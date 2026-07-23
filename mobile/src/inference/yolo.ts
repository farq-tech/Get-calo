/**
 * On-device YOLO inference for Calora.
 *
 * Production path: onnxruntime-react-native (custom/dev client).
 * Expo Go / missing native module: deterministic mock detector so UI still works.
 *
 * Wire CoreML (.mlpackage) on iOS and TFLite on Android via a thin native bridge
 * when shipping store builds — see README.md.
 */

import { Platform } from 'react-native';

import type { Detection } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';

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
    // Dynamic import so Expo Go does not hard-crash when the native module is absent.
    ortModule = await import('onnxruntime-react-native');
    return ortModule;
  } catch {
    ortModule = null;
    return null;
  }
}

/**
 * Preferred backend for the current platform when a native model is present.
 */
export function preferredBackend(): InferenceBackend {
  if (Platform.OS === 'ios') return 'coreml';
  if (Platform.OS === 'android') return 'tflite';
  return 'onnx';
}

export async function loadModel(): Promise<InferenceSession> {
  if (session?.ready) return session;

  const ort = await tryLoadOrt();
  if (ort) {
    // Production: load assets/models/food_yolo.onnx (or platform-specific asset).
    // Ort session creation is deferred until the binary is bundled in a custom build.
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

/**
 * Hash a URI string into a stable pseudo-random seed for mock detections.
 */
function hashUri(uri: string): number {
  let h = 2166136261;
  for (let i = 0; i < uri.length; i += 1) {
    h ^= uri.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mockDetections(uri: string, threshold: number): Detection[] {
  const seed = hashUri(uri);
  const classId = seed % 20;
  const confidence = 0.35 + ((seed % 60) / 100); // 0.35 – 0.94
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
    classId: (classId + 7) % 20,
    confidence: Math.max(0.15, primary.confidence - 0.25),
    bbox: {
      x: 0.55,
      y: 0.55,
      width: 0.3,
      height: 0.28,
    },
  };

  return [primary, secondary].filter((d) => d.confidence >= threshold * 0.5);
}

/**
 * Run YOLO inference on a local image URI.
 * Returns detections sorted by confidence descending.
 */
export async function runInference(
  uri: string,
  options: RunInferenceOptions = {},
): Promise<{ detections: Detection[]; backend: InferenceBackend; modelVersion: string }> {
  const threshold = options.confidenceThreshold ?? LOW_CONFIDENCE_THRESHOLD;
  const maxDetections = options.maxDetections ?? 5;

  const active = session ?? (await loadModel());

  if (active.backend === 'onnx' && ortModule) {
    // Placeholder for production ONNX path:
    // 1. Decode image → float32 NCHW tensor (letterbox 640)
    // 2. session.run({ images: tensor })
    // 3. NMS + class decode against labels.json
    // Until the .onnx binary is bundled, fall through to mock so UX remains demoable.
    console.info('[calora/yolo] ONNX module present — using mock until model asset is bundled');
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
