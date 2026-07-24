import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import jpeg from 'jpeg-js';

import { MODEL_INPUT_SIZE } from './labels';

export interface LetterboxMeta {
  /** Original image width */
  width: number;
  /** Original image height */
  height: number;
  /** Resize scale applied before padding */
  ratio: number;
  /** Left pad in letterbox canvas */
  padX: number;
  /** Top pad in letterbox canvas */
  padY: number;
}

export interface PreprocessedImage {
  /** NCHW float32 tensor data, length 1*3*640*640 */
  tensor: Float32Array;
  meta: LetterboxMeta;
}

interface DecodedRgb {
  width: number;
  height: number;
  /** RGB pixels, length width*height*3 */
  data: Uint8Array;
}

async function decodeImageWeb(uri: string): Promise<DecodedRgb> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  const src = imageData.data;
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    rgb[j] = src[i]!;
    rgb[j + 1] = src[i + 1]!;
    rgb[j + 2] = src[i + 2]!;
  }
  return { width: canvas.width, height: canvas.height, data: rgb };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function decodeImageNative(uri: string): Promise<DecodedRgb> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(base64);
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  const rgb = new Uint8Array(decoded.width * decoded.height * 3);
  const src = decoded.data;
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    rgb[j] = src[i]!;
    rgb[j + 1] = src[i + 1]!;
    rgb[j + 2] = src[i + 2]!;
  }
  return { width: decoded.width, height: decoded.height, data: rgb };
}

function sampleRgb(
  src: DecodedRgb,
  x: number,
  y: number,
): [number, number, number] {
  const xi = Math.min(src.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(src.height - 1, Math.max(0, Math.round(y)));
  const idx = (yi * src.width + xi) * 3;
  return [src.data[idx]!, src.data[idx + 1]!, src.data[idx + 2]!];
}

/**
 * Letterbox resize to 640², RGB /255, NCHW layout (Ultralytics ONNX).
 */
export function letterboxToTensor(src: DecodedRgb): PreprocessedImage {
  const size = MODEL_INPUT_SIZE;
  const ratio = Math.min(size / src.height, size / src.width);
  const newW = Math.round(src.width * ratio);
  const newH = Math.round(src.height * ratio);
  const padX = Math.floor((size - newW) / 2);
  const padY = Math.floor((size - newH) / 2);

  const tensor = new Float32Array(1 * 3 * size * size);
  const plane = size * size;
  // fill gray 114/255 like Ultralytics
  const fill = 114 / 255;
  tensor.fill(fill);

  for (let y = 0; y < newH; y += 1) {
    for (let x = 0; x < newW; x += 1) {
      const srcX = (x + 0.5) / ratio - 0.5;
      const srcY = (y + 0.5) / ratio - 0.5;
      const [r, g, b] = sampleRgb(src, srcX, srcY);
      const dx = x + padX;
      const dy = y + padY;
      const pix = dy * size + dx;
      tensor[pix] = r / 255;
      tensor[plane + pix] = g / 255;
      tensor[2 * plane + pix] = b / 255;
    }
  }

  return {
    tensor,
    meta: {
      width: src.width,
      height: src.height,
      ratio,
      padX,
      padY,
    },
  };
}

export async function preprocessImageUri(uri: string): Promise<PreprocessedImage> {
  const decoded =
    Platform.OS === 'web' ? await decodeImageWeb(uri) : await decodeImageNative(uri);
  return letterboxToTensor(decoded);
}
