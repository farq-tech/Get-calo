import { useCallback, useRef, useState } from 'react';

import { lookupByClassId } from '@/db/nutrition';
import { analyzeFoodWithAi, AI_MODEL_VERSION, isAiScanEnabled } from '@/inference/aiVision';
import { isLowConfidence, loadModel, runInference } from '@/inference/yolo';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { saveScanForTraining } from '@/services/trainingCapture';
import { SCAN_STEP_ORDER, type ScanStepId } from '@/components/ScanProgressOverlay';
import { motion } from '@/theme/tokens';
import type { Detection, ScanResult } from '@/types';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Time until Get Calo overlay begins showing analysis steps. */
const ENGINE_TYPE_CHARS = 'Get Calo'.length;
const INTRO_MS =
  motion.sattamStartType + ENGINE_TYPE_CHARS * motion.sattamCharMs + motion.sattamStepsDelay;

export type ScanOutcome =
  | { status: 'ok'; result: ScanResult }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface UseInferenceReturn {
  scanning: boolean;
  scanStep: ScanStepId | null;
  previewUri: string | null;
  error: string | null;
  scan: (imageUri: string) => Promise<ScanOutcome>;
  cancelScan: () => void;
  resetError: () => void;
}

export function useInference(): UseInferenceReturn {
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState<ScanStepId | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const threshold = useSettingsStore((s) => s.confidenceThreshold);
  const locale = useSettingsStore((s) => s.locale);
  const setLastResult = useScanStore((s) => s.setLastResult);

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    scanIdRef.current += 1;
    setScanning(false);
    setScanStep(null);
    setPreviewUri(null);
  }, []);

  const advanceSteps = useCallback(async (until: ScanStepId, scanId: number) => {
    const target = SCAN_STEP_ORDER.indexOf(until);
    for (let i = 0; i <= target; i++) {
      if (scanId !== scanIdRef.current) return;
      const nextStep = SCAN_STEP_ORDER[i];
      if (!nextStep) return;
      setScanStep(nextStep);
      await wait(motion.stepBase + Math.random() * motion.stepJitter);
    }
  }, []);

  const scan = useCallback(
    async (imageUri: string): Promise<ScanOutcome> => {
      const scanId = ++scanIdRef.current;
      const abort = new AbortController();
      abortRef.current = abort;

      setScanning(true);
      setPreviewUri(imageUri);
      setError(null);

      const active = () => scanId === scanIdRef.current;

      try {
        setScanStep('recognize');
        await wait(INTRO_MS);
        if (!active()) return { status: 'cancelled' };

        if (isAiScanEnabled()) {
          try {
            const progress = advanceSteps('portion', scanId);
            const ai = await analyzeFoodWithAi(imageUri, locale, abort.signal);
            await progress;
            if (!active()) return { status: 'cancelled' };

            await advanceSteps('finalize', scanId);
            if (!active()) return { status: 'cancelled' };

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
            void saveScanForTraining({ result, locale, source: 'scan' });
            return { status: 'ok', result };
          } catch (aiErr) {
            if (!active()) return { status: 'cancelled' };
            if (abort.signal.aborted) return { status: 'cancelled' };
            console.warn('[get-calo] cloud scan failed, falling back on-device', aiErr);
            setError(
              aiErr instanceof Error
                ? aiErr.message
                : 'Cloud scan unavailable — trying on-device',
            );
          }
        }

        await loadModel();
        if (!active()) return { status: 'cancelled' };
        setScanStep('ingredients');
        const { detections, modelVersion } = await runInference(imageUri, {
          confidenceThreshold: threshold,
        });
        if (!active()) return { status: 'cancelled' };

        await advanceSteps('finalize', scanId);
        if (!active()) return { status: 'cancelled' };

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
        void saveScanForTraining({ result, locale, source: 'scan' });
        return { status: 'ok', result };
      } catch (err) {
        if (!active() || abort.signal.aborted) return { status: 'cancelled' };
        const message = err instanceof Error ? err.message : 'Scan failed';
        setError(message);
        return { status: 'error', message };
      } finally {
        if (active()) {
          setScanning(false);
          setScanStep(null);
          setPreviewUri(null);
          abortRef.current = null;
        }
      }
    },
    [advanceSteps, locale, setLastResult, threshold],
  );

  const resetError = useCallback(() => setError(null), []);

  return { scanning, scanStep, previewUri, error, scan, cancelScan, resetError };
}
