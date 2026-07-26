/**
 * Get Calo food vision endpoint (Vercel Serverless).
 * POST { imageBase64, mimeType?, locale? } → food + nutrition JSON
 *
 * Hardening: CORS allowlist, optional shared token, IP rate limit,
 * mime/locale validation, Gemini timeout, opaque client errors.
 */

const SYSTEM_PROMPT = `You are Get Calo, an expert nutrition assistant for Gulf / Saudi everyday food, drinks, snacks, and grocery products.

Identify the main edible product(s) in the photo and estimate nutrition.

Critical rules:
- Single packaged product (jar, can, bottle, carton, bag, box of rice/sugar/sauce/spread): return EXACTLY one item — use the product name on the label when readable.
- Mixed plated meal (rice + meat + salad, etc.): split into the main distinct foods only (usually 2–4), NOT tiny garnishes.
- Do NOT list herbs, spices, lemon wedges, garlic cloves, or garnish as separate items unless that is the only food in the photo.
- Cans/bottles of drinks are that drink. Never misclassify beverage packaging as electronics/toys.
- Prefer clear everyday Arabic (Saudi) names that shoppers recognize (e.g. أرز، سكر، نوتيلا، صلصة صويا).

Return ONLY valid JSON (no markdown):
{
  "items": [
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
      "category": string
    }
  ],
  "notes_en": string
}

Rules:
- Packaged grocery → 1 item. Plated meal → 2–4 main items max.
- If truly not food/drink, return items: [{ name_en: "Unknown item", confidence: 0.2, calories_kcal: 0, ... }].
- Calories/macros must be realistic for each serving_size_g (use label serving when visible).
- Arabic (Saudi) for name_ar and serving_label_ar.
- confidence >= 0.75 when clearly identifiable.
- Keep notes_en short. Do not mention models or vendors.`;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 30;
const GEMINI_TIMEOUT_MS = 28000;

/** Best-effort in-memory rate limit (per serverless isolate). */
const rateBuckets = globalThis.__getCaloRateBuckets || new Map();
globalThis.__getCaloRateBuckets = rateBuckets;

function defaultOrigins() {
  return [
    'https://get-calo-web.vercel.app',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:19006',
  ];
}

function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : defaultOrigins();
}

function corsOrigin(req) {
  const origin = String(req.headers.origin || '');
  const allow = allowedOrigins();
  if (origin && allow.includes(origin)) return origin;
  // Same-origin / non-browser clients: no ACAO reflection of *
  if (!origin) return allow[0];
  return null;
}

function applyCors(req, res) {
  const origin = corsOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Get-Calo-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  return Boolean(origin) || !req.headers.origin;
}

function send(req, res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  applyCors(req, res);
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX;
}

function authorize(req) {
  const secret = process.env.ANALYZE_API_SECRET || process.env.GET_CALO_ANALYZE_SECRET;
  if (!secret) {
    // Secret optional for gradual rollout; CORS + rate limit still apply.
    return true;
  }
  const header = String(req.headers['x-get-calo-token'] || '');
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return header === secret || bearer === secret;
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
    let size = 0;
    const MAX = 6_000_000;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
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

function normalizeItem(raw) {
  return {
    name_en: String(raw.name_en || 'Unknown item'),
    name_ar: String(raw.name_ar || ''),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0.5)),
    calories_kcal: Math.max(0, Number(raw.calories_kcal) || 0),
    protein_g: Math.max(0, Number(raw.protein_g) || 0),
    carbs_g: Math.max(0, Number(raw.carbs_g) || 0),
    fat_g: Math.max(0, Number(raw.fat_g) || 0),
    serving_size_g: Math.max(1, Number(raw.serving_size_g) || 100),
    serving_label_en: String(raw.serving_label_en || 'serving'),
    serving_label_ar: String(raw.serving_label_ar || '\u062D\u0635\u0629'),
    category: String(raw.category || 'food'),
  };
}

