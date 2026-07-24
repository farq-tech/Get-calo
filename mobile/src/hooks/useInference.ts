import { useCallback, useRef, useState } from 'react';

import { lookupByClassId, searchNutrition } from '@/db/nutrition';
import { analyzeFoodWithAi, AI_MODEL_VERSION, isAiScanEnabled } from '@/inference/aiVision';
import { isLowConfidence, loadModel, runInference } from '@/inference/yolo';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { SCAN_STEP_ORDER, type ScanStepId } from '@/components/ScanProgressOverlay';
import type { Detection, NutritionItem, ScanResult } from '@/types';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDemoUri(uri: string) {
  return uri.startsWith('web-demo:') || uri.startsWith('demo:');
}

const DEMO_NUTRITION: NutritionItem = {
  itemIdentity: 'demo.chicken_kabsa',
  classId: -100,
  nameEn: 'Chicken Kabsa',
  nameAr: 'كبسة دجاج',
  caloriesKcal: 487,
  proteinG: 32,
  carbsG: 54,
  fatG: 18,
  servingSizeG: 240,
  servingLabelEn: '1 plate',
  servingLabelAr: 'صحن واحد',
  category: 'meal',
};

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

  const advanceSteps = useCallback(async (until: ScanStepId) => {
    const target = SCAN_STEP_ORDER.indexOf(until);
    for (let i = 0; i <= target; i++) {
      if (cancelledRef.current) return;
      setScanStep(SCAN_STEP_ORDER[i]);
      await wait(i === 0 ? 180 : 420 + Math.random() * 180);
    }
  }, []);

  const scan = useCallback(
    async (imageUri: string): Promise<ScanResult | null> => {
      cancelledRef.current = false;
      setScanning(true);
      setPreviewUri(imageUri);
      setError(null);
      try {
        setScanStep('recognize');

        // Built-in demo path — always returns a complete nutrition result.
        if (isDemoUri(imageUri)) {
          await advanceSteps('finalize');
          if (cancelledRef.current) return null;
          const matches = await searchNutrition('kabsa', 5);
          const nutrition = matches[0] ?? DEMO_NUTRITION;
          const detection: Detection = {
            classId: nutrition.classId ?? -100,
            confidence: 0.94,
            bbox: { x: 0.12, y: 0.12, width: 0.76, height: 0.76 },
            label: nutrition.nameEn,
          };
          const result: ScanResult = {
            imageUri,
            detections: [detection],
            topDetection: detection,
            nutrition,
            confidence: 0.94,
            lowConfidence: false,
            modelVersion: 'demo-1.0',
            inferredAt: new Date().toISOString(),
            usedFallback: false,
          };
          setLastResult(result);
          return result;
        }

        if (isAiScanEnabled()) {
          try {
            const progress = (async () => {
              await advanceSteps('portion');
            })();

            const ai = await analyzeFoodWithAi(imageUri, locale);
            await progress;
            if (cancelledRef.current) return null;

            await advanceSteps('finalize');
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
            console.warn('[snapcal] cloud scan failed, falling back on-device', aiErr);
          }
        }

        await loadModel();
        if (cancelledRef.current) return null;
        setScanStep('ingredients');
        const { detections, modelVersion } = await runInference(imageUri, {
          confidenceThreshold: threshold,
        });
        if (cancelledRef.current) return null;

        await advanceSteps('finalize');
        if (cancelledRef.current) return null;

        const top = detections[0] ?? null;
        const nutrition = top ? await lookupByClassId(top.classId) : null;
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
          usedFallback: !top,
        };
        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scan failed';
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
    [advanceSteps, locale, setLastResult, threshold],
  );

  const resetError = useCallback(() => setError(null), []);

  return { scanning, scanStep, previewUri, error, scan, cancelScan, resetError };
}
