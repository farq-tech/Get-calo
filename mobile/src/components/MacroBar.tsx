import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors } from '@/theme/colors';
import { motion } from '@/theme/tokens';
import { typography } from '@/theme/typography';

interface MacroBarProps {
  label: string;
  valueG: number;
  maxG?: number;
  color: string;
  unitLabel: string;
  delay?: number;
}

export function MacroBar({
  label,
  valueG,
  maxG = 80,
  color,
  unitLabel,
  delay = 0,
}: MacroBarProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const slide = useSharedValue(24);
  const opacity = useSharedValue(0);
  const [trackW, setTrackW] = useState(0);
  const ratio = Math.min(1, Math.max(0, valueG / maxG));

  useEffect(() => {
    if (reducedMotion) {
      progress.value = ratio;
      slide.value = 0;
      opacity.value = 1;
      return;
    }

    progress.value = 0;
    const ease = Easing.bezier(0.2, 0, 0, 1);
    progress.value = withDelay(
      delay,
      withTiming(ratio, { duration: motion.macroFill, easing: ease }),
    );
    slide.value = withDelay(
      delay,
      withTiming(0, { duration: motion.standard + 80, easing: ease }),
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: motion.standard }));
  }, [delay, opacity, progress, ratio, reducedMotion, slide]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackW * progress.value,
  }));

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slide.value }],
    opacity: opacity.value,
  }));

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  return (
    <Animated.View style={[styles.row, rowStyle]}>
      <View style={styles.meta}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(valueG)}
          {unitLabel}
        </Text>
      </View>
      <View style={styles.track} onLayout={onTrackLayout}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 14,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  value: {
    ...typography.bodySm,
    color: colors.text,
    fontFamily: typography.h3.fontFamily,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
