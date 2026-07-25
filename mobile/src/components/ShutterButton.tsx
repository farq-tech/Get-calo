import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { colors } from '@/theme/colors';
import { motion } from '@/theme/tokens';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ShutterButtonProps {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}

export function ShutterButton({
  onPress,
  disabled,
  busy,
  accessibilityLabel = 'Capture meal',
}: ShutterButtonProps) {
  const pulse = useSharedValue(1);
  const ring = useSharedValue(0);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  useEffect(() => {
    if (busy) {
      ring.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(ring);
      ring.value = withTiming(0, { duration: motion.micro });
    }
  }, [busy, ring]);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const busyStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + ring.value * 0.55,
    transform: [{ scale: 1 + ring.value * 0.08 }],
  }));

  const handlePress = () => {
    if (disabled || busy) return;
    if (hapticsEnabled && Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.outer, outerStyle, busy && busyStyle]}>
        <LinearGradient
          colors={[...colors.gradientShutter]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.inner} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const SIZE = 80;

const styles = StyleSheet.create({
  hit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  outer: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    padding: 4,
    borderWidth: 2.5,
    borderColor: 'rgba(45,212,168,0.4)',
    backgroundColor: 'rgba(10,14,13,0.35)',
  },
  gradient: {
    flex: 1,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: SIZE - 28,
    height: SIZE - 28,
    borderRadius: (SIZE - 28) / 2,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
