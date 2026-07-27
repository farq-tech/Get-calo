import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  I18nManager,
  Image,
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
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { CalorieCard } from '@/components/CalorieCard';
import { NutritionReportPanel } from '@/components/NutritionReportPanel';
import { PlateBreakdown } from '@/components/PlateBreakdown';
import { useMealStore } from '@/hooks/useMealStore';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { motion, radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';
import { LOW_CONFIDENCE_THRESHOLD } from '@/types';

const SERVING_FACTORS = [1, 1.33, 1.9];


export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const result = useScanStore((s) => s.lastResult);
  const addMeal = useMealStore((s) => s.addMeal);
  const locale = useSettingsStore((s) => s.locale);
  const [servingIdx, setServingIdx] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [saved, setSaved] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const plateItems = result?.items?.length ? result.items : result?.nutrition ? [result.nutrition] : [];
  const isPlate = plateItems.length > 1;

  const foodName = useMemo(() => {
    if (!result?.nutrition) return t('result.unknownFood');
    if (isPlate) {
      if (locale === 'ar') {
        return result.nutrition.nameAr || t('result.plateTitle', { count: plateItems.length });
      }
      return result.nutrition.nameEn || t('result.plateTitle', { count: plateItems.length });
    }
    if (locale === 'ar' && result.nutrition.nameAr) return result.nutrition.nameAr;
    return result.nutrition.nameEn;
  }, [isPlate, locale, plateItems.length, result, t]);

  const factor = SERVING_FACTORS[servingIdx] ?? 1;
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
    if (isPlate) {
      return `${t('result.est')} ${scaledNutrition.servingSizeG}${t('result.grams')} · ${t('result.fullPlate')}`;
    }
    return `${t('result.est')} ${scaledNutrition.servingSizeG}${t('result.grams')} · ${t('result.perServing')}`;
  }, [isPlate, scaledNutrition, t]);

  const servingOptions = useMemo(() => {
    const base = result?.nutrition?.servingSizeG ?? 240;
    const labels = [
      t('result.servingHalf'),
      t('result.servingRegular'),
      t('result.servingLarge'),
    ];
    return SERVING_FACTORS.map((f, i) => ({
      label: labels[i] ?? '',
      grams: `${Math.round(base * f)}${t('result.grams')}`,
    }));
  }, [result, t]);

  const confidenceLabel = useMemo(() => {
    const confidence = result?.confidence ?? 0;
    if (confidence >= 0.85) return t('result.confidenceHigh');
    if (confidence >= 0.6) return t('result.confidenceMedium');
    return t('result.confidenceLow');
  }, [result, t]);

  const lowConfidence = Boolean(
    result?.lowConfidence || (result && result.confidence < LOW_CONFIDENCE_THRESHOLD),
  );
  const noFood = Boolean(result && !result.nutrition);

  useEffect(() => {
    setSaved(false);
  }, [servingIdx, result?.inferredAt]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const onSaveMeal = () => {
    if (!result || !scaledNutrition || saved) return;
    const saveName = isPlate
      ? `${foodName}: ${plateItems
          .map((item) => (locale === 'ar' && item.nameAr ? item.nameAr : item.nameEn))
          .join(', ')}`
      : foodName;
    addMeal({
      name: saveName,
      caloriesKcal: scaledNutrition.caloriesKcal,
      proteinG: scaledNutrition.proteinG,
      carbsG: scaledNutrition.carbsG,
      fatG: scaledNutrition.fatG,
      servingLabel,
      confidence: result.confidence,
      imageUri: result.imageUri,
    });
    setSaved(true);
    setShowToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), 2600);
  };

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

  if (noFood) {
    return (
      <View style={styles.fill}>
        <View style={[styles.empty, { paddingTop: insets.top + 80 }]}>
          <Text style={styles.emptyText}>{t('result.noFoodTitle')}</Text>
          <Pressable style={styles.primaryHit} onPress={() => router.replace('/camera')}>
            <LinearGradient colors={[...colors.gradientPrimary]} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{t('result.noFoodAction')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={[styles.topBar, { paddingTop: insets.top + 17 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.replace('/camera')}>
          <Ionicons
            name="chevron-back"
            size={18}
            color={colors.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
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
        <Animated.View entering={FadeIn.duration(motion.emphasized)}>
          {result.imageUri ? (
            <Image
              source={{ uri: result.imageUri }}
              style={styles.heroThumb}
              resizeMode="cover"
            />
          ) : null}

          {lowConfidence ? (
            <Pressable style={styles.lowBanner} onPress={() => router.push('/correct')}>
              <Text style={styles.lowBannerText}>{t('result.lowConfidenceTitle')}</Text>
              <Text style={styles.lowBannerAction}>{t('result.correct')}</Text>
            </Pressable>
          ) : null}

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
            confidenceLabel={confidenceLabel}
            perServingLabel={t('result.perServing')}
            gramsLabel={t('result.grams')}
          />
        </Animated.View>

        <PlateBreakdown
          items={plateItems}
          locale={locale}
          factor={factor}
          title={t('result.plateBreakdown')}
          kcalLabel={t('result.kcal')}
          gramsLabel={t('result.grams')}
        />

        {result.report ? (
          <NutritionReportPanel
            report={result.report}
            locale={locale}
            labels={{
              healthScore: t('result.healthScore'),
              why: t('result.healthWhy'),
              diets: t('result.diets'),
              micros: t('result.micros'),
              allergens: t('result.allergens'),
              improve: t('result.improve'),
              burn: t('result.burn'),
              walking: t('result.walking'),
              running: t('result.running'),
              cycling: t('result.cycling'),
              extras: t('result.extras'),
              fiber: t('result.fiber'),
              sugar: t('result.sugar'),
              sodium: t('result.sodium'),
              minutes: t('result.minutes'),
            }}
          />
        ) : null}

        <View style={styles.servingBox}>
          <Text style={styles.servingTitle}>{t('result.servingSize')}</Text>
          <View style={styles.servingRow}>
            {servingOptions.map((option, i) => (
              <Pressable
                key={option.label}
                onPress={() => setServingIdx(i)}
                style={[styles.servingChip, servingIdx === i && styles.servingChipActive]}
              >
                <Text
                  style={[
                    styles.servingChipText,
                    servingIdx === i && styles.servingChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.servingChipGrams,
                    servingIdx === i && styles.servingChipGramsActive,
                  ]}
                >
                  {option.grams}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={styles.changeRow} onPress={() => router.push('/correct')}>
          <Ionicons name="list-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.changeLabel}>{t('result.notRight')}</Text>
          <Text style={styles.changeAction}>{t('result.correct')}</Text>
        </Pressable>
      </ScrollView>

      <LinearGradient
        colors={['rgba(10,14,13,0)', colors.bg, colors.bg]}
        locations={[0, 0.4, 1]}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
      >
        <Pressable style={styles.ghostBtn} onPress={() => router.replace('/camera')}>
          <Text style={styles.ghostBtnText}>{t('result.scanAgain')}</Text>
        </Pressable>
        <Pressable
          style={[styles.saveHit, saved && styles.saveHitDone]}
          onPress={saved ? () => router.push('/history') : onSaveMeal}
          disabled={false}
        >
          <LinearGradient
            colors={saved ? ['#1C2622', '#1C2622'] : [...colors.gradientPrimary]}
            style={styles.saveBtn}
          >
            <Text style={[styles.saveBtnText, saved && styles.saveBtnTextDone]}>
              {saved ? t('result.saved') : t('result.save')}
            </Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
      {showToast ? (
        <View style={[styles.toast, { bottom: Math.max(110, insets.bottom + 76) }]}>
          <View style={styles.toastIcon}>
            <Ionicons name="checkmark" size={12} color={colors.success} />
          </View>
          <Text style={styles.toastText}>{t('history.savedToast')}</Text>
          <Pressable onPress={() => router.push('/history')} hitSlop={10}>
            <Text style={styles.toastAction}>{t('history.view')}</Text>
          </Pressable>
        </View>
      ) : null}
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
  heroThumb: {
    width: '100%',
    height: 168,
    borderRadius: radius.xl,
    marginBottom: 14,
    backgroundColor: colors.bgElevated,
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
    textAlign: 'center',
  },
  lowBanner: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  lowBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.danger,
  },
  lowBannerAction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
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
    minHeight: 44,
    justifyContent: 'center',
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
  servingChipGrams: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    writingDirection: 'ltr',
  },
  servingChipGramsActive: {
    color: colors.accentMuted,
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
    minHeight: 44,
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
  saveHitDone: {
    opacity: 1,
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse,
  },
  saveBtnTextDone: {
    color: colors.accent,
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
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: colors.black,
    shadowOpacity: 0.4,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  toastIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(52,211,153,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  toastAction: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
});
