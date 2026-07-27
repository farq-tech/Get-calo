/**
 * Get Calo Nutrition Vision Engine (Vercel Serverless).
 * POST { imageBase64, mimeType?, locale? } → full nutrition report JSON
 *
 * Hardening: CORS allowlist, optional shared token, IP rate limit,
 * mime/locale validation, Gemini timeout, opaque client errors.
 */

const SYSTEM_PROMPT = `You are an expert AI Nutrition Vision Engine for Get Calo (Gulf / Saudi everyday food).

Your job is NOT to simply identify food.
Your goal is to generate the most complete nutritional analysis possible from ONE food image.
Treat every response as a professional nutrition report.
Never reply with "I can't know." Estimate scientifically and provide confidence scores.

--------------------------------------------------
DETECTION RULES
--------------------------------------------------
- Identify every DISTINCT edible item visible (chicken, rice, fries, sauce, drink, packaged product, etc.).
- Hand-held whole foods (date, cookie, biscuit, falafel, fruit): identify THAT food — never guess packaged powder/flour/spice from a blurry brown shape.
- Single packaged product: return EXACTLY one food — use the label name when readable.
- Mixed plated meals: split main foods (usually 2–6). Do NOT list tiny garnishes (cilantro pinch, lemon wedge, single garlic clove) unless that is the only food.
- Soft drink cans/bottles are that drink — never electronics/toys.
- Prefer clear everyday Arabic (Saudi) names (أرز، تمر، دجاج مشوي، نوتيلا).
- Base estimates on USDA / FoodData Central equivalents. If partially hidden, estimate conservatively.
- Estimate ONLY the portion visibly present in the photo (e.g. 1–2 pizza slices on a plate ≠ whole pizza; one date ≠ a box).
- Never invent impossible foods.

--------------------------------------------------
OUTPUT — STRICT JSON ONLY (no markdown)
--------------------------------------------------
{
  "foods": [
    {
      "name_en": string,
      "name_ar": string,
      "estimated_weight_g": number,
      "serving_label_en": string,
      "serving_label_ar": string,
      "confidence": number,
      "category": string,
      "calories_kcal": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "fiber_g": number,
      "sugar_g": number,
      "sodium_mg": number,
      "cholesterol_mg": number,
      "saturated_fat_g": number,
      "unsaturated_fat_g": number
    }
  ],
  "meal_summary": {
    "title_en": string,
    "title_ar": string,
    "assumptions_en": string,
    "serving_label_en": string,
    "serving_label_ar": string,
    "total_weight_g": number
  },
  "macros": {
    "calories_kcal": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "fiber_g": number,
    "sugar_g": number,
    "sodium_mg": number,
    "cholesterol_mg": number,
    "saturated_fat_g": number,
    "unsaturated_fat_g": number
  },
  "micronutrients": {
    "vitamin_a": "Low|Medium|High",
    "vitamin_c": "Low|Medium|High",
    "vitamin_d": "Low|Medium|High",
    "vitamin_e": "Low|Medium|High",
    "vitamin_k": "Low|Medium|High",
    "vitamin_b1": "Low|Medium|High",
    "vitamin_b2": "Low|Medium|High",
    "vitamin_b6": "Low|Medium|High",
    "vitamin_b12": "Low|Medium|High",
    "folate": "Low|Medium|High",
    "calcium": "Low|Medium|High",
    "iron": "Low|Medium|High",
    "magnesium": "Low|Medium|High",
    "potassium": "Low|Medium|High",
    "zinc": "Low|Medium|High",
    "phosphorus": "Low|Medium|High",
    "selenium": "Low|Medium|High"
  },
  "health_analysis": {
    "health_score": number,
    "protein_score": number,
    "fiber_score": number,
    "sugar_score": number,
    "fat_quality": string,
    "sodium_level": string,
    "meal_balance": string,
    "processing_level": string,
    "hydration_support": string,
    "energy_density": string,
    "why_en": string,
    "why_ar": string
  },
  "diet_compatibility": {
    "weight_loss": boolean,
    "muscle_gain": boolean,
    "keto": boolean,
    "low_carb": boolean,
    "mediterranean": boolean,
    "high_protein": boolean,
    "vegetarian": boolean,
    "vegan": boolean,
    "diabetic_friendly": boolean,
    "heart_healthy": boolean,
    "low_sodium": boolean,
    "kids": boolean,
    "athletes": boolean
  },
  "allergens": ["Milk","Egg","Fish","Shellfish","Soy","Peanuts","Tree Nuts","Sesame","Gluten","Mustard","Celery","Lupin"],
  "improvements": [
    {
      "action_en": string,
      "action_ar": string,
      "kcal_delta": number,
      "health_score_delta": number
    }
  ],
  "exercise_equivalent": {
    "walking_min": number,
    "running_min": number,
    "cycling_min": number,
    "swimming_min": number,
    "jump_rope_min": number,
    "strength_training_min": number
  },
  "confidence": {
    "food_recognition": number,
    "portion_size": number,
    "calories": number,
    "macronutrients": number,
    "micronutrients": number,
    "overall": number
  }
}

Rules for numbers:
- confidence fields: 0–1
- health_score / protein_score / fiber_score / sugar_score: 0–100
- allergens: only include likely ones (empty array if none)
- improvements: 2–5 practical suggestions with realistic kcal_delta (negative = fewer kcal)
- exercise minutes assume ~70kg adult
- If truly not food/drink: one food "Unknown item" with low confidence and near-zero macros`;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 30;
const GEMINI_TIMEOUT_MS = 45000;

