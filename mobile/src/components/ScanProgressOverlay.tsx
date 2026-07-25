import React, { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  Image,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/hooks/useReducedMotion';
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

const STEP_FADE = [1, 0.55, 0.28] as const;
const CUBIC = Easing.bezier(0.2, 0, 0, 1);

/**
 * Get Calo cinematic analyzing — used only for real recognition flows.
 * Exact timing from Calora design spec §3.4.
 */
export function ScanProgressOverlay({ imageUri, step, onBack, imageSource }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>(reducedMotion ? 'engine' : 'type');
  const word = 'Get Calo';
  const [typed, setTyped] = useState(reducedMotion ? word.length : 0);
  const [cursorOn, setCursorOn] = useState(!reducedMotion);
  const [showSteps, setShowSteps] = useState(reducedMotion);

  const sweep = useSharedValue(0);
  const ken = useSharedValue(0);
  const glow = useSharedValue(0);
  const particle = useSharedValue(0);
  const wordOp = useSharedValue(1);
  const wordBlur = useSharedValue(0);
  const wordScale = useSharedValue(1);
  const wordY = useSharedValue(0);
  const engineOp = useSharedValue(reducedMotion ? 1 : 0);
  const engineBlur = useSharedValue(reducedMotion ? 0 : 8);
  const engineY = useSharedValue(reducedMotion ? 0 : 12);
  const creditOp = useSharedValue(reducedMotion ? 1 : 0);
  const creditY = useSharedValue(reducedMotion ? 0 : 8);
  const cursorOp = useSharedValue(1);

  const stepIndex = SCAN_STEP_ORDER.indexOf(step);

  useEffect(() => {
    if (reducedMotion) {
      setPhase('engine');
      setTyped(word.length);
      setCursorOn(false);
      setShowSteps(true);
      wordOp.value = 0;
      engineOp.value = 1;
      engineBlur.value = 0;
      engineY.value = 0;
      creditOp.value = 1;
      return;
    }

    setPhase('type');
    setTyped(0);
    setCursorOn(true);
    setShowSteps(false);
    wordOp.value = 1;
    wordBlur.value = 0;
    wordScale.value = 1;
    wordY.value = 0;
    engineOp.value = 0;
    engineBlur.value = 8;
    engineY.value = 12;
    creditOp.value = 0;
    creditY.value = 8;
    cursorOp.value = 1;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const typeMs = motion.sattamCharMs;
    const startType = motion.sattamStartType;

    for (let i = 1; i <= word.length; i++) {
      timers.push(setTimeout(() => setTyped(i), startType + i * typeMs));
    }

    const typedDone = startType + word.length * typeMs;
    timers.push(
      setTimeout(() => {
        cursorOp.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) });
        setCursorOn(false);
      }, typedDone + motion.sattamCursorHold),
    );

    timers.push(
      setTimeout(() => {
        setPhase('credit');
        creditOp.value = withTiming(1, { duration: 600, easing: CUBIC });
        creditY.value = withTiming(0, { duration: 600, easing: CUBIC });
      }, typedDone + motion.sattamCreditDelay),
    );

    timers.push(
      setTimeout(() => {
        setPhase('engine');
        wordOp.value = withTiming(0, { duration: motion.morph, easing: CUBIC });
        wordBlur.value = withTiming(10, { duration: motion.morph, easing: CUBIC });
        wordScale.value = withTiming(0.94, { duration: motion.morph, easing: CUBIC });
        wordY.value = withTiming(-10, { duration: motion.morph, easing: CUBIC });
        engineOp.value = withTiming(1, { duration: motion.morph, easing: CUBIC });
        engineBlur.value = withTiming(0, { duration: motion.morph, easing: CUBIC });
        engineY.value = withTiming(0, { duration: motion.morph, easing: CUBIC });
      }, typedDone + motion.sattamMorphDelay),
    );

    timers.push(
      setTimeout(() => setShowSteps(true), typedDone + motion.sattamStepsDelay),
    );

    return () => timers.forEach(clearTimeout);
  }, [
    creditOp,
    creditY,
    cursorOp,
    engineBlur,
    engineOp,
    engineY,
    reducedMotion,
    wordBlur,
    wordOp,
    wordScale,
    wordY,
  ]);

  useEffect(() => {
    if (reducedMotion) return;
    sweep.value = withRepeat(
      withTiming(1, { duration: motion.scanSweep, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
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
    particle.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [glow, ken, particle, reducedMotion, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    top: interpolate(sweep.value, [0, 1], [-40, height * 0.75]),
    opacity: interpolate(sweep.value, [0, 0.15, 0.85, 1], [0.2, 1, 1, 0.2]),
  }));

  const kenStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ken.value, [0, 1], [1.02, 1.045]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.22, 0.45]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.96, 1.04]) }],
  }));

  const particleA = useAnimatedStyle(() => ({
    opacity: interpolate(particle.value, [0, 0.5, 1], [0.35, 1, 0.35]),
    transform: [{ translateY: interpolate(particle.value, [0, 1], [0, -14]) }],
  }));
  const particleB = useAnimatedStyle(() => ({
    opacity: interpolate(particle.value, [0, 0.5, 1], [1, 0.35, 1]),
    transform: [{ translateY: interpolate(particle.value, [0, 1], [-8, 10]) }],
  }));
  const particleC = useAnimatedStyle(() => ({
    opacity: interpolate(particle.value, [0, 0.5, 1], [0.5, 1, 0.45]),
    transform: [{ translateY: interpolate(particle.value, [0, 1], [6, -10]) }],
  }));
  const particleD = useAnimatedStyle(() => ({
    opacity: interpolate(particle.value, [0, 0.5, 1], [0.7, 0.3, 0.7]),
    transform: [{ translateY: interpolate(particle.value, [0, 1], [-4, 12]) }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOp.value,
    transform: [{ scale: wordScale.value }, { translateY: wordY.value }],
  }));

  const engineStyle = useAnimatedStyle(() => ({
    opacity: engineOp.value,
    transform: [{ translateY: engineY.value }],
  }));

  const creditStyle = useAnimatedStyle(() => ({
    opacity: creditOp.value,
    transform: [{ translateY: creditY.value }],
  }));

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOp.value,
  }));

  const source = imageSource ?? { uri: imageUri };

  const visibleSteps = useMemo(() => {
    if (!showSteps) return [];
    const end = Math.max(1, stepIndex + 1);
    const start = Math.max(0, end - 3);
    const slice = SCAN_STEP_ORDER.slice(start, end);
    return slice.map((id, i) => {
      const absolute = start + i;
      const fromEnd = slice.length - 1 - i;
      return {
        id,
        done: absolute < stepIndex,
        active: absolute === stepIndex,
        label: t(`camera.analyzeMsgs.${id}`),
        opacity: STEP_FADE[Math.min(fromEnd, STEP_FADE.length - 1)] ?? 1,
      };
    });
  }, [showSteps, stepIndex, t]);

  const backFlip = I18nManager.isRTL ? [{ scaleX: -1 }] : undefined;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.bgWrap, reducedMotion ? undefined : kenStyle]}>
        {source ? (
          <Image source={source} style={styles.bgImage} blurRadius={18} />
        ) : (
          <View style={[styles.bgImage, styles.bgFallback]} />
        )}
        <View style={styles.bgTint} />
      </Animated.View>

      {!reducedMotion ? (
        <>
          <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
          <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none" />
          <Animated.View style={[styles.particle, styles.particleA, particleA]} pointerEvents="none" />
          <Animated.View style={[styles.particle, styles.particleB, particleB]} pointerEvents="none" />
          <Animated.View style={[styles.particle, styles.particleC, particleC]} pointerEvents="none" />
          <Animated.View style={[styles.particle, styles.particleD, particleD]} pointerEvents="none" />
        </>
      ) : null}
      <View style={styles.vignette} pointerEvents="none" />

      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          hitSlop={12}
          style={[styles.backBtn, { top: insets.top + 8 }]}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.text}
            style={backFlip ? { transform: backFlip } : undefined}
          />
        </Pressable>
      ) : null}

      <View style={styles.center}>
        <View style={styles.signatureBlock}>
          {(phase === 'type' || phase === 'credit') && !reducedMotion ? (
            <Animated.View style={[styles.wordRow, wordStyle]}>
              <Text style={styles.typedWord}>
                {word.slice(0, typed)}
              </Text>
              {cursorOn ? (
                <Animated.View style={cursorStyle}>
                  <LinearGradient
                    colors={['#5EEAD4', '#10B981']}
                    style={styles.cursor}
                  />
                </Animated.View>
              ) : null}
            </Animated.View>
          ) : null}

          {phase === 'engine' || reducedMotion ? (
            <Animated.View style={[styles.engine, engineStyle]}>
              <Text style={styles.engineName}>{t('engineName')}</Text>
            </Animated.View>
          ) : null}

          {/* Keep morph layers stacked during transition */}
          {phase === 'engine' && !reducedMotion ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.wordRow, styles.wordAbsolute, wordStyle]}
            >
              <Text style={styles.typedWord}>
                {word}
              </Text>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.steps}>
          {visibleSteps.map((row) => (
            <Animated.View
              key={row.id}
              entering={reducedMotion ? undefined : FadeIn.duration(460)}
              style={[styles.stepRow, { opacity: row.opacity }]}
            >
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
    top: '30%',
    left: '50%',
    marginLeft: -130,
    width: 260,
    height: 210,
    borderRadius: 130,
    backgroundColor: 'rgba(45,212,168,0.16)',
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
  particle: {
    position: 'absolute',
    borderRadius: 3,
  },
  particleA: {
    top: '34%',
    left: '30%',
    width: 5,
    height: 5,
    backgroundColor: '#5EEAD4',
    shadowColor: '#5EEAD4',
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  particleB: {
    top: '28%',
    right: '28%',
    width: 4,
    height: 4,
    backgroundColor: '#2DD4A8',
    shadowColor: '#2DD4A8',
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  particleC: {
    top: '46%',
    right: '34%',
    width: 3,
    height: 3,
    backgroundColor: '#F2F7F5',
    shadowColor: '#F2F7F5',
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  particleD: {
    top: '42%',
    left: '36%',
    width: 3,
    height: 3,
    backgroundColor: '#5EEAD4',
    shadowColor: '#5EEAD4',
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,10,9,0.55)',
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
    textAlign: 'center',
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
  wordAbsolute: {
    position: 'absolute',
  },
  typedWord: {
    fontFamily: typography.brand.fontFamily,
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: colors.text,
    textShadowColor: 'rgba(45,212,168,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 28,
    writingDirection: 'ltr',
  },
  cursor: {
    width: 3,
    height: 42,
    borderRadius: 2,
    marginStart: 7,
  },
  engine: {
    alignItems: 'center',
    gap: 6,
  },
  engineName: {
    fontFamily: typography.brand.fontFamily,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: colors.text,
    writingDirection: 'ltr',
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
