import React, { useMemo, useState } from 'react';
import {
  I18nManager,
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
import { Ionicons } from '@expo/vector-icons';

import { type SavedMeal, useMealStore } from '@/hooks/useMealStore';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

type HistoryTab = 'today' | 'week' | 'all';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const meals = useMealStore((s) => s.meals);
  const dailyGoalKcal = useSettingsStore((s) => s.dailyGoalKcal);
  const [tab, setTab] = useState<HistoryTab>('today');

  const todayMeals = useMemo(() => meals.filter((meal) => isToday(meal.savedAt)), [meals]);
  const visibleMeals = useMemo(() => {
    if (tab === 'today') return todayMeals;
    if (tab === 'week') return meals.filter((meal) => isThisWeek(meal.savedAt));
    return meals;
  }, [meals, tab, todayMeals]);

  const todayTotal = todayMeals.reduce((sum, meal) => sum + Math.round(meal.caloriesKcal), 0);
  const goalPct = Math.min(100, Math.round((todayTotal / Math.max(dailyGoalKcal, 1)) * 100));
  const tabs: Array<{ id: HistoryTab; label: string }> = [
    { id: 'today', label: t('history.today') },
    { id: 'week', label: t('history.week') },
    { id: 'all', label: t('history.all') },
  ];

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            style={styles.iconBtn}
          >
            <Ionicons
              name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
              size={18}
              color={colors.text}
            />
          </Pressable>
          <Text style={styles.topTitle}>{t('history.title')}</Text>
          <View style={styles.iconBtnSpacer} />
        </View>

        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('history.todayTotal')}</Text>
            <Text style={styles.totalValue}>
              {todayTotal.toLocaleString('en-US')}{' '}
              <Text style={styles.kcalUnit}>{t('result.kcal')}</Text>
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#2DD4A8', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${goalPct}%` }]}
            />
          </View>
          <Text style={styles.goalText}>
            {goalPct}% {t('history.ofGoal')}
          </Text>
        </View>

        <View style={styles.tabs}>
          {tabs.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              style={[styles.tab, tab === item.id && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 104 },
        ]}
      >
        {visibleMeals.length > 0 ? (
          <View style={styles.mealList}>
            {visibleMeals.map((meal) => (
              <MealRow key={meal.id} meal={meal} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="camera-outline" size={24} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('history.emptyBody')}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <Pressable style={styles.scanHit} onPress={() => router.replace('/camera')}>
          <LinearGradient colors={[...colors.gradientPrimary]} style={styles.scanBtn}>
            <Ionicons name="camera-outline" size={19} color={colors.textInverse} />
            <Text style={styles.scanText}>{t('history.scanMeal')}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function MealRow({ meal }: { meal: SavedMeal }) {
  const initial = meal.name.trim().charAt(0).toUpperCase() || '?';
  const time = formatTime(meal.savedAt);

  return (
    <View style={styles.mealRow}>
      <View style={styles.initial}>
        <Text style={styles.initialText}>{initial}</Text>
      </View>
      <View style={styles.mealBody}>
        <Text style={styles.mealName} numberOfLines={1}>
          {meal.name}
        </Text>
        <Text style={styles.mealMeta}>
          {time} · {meal.servingLabel}
        </Text>
      </View>
      <Text style={styles.mealKcal} numberOfLines={1}>
        {Math.round(meal.caloriesKcal)}
      </Text>
    </View>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isThisWeek(value: string) {
  const date = new Date(value).getTime();
  return Date.now() - date <= 7 * 24 * 60 * 60 * 1000;
}

function formatTime(value: string) {
  const date = new Date(value);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  totalCard: {
    marginTop: 18,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  totalLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: typography.brandSm.fontFamily,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: colors.text,
  },
  kcalUnit: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    color: colors.textMuted,
  },
  progressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  goalText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
  },
  tabs: {
    marginTop: 16,
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.bgMuted,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  mealList: {
    gap: 9,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  initial: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontFamily: typography.brandSm.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
  mealBody: {
    flex: 1,
    minWidth: 0,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  mealMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  mealKcal: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    flexShrink: 0,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(45,212,168,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.bg,
  },
  scanHit: {
    width: '100%',
  },
  scanBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  scanText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse,
  },
});
