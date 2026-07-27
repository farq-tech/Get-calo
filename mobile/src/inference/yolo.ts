/**
 * On-device food/drink scan for Get Calo.
 *
 * Runs bundled YOLOv8 ONNX via onnxruntime-web / react-native.
 * On failure returns empty detections (no random catalog mocks).
 */

import { Platform } from 'react-native';

import type { Detection } from '@/types';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';

import { runOnnx, getOnnxSession, getOrtLoadError } from './ortSession';
import { decodeYoloOutput } from './postprocess';
import { preprocessImageUri } from './preprocess';

export const BUNDLED_MODEL_VERSION = '1.2.0-essential69-drinks';

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




/** Resolve scan URI (identity — kept for callers that previously remapped demo URIs). */
export async function resolveScanUri(uri: string): Promise<string> {
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

  // Do not invent random catalog foods — that produced "Corn Flour" / "Curry Powder" nonsense.
  return {
    detections: [],
    backend: 'mock',
    modelVersion: `${active.modelVersion}-mock`.replace(/-mock-mock$/, '-mock'),
  };
}

export function isLowConfidence(confidence: number, threshold = LOW_CONFIDENCE_THRESHOLD): boolean {
  return confidence < threshold;
}
