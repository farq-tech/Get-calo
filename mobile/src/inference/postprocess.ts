import type { Detection } from '@/types';

import { getModelClass, MODEL_NUM_CLASSES } from './labels';
import type { LetterboxMeta } from './preprocess';

export interface YoloDecodeOptions {
  confidenceThreshold: number;
  iouThreshold?: number;
  maxDetections?: number;
}

function iou(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Decode Ultralytics YOLOv8 ONNX output `[1, 4+nc, N]` → detections.
 * Boxes are xywh in letterbox pixel space.
 */
export function decodeYoloOutput(
  output: Float32Array | number[],
  dims: readonly number[],
  meta: LetterboxMeta,
  options: YoloDecodeOptions,
): Detection[] {
  const confTh = options.confidenceThreshold;
  const iouTh = options.iouThreshold ?? 0.45;
  const maxDet = options.maxDetections ?? 5;

  // Expected [1, 4+nc, anchors]
  let channels = 4 + MODEL_NUM_CLASSES;
  let anchors = 8400;
  if (dims.length === 3) {
    channels = dims[1] ?? channels;
    anchors = dims[2] ?? anchors;
  }

  const nc = channels - 4;
  const candidates: Array<{
    classId: number;
    confidence: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];

  for (let i = 0; i < anchors; i += 1) {
    let bestCls = 0;
    let bestScore = -1;
    for (let c = 0; c < nc; c += 1) {
      const score = Number(output[(4 + c) * anchors + i] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestCls = c;
      }
    }
    if (bestScore < confTh) continue;

    const cx = Number(output[0 * anchors + i] ?? 0);
    const cy = Number(output[1 * anchors + i] ?? 0);
    const w = Number(output[2 * anchors + i] ?? 0);
    const h = Number(output[3 * anchors + i] ?? 0);

    candidates.push({
      classId: bestCls,
      confidence: bestScore,
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2,
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  const kept: typeof candidates = [];
  for (const det of candidates) {
    let suppressed = false;
    for (const prev of kept) {
      if (prev.classId === det.classId && iou(prev, det) > iouTh) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) {
      kept.push(det);
      if (kept.length >= maxDet) break;
    }
  }

  return kept.map((det) => {
    // Undo letterbox → normalized original image coords
    const x1 = (det.x1 - meta.padX) / meta.ratio;
    const y1 = (det.y1 - meta.padY) / meta.ratio;
    const x2 = (det.x2 - meta.padX) / meta.ratio;
    const y2 = (det.y2 - meta.padY) / meta.ratio;
    const nx = Math.min(1, Math.max(0, x1 / meta.width));
    const ny = Math.min(1, Math.max(0, y1 / meta.height));
    const nw = Math.min(1 - nx, Math.max(0, (x2 - x1) / meta.width));
    const nh = Math.min(1 - ny, Math.max(0, (y2 - y1) / meta.height));
    const modelClass = getModelClass(det.classId);
    return {
      classId: det.classId,
      confidence: det.confidence,
      bbox: { x: nx, y: ny, width: nw, height: nh },
      label: modelClass?.nameEn,
    };
  });
}
