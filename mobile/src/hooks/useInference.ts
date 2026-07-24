import { useCallback, useState } from 'react';

import { lookupByClassId } from '@/db/nutrition';
import { isLowConfidence, loadModel, runInference } from '@/inference/yolo';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import type { ScanResult } from '@/types';

export interface UseInferenceReturn {
  scanning: boolean;
  error: string | null;
  scan: (imageUri: string) => Promise<ScanResult | null>;
  resetError: () => void;
}

export function useInference(): UseInferenceReturn {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threshold = useSettingsStore((s) => s.confidenceThreshold);
  const setLastResult = useScanStore((s) => s.setLastResult);

  const scan = useCallback(
    async (imageUri: string): Promise<ScanResult | null> => {
      setScanning(true);
      setError(null);
      try {
        await loadModel();
        const { detections, backend, modelVersion } = await runInference(imageUri, {
          confidenceThreshold: threshold,
        });

        const top = detections[0] ?? null;
        const nutrition = top ? await lookupByClassId(top.classId) : null;
        const confidence = top?.confidence ?? 0;
        const lowConfidence = !top || isLowConfidence(confidence, threshold);

        const result: ScanResult = {
          imageUri,
          detections,
          topDetection: top,
          nutrition,
          confidence,
          lowConfidence,
          modelVersion,
          inferredAt: new Date().toISOString(),
          usedFallback: backend === 'mock',
        };

        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Inference failed';
        setError(message);
        return null;
      } finally {
        setScanning(false);
      }
    },
    [setLastResult, threshold],
  );

  const resetError = useCallback(() => setError(null), []);

  return { scanning, error, scan, resetError };
}
