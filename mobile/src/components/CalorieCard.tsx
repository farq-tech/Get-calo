import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConfidenceBadge } from '@/components/ConfidenceBadge';
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
  servingTitle,
  confidenceLabel,
  perServingLabel,
  gramsLabel,
}: CalorieCardProps) {
  const calories = nutrition?.caloriesKcal ?? 0;
  const [shown, setShown] = useState(0);

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
      <Text style={styles.foodName}>{foodName}</Text>
      <Text style={styles.servingMeta}>
        {servingTitle}: {servingLabel} · {perServingLabel}
      </Text>

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

      <View style={styles.confidence}>
        <ConfidenceBadge confidence={confidence} label={confidenceLabel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  foodName: {
    ...typography.foodTitle,
    color: colors.text,
    marginBottom: 4,
  },
  servingMeta: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginBottom: 20,
  },
  calorieBlock: {
    marginBottom: 22,
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
    marginBottom: 8,
  },
  confidence: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
