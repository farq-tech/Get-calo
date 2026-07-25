/**
 * Persist every real scan (image + labels) to Supabase for model training.
 * Fire-and-forget from the scan path — never blocks UX.
 */

import { Platform } from 'react-native';

import type { LocaleCode, ScanResult } from '@/types';
import { getDeviceId } from '@/utils/deviceId';
import { isSupabaseConfigured, supabase } from './supabase';

export interface TrainingScanPayload {
  result: ScanResult;
  locale: LocaleCode;
  source?: 'scan' | 'correction';
  /** User-chosen label when source is correction */
  correctedItemIdentity?: string | null;
  correctedName?: string | null;
}

function guessExt(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('image/png') || lower.includes('.png')) return 'png';
  if (lower.includes('image/webp') || lower.includes('.webp')) return 'webp';
  return 'jpg';
}

function isDemoUri(uri: string): boolean {
  return uri.startsWith('web-demo:') || uri.startsWith('demo:');
}

async function uriToBlob(uri: string): Promise<Blob | null> {
  try {
    if (uri.startsWith('data:')) {
      const resp = await fetch(uri);
      return await resp.blob();
    }
    const resp = await fetch(uri);
    return await resp.blob();
  } catch (err) {
    console.warn('[get-calo/training] image read failed', err);
    return null;
  }
}

async function uploadTrainingImage(uri: string, deviceId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  if (isDemoUri(uri) || !uri) return null;

  const blob = await uriToBlob(uri);
  if (!blob || blob.size < 32) return null;

  // Cap ~4.5MB to avoid storage abuse on mobile networks
  if (blob.size > 4_500_000) {
    console.warn('[get-calo/training] image too large, skipping upload', blob.size);
    return null;
  }

  const ext = guessExt(uri);
  const path = `scans/${deviceId}/${Date.now()}.${ext}`;
  const contentType =
    blob.type ||
    (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

  const { error } = await supabase.storage.from('training-scans').upload(path, blob, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.warn('[get-calo/training] storage upload failed', error.message);
    return null;
  }
  return path;
}

/** Save a completed scan for the training dataset. Never throws to callers. */
export async function saveScanForTraining(payload: TrainingScanPayload): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;

    const { result, locale } = payload;
    if (!result?.imageUri || isDemoUri(result.imageUri)) return;

    const deviceId = await getDeviceId();
    const imagePath = await uploadTrainingImage(result.imageUri, deviceId);

    const items = (result.items?.length ? result.items : result.nutrition ? [result.nutrition] : []).map(
      (item) => ({
        name_en: item.nameEn,
        name_ar: item.nameAr,
        item_identity: item.itemIdentity,
        class_id: item.classId,
        calories_kcal: item.caloriesKcal,
        protein_g: item.proteinG,
        carbs_g: item.carbsG,
        fat_g: item.fatG,
        serving_size_g: item.servingSizeG,
        category: item.category,
      }),
    );

    const detections = (result.detections || []).map((d) => ({
      class_id: d.classId,
      confidence: d.confidence,
      label: d.label ?? null,
      bbox: d.bbox,
    }));

    const { error } = await supabase.from('training_scans').insert({
      device_id: deviceId,
      image_storage_path: imagePath,
      locale,
      platform: Platform.OS,
      model_version: result.modelVersion,
      predicted_name_en: result.nutrition?.nameEn ?? result.topDetection?.label ?? null,
      predicted_name_ar: result.nutrition?.nameAr ?? null,
      predicted_confidence: result.confidence,
      calories_kcal: result.nutrition?.caloriesKcal ?? null,
      protein_g: result.nutrition?.proteinG ?? null,
      carbs_g: result.nutrition?.carbsG ?? null,
      fat_g: result.nutrition?.fatG ?? null,
      serving_size_g: result.nutrition?.servingSizeG ?? null,
      items,
      detections,
      used_fallback: result.usedFallback,
      corrected_item_identity: payload.correctedItemIdentity ?? null,
      corrected_name: payload.correctedName ?? null,
      source: payload.source ?? 'scan',
      status: 'pending',
    });

    if (error) {
      console.warn('[get-calo/training] insert failed', error.message);
    }
  } catch (err) {
    console.warn('[get-calo/training] save failed', err);
  }
}