function normalizeResult(parsed, model) {
  let items = Array.isArray(parsed.items) ? parsed.items.map(normalizeItem) : [];

  if (items.length === 0 && (parsed.name_en || parsed.calories_kcal != null)) {
    items = [normalizeItem(parsed)];
  }
  if (items.length === 0) {
    items = [
      normalizeItem({
        name_en: 'Unknown item',
        name_ar: '',
        confidence: 0.2,
        calories_kcal: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        serving_size_g: 100,
      }),
    ];
  }

  // Drop tiny garnish-like rows that clutter plated results.
  if (items.length > 1) {
    const main = items.filter(
      (item) =>
        item.calories_kcal >= 40 ||
        item.serving_size_g >= 40 ||
        /drink|beverage|juice|soda|milk|coffee|tea|ماء|عصير|مشروب/i.test(
          `${item.name_en} ${item.name_ar} ${item.category}`,
        ),
    );
    if (main.length > 0) items = main;
  }

  items = items.slice(0, 4);

  const totals = items.reduce(
    (acc, item) => {
      acc.calories_kcal += item.calories_kcal;
      acc.protein_g += item.protein_g;
      acc.carbs_g += item.carbs_g;
      acc.fat_g += item.fat_g;
      acc.serving_size_g += item.serving_size_g;
      return acc;
    },
    { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, serving_size_g: 0 },
  );

  const primary = items[0];
  const isPlate = items.length > 1;
  const confidence =
    items.reduce((sum, item) => sum + item.confidence, 0) / Math.max(items.length, 1);

  return {
    name_en: isPlate ? `Plate · ${items.length} items` : primary.name_en,
    name_ar: isPlate
      ? `\u0635\u062D\u0646 \u00B7 ${items.length} \u0623\u0635\u0646\u0627\u0641`
      : primary.name_ar,
    confidence: Math.max(0, Math.min(1, confidence)),
    calories_kcal: Math.round(totals.calories_kcal),
    protein_g: Math.round(totals.protein_g),
    carbs_g: Math.round(totals.carbs_g),
    fat_g: Math.round(totals.fat_g),
    serving_size_g: Math.max(1, Math.round(totals.serving_size_g)),
    serving_label_en: isPlate ? 'full plate' : primary.serving_label_en,
    serving_label_ar: isPlate ? '\u0635\u062D\u0646 \u0643\u0627\u0645\u0644' : primary.serving_label_ar,
    category: isPlate ? 'plate' : primary.category,
    notes_en: String(parsed.notes_en || ''),
    items,
    model,
    provider: 'gemini',
  };
}

async function callGemini(imageBase64, mimeType, locale) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    const err = new Error('Scan service unavailable');
    err.status = 503;
    throw err;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${SYSTEM_PROMPT}\n\nUser locale preference: ${locale}` },
          {
            inlineData: {
              mimeType,
              data: String(imageBase64).replace(/^data:[^;]+;base64,/, ''),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1600,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      const timeoutErr = new Error('Scan timed out');
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  }
  clearTimeout(timer);

  const raw = await resp.text();
  if (!resp.ok) {
    const err = new Error(resp.status === 429 ? 'Too many requests' : 'Scan failed');
    err.status = resp.status === 429 ? 429 : 502;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    const err = new Error('Scan failed');
    err.status = 502;
    throw err;
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  if (!text) {
    const err = new Error('Scan failed');
    err.status = 502;
    throw err;
  }

  const parsed = JSON.parse(stripCodeFence(text));
  return normalizeResult(parsed, model);
}

function publicError(err) {
  const status = err && err.status ? Number(err.status) : 500;
  if (status === 429) return { status, error: 'Too many requests — try again later' };
  if (status === 413) return { status, error: 'Image too large' };
  if (status === 400) return { status, error: 'Invalid request' };
  if (status === 401 || status === 403) return { status, error: 'Unauthorized' };
  if (status === 504) return { status, error: 'Scan timed out — try again' };
  if (status === 503) return { status, error: 'Scan service unavailable' };
  return { status: status >= 400 && status < 600 ? status : 500, error: 'Scan failed' };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (!applyCors(req, res)) {
      res.statusCode = 403;
      res.end('');
      return;
    }
    res.statusCode = 204;
    res.end('');
    return;
  }

  if (req.method !== 'POST') {
    return send(req, res, 405, { error: 'Method not allowed' });
  }

  if (!applyCors(req, res) && req.headers.origin) {
    return send(req, res, 403, { error: 'Origin not allowed' });
  }

  if (!authorize(req)) {
    return send(req, res, 401, { error: 'Unauthorized' });
  }

  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return send(req, res, 429, { error: 'Too many requests — try again later' });
  }

  try {
    const body = await readBody(req);
    const imageBase64 = String(body.imageBase64 || '').trim();
    if (!imageBase64 || imageBase64.length < 64) {
      return send(req, res, 400, { error: 'Invalid request' });
    }
    if (imageBase64.length > 5_500_000) {
      return send(req, res, 413, { error: 'Image too large' });
    }

    let mimeType = String(body.mimeType || 'image/jpeg').toLowerCase();
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
    if (!ALLOWED_MIMES.has(mimeType)) {
      return send(req, res, 400, { error: 'Invalid request' });
    }

    const locale = body.locale === 'ar' ? 'ar' : 'en';
    const result = await callGemini(imageBase64, mimeType, locale);
    return send(req, res, 200, { ok: true, result });
  } catch (err) {
    const mapped = publicError(err);
    return send(req, res, mapped.status, { ok: false, error: mapped.error });
  }
};
