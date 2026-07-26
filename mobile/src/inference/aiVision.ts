/**
 * Cloud vision scan (Gemini via /api/analyze-food) — primary recognition path on web.
 * Supports multi-item plates via `items[]`.
 */

import { Platform } from 'react-native';

import type { NutritionItem } from '@/types';

export const AI_MODEL_VERSION = 'vision-gemini-1.2';

const ANALYZE_TIMEOUT_MS = 32000;
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.82;

export interface AiFoodResult {
  nameEn: string;
  nameAr: string;
  confidence: number;
  nutrition: NutritionItem;
  items: NutritionItem[];
  notesEn?: string;
  model: string;
  provider: string;
}

function apiBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return (process.env.EXPO_PUBLIC_AI_API_BASE || '').replace(/\/$/, '');
}

function analyzeToken(): string {
  return (process.env.EXPO_PUBLIC_ANALYZE_TOKEN || '').trim();
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

async function downscaleWebBlob(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { base64: await blobToBase64(blob), mimeType: blob.type || 'image/jpeg' };
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image'));
      el.src = url;
    });

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { base64: await blobToBase64(blob), mimeType: blob.type || 'image/jpeg' };
    }
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const comma = dataUrl.indexOf(',');
    return {
      base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
      mimeType: 'image/jpeg',
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUriToBlob(uri: string): Blob {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(uri);
  if (!match) {
    throw new Error('Invalid image data');
  }
  const mimeType = match[1] || 'image/jpeg';
  const binary = globalThis.atob(match[2] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function uriToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  // Camera snapshots are data: URLs — parse directly (fetch(data:) is flaky on some mobiles).
  const blob = uri.startsWith('data:') ? dataUriToBlob(uri) : await (await fetch(uri)).blob();

  if (Platform.OS === 'web') {
    return downscaleWebBlob(blob);
  }

  const mimeType = blob.type || 'image/jpeg';
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = globalThis.btoa(binary);
  if (base64.length > 5_000_000) {
    throw new Error('Image too large — try a closer photo');
  }
  return { base64, mimeType };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64) || 'item'
  );
}

function toNutrition(raw: Record<string, unknown>, index = 0): NutritionItem {
  const nameEn = String(raw.name_en || 'Unknown item');
  return {
    classId: -1 - index,
    itemIdentity: `vision.${slugify(nameEn)}.${index}`,
    nameEn,
    nameAr: raw.name_ar ? String(raw.name_ar) : null,
    caloriesKcal: Number(raw.calories_kcal) || 0,
    proteinG: Number(raw.protein_g) || 0,
    carbsG: Number(raw.carbs_g) || 0,
    fatG: Number(raw.fat_g) || 0,
    servingSizeG: Number(raw.serving_size_g) || 100,
    servingLabelEn: String(raw.serving_label_en || 'serving'),
    servingLabelAr: raw.serving_label_ar ? String(raw.serving_label_ar) : null,
    category: raw.category ? String(raw.category) : 'food',
  };
}

export async function analyzeFoodWithAi(
  imageUri: string,
  locale: 'en' | 'ar' = 'en',
  signal?: AbortSignal,
): Promise<AiFoodResult> {
  const base = apiBase();
  if (!base && Platform.OS !== 'web') {
    throw new Error('Scan API is not configured');
  }

  const { base64, mimeType } = await uriToBase64(imageUri);
  const endpoint = `${base || ''}/api/analyze-food`;
  const token = analyzeToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Get-Calo-Token': token } : {}),
      },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType,
        locale,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Scan timed out — try again');
    }
    throw err;
  }
  clearTimeout(timer);
  signal?.removeEventListener('abort', onOuterAbort);

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload?.ok || !payload?.result) {
    throw new Error(payload?.error || `Scan failed (${resp.status})`);
  }

  const r = payload.result as Record<string, unknown>;
  const rawItems = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  const items =
    rawItems.length > 0
      ? rawItems.map((item, i) => toNutrition(item, i))
      : [toNutrition(r, 0)];

  const nameEn = String(r.name_en || items[0]?.nameEn || 'Unknown item');
  const nutrition: NutritionItem = {
    classId: -1,
    itemIdentity: `vision.${slugify(nameEn)}`,
    nameEn,
    nameAr: r.name_ar ? String(r.name_ar) : items[0]?.nameAr ?? null,
    caloriesKcal: Number(r.calories_kcal) || items.reduce((s, i) => s + i.caloriesKcal, 0),
    proteinG: Number(r.protein_g) || items.reduce((s, i) => s + i.proteinG, 0),
    carbsG: Number(r.carbs_g) || items.reduce((s, i) => s + i.carbsG, 0),
    fatG: Number(r.fat_g) || items.reduce((s, i) => s + i.fatG, 0),
    servingSizeG: Number(r.serving_size_g) || items.reduce((s, i) => s + i.servingSizeG, 0) || 100,
    servingLabelEn: String(r.serving_label_en || (items.length > 1 ? 'full plate' : 'serving')),
    servingLabelAr: r.serving_label_ar
      ? String(r.serving_label_ar)
      : items.length > 1
        ? 'صحن كامل'
        : items[0]?.servingLabelAr ?? null,
    category: r.category ? String(r.category) : items.length > 1 ? 'plate' : 'food',
  };

  return {
    nameEn,
    nameAr: String(r.name_ar || ''),
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
    nutrition,
    items,
    notesEn: r.notes_en ? String(r.notes_en) : undefined,
    model: String(r.model || 'gemini'),
    provider: String(r.provider || 'gemini'),
  };
}

export function isAiScanEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_AI_SCAN === '0') return false;
  if (Platform.OS === 'web') return true;
  return Boolean(process.env.EXPO_PUBLIC_AI_API_BASE);
}
