import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { CalorieCard } from '@/components/CalorieCard';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { motion, radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

const SERVING_FACTORS = [1, 1.33, 1.9];

export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const result = useScanStore((s) => s.lastResult);
  const locale = useSettingsStore((s) => s.locale);
  const [servingIdx, setServingIdx] = useState(0);

  const foodName = useMemo(() => {
    if (!result?.nutrition) return t('result.unknownFood');
    if (locale === 'ar' && result.nutrition.nameAr) return result.nutrition.nameAr;
    return result.nutrition.nameEn;
  }, [locale, result, t]);

  const factor = SERVING_FACTORS[servingIdx];
  const scaledNutrition = useMemo(() => {
    if (!result?.nutrition) return null;
    const n = result.nutrition;
    return {
      ...n,
      caloriesKcal: Math.round(n.caloriesKcal * factor),
      proteinG: Math.round(n.proteinG * factor),
      carbsG: Math.round(n.carbsG * factor),
      fatG: Math.round(n.fatG * factor),
      servingSizeG: Math.round(n.servingSizeG * factor),
    };
  }, [factor, result]);

  const servingLabel = useMemo(() => {
    if (!scaledNutrition) return '—';
    return `${t('result.est')} ${scaledNutrition.servingSizeG}${t('result.grams')} · ${t('result.perServing')}`;
  }, [scaledNutrition, t]);

  const servingOptions = useMemo(() => {
    const base = result?.nutrition?.servingSizeG ?? 240;
    return SERVING_FACTORS.map((f) => `${Math.round(base * f)}${t('result.grams')}`);
  }, [result, t]);

  if (!result) {
    return (
      <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
        <View style={[styles.empty, { paddingTop: insets.top + 40 }]}>
          <Text style={styles.emptyText}>{t('common.error')}</Text>
          <Pressable style={styles.primaryHit} onPress={() => router.replace('/camera')}>
            <LinearGradient colors={[...colors.gradientPrimary]} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{t('result.scanAgain')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.replace('/camera')}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>{t('result.title')}</Text>
        <View style={styles.iconBtnSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(motion.emphasized).springify()}>
          <CalorieCard
            nutrition={scaledNutrition}
            foodName={foodName}
            servingLabel={servingLabel}
            confidence={result.confidence}
            caloriesLabel={t('result.calories')}
            kcalLabel={t('result.kcal')}
            proteinLabel={t('result.protein')}
            carbsLabel={t('result.carbs')}
            fatLabel={t('result.fat')}
            servingTitle={t('result.serving')}
            confidenceLabel={t('result.confidence')}
            perServingLabel={t('result.perServing')}
            gramsLabel={t('result.grams')}
          />
        </Animated.View>

        <View style={styles.servingBox}>
          <Text style={styles.servingTitle}>{t('result.servingSize')}</Text>
          <View style={styles.servingRow}>
            {servingOptions.map((label, i) => (
              <Pressable
                key={label}
                onPress={() => setServingIdx(i)}
                style={[styles.servingChip, servingIdx === i && styles.servingChipActive]}
              >
                <Text
                  style={[
                    styles.servingChipText,
                    servingIdx === i && styles.servingChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={styles.changeRow} onPress={() => router.push('/correct')}>
          <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
          <Text style={styles.changeLabel}>{t('result.notRight')}</Text>
          <Text style={styles.changeAction}>{t('result.correct')}</Text>
        </Pressable>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <Pressable style={styles.ghostBtn} onPress={() => router.replace('/camera')}>
          <Text style={styles.ghostBtnText}>{t('result.scanAgain')}</Text>
        </Pressable>
        <Pressable style={styles.saveHit} onPress={() => router.replace('/camera')}>
          <LinearGradient colors={[...colors.gradientPrimary]} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{t('result.save')}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnSpacer: {
    width: 44,
  },
  topTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  content: {
    paddingHorizontal: spacing.lg - 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  servingBox: {
    marginTop: 14,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  servingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  servingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  servingChip: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  servingChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  servingChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  servingChipTextActive: {
    color: colors.accent,
  },
  changeRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  changeLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  changeAction: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.bg,
  },
  ghostBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  saveHit: {
    flex: 1.4,
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse,
  },
  primaryHit: {
    alignSelf: 'stretch',
    maxWidth: 300,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
