import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import type { LocaleCode, NutritionReport } from '@/types';

type Props = {
  report: NutritionReport;
  locale: LocaleCode;
  labels: {
    healthScore: string;
    why: string;
    diets: string;
    micros: string;
    allergens: string;
    improve: string;
    burn: string;
    walking: string;
    running: string;
    cycling: string;
    extras: string;
    fiber: string;
    sugar: string;
    sodium: string;
    minutes: string;
  };
};

const DIET_LABELS: Record<string, { en: string; ar: string }> = {
  weight_loss: { en: 'Weight loss', ar: 'خسارة وزن' },
  muscle_gain: { en: 'Muscle gain', ar: 'بناء عضل' },
  keto: { en: 'Keto', ar: 'كيتو' },
  low_carb: { en: 'Low carb', ar: 'منخفض الكارب' },
  mediterranean: { en: 'Mediterranean', ar: 'متوسطي' },
  high_protein: { en: 'High protein', ar: 'عالي البروتين' },
  vegetarian: { en: 'Vegetarian', ar: 'نباتي' },
  vegan: { en: 'Vegan', ar: 'نباتي صرف' },
  diabetic_friendly: { en: 'Diabetic', ar: 'مناسب للسكري' },
  heart_healthy: { en: 'Heart healthy', ar: 'صحة القلب' },
  low_sodium: { en: 'Low sodium', ar: 'قليل الصوديوم' },
  kids: { en: 'Kids', ar: 'أطفال' },
  athletes: { en: 'Athletes', ar: 'رياضيين' },
};

const MICRO_LABELS: Record<string, { en: string; ar: string }> = {
  vitamin_a: { en: 'Vit A', ar: 'فيتامين أ' },
  vitamin_c: { en: 'Vit C', ar: 'فيتامين ج' },
  vitamin_d: { en: 'Vit D', ar: 'فيتامين د' },
  iron: { en: 'Iron', ar: 'حديد' },
  calcium: { en: 'Calcium', ar: 'كالسيوم' },
  potassium: { en: 'Potassium', ar: 'بوتاسيوم' },
  magnesium: { en: 'Magnesium', ar: 'مغنيسيوم' },
  zinc: { en: 'Zinc', ar: 'زنك' },
  folate: { en: 'Folate', ar: 'فولات' },
  vitamin_b12: { en: 'B12', ar: 'ب12' },
};

function levelColor(level: string) {
  if (level === 'High') return colors.accent;
  if (level === 'Medium') return colors.warning;
  return colors.textMuted;
}

export function NutritionReportPanel({ report, locale, labels }: Props) {
  const health = report.healthAnalysis;
  const why = locale === 'ar' && health.whyAr ? health.whyAr : health.whyEn;

  const dietChips = useMemo(() => {
    return Object.entries(report.dietCompatibility)
      .filter(([, ok]) => ok)
      .map(([key]) => {
        const meta = DIET_LABELS[key];
        return meta ? (locale === 'ar' ? meta.ar : meta.en) : key;
      })
      .slice(0, 8);
  }, [locale, report.dietCompatibility]);

  const microChips = useMemo(() => {
    return Object.entries(report.micronutrients)
      .filter(([, level]) => level === 'High' || level === 'Medium')
      .slice(0, 8)
      .map(([key, level]) => {
        const meta = MICRO_LABELS[key];
        const name = meta ? (locale === 'ar' ? meta.ar : meta.en) : key;
        return { name, level };
      });
  }, [locale, report.micronutrients]);

  const improvements = report.improvements.slice(0, 4);
  const burn = report.exerciseEquivalent;

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreRow}>
        <View style={styles.scoreRing}>
          <Text style={styles.scoreValue}>{Math.round(health.healthScore)}</Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>
        <View style={styles.scoreBody}>
          <Text style={styles.sectionTitle}>{labels.healthScore}</Text>
          <Text style={styles.metaLine}>
            {health.mealBalance}
            {' · '}
            {health.fatQuality}
            {' · '}
            {health.sodiumLevel}
          </Text>
          {why ? (
            <Text style={styles.why} numberOfLines={3}>
              {why}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.extraMacros}>
        <Text style={styles.extraItem}>
          {labels.fiber} {Math.round(report.macros.fiberG)}g
        </Text>
        <Text style={styles.extraItem}>
          {labels.sugar} {Math.round(report.macros.sugarG)}g
        </Text>
        <Text style={styles.extraItem}>
          {labels.sodium} {Math.round(report.macros.sodiumMg)}mg
        </Text>
      </View>

      {dietChips.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{labels.diets}</Text>
          <View style={styles.chips}>
            {dietChips.map((chip) => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {microChips.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{labels.micros}</Text>
          <View style={styles.chips}>
            {microChips.map((chip) => (
              <View key={chip.name} style={styles.chip}>
                <Text style={[styles.chipText, { color: levelColor(chip.level) }]}>
                  {chip.name} · {chip.level}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {report.allergens.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{labels.allergens}</Text>
          <Text style={styles.metaLine}>{report.allergens.join(' · ')}</Text>
        </View>
      ) : null}

      {improvements.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>{labels.improve}</Text>
          {improvements.map((row, index) => {
            const action =
              locale === 'ar' && row.actionAr ? row.actionAr : row.actionEn;
            const delta =
              row.kcalDelta === 0
                ? ''
                : `${row.kcalDelta > 0 ? '+' : ''}${Math.round(row.kcalDelta)} kcal`;
            return (
              <View key={`${action}-${index}`} style={styles.improveRow}>
                <Text style={styles.improveAction} numberOfLines={2}>
                  {action}
                </Text>
                {delta ? <Text style={styles.improveDelta}>{delta}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.sectionTitle}>{labels.burn}</Text>
        <Text style={styles.metaLine}>
          {labels.walking} {burn.walkingMin}
          {labels.minutes}
          {' · '}
          {labels.running} {burn.runningMin}
          {labels.minutes}
          {' · '}
          {labels.cycling} {burn.cyclingMin}
          {labels.minutes}
        </Text>
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
    gap: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  scoreRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: typography.brandSm.fontFamily,
  },
  scoreMax: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: -2,
  },
  scoreBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  metaLine: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  why: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  extraMacros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  extraItem: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.bgMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  block: {
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  improveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  improveAction: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  improveDelta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
});
