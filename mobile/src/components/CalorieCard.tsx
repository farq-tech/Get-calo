import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { MacroBar } from '@/components/MacroBar';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors } from '@/theme/colors';
import { motion } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import type { NutritionItem } from '@/types';

interface CalorieCardProps {
  nutrition: NutritionItem | null;
  foodName: string;
  servingLabel: string;
  confidence: number;
  caloriesLabel: string;
  kcalLabel: string;
  proteinLabel: string;
  carbsLabel: string;
  fatLabel: string;
  servingTitle: string;
  confidenceLabel: string;
  perServingLabel: string;
  gramsLabel: string;
}

const REVEAL = Easing.bezier(0.2, 0, 0, 1);
const STAGE = {
  name: 140,
  calories: 500,
  protein: 900,
  carbs: 1120,
  fat: 1340,
  confidence: 1620,
} as const;

function useReveal(delayMs: number, reduced: boolean) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const y = useSharedValue(reduced ? 0 : 14);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      y.value = 0;
      return;
    }
    opacity.value = 0;
    y.value = 14;
    opacity.value = withDelay(
      delayMs,
      withTiming(1, { duration: motion.reveal, easing: REVEAL }),
    );
    y.value = withDelay(
      delayMs,
      withTiming(0, { duration: motion.reveal, easing: REVEAL }),
    );
  }, [delayMs, opacity, reduced, y]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
}

export function CalorieCard({
  nutrition,
  foodName,
  servingLabel,
  confidence,
  caloriesLabel,
  kcalLabel,
  proteinLabel,
  carbsLabel,
  fatLabel,
  confidenceLabel,
  gramsLabel,
}: CalorieCardProps) {
  const reduced = useReducedMotion();
  const calories = nutrition?.caloriesKcal ?? 0;
  const [shown, setShown] = useState(reduced ? calories : 0);
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const confColor =
    confidence >= 0.85
      ? colors.confidence.high
      : confidence >= 0.6
        ? colors.confidence.mid
        : colors.confidence.low;

  const nameStyle = useReveal(STAGE.name, reduced);
  const calStyle = useReveal(STAGE.calories, reduced);
  const confStyle = useReveal(STAGE.confidence, reduced);

  useEffect(() => {
    if (reduced) {
      setShown(calories);
      return;
    }
    let frame = 0;
    const startAt = Date.now() + STAGE.calories;
    const duration = motion.countUp;
    const tick = () => {
      const now = Date.now();
      if (now < startAt) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(calories * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calories, reduced]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Animated.View style={[styles.foodCopy, nameStyle]}>
          <Text style={styles.foodName}>{foodName}</Text>
          <Text style={styles.servingMeta}>{servingLabel}</Text>
        </Animated.View>
        <Animated.View
          style={[styles.confidencePill, { backgroundColor: `${confColor}1F` }, confStyle]}
        >
          <View style={[styles.confidenceDot, { backgroundColor: confColor }]} />
          <Text style={[styles.confidenceText, { color: confColor }]}>
            {confidenceLabel} · {pct}%
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.calorieBlock, calStyle]}>
        <Text style={styles.calorieLabel}>{caloriesLabel}</Text>
        <View style={styles.calorieRow}>
          <Text style={styles.calorieNumber} accessibilityRole="text">
            {shown}
          </Text>
          <Text style={styles.kcal}>{kcalLabel}</Text>
        </View>
      </Animated.View>

      <View style={styles.macros}>
        <MacroBar
          label={proteinLabel}
          valueG={nutrition?.proteinG ?? 0}
          color={colors.protein}
          unitLabel={gramsLabel}
          delay={reduced ? 0 : STAGE.protein}
        />
        <MacroBar
          label={carbsLabel}
          valueG={nutrition?.carbsG ?? 0}
          color={colors.carbs}
          unitLabel={gramsLabel}
          delay={reduced ? 0 : STAGE.carbs}
        />
        <MacroBar
          label={fatLabel}
          valueG={nutrition?.fatG ?? 0}
          color={colors.fat}
          unitLabel={gramsLabel}
          delay={reduced ? 0 : STAGE.fat}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  foodCopy: {
    flex: 1,
  },
  foodName: {
    ...typography.foodTitle,
    fontSize: 23,
    color: colors.text,
    marginBottom: 4,
  },
  servingMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  confidencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
    writingDirection: 'ltr',
  },
  calorieBlock: {
    marginTop: 18,
    marginBottom: 20,
  },
  calorieLabel: {
    ...typography.caption,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  calorieNumber: {
    ...typography.heroNumber,
    fontSize: 64,
    letterSpacing: -2,
    lineHeight: 68,
    color: colors.calories,
    writingDirection: 'ltr',
  },
  kcal: {
    ...typography.h2,
    fontSize: 17,
    color: colors.textSecondary,
    paddingBottom: 9,
  },
  macros: {
    gap: 13,
  },
});
