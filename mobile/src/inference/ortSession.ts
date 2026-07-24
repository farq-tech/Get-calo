/**
 * ONNX Runtime session loader for Calora YOLO.
 * Web: load onnxruntime-web from CDN (avoids Metro bundling issues).
 * Native: onnxruntime-react-native when available.
 */

import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import modelAsset from '../../assets/models/best.onnx';

type OrtLike = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (
    type: 'float32',
    data: Float32Array,
    dims: number[],
  ) => { data: Float32Array; dims: readonly number[] };
  InferenceSession: {
    create: (
      uri: string,
      options?: { executionProviders?: string[] },
    ) => Promise<{
      inputNames: string[];
      outputNames: string[];
      run: (
        feeds: Record<string, unknown>,
      ) => Promise<Record<string, { data: Float32Array | ArrayLike<number>; dims: readonly number[] }>>;
    }>;
  };
};

type InferenceSession = Awaited<ReturnType<OrtLike['InferenceSession']['create']>>;

let ortWeb: OrtLike | null = null;
let ortNative: OrtLike | null = null;
let session: InferenceSession | null = null;
let loadError: string | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('document unavailable'));
      return;
    }
    const existing = document.querySelector(`script[data-calora-ort="1"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.caloraOrt = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadOrtWeb(): Promise<OrtLike> {
  if (ortWeb) return ortWeb;
  const CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist';
  await loadScript(`${CDN}/ort.wasm.min.js`);
  const ort = (globalThis as unknown as { ort?: OrtLike }).ort;
  if (!ort) throw new Error('onnxruntime-web global missing after script load');
  ort.env.wasm.wasmPaths = `${CDN}/`;
  ort.env.wasm.numThreads = 1;
  ortWeb = ort;
  return ort;
}

async function resolveModelUri(): Promise<string> {
  const asset = Asset.fromModule(modelAsset);
  await asset.downloadAsync();
  if (!asset.localUri && !asset.uri) {
    throw new Error('ONNX model asset URI missing');
  }
  // Prefer absolute URL on web so ORT WASM can fetch weights.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const uri = asset.uri;
    if (uri.startsWith('http') || uri.startsWith('blob:') || uri.startsWith('data:')) return uri;
    return new URL(uri, window.location.origin).href;
  }
  return asset.localUri ?? asset.uri;
}

export async function getOnnxSession(): Promise<{
  session: InferenceSession;
  backend: 'onnx';
} | null> {
  if (session) return { session, backend: 'onnx' };
  if (loadError) return null;

  try {
    const modelUri = await resolveModelUri();

    if (Platform.OS === 'web') {
      const ort = await loadOrtWeb();
      session = await ort.InferenceSession.create(modelUri, {
        executionProviders: ['wasm'],
      });
      return { session, backend: 'onnx' };
    }

    try {
      const native = (await import('onnxruntime-react-native')) as unknown as OrtLike;
      ortNative = native;
      session = await native.InferenceSession.create(modelUri);
      return { session, backend: 'onnx' };
    } catch (nativeErr) {
      console.warn('[calora/ort] native ORT unavailable', nativeErr);
      loadError = nativeErr instanceof Error ? nativeErr.message : 'native ort failed';
      return null;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'onnx load failed';
    console.warn('[calora/ort] failed to load session', loadError);
    return null;
  }
}

export async function runOnnx(
  input: Float32Array,
): Promise<{ data: Float32Array; dims: readonly number[] } | null> {
  const loaded = await getOnnxSession();
  if (!loaded) return null;

  const ort =
    Platform.OS === 'web'
      ? await loadOrtWeb()
      : (ortNative ?? ((await import('onnxruntime-react-native')) as unknown as OrtLike));

  const tensor = new ort.Tensor('float32', input, [1, 3, 640, 640]);
  const feeds: Record<string, unknown> = {};
  const inputName = loaded.session.inputNames[0] ?? 'images';
  feeds[inputName] = tensor;

  const results = await loaded.session.run(feeds);
  const outputName = loaded.session.outputNames[0] ?? 'output0';
  const out = results[outputName];
  if (!out) return null;

  const data =
    out.data instanceof Float32Array
      ? out.data
      : Float32Array.from(out.data as ArrayLike<number>);

  return { data, dims: out.dims };
}

export function getOrtLoadError(): string | null {
  return loadError;
}
