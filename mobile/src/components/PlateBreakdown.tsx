import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import type { NutritionItem } from '@/types';

type Props = {
  items: NutritionItem[];
  locale: 'en' | 'ar';
  factor?: number;
  title: string;
  kcalLabel: string;
  gramsLabel: string;
};

export function PlateBreakdown({
  items,
  locale,
  factor = 1,
  title,
  kcalLabel,
  gramsLabel,
}: Props) {
  if (items.length < 2) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.map((item) => {
          const name =
            locale === 'ar' && item.nameAr ? item.nameAr : item.nameEn;
          const initial = name.trim().charAt(0).toUpperCase() || '?';
          const kcal = Math.round(item.caloriesKcal * factor);
          const grams = Math.round(item.servingSizeG * factor);
          return (
            <View key={item.itemIdentity} style={styles.row}>
              <View style={styles.initial}>
                <Text style={styles.initialText}>{initial}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.meta}>
                  {grams}
                  {gramsLabel}
                  {' · '}
                  {Math.round(item.proteinG * factor)}p / {Math.round(item.carbsG * factor)}c /{' '}
                  {Math.round(item.fatG * factor)}f
                </Text>
              </View>
              <Text style={styles.kcal}>
                {kcal} {kcalLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  initial: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: typography.brandSm.fontFamily,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
    writingDirection: 'ltr',
  },
  kcal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    writingDirection: 'ltr',
  },
});