const MICRO_KEYS = [
  'vitamin_a',
  'vitamin_c',
  'vitamin_d',
  'vitamin_e',
  'vitamin_k',
  'vitamin_b1',
  'vitamin_b2',
  'vitamin_b6',
  'vitamin_b12',
  'folate',
  'calcium',
  'iron',
  'magnesium',
  'potassium',
  'zinc',
  'phosphorus',
  'selenium',
];

const DIET_KEYS = [
  'weight_loss',
  'muscle_gain',
  'keto',
  'low_carb',
  'mediterranean',
  'high_protein',
  'vegetarian',
  'vegan',
  'diabetic_friendly',
  'heart_healthy',
  'low_sodium',
  'kids',
  'athletes',
];

const ALLERGEN_SET = new Set([
  'Milk',
  'Egg',
  'Fish',
  'Shellfish',
  'Soy',
  'Peanuts',
  'Tree Nuts',
  'Sesame',
  'Gluten',
  'Mustard',
  'Celery',
  'Lupin',
]);

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
  if (!secret) return true;
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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function level(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('h')) return 'High';
  if (raw.startsWith('m')) return 'Medium';
  return 'Low';
}

function normalizeFood(raw) {
  const weight = Math.max(1, num(raw.estimated_weight_g ?? raw.serving_size_g, 100));
  const confidenceRaw = num(raw.confidence, 0.5);
  const confidence = confidenceRaw > 1 ? clamp(confidenceRaw / 100, 0, 1) : clamp(confidenceRaw, 0, 1);

  return {
    name_en: String(raw.name_en || raw.name || 'Unknown item'),
    name_ar: String(raw.name_ar || ''),
    estimated_weight_g: Math.round(weight),
    serving_label_en: String(raw.serving_label_en || 'serving'),
    serving_label_ar: String(raw.serving_label_ar || '\u062D\u0635\u0629'),
    confidence,
    category: String(raw.category || 'food'),
    calories_kcal: Math.max(0, num(raw.calories_kcal)),
    protein_g: Math.max(0, num(raw.protein_g)),
    carbs_g: Math.max(0, num(raw.carbs_g)),
    fat_g: Math.max(0, num(raw.fat_g)),
    fiber_g: Math.max(0, num(raw.fiber_g)),
    sugar_g: Math.max(0, num(raw.sugar_g)),
    sodium_mg: Math.max(0, num(raw.sodium_mg)),
    cholesterol_mg: Math.max(0, num(raw.cholesterol_mg)),
    saturated_fat_g: Math.max(0, num(raw.saturated_fat_g)),
    unsaturated_fat_g: Math.max(0, num(raw.unsaturated_fat_g)),
  };
}

