/**
 * Cloud AI vision scan (Gemini) — primary recognition path for Calora.
 * Cost-optimized: compress image before upload; short server prompt; no thinking tokens.
 */

import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import type { NutritionItem } from '@/types';

import demoMeal from '../../assets/samples/demo-meal.jpg';

export const AI_MODEL_VERSION = 'ai-gemini-vision-1.1-econ';

const MAX_SIDE = 768;
const JPEG_QUALITY = 0.7;

export interface AiFoodResult {
  nameEn: string;
  nameAr: string;
  confidence: number;
  nutrition: NutritionItem;
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

async function blobToCompressedJpegBase64(blob: Blob): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return globalThis.btoa(binary);
  }

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
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
  const base64 = await blobToCompressedJpegBase64(blob);
  return { base64, mimeType: 'image/jpeg' };
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

  const r = payload.result;
  const nameEn = String(r.name_en || 'Unknown item');
  const nutrition: NutritionItem = {
    classId: -1,
    itemIdentity: `ai.${slugify(nameEn)}`,
    nameEn,
    nameAr: r.name_ar ? String(r.name_ar) : null,
    caloriesKcal: Number(r.calories_kcal) || 0,
    proteinG: Number(r.protein_g) || 0,
    carbsG: Number(r.carbs_g) || 0,
    fatG: Number(r.fat_g) || 0,
    servingSizeG: Number(r.serving_size_g) || 100,
    servingLabelEn: String(r.serving_label_en || 'serving'),
    servingLabelAr: r.serving_label_ar ? String(r.serving_label_ar) : null,
    category: r.category ? String(r.category) : 'food',
  };

  return {
    nameEn,
    nameAr: String(r.name_ar || ''),
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
    nutrition,
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
