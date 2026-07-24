import { useCallback, useRef, useState } from 'react';

import { lookupByClassId } from '@/db/nutrition';
import { analyzeFoodWithAi, AI_MODEL_VERSION, isAiScanEnabled } from '@/inference/aiVision';
import { isLowConfidence, loadModel, runInference } from '@/inference/yolo';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import type { ScanStepId } from '@/components/ScanProgressOverlay';
import type { Detection, ScanResult } from '@/types';

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
  const locale = useSettingsStore((s) => s.locale);
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
        await wait(280);
        if (cancelledRef.current) return null;

        setScanStep('identifying');

        // Primary path: cloud AI vision (Gemini)
        if (isAiScanEnabled()) {
          try {
            const ai = await analyzeFoodWithAi(imageUri, locale);
            if (cancelledRef.current) return null;

            setScanStep('calculating');
            await wait(220);
            if (cancelledRef.current) return null;

            setScanStep('preparing');
            await wait(220);
            if (cancelledRef.current) return null;

            const detection: Detection = {
              classId: -1,
              confidence: ai.confidence,
              bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
              label: ai.nameEn,
            };

            const result: ScanResult = {
              imageUri,
              detections: [detection],
              topDetection: detection,
              nutrition: ai.nutrition,
              confidence: ai.confidence,
              lowConfidence: isLowConfidence(ai.confidence, threshold),
              modelVersion: `${AI_MODEL_VERSION}:${ai.model}`,
              inferredAt: new Date().toISOString(),
              usedFallback: false,
            };
            setLastResult(result);
            return result;
          } catch (aiErr) {
            console.warn('[calora] AI scan failed, falling back to on-device', aiErr);
            // continue to YOLO fallback below
          }
        }

        // Fallback: on-device YOLO
        await loadModel();
        if (cancelledRef.current) return null;
        const { detections, backend, modelVersion } = await runInference(imageUri, {
          confidenceThreshold: threshold,
        });
        if (cancelledRef.current) return null;

        setScanStep('calculating');
        const top = detections[0] ?? null;
        const nutrition = top ? await lookupByClassId(top.classId) : null;
        await wait(200);
        if (cancelledRef.current) return null;

        setScanStep('preparing');
        await wait(200);
        if (cancelledRef.current) return null;

        const confidence = top?.confidence ?? 0;
        const result: ScanResult = {
          imageUri,
          detections,
          topDetection: top,
          nutrition,
          confidence,
          lowConfidence: !top || isLowConfidence(confidence, threshold),
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
    [locale, setLastResult, threshold],
  );

  const resetError = useCallback(() => setError(null), []);

  return { scanning, scanStep, previewUri, error, scan, cancelScan, resetError };
}
