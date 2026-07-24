/**
 * Calora AI food vision endpoint (Vercel Serverless, CommonJS).
 * POST { imageBase64, mimeType?, locale? } → Gemini food + nutrition JSON
 */

const SYSTEM_PROMPT = `Identify the main food/drink/grocery item in the photo (Gulf/Saudi context OK).
Cans, bottles, laban, juice, snacks ARE edible — name them normally.
Return ONLY JSON:
{"name_en":"","name_ar":"","confidence":0.9,"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"serving_size_g":100,"serving_label_en":"serving","serving_label_ar":"حصة","category":"food"}
confidence 0-1. Calories for one typical serving. Arabic for name_ar/serving_label_ar.`;

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
          { text: SYSTEM_PROMPT },
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
      temperature: 0.1,
      maxOutputTokens: 200,
      responseMimeType: 'application/json',
      // Disable thinking tokens — biggest cost saver on 2.5 Flash.
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
