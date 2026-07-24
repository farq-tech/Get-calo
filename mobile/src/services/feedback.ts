/**
 * Upload prediction corrections (+ optional image) to Calorie Scanner Supabase.
 */

import type { FeedbackPayload } from '@/types';
import { isSupabaseConfigured, supabase } from './supabase';

export interface FeedbackResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function guessExt(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.webp')) return 'webp';
  return 'jpg';
}

async function uploadImage(uri: string, deviceId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const ext = guessExt(uri);
  const path = `feedback/${deviceId}/${Date.now()}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from('feedback-images').upload(path, blob, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.warn('[calora/feedback] image upload failed', error.message);
    return null;
  }
  return path;
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
  if (!isSupabaseConfigured()) {
    // Offline / demo mode — accept locally so UX completes.
    return { ok: true, id: `local-${Date.now()}` };
  }

  const deviceId = payload.deviceId ?? 'anonymous';
  let imagePath: string | null = null;

  if (payload.imageUri) {
    try {
      imagePath = await uploadImage(payload.imageUri, deviceId);
    } catch (err) {
      console.warn('[calora/feedback] image read failed', err);
    }
  }

  const { data, error } = await supabase
    .from('prediction_feedback')
    .insert({
      device_id: deviceId,
      predicted_class_id: payload.predictedClassId,
      predicted_item_identity: payload.predictedItemIdentity,
      predicted_confidence: payload.predictedConfidence,
      corrected_item_identity: payload.correctedItemIdentity,
      corrected_name: payload.correctedName,
      image_storage_path: imagePath,
      locale: payload.locale,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data.id as string };
}
