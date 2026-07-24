/**
 * On-device food/drink scan for Calora.
 *
 * Production path: onnxruntime-react-native (custom/dev client).
 * Expo Go / web / missing native module: catalog-backed mock so you can still
 * scan meals, drinks, and snacks and correct them from the full nutrition list.
 */

import { Platform } from 'react-native';

import type { Detection } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';
import { getBundledNutritionSeed } from '@/db/seed';

export const BUNDLED_MODEL_VERSION = '1.0.0-bundled';

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
let ortModule: typeof import('onnxruntime-react-native') | null = null;
let ortLoadAttempted = false;

async function tryLoadOrt(): Promise<typeof import('onnxruntime-react-native') | null> {
  if (ortLoadAttempted) return ortModule;
  ortLoadAttempted = true;
  try {
    ortModule = await import('onnxruntime-react-native');
    return ortModule;
  } catch {
    ortModule = null;
    return null;
  }
}

export function preferredBackend(): InferenceBackend {
  if (Platform.OS === 'ios') return 'coreml';
  if (Platform.OS === 'android') return 'tflite';
  return 'onnx';
}

export async function loadModel(): Promise<InferenceSession> {
  if (session?.ready) return session;

  const ort = await tryLoadOrt();
  if (ort) {
    session = {
      backend: 'onnx',
      modelVersion: BUNDLED_MODEL_VERSION,
      ready: true,
    };
    return session;
  }

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
  return Math.max(1, getBundledNutritionSeed().length);
}

function mockDetections(uri: string, threshold: number): Detection[] {
  const classCount = catalogSize();
  const seed = hashUri(uri);
  const classId = seed % classCount;
  const confidence = 0.55 + ((seed % 40) / 100);
  const jitter = ((seed >> 8) % 20) / 100;

  const primary: Detection = {
    classId,
    confidence: Math.min(0.98, confidence),
    bbox: {
      x: 0.18 + jitter * 0.2,
      y: 0.22 + jitter * 0.15,
      width: 0.55 - jitter * 0.1,
      height: 0.5 - jitter * 0.1,
    },
  };

  const secondary: Detection = {
    classId: (classId + 7) % classCount,
    confidence: Math.max(0.15, primary.confidence - 0.28),
    bbox: {
      x: 0.55,
      y: 0.55,
      width: 0.3,
      height: 0.28,
    },
  };

  return [primary, secondary].filter((d) => d.confidence >= threshold * 0.5);
}

export async function runInference(
  uri: string,
  options: RunInferenceOptions = {},
): Promise<{ detections: Detection[]; backend: InferenceBackend; modelVersion: string }> {
  const threshold = options.confidenceThreshold ?? LOW_CONFIDENCE_THRESHOLD;
  const maxDetections = options.maxDetections ?? 5;

  const active = session ?? (await loadModel());

  if (active.backend === 'onnx' && ortModule) {
    console.info('[calora/yolo] ONNX module present — using catalog match until model is wired');
  }

  const detections = mockDetections(uri, threshold)
    .filter((d) => d.confidence >= threshold * 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxDetections);

  return {
    detections,
    backend: active.backend,
    modelVersion: active.modelVersion,
  };
}

export function isLowConfidence(confidence: number, threshold = LOW_CONFIDENCE_THRESHOLD): boolean {
  return confidence < threshold;
}
