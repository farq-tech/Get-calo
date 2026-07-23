/**
 * Background model update manager.
 * Checks Calorie Scanner Supabase `client_manifests` (+ CDN) for newer on-device models.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

import type { ClientManifest, ModelInfo } from '@/types';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { BUNDLED_MODEL_VERSION, getSession, loadModel, preferredBackend } from './yolo';

const MODEL_DIR = `${FileSystem.documentDirectory ?? ''}models/`;
const MANIFEST_CACHE = `${FileSystem.documentDirectory ?? ''}model_manifest.json`;

export interface ManifestCheckResult {
  current: ModelInfo;
  remote: ClientManifest | null;
  updateAvailable: boolean;
}

function platformKey(): 'ios' | 'android' | 'all' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'all';
}

async function ensureModelDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(MODEL_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  }
}

export async function getLocalModelInfo(): Promise<ModelInfo> {
  const session = getSession() ?? (await loadModel());
  let updateAvailable = false;
  try {
    const cached = await FileSystem.readAsStringAsync(MANIFEST_CACHE);
    const parsed = JSON.parse(cached) as { version?: string };
    if (parsed.version && parsed.version !== session.modelVersion) {
      updateAvailable = true;
    }
  } catch {
    // no cache yet
  }

  return {
    version: session.modelVersion,
    loaded: session.ready,
    backend: session.backend,
    lastCheckedAt: null,
    updateAvailable,
    offline: !isSupabaseConfigured(),
  };
}

/**
 * Query active client_manifests for this platform.
 */
export async function fetchRemoteManifest(): Promise<ClientManifest | null> {
  if (!isSupabaseConfigured()) return null;

  const platform = platformKey();
  const { data, error } = await supabase
    .from('client_manifests')
    .select(
      `
      id,
      platform,
      nutrition_db_url,
      labels_url,
      min_app_version,
      force_update,
      active,
      model_version_id,
      model_versions (
        version,
        artifact_urls,
        status
      )
    `,
    )
    .eq('active', true)
    .in('platform', [platform, 'all'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('[calora/modelManager] manifest fetch failed', error.message);
    return null;
  }

  const mv = data.model_versions as unknown as {
    version: string;
    artifact_urls: Record<string, string>;
    status: string;
  } | null;

  if (!mv) return null;

  return {
    id: data.id as string,
    platform: data.platform as ClientManifest['platform'],
    modelVersion: mv.version,
    modelVersionId: data.model_version_id as string,
    artifactUrls: {
      onnx: mv.artifact_urls?.onnx,
      tflite: mv.artifact_urls?.tflite,
      coreml: mv.artifact_urls?.coreml,
      labels: mv.artifact_urls?.labels ?? (data.labels_url as string | null) ?? undefined,
      nutritionDb:
        mv.artifact_urls?.nutritionDb ?? (data.nutrition_db_url as string | null) ?? undefined,
    },
    nutritionDbUrl: (data.nutrition_db_url as string | null) ?? null,
    labelsUrl: (data.labels_url as string | null) ?? null,
    minAppVersion: (data.min_app_version as string | null) ?? null,
    forceUpdate: Boolean(data.force_update),
    active: Boolean(data.active),
  };
}

export async function checkForModelUpdates(): Promise<ManifestCheckResult> {
  const session = getSession() ?? (await loadModel());
  const remote = await fetchRemoteManifest();
  const updateAvailable = Boolean(
    remote && remote.modelVersion !== session.modelVersion.replace(/-mock$/, ''),
  );

  if (remote && FileSystem.documentDirectory) {
    await ensureModelDir();
    await FileSystem.writeAsStringAsync(
      MANIFEST_CACHE,
      JSON.stringify({
        version: remote.modelVersion,
        checkedAt: new Date().toISOString(),
        forceUpdate: remote.forceUpdate,
      }),
    );
  }

  const cdnBase = process.env.EXPO_PUBLIC_MODEL_CDN_URL;
  if (updateAvailable && remote && cdnBase) {
    // Background download of artifacts is best-effort; failures leave bundled model in place.
    void downloadArtifacts(remote).catch((err) =>
      console.warn('[calora/modelManager] artifact download failed', err),
    );
  }

  return {
    current: {
      version: session.modelVersion,
      loaded: session.ready,
      backend: session.backend,
      lastCheckedAt: new Date().toISOString(),
      updateAvailable,
      offline: !isSupabaseConfigured() || remote === null,
    },
    remote,
    updateAvailable,
  };
}

async function downloadArtifacts(manifest: ClientManifest): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  await ensureModelDir();

  const backend = preferredBackend();
  const url =
    backend === 'coreml'
      ? manifest.artifactUrls.coreml
      : backend === 'tflite'
        ? manifest.artifactUrls.tflite
        : manifest.artifactUrls.onnx;

  if (!url) return;

  const ext = backend === 'coreml' ? 'mlpackage' : backend === 'tflite' ? 'tflite' : 'onnx';
  const dest = `${MODEL_DIR}food_yolo_${manifest.modelVersion}.${ext}`;
  const result = await FileSystem.downloadAsync(url, dest);
  if (result.status !== 200) {
    throw new Error(`Download failed with status ${result.status}`);
  }

  if (manifest.labelsUrl) {
    await FileSystem.downloadAsync(manifest.labelsUrl, `${MODEL_DIR}labels.json`);
  }
  if (manifest.nutritionDbUrl) {
    await FileSystem.downloadAsync(
      manifest.nutritionDbUrl,
      `${MODEL_DIR}nutrition.sqlite`,
    );
  }
}

export function getBundledVersion(): string {
  return BUNDLED_MODEL_VERSION;
}
