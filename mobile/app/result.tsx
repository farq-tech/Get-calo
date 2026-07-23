import React, { useMemo } from 'react';
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

import { CalorieCard } from '@/components/CalorieCard';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';

export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const result = useScanStore((s) => s.lastResult);
  const locale = useSettingsStore((s) => s.locale);

  const foodName = useMemo(() => {
    if (!result?.nutrition) return t('result.unknownFood');
    if (locale === 'ar' && result.nutrition.nameAr) return result.nutrition.nameAr;
    return result.nutrition.nameEn;
  }, [locale, result, t]);

  const servingLabel = useMemo(() => {
    if (!result?.nutrition) return '—';
    const label =
      locale === 'ar' && result.nutrition.servingLabelAr
        ? result.nutrition.servingLabelAr
        : result.nutrition.servingLabelEn;
    return `${result.nutrition.servingSizeG}${t('result.grams')} · ${label}`;
  }, [locale, result, t]);

  if (!result) {
    return (
      <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
        <View style={[styles.empty, { paddingTop: insets.top + 40 }]}>
          <Text style={styles.emptyText}>{t('common.error')}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/camera')}>
            <Text style={styles.primaryBtnText}>{t('result.scanAgain')}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[...colors.gradientAtmosphere]} style={styles.fill}>
      <LinearGradient
        colors={[...colors.gradientTealWash]}
        style={styles.wash}
        pointerEvents="none"
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(480).springify()}>
          <CalorieCard
            nutrition={result.nutrition}
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

        {result.lowConfidence ? (
          <Animated.View
            entering={FadeInDown.delay(120).duration(420)}
            style={styles.lowBox}
          >
            <Text style={styles.lowTitle}>{t('result.lowConfidenceTitle')}</Text>
            <Text style={styles.lowBody}>{t('result.lowConfidenceBody')}</Text>
            <Pressable style={styles.correctBtn} onPress={() => router.push('/correct')}>
              <Text style={styles.correctBtnText}>{t('result.correct')}</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(160).duration(420)} style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={() => router.push('/correct')}>
              <Text style={styles.secondaryBtnText}>{t('result.correct')}</Text>
            </Pressable>
          </Animated.View>
        )}

        <Pressable
          style={[styles.primaryBtn, styles.scanAgain]}
          onPress={() => router.replace('/camera')}
        >
          <Text style={styles.primaryBtnText}>{t('result.scanAgain')}</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  content: {
    paddingHorizontal: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  lowBox: {
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
  },
  lowTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 8,
  },
  lowBody: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  correctBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  correctBtnText: {
    ...typography.button,
    color: colors.accent,
  },
  actions: {
    marginTop: 18,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    ...typography.button,
    color: colors.accent,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    ...typography.button,
    color: colors.textInverse,
  },
  scanAgain: {
    marginTop: 24,
  },
});
