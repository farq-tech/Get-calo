/**
 * SnapCal food vision endpoint (Vercel Serverless, CommonJS).
 * POST { imageBase64, mimeType?, locale? } → food + nutrition JSON
 */

const SYSTEM_PROMPT = `You are SnapCal, an expert nutrition assistant for Gulf / Saudi everyday food, drinks, snacks, and grocery products.

Identify the main edible item in the photo. Prefer specific product names when clear (Pepsi can, laban bottle, basmati rice pack).

Critical rules for packaging:
- Cans, bottles, cartons, cups, and pouches that look like beverages or food are edible products. Estimate nutrition for a typical serving of that drink/food.
- Do NOT classify beverage packaging as speakers, radios, toys, or novelty gadgets unless the object clearly has electronics (buttons, screens, antenna, ports) and no drink branding/nutrition label.
- If it looks like a soft drink can (Coca-Cola, Pepsi, etc.), treat it as that drink.

Return ONLY valid JSON (no markdown):
{
  "name_en": string,
  "name_ar": string,
  "confidence": number,
  "calories_kcal": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "serving_size_g": number,
  "serving_label_en": string,
  "serving_label_ar": string,
  "category": string,
  "notes_en": string
}

Rules:
- If truly not food/drink, return low confidence and name_en "Unknown item".
- Calories/macros must be realistic for serving_size_g.
- Arabic (Saudi) for name_ar and serving_label_ar.
- confidence >= 0.75 when clearly identifiable.
- Keep notes_en short. Do not mention models, vendors, or how the estimate was produced.`;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(body));
}

function stripCodeFence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    if (typeof req.body === 'string') {
      try {
        resolve(JSON.parse(req.body || '{}'));
      } catch (err) {
        reject(err);
      }
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function callGemini(imageBase64, mimeType, locale) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${SYSTEM_PROMPT}\n\nUser locale preference: ${locale}` },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: String(imageBase64).replace(/^data:[^;]+;base64,/, ''),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await resp.text();
  if (!resp.ok) {
    let message = `Gemini error ${resp.status}`;
    try {
      message = JSON.parse(raw)?.error?.message || message;
    } catch (_) {
      /* ignore */
    }
    const err = new Error(message);
    err.status = resp.status === 429 ? 429 : 502;
    throw err;
  }

  const data = JSON.parse(raw);
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  if (!text) {
    const err = new Error('Empty Gemini response');
    err.status = 502;
    throw err;
  }

  const parsed = JSON.parse(stripCodeFence(text));
  return {
    name_en: String(parsed.name_en || 'Unknown item'),
    name_ar: String(parsed.name_ar || ''),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    calories_kcal: Math.max(0, Number(parsed.calories_kcal) || 0),
    protein_g: Math.max(0, Number(parsed.protein_g) || 0),
    carbs_g: Math.max(0, Number(parsed.carbs_g) || 0),
    fat_g: Math.max(0, Number(parsed.fat_g) || 0),
    serving_size_g: Math.max(1, Number(parsed.serving_size_g) || 100),
    serving_label_en: String(parsed.serving_label_en || 'serving'),
    serving_label_ar: String(parsed.serving_label_ar || 'حصة'),
    category: String(parsed.category || 'food'),
    notes_en: String(parsed.notes_en || ''),
    model,
    provider: 'gemini',
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);
    const imageBase64 = String(body.imageBase64 || '').trim();
    if (!imageBase64 || imageBase64.length < 64) {
      return send(res, 400, { error: 'imageBase64 is required' });
    }
    if (imageBase64.length > 5_500_000) {
      return send(res, 413, { error: 'Image too large' });
    }

    const result = await callGemini(
      imageBase64,
      body.mimeType || 'image/jpeg',
      body.locale || 'en',
    );
    return send(res, 200, { ok: true, result });
  } catch (err) {
    const status = err && err.status ? Number(err.status) : 500;
    return send(res, status || 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'Analyze failed',
    });
  }
};
