import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MacroBar } from '@/components/MacroBar';
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
  const calories = nutrition?.caloriesKcal ?? 0;
  const [shown, setShown] = useState(0);
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const confColor =
    confidence >= 0.85
      ? colors.confidenceHigh
      : confidence >= 0.6
        ? colors.confidenceMid
        : colors.confidenceLow;

  useEffect(() => {
    let frame = 0;
    const start = Date.now();
    const duration = motion.countUp;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(calories * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calories]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.foodCopy}>
          <Text style={styles.foodName}>{foodName}</Text>
          <Text style={styles.servingMeta}>{servingLabel}</Text>
        </View>
        <View style={[styles.confidencePill, { backgroundColor: `${confColor}1F` }]}>
          <View style={[styles.confidenceDot, { backgroundColor: confColor }]} />
          <Text style={[styles.confidenceText, { color: confColor }]}>
            {confidenceLabel} · {pct}%
          </Text>
        </View>
      </View>

      <View style={styles.calorieBlock}>
        <Text style={styles.calorieLabel}>{caloriesLabel}</Text>
        <View style={styles.calorieRow}>
          <Text style={styles.calorieNumber} accessibilityRole="text">
            {shown}
          </Text>
          <Text style={styles.kcal}>{kcalLabel}</Text>
        </View>
      </View>

      <View style={styles.macros}>
        <MacroBar
          label={proteinLabel}
          valueG={nutrition?.proteinG ?? 0}
          color={colors.protein}
          unitLabel={gramsLabel}
          delay={80}
        />
        <MacroBar
          label={carbsLabel}
          valueG={nutrition?.carbsG ?? 0}
          color={colors.carbs}
          unitLabel={gramsLabel}
          delay={160}
        />
        <MacroBar
          label={fatLabel}
          valueG={nutrition?.fatG ?? 0}
          color={colors.fat}
          unitLabel={gramsLabel}
          delay={240}
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
  },
  kcal: {
    ...typography.h2,
    fontSize: 18,
    color: colors.textSecondary,
    paddingBottom: 10,
  },
  macros: {
    gap: 13,
  },
});
