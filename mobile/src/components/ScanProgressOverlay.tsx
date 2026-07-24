import React, { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme/colors';
import { motion } from '@/theme/tokens';
import { typography } from '@/theme/typography';

export type ScanStepId =
  | 'recognize'
  | 'ingredients'
  | 'portion'
  | 'calories'
  | 'profile'
  | 'finalize';

export const SCAN_STEP_ORDER: ScanStepId[] = [
  'recognize',
  'ingredients',
  'portion',
  'calories',
  'profile',
  'finalize',
];

type Phase = 'type' | 'credit' | 'engine';

type Props = {
  imageUri: string;
  step: ScanStepId;
  onBack?: () => void;
  imageSource?: ImageSourcePropType;
};

/**
 * Cinematic analyzing screen — matches Calora App.html prototype.
 * Signature: types "Sattam" → credit → Sattam engine + live steps.
 */
export function ScanProgressOverlay({ imageUri, step, onBack, imageSource }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>('type');
  const [typed, setTyped] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  const sweep = useSharedValue(0);
  const ken = useSharedValue(0);
  const glow = useSharedValue(0);

  const word = 'Sattam';
  const stepIndex = SCAN_STEP_ORDER.indexOf(step);

  useEffect(() => {
    setPhase('type');
    setTyped(0);
    setCursorOn(true);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const typeMs = 140;
    for (let i = 1; i <= word.length; i++) {
      timers.push(setTimeout(() => setTyped(i), 320 + i * typeMs));
    }
    const done = 320 + word.length * typeMs;
    timers.push(setTimeout(() => setCursorOn(false), done + 150));
    timers.push(setTimeout(() => setPhase('credit'), done + 340));
    timers.push(setTimeout(() => setPhase('engine'), done + 1750));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
      -1,
      false,
    );
    ken.value = withRepeat(
      withTiming(1, { duration: 7000, easing: Easing.bezier(0.3, 0, 0.5, 1) }),
      -1,
      true,
    );
    glow.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [glow, ken, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    top: interpolate(sweep.value, [0, 1], [-40, height * 0.75]),
    opacity: interpolate(sweep.value, [0, 0.15, 0.85, 1], [0.2, 1, 1, 0.2]),
  }));

  const kenStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ken.value, [0, 1], [1.05, 1.18]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.55, 1]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.94, 1.06]) }],
  }));

  const source =
    imageSource ??
    (imageUri.startsWith('web-demo:') || imageUri.startsWith('demo:')
      ? undefined
      : { uri: imageUri });

  const visibleSteps = useMemo(() => {
    return SCAN_STEP_ORDER.slice(0, Math.max(1, stepIndex + 1)).map((id, i) => ({
      id,
      done: i < stepIndex,
      active: i === stepIndex,
      label: t(`camera.analyzeMsgs.${id}`),
    }));
  }, [stepIndex, t]);

  const showCredit = phase === 'credit' || phase === 'engine';
  const showEngine = phase === 'engine';
  const showWord = phase === 'type' || phase === 'credit';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.bgWrap, kenStyle]}>
        {source ? (
          <Image source={source} style={styles.bgImage} blurRadius={18} />
        ) : (
          <View style={[styles.bgImage, styles.bgFallback]} />
        )}
        <View style={styles.bgTint} />
      </Animated.View>

      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
      <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none" />
      <View style={styles.vignette} pointerEvents="none" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        hitSlop={12}
        style={[styles.backBtn, { top: insets.top + 8 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      <View style={styles.center}>
        <Text style={[styles.credit, { opacity: showCredit ? 1 : 0 }]}>
          {t('creditBy')}
        </Text>

        <View style={styles.signatureBlock}>
          {showWord ? (
            <View style={styles.wordRow}>
              <Text style={styles.typedWord}>{word.slice(0, typed)}</Text>
              {cursorOn ? <View style={styles.cursor} /> : null}
            </View>
          ) : null}

          {showEngine ? (
            <Animated.View entering={FadeIn.duration(motion.emphasized)} style={styles.engine}>
              <Text style={styles.engineName}>Sattam</Text>
              <Text style={styles.engineSub}>{t('engineSub')}</Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.steps}>
          {visibleSteps.map((row) => (
            <Animated.View key={row.id} entering={FadeInUp.duration(420)} style={styles.stepRow}>
              <View style={[styles.stepIcon, row.done && styles.stepIconDone]}>
                {row.done ? (
                  <Ionicons name="checkmark" size={11} color={colors.accent} />
                ) : row.active ? (
                  <View style={styles.stepDot} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.stepText,
                  row.done && styles.stepTextDone,
                  row.active && styles.stepTextActive,
                ]}
              >
                {row.label}
              </Text>
            </Animated.View>
          ))}
        </View>
      </View>

      <Text style={[styles.footer, { bottom: Math.max(insets.bottom, 16) + 28 }]}>
        {t('camera.onDevice')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 40,
    overflow: 'hidden',
  },
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    margin: -48,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  bgFallback: {
    backgroundColor: '#0E1512',
  },
  bgTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,14,13,0.45)',
  },
  glow: {
    position: 'absolute',
    top: '28%',
    left: '50%',
    marginLeft: -130,
    width: 260,
    height: 210,
    borderRadius: 130,
    backgroundColor: 'rgba(45,212,168,0.14)',
  },
  sweep: {
    position: 'absolute',
    left: '-10%',
    right: '-10%',
    height: 120,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(45,212,168,0.08)',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,10,9,0.35)',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(28,38,34,0.75)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  credit: {
    minHeight: 20,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  signatureBlock: {
    minHeight: 72,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typedWord: {
    fontFamily: typography.brand.fontFamily,
    fontSize: 46,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.text,
    textShadowColor: 'rgba(45,212,168,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 28,
  },
  cursor: {
    width: 3,
    height: 42,
    borderRadius: 2,
    marginLeft: 7,
    backgroundColor: colors.accent,
  },
  engine: {
    alignItems: 'center',
    gap: 6,
  },
  engineName: {
    fontFamily: typography.brand.fontFamily,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: colors.text,
  },
  engineSub: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  steps: {
    marginTop: 30,
    width: 250,
    minHeight: 120,
    gap: 11,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  stepIcon: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: 'rgba(45,212,168,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,168,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: 'rgba(45,212,168,0.16)',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  stepTextActive: {
    color: colors.text,
  },
  stepTextDone: {
    color: colors.textSecondary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
});
