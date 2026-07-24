import type { VercelRequest, VercelResponse } from '@vercel/node';

type AnalyzeBody = {
  imageBase64?: string;
  mimeType?: string;
  locale?: 'en' | 'ar';
};

const SYSTEM_PROMPT = `You are Calora, an expert nutrition vision assistant for Gulf / Saudi everyday food, drinks, snacks, and grocery products.

Analyze the photo and identify the main edible item(s). Prefer specific product names when clear (e.g. Pepsi can, laban bottle, basmati rice pack). If unsure, give the best generic food name.

Return ONLY valid JSON (no markdown) with this shape:
{
  "name_en": string,
  "name_ar": string,
  "confidence": number,          // 0-1
  "calories_kcal": number,       // for one typical serving
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
- If the image is not food/drink, still return JSON with low confidence and name_en "Unknown item".
- Calories/macros must be realistic for the serving_size_g you choose.
- Use Arabic (Saudi) for name_ar and serving_label_ar.
- confidence >= 0.75 when clearly identifiable.`;

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.send(JSON.stringify(body));
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function callGemini(imageBase64: string, mimeType: string, locale: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { status: 503 });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
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
              data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
      responseMimeType: 'application/json',
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
      const err = JSON.parse(raw);
      message = err?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error(message), { status: resp.status === 429 ? 429 : 502, detail: raw.slice(0, 500) });
  }

  const data = JSON.parse(raw);
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
  if (!text) {
    throw Object.assign(new Error('Empty Gemini response'), { status: 502 });
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as AnalyzeBody;
    const imageBase64 = body.imageBase64?.trim();
    if (!imageBase64 || imageBase64.length < 64) {
      return json(res, 400, { error: 'imageBase64 is required' });
    }
    // ~4MB base64 limit for serverless friendliness
    if (imageBase64.length > 5_500_000) {
      return json(res, 413, { error: 'Image too large' });
    }

    const result = await callGemini(imageBase64, body.mimeType || 'image/jpeg', body.locale || 'en');
    return json(res, 200, { ok: true, result });
  } catch (err) {
    const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
    const message = err instanceof Error ? err.message : 'Analyze failed';
    return json(res, status || 500, { ok: false, error: message });
  }
}
