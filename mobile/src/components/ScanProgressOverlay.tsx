import React, { useEffect } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { typography } from '@/theme/typography';

export type ScanStepId = 'uploading' | 'identifying' | 'calculating' | 'preparing';

const STEP_ORDER: ScanStepId[] = ['uploading', 'identifying', 'calculating', 'preparing'];

const SCAN_GREEN = '#22C55E';
const SCAN_GREEN_SOFT = 'rgba(34,197,94,0.35)';
const PAGE_BG = '#FFFFFF';
const TEXT = '#111827';
const TEXT_MUTED = '#9CA3AF';
const TEXT_ACTIVE = '#111827';

type Props = {
  imageUri: string;
  step: ScanStepId;
  onBack?: () => void;
  imageSource?: ImageSourcePropType;
};

function stepState(current: ScanStepId, id: ScanStepId): 'done' | 'active' | 'pending' {
  const ci = STEP_ORDER.indexOf(current);
  const ii = STEP_ORDER.indexOf(id);
  if (ii < ci) return 'done';
  if (ii === ci) return 'active';
  return 'pending';
}

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <View style={[styles.stepIcon, styles.stepIconDone]}>
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={[styles.stepIcon, styles.stepIconActive]}>
        <ActivityIndicator size="small" color={SCAN_GREEN} />
      </View>
    );
  }
  return <View style={[styles.stepIcon, styles.stepIconPending]} />;
}

function CornerBracket({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const edge = 28;
  const thick = 3;
  const base = {
    position: 'absolute' as const,
    width: edge,
    height: edge,
    borderColor: '#FFFFFF',
  };
  if (position === 'tl') {
    return (
      <View
        style={[
          base,
          { top: 10, left: 10, borderTopWidth: thick, borderLeftWidth: thick, borderTopLeftRadius: 6 },
        ]}
      />
    );
  }
  if (position === 'tr') {
    return (
      <View
        style={[
          base,
          { top: 10, right: 10, borderTopWidth: thick, borderRightWidth: thick, borderTopRightRadius: 6 },
        ]}
      />
    );
  }
  if (position === 'bl') {
    return (
      <View
        style={[
          base,
          {
            bottom: 10,
            left: 10,
            borderBottomWidth: thick,
            borderLeftWidth: thick,
            borderBottomLeftRadius: 6,
          },
        ]}
      />
    );
  }
  return (
    <View
      style={[
        base,
        {
          bottom: 10,
          right: 10,
          borderBottomWidth: thick,
          borderRightWidth: thick,
          borderBottomRightRadius: 6,
        },
      ]}
    />
  );
}

export function ScanProgressOverlay({ imageUri, step, onBack, imageSource }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frameSize = Math.min(width - 48, 340);

  const scanProgress = useSharedValue(0);

  useEffect(() => {
    scanProgress.value = 0;
    scanProgress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [scanProgress]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanProgress.value * (frameSize - 24) }],
  }));

  const source =
    imageSource ??
    (imageUri.startsWith('web-demo:') || imageUri.startsWith('demo:')
      ? undefined
      : { uri: imageUri });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={TEXT} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={[styles.frameWrap, { width: frameSize, height: frameSize }]}>
          {source ? (
            <Image source={source} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={[styles.preview, styles.previewFallback]} />
          )}
          <View style={styles.frameShade} pointerEvents="none" />
          <CornerBracket position="tl" />
          <CornerBracket position="tr" />
          <CornerBracket position="bl" />
          <CornerBracket position="br" />
          <Animated.View style={[styles.scanLine, scanLineStyle]} pointerEvents="none">
            <View style={styles.scanLineCore} />
            <View style={styles.scanLineGlow} />
          </Animated.View>
        </View>

        <View style={styles.steps}>
          {STEP_ORDER.map((id) => {
            const state = stepState(step, id);
            return (
              <View key={id} style={styles.stepRow}>
                <StepIcon state={state} />
                <Text
                  style={[
                    styles.stepText,
                    state === 'active' && styles.stepTextActive,
                    state === 'pending' && styles.stepTextPending,
                    state === 'done' && styles.stepTextDone,
                  ]}
                >
                  {t(`camera.steps.${id}`)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PAGE_BG,
    zIndex: 40,
  },
  topBar: {
    height: 48,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 36,
  },
  frameWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
  },
  frameShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  scanLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    height: 3,
  },
  scanLineCore: {
    height: 2,
    borderRadius: 2,
    backgroundColor: SCAN_GREEN,
  },
  scanLineGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -6,
    height: 14,
    borderRadius: 8,
    backgroundColor: SCAN_GREEN_SOFT,
  },
  steps: {
    width: '100%',
    maxWidth: 320,
    gap: 18,
    paddingHorizontal: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: SCAN_GREEN,
  },
  stepIconActive: {
    backgroundColor: 'transparent',
  },
  stepIconPending: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: 'transparent',
  },
  stepText: {
    ...typography.body,
    fontSize: 17,
    color: TEXT,
  },
  stepTextActive: {
    color: TEXT_ACTIVE,
    fontFamily: 'IBMPlexSansArabic_700Bold',
    fontWeight: '700',
  },
  stepTextPending: {
    color: TEXT_MUTED,
  },
  stepTextDone: {
    color: TEXT,
  },
  previewFallback: {
    backgroundColor: '#D1D5DB',
  },
});