/** Legacy `items[]` shape for older clients. */
function foodToLegacyItem(food) {
  return {
    name_en: food.name_en,
    name_ar: food.name_ar,
    confidence: food.confidence,
    calories_kcal: food.calories_kcal,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    serving_size_g: food.estimated_weight_g,
    serving_label_en: food.serving_label_en,
    serving_label_ar: food.serving_label_ar,
    category: food.category,
    fiber_g: food.fiber_g,
    sugar_g: food.sugar_g,
    sodium_mg: food.sodium_mg,
  };
}

function sumFoods(foods, key) {
  return foods.reduce((sum, food) => sum + num(food[key]), 0);
}

function normalizeResult(parsed, model) {
  let foods = [];
  if (Array.isArray(parsed.foods) && parsed.foods.length) {
    foods = parsed.foods.map(normalizeFood);
  } else if (Array.isArray(parsed.items) && parsed.items.length) {
    foods = parsed.items.map(normalizeFood);
  } else if (parsed.name_en || parsed.calories_kcal != null) {
    foods = [normalizeFood(parsed)];
  }

  if (foods.length === 0) {
    foods = [
      normalizeFood({
        name_en: 'Unknown item',
        name_ar: '',
        confidence: 0.2,
        calories_kcal: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        estimated_weight_g: 100,
      }),
    ];
  }

  if (foods.length > 1) {
    const main = foods.filter(
      (food) =>
        food.calories_kcal >= 25 ||
        food.estimated_weight_g >= 25 ||
        /drink|beverage|juice|soda|milk|coffee|tea|ماء|عصير|مشروب/i.test(
          `${food.name_en} ${food.name_ar} ${food.category}`,
        ),
    );
    if (main.length > 0) foods = main;
  }
  foods = foods.slice(0, 8);

  const macrosIn = parsed.macros && typeof parsed.macros === 'object' ? parsed.macros : {};
  const macros = {
    calories_kcal: Math.round(num(macrosIn.calories_kcal, sumFoods(foods, 'calories_kcal'))),
    protein_g: Math.round(num(macrosIn.protein_g, sumFoods(foods, 'protein_g'))),
    carbs_g: Math.round(num(macrosIn.carbs_g, sumFoods(foods, 'carbs_g'))),
    fat_g: Math.round(num(macrosIn.fat_g, sumFoods(foods, 'fat_g'))),
    fiber_g: Math.round(num(macrosIn.fiber_g, sumFoods(foods, 'fiber_g'))),
    sugar_g: Math.round(num(macrosIn.sugar_g, sumFoods(foods, 'sugar_g'))),
    sodium_mg: Math.round(num(macrosIn.sodium_mg, sumFoods(foods, 'sodium_mg'))),
    cholesterol_mg: Math.round(num(macrosIn.cholesterol_mg, sumFoods(foods, 'cholesterol_mg'))),
    saturated_fat_g: Math.round(num(macrosIn.saturated_fat_g, sumFoods(foods, 'saturated_fat_g'))),
    unsaturated_fat_g: Math.round(
      num(macrosIn.unsaturated_fat_g, sumFoods(foods, 'unsaturated_fat_g')),
    ),
  };

  const totalWeight = Math.max(
    1,
    Math.round(
      num(
        parsed.meal_summary?.total_weight_g,
        foods.reduce((s, f) => s + f.estimated_weight_g, 0),
      ),
    ),
  );

  const isPlate = foods.length > 1;
  const primary = foods[0];
  const summaryIn = parsed.meal_summary && typeof parsed.meal_summary === 'object' ? parsed.meal_summary : {};
  const meal_summary = {
    title_en: String(
      summaryIn.title_en ||
        (isPlate ? `Plate · ${foods.length} items` : primary.name_en),
    ),
    title_ar: String(
      summaryIn.title_ar ||
        (isPlate
          ? `\u0635\u062D\u0646 \u00B7 ${foods.length} \u0623\u0635\u0646\u0627\u0641`
          : primary.name_ar),
    ),
    assumptions_en: String(summaryIn.assumptions_en || parsed.notes_en || ''),
    serving_label_en: String(
      summaryIn.serving_label_en || (isPlate ? 'full plate' : primary.serving_label_en),
    ),
    serving_label_ar: String(
      summaryIn.serving_label_ar || (isPlate ? '\u0635\u062D\u0646 \u0643\u0627\u0645\u0644' : primary.serving_label_ar),
    ),
    total_weight_g: totalWeight,
  };

  const microIn =
    parsed.micronutrients && typeof parsed.micronutrients === 'object' ? parsed.micronutrients : {};
  const micronutrients = {};
  for (const key of MICRO_KEYS) {
    micronutrients[key] = level(microIn[key]);
  }

  const healthIn =
    parsed.health_analysis && typeof parsed.health_analysis === 'object' ? parsed.health_analysis : {};
  const health_analysis = {
    health_score: Math.round(clamp(num(healthIn.health_score, 50), 0, 100)),
    protein_score: Math.round(clamp(num(healthIn.protein_score, 50), 0, 100)),
    fiber_score: Math.round(clamp(num(healthIn.fiber_score, 50), 0, 100)),
    sugar_score: Math.round(clamp(num(healthIn.sugar_score, 50), 0, 100)),
    fat_quality: String(healthIn.fat_quality || 'Moderate'),
    sodium_level: String(healthIn.sodium_level || 'Moderate'),
    meal_balance: String(healthIn.meal_balance || 'Fair'),
    processing_level: String(healthIn.processing_level || 'Mixed'),
    hydration_support: String(healthIn.hydration_support || 'Low'),
    energy_density: String(healthIn.energy_density || 'Moderate'),
    why_en: String(healthIn.why_en || ''),
    why_ar: String(healthIn.why_ar || ''),
  };

  const dietIn =
    parsed.diet_compatibility && typeof parsed.diet_compatibility === 'object'
      ? parsed.diet_compatibility
      : {};
  const diet_compatibility = {};
  for (const key of DIET_KEYS) {
    diet_compatibility[key] = Boolean(dietIn[key]);
  }

  const allergens = Array.isArray(parsed.allergens)
    ? parsed.allergens
        .map((a) => String(a))
        .filter((a) => ALLERGEN_SET.has(a) || ALLERGEN_SET.has(a.replace(/\b\w/g, (c) => c.toUpperCase())))
        .map((a) => {
          for (const known of ALLERGEN_SET) {
            if (known.toLowerCase() === a.toLowerCase()) return known;
          }
          return a;
        })
        .filter((a, i, arr) => arr.indexOf(a) === i)
    : [];

  const improvements = Array.isArray(parsed.improvements)
    ? parsed.improvements.slice(0, 6).map((row) => ({
        action_en: String(row.action_en || row.action || ''),
        action_ar: String(row.action_ar || ''),
        kcal_delta: Math.round(num(row.kcal_delta)),
        health_score_delta: Math.round(num(row.health_score_delta)),
      })).filter((row) => row.action_en || row.action_ar)
    : [];

  const burnIn =
    parsed.exercise_equivalent && typeof parsed.exercise_equivalent === 'object'
      ? parsed.exercise_equivalent
      : {};
  const kcal = Math.max(0, macros.calories_kcal);
  const exercise_equivalent = {
    walking_min: Math.max(0, Math.round(num(burnIn.walking_min, kcal / 4))),
    running_min: Math.max(0, Math.round(num(burnIn.running_min, kcal / 11))),
    cycling_min: Math.max(0, Math.round(num(burnIn.cycling_min, kcal / 8))),
    swimming_min: Math.max(0, Math.round(num(burnIn.swimming_min, kcal / 9))),
    jump_rope_min: Math.max(0, Math.round(num(burnIn.jump_rope_min, kcal / 12))),
    strength_training_min: Math.max(0, Math.round(num(burnIn.strength_training_min, kcal / 6))),
  };

  const confIn = parsed.confidence && typeof parsed.confidence === 'object' ? parsed.confidence : {};
  const asUnit = (v, fallback) => {
    const n = num(v, fallback);
    return n > 1 ? clamp(n / 100, 0, 1) : clamp(n, 0, 1);
  };
  const avgFoodConf =
    foods.reduce((s, f) => s + f.confidence, 0) / Math.max(foods.length, 1);
  const confidence = {
    food_recognition: asUnit(confIn.food_recognition, avgFoodConf),
    portion_size: asUnit(confIn.portion_size, avgFoodConf * 0.9),
    calories: asUnit(confIn.calories, avgFoodConf * 0.85),
    macronutrients: asUnit(confIn.macronutrients, avgFoodConf * 0.85),
    micronutrients: asUnit(confIn.micronutrients, avgFoodConf * 0.7),
    overall: asUnit(confIn.overall, avgFoodConf),
  };

  const items = foods.map(foodToLegacyItem);

  // Backward-compatible top-level fields + full report.
  return {
    name_en: meal_summary.title_en,
    name_ar: meal_summary.title_ar,
    confidence: confidence.overall,
    calories_kcal: macros.calories_kcal,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    serving_size_g: totalWeight,
    serving_label_en: meal_summary.serving_label_en,
    serving_label_ar: meal_summary.serving_label_ar,
    category: isPlate ? 'plate' : primary.category,
    notes_en: meal_summary.assumptions_en,
    items,
    foods,
    meal_summary,
    macros,
    micronutrients,
    health_analysis,
    diet_compatibility,
    allergens,
    improvements,
    exercise_equivalent,
    confidence_detail: confidence,
    model,
    provider: 'gemini',
    engine: 'nutrition-vision-1.0',
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
          {
            text: `${SYSTEM_PROMPT}\n\nUser locale preference: ${locale}. Fill both English and Arabic name fields.`,
          },
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
      temperature: 0.15,
      maxOutputTokens: 8192,
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
    throw mapGeminiHttpError(resp.status, raw);
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
    const finish = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || '';
    const err = new Error(finish ? `Scan failed (${finish})` : 'Scan failed');
    err.status = 502;
    throw err;
  }

  const parsed = JSON.parse(stripCodeFence(text));
  return normalizeResult(parsed, model);
}

function mapGeminiHttpError(status, raw) {
  const body = String(raw || '').toLowerCase();
  const quota =
    status === 429 ||
    body.includes('resource_exhausted') ||
    body.includes('quota') ||
    body.includes('rate limit') ||
    body.includes('billing') ||
    body.includes('credit');
  const badKey =
    status === 400 &&
    (body.includes('api_key_invalid') ||
      body.includes('api key not valid') ||
      body.includes('api key expired'));
  const err = new Error(
    quota
      ? 'Scan quota exceeded — check Gemini API credits'
      : badKey
        ? 'Scan service misconfigured'
        : 'Scan failed',
  );
  err.status = quota ? 429 : badKey ? 503 : status === 429 ? 429 : 502;
  return err;
}

function publicError(err) {
  const status = err && err.status ? Number(err.status) : 500;
  const message = err && err.message ? String(err.message) : '';
  if (status === 429 || /quota|credit|billing|rate limit/i.test(message)) {
    return {
      status: 429,
      error: 'Scan quota exceeded — add Gemini credits or try again later',
    };
  }
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
