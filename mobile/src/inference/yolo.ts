/**
 * On-device food/drink scan for Calora.
 *
 * Runs bundled YOLOv8 ONNX (40 Farq food/drink classes) via:
 * - Web: onnxruntime-web (WASM)
 * - Native custom builds: onnxruntime-react-native
 *
 * Falls back to catalog mock only if the model cannot load.
 */

import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import type { Detection } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';
import { getBundledNutritionSeed } from '@/db/seed';

import { getModelClass } from './labels';
import { runOnnx, getOnnxSession, getOrtLoadError } from './ortSession';
import { decodeYoloOutput } from './postprocess';
import { preprocessImageUri } from './preprocess';

import demoMeal from '../../assets/samples/demo-meal.jpg';

export const BUNDLED_MODEL_VERSION = '1.0.0-onnx-farq40';

export type InferenceBackend = 'onnx' | 'tflite' | 'coreml' | 'mock';

export interface InferenceSession {
  backend: InferenceBackend;
  modelVersion: string;
  ready: boolean;
}

export interface RunInferenceOptions {
  confidenceThreshold?: number;
  maxDetections?: number;
}

let session: InferenceSession | null = null;

export function preferredBackend(): InferenceBackend {
  if (Platform.OS === 'ios') return 'coreml';
  if (Platform.OS === 'android') return 'tflite';
  return 'onnx';
}

export async function loadModel(): Promise<InferenceSession> {
  if (session?.ready) return session;

  const onnx = await getOnnxSession();
  if (onnx) {
    session = {
      backend: 'onnx',
      modelVersion: BUNDLED_MODEL_VERSION,
      ready: true,
    };
    return session;
  }

  console.warn('[calora/yolo] ONNX unavailable, using mock', getOrtLoadError());
  session = {
    backend: 'mock',
    modelVersion: `${BUNDLED_MODEL_VERSION}-mock`,
    ready: true,
  };
  return session;
}

export function getSession(): InferenceSession | null {
  return session;
}

function hashUri(uri: string): number {
  let h = 2166136261;
  for (let i = 0; i < uri.length; i += 1) {
    h ^= uri.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function catalogSize(): number {
  // Mock only samples model classes 0–39 so IDs stay aligned with nutrition seed.
  return Math.min(40, Math.max(1, getBundledNutritionSeed().length));
}

function mockDetections(uri: string, threshold: number): Detection[] {
  const classCount = catalogSize();
  const seed = hashUri(uri);
  const classId = seed % classCount;
  const confidence = 0.55 + ((seed % 40) / 100);
  const jitter = ((seed >> 8) % 20) / 100;
  const modelClass = getModelClass(classId);

  const primary: Detection = {
    classId,
    confidence: Math.min(0.98, confidence),
    bbox: {
      x: 0.18 + jitter * 0.2,
      y: 0.22 + jitter * 0.15,
      width: 0.55 - jitter * 0.1,
      height: 0.5 - jitter * 0.1,
    },
    label: modelClass?.nameEn,
  };

  return [primary].filter((d) => d.confidence >= threshold * 0.5);
}

/** Resolve demo / non-file URIs to a real sample meal photo. */
export async function resolveScanUri(uri: string): Promise<string> {
  if (uri.startsWith('web-demo:') || uri.startsWith('demo:')) {
    const asset = Asset.fromModule(demoMeal);
    await asset.downloadAsync();
    return asset.localUri ?? asset.uri;
  }
  return uri;
}

async function runOnnxInference(
  uri: string,
  threshold: number,
  maxDetections: number,
): Promise<Detection[] | null> {
  try {
    const resolved = await resolveScanUri(uri);
    const { tensor, meta } = await preprocessImageUri(resolved);
    const output = await runOnnx(tensor);
    if (!output) return null;

    // Slightly lower gate for decode, then filter to user threshold.
    const decoded = decodeYoloOutput(output.data, output.dims, meta, {
      confidenceThreshold: Math.min(0.25, threshold),
      maxDetections: Math.max(maxDetections, 10),
    });

    return decoded
      .filter((d) => d.confidence >= threshold)
      .slice(0, maxDetections);
  } catch (err) {
    console.warn('[calora/yolo] onnx inference failed', err);
    return null;
  }
}

export async function runInference(
  uri: string,
  options: RunInferenceOptions = {},
): Promise<{ detections: Detection[]; backend: InferenceBackend; modelVersion: string }> {
  const threshold = options.confidenceThreshold ?? LOW_CONFIDENCE_THRESHOLD;
  const maxDetections = options.maxDetections ?? 5;

  const active = session ?? (await loadModel());

  if (active.backend === 'onnx') {
    const detections = await runOnnxInference(uri, threshold, maxDetections);
    if (detections) {
      return {
        detections,
        backend: 'onnx',
        modelVersion: active.modelVersion,
      };
    }
  }

  const detections = mockDetections(uri, threshold)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxDetections);

  return {
    detections,
    backend: 'mock',
    modelVersion: `${active.modelVersion}-mock`.replace(/-mock-mock$/, '-mock'),
  };
}

export function isLowConfidence(confidence: number, threshold = LOW_CONFIDENCE_THRESHOLD): boolean {
  return confidence < threshold;
}
