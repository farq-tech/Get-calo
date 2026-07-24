import { useCallback, useRef, useState } from 'react';

import { lookupByClassId } from '@/db/nutrition';
import { isLowConfidence, loadModel, runInference } from '@/inference/yolo';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import type { ScanStepId } from '@/components/ScanProgressOverlay';
import type { ScanResult } from '@/types';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UseInferenceReturn {
  scanning: boolean;
  scanStep: ScanStepId | null;
  previewUri: string | null;
  error: string | null;
  scan: (imageUri: string) => Promise<ScanResult | null>;
  cancelScan: () => void;
  resetError: () => void;
}

export function useInference(): UseInferenceReturn {
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState<ScanStepId | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const threshold = useSettingsStore((s) => s.confidenceThreshold);
  const setLastResult = useScanStore((s) => s.setLastResult);

  const cancelScan = useCallback(() => {
    cancelledRef.current = true;
    setScanning(false);
    setScanStep(null);
    setPreviewUri(null);
  }, []);

  const scan = useCallback(
    async (imageUri: string): Promise<ScanResult | null> => {
      cancelledRef.current = false;
      setScanning(true);
      setPreviewUri(imageUri);
      setError(null);
      try {
        setScanStep('uploading');
        await wait(380);
        if (cancelledRef.current) return null;

        setScanStep('identifying');
        await loadModel();
        if (cancelledRef.current) return null;
        const { detections, backend, modelVersion } = await runInference(imageUri, {
          confidenceThreshold: threshold,
        });
        if (cancelledRef.current) return null;

        setScanStep('calculating');
        const top = detections[0] ?? null;
        const nutrition = top ? await lookupByClassId(top.classId) : null;
        await wait(280);
        if (cancelledRef.current) return null;

        setScanStep('preparing');
        await wait(320);
        if (cancelledRef.current) return null;

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
        if (cancelledRef.current) return null;
        const message = err instanceof Error ? err.message : 'Inference failed';
        setError(message);
        return null;
      } finally {
        if (!cancelledRef.current) {
          setScanning(false);
          setScanStep(null);
          setPreviewUri(null);
        }
      }
    },
    [setLastResult, threshold],
  );

  const resetError = useCallback(() => setError(null), []);

  return { scanning, scanStep, previewUri, error, scan, cancelScan, resetError };
}
