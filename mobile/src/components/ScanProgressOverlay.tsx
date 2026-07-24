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

import { colors } from '@/theme/colors';
import { motion, radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

export type ScanStepId = 'uploading' | 'identifying' | 'calculating' | 'preparing';

const STEP_ORDER: ScanStepId[] = ['uploading', 'identifying', 'calculating', 'preparing'];

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
        <Ionicons name="checkmark" size={14} color={colors.white} />
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={[styles.stepIcon, styles.stepIconActive]}>
        <ActivityIndicator size="small" color={colors.lightAccent} />
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
    borderColor: colors.accent,
  };
  if (position === 'tl') {
    return (
      <View
        style={[
          base,
          {
            top: -2,
            left: -2,
            borderTopWidth: thick,
            borderLeftWidth: thick,
            borderTopLeftRadius: radius.xl,
          },
        ]}
      />
    );
  }
  if (position === 'tr') {
    return (
      <View
        style={[
          base,
          {
            top: -2,
            right: -2,
            borderTopWidth: thick,
            borderRightWidth: thick,
            borderTopRightRadius: radius.xl,
          },
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
            bottom: -2,
            left: -2,
            borderBottomWidth: thick,
            borderLeftWidth: thick,
            borderBottomLeftRadius: radius.xl,
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
          bottom: -2,
          right: -2,
          borderBottomWidth: thick,
          borderRightWidth: thick,
          borderBottomRightRadius: radius.xl,
        },
      ]}
    />
  );
}

/**
 * Bright analysis surface — Design System light tokens + teal scan sweep.
 */
export function ScanProgressOverlay({ imageUri, step, onBack, imageSource }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frameSize = Math.min(width - 48, 340);

  const scanProgress = useSharedValue(0);

  useEffect(() => {
    scanProgress.value = 0;
    scanProgress.value = withRepeat(
      withTiming(1, {
        duration: motion.scanSweep,
        easing: Easing.bezier(0.4, 0, 0.4, 1),
      }),
      -1,
      false,
    );
  }, [scanProgress]);

  const scanLineStyle = useAnimatedStyle(() => {
    const t = scanProgress.value;
    const fade = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
    return {
      transform: [{ translateY: t * (frameSize - 8) }],
      opacity: Math.max(0.2, fade),
    };
  });

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
          <Ionicons name="chevron-back" size={26} color={colors.lightText} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={[styles.frameOuter, { width: frameSize, height: frameSize }]}>
          <View style={styles.frameInner}>
            {source ? (
              <Image source={source} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={[styles.preview, styles.previewFallback]} />
            )}
            <View style={styles.frameShade} pointerEvents="none" />
            <Animated.View style={[styles.scanLine, scanLineStyle]} pointerEvents="none">
              <View style={styles.scanLineCore} />
              <View style={styles.scanLineGlow} />
            </Animated.View>
          </View>
          <CornerBracket position="tl" />
          <CornerBracket position="tr" />
          <CornerBracket position="bl" />
          <CornerBracket position="br" />
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
    backgroundColor: colors.lightBg,
    zIndex: 40,
  },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.sm,
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
    paddingHorizontal: spacing.lg,
    gap: 36,
  },
  frameOuter: {
    borderRadius: radius.xl + 4,
    borderWidth: 1.5,
    borderColor: colors.accentBorder,
    padding: 0,
    position: 'relative',
  },
  frameInner: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.lightSurfaceMuted,
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
  },
  frameShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,14,13,0.04)',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    height: 2,
  },
  scanLineCore: {
    height: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  scanLineGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -8,
    height: 18,
    backgroundColor: 'rgba(45,212,168,0.28)',
  },
  steps: {
    width: '100%',
    maxWidth: 320,
    gap: 18,
    paddingHorizontal: spacing.sm,
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
    backgroundColor: colors.lightAccent,
  },
  stepIconActive: {
    backgroundColor: 'transparent',
  },
  stepIconPending: {
    borderWidth: 2,
    borderColor: 'rgba(10,14,13,0.14)',
    backgroundColor: 'transparent',
  },
  stepText: {
    ...typography.body,
    fontSize: 17,
    color: colors.lightText,
  },
  stepTextActive: {
    color: colors.lightText,
    fontFamily: typography.h3.fontFamily,
  },
  stepTextPending: {
    color: colors.lightTextSecondary,
  },
  stepTextDone: {
    color: colors.lightText,
  },
  previewFallback: {
    backgroundColor: colors.lightSurfaceMuted,
  },
});
