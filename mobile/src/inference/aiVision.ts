/**
 * Cloud AI vision scan (Gemini) — primary recognition path for Calora.
 * Supports multi-item plates via `items[]`.
 */

import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import type { NutritionItem } from '@/types';

import demoMeal from '../../assets/samples/demo-meal.jpg';

export const AI_MODEL_VERSION = 'ai-gemini-vision-1.1';

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

async function uriToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  let resolved = uri;
  if (uri.startsWith('web-demo:') || uri.startsWith('demo:')) {
    const asset = Asset.fromModule(demoMeal);
    await asset.downloadAsync();
    resolved = asset.localUri ?? asset.uri;
  }

  const response = await fetch(resolved);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';

  if (Platform.OS === 'web') {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
    return { base64, mimeType };
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = globalThis.btoa(binary);
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
    itemIdentity: `ai.${slugify(nameEn)}.${index}`,
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
): Promise<AiFoodResult> {
  const base = apiBase();
  if (!base && Platform.OS !== 'web') {
    throw new Error('AI API base URL is not configured');
  }

  const { base64, mimeType } = await uriToBase64(imageUri);
  const endpoint = `${base || ''}/api/analyze-food`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType,
      locale,
    }),
  });

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload?.ok || !payload?.result) {
    throw new Error(payload?.error || `AI scan failed (${resp.status})`);
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
    itemIdentity: `ai.${slugify(nameEn)}`,
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
