import { useCallback, useRef, useState } from 'react';

import { lookupByClassId } from '@/db/nutrition';
import { analyzeFoodWithAi, AI_MODEL_VERSION, isAiScanEnabled } from '@/inference/aiVision';
import { isLowConfidence, loadModel, runInference } from '@/inference/yolo';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { SCAN_STEP_ORDER, type ScanStepId } from '@/components/ScanProgressOverlay';
import { motion } from '@/theme/tokens';
import type { Detection, NutritionItem, ScanResult } from '@/types';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Time until get Calo overlay begins showing analysis steps (§3.4). */
const ENGINE_TYPE_CHARS = 'get Calo'.length;
const SATTAM_INTRO_MS =
  motion.sattamStartType + ENGINE_TYPE_CHARS * motion.sattamCharMs + motion.sattamStepsDelay;

function isDemoUri(uri: string) {
  return uri.startsWith('web-demo:') || uri.startsWith('demo:');
}

const DEMO_NUTRITION: NutritionItem = {
  itemIdentity: 'demo.margherita_pizza',
  classId: -100,
  nameEn: 'Margherita Pizza',
  nameAr: 'بيتزا مارغريتا',
  caloriesKcal: 268,
  proteinG: 11,
  carbsG: 33,
  fatG: 10,
  servingSizeG: 120,
  servingLabelEn: '1 slice',
  servingLabelAr: '\u0634\u0631\u064A\u062D\u0629 \u0648\u0627\u062D\u062F\u0629',
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
      const nextStep = SCAN_STEP_ORDER[i];
      if (!nextStep) return;
      setScanStep(nextStep);
      await wait(motion.stepBase + Math.random() * motion.stepJitter);
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
        await wait(SATTAM_INTRO_MS);
        if (cancelledRef.current) return null;

        // Built-in demo path — always returns a complete nutrition result.
        if (isDemoUri(imageUri)) {
          await advanceSteps('finalize');
          if (cancelledRef.current) return null;
          const nutrition = DEMO_NUTRITION;
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

            const isUnknown =
              /unknown/i.test(ai.nameEn) ||
              (ai.confidence < 0.35 && ai.nutrition.caloriesKcal <= 0);

            const detections: Detection[] = (ai.items.length > 0 ? ai.items : [ai.nutrition]).map(
              (item, index) => ({
                classId: item.classId,
                confidence: ai.confidence,
                bbox: {
                  x: 0.08 + index * 0.04,
                  y: 0.08 + index * 0.04,
                  width: 0.7,
                  height: 0.7,
                },
                label: item.nameEn,
              }),
            );

            const result: ScanResult = {
              imageUri,
              detections,
              topDetection: detections[0] ?? null,
              nutrition: isUnknown ? null : ai.nutrition,
              items: isUnknown ? [] : ai.items,
              confidence: ai.confidence,
              lowConfidence: isUnknown || isLowConfidence(ai.confidence, threshold),
              modelVersion: `${AI_MODEL_VERSION}:${ai.model}`,
              inferredAt: new Date().toISOString(),
              usedFallback: false,
            };
            setLastResult(result);
            return result;
          } catch (aiErr) {
            console.warn('[calora] cloud scan failed, falling back on-device', aiErr);
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
