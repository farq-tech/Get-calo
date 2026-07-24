import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { searchNutrition } from '@/db/nutrition';
import { submitFeedback } from '@/services/feedback';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { radius } from '@/theme/tokens';
import type { NutritionItem } from '@/types';

export default function CorrectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const result = useScanStore((s) => s.lastResult);
  const applyNutritionOverride = useScanStore((s) => s.applyNutritionOverride);
  const locale = useSettingsStore((s) => s.locale);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const shareFeedbackEnabled = useSettingsStore((s) => s.shareFeedbackEnabled);

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<NutritionItem[]>([]);

  useEffect(() => {
    let alive = true;
    void searchNutrition(query, 40).then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  const displayName = useCallback(
    (item: NutritionItem) =>
      locale === 'ar' && item.nameAr ? item.nameAr : item.nameEn,
    [locale],
  );

  const suggestions = useMemo(() => items.slice(0, 4), [items]);
  const heading = query.trim() ? t('correct.results') : t('correct.suggestions');

  const onPick = async (item: NutritionItem) => {
    const name = displayName(item);
    applyNutritionOverride(item);
    if (hapticsEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }
    if (shareFeedbackEnabled) {
      void submitFeedback({
        predictedClassId: result?.topDetection?.classId ?? null,
        predictedItemIdentity: result?.nutrition?.itemIdentity ?? null,
        predictedConfidence: result?.confidence ?? null,
        correctedItemIdentity: item.itemIdentity,
        correctedName: name,
        imageUri: null,
        locale,
      }).catch(() => undefined);
    }
    router.replace('/result');
  };

  return (
    <View style={styles.fill}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, paddingBottom: 12 },
        ]}
      >
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
        <View style={styles.searchRing}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('correct.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
            />
          </View>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
      >
        <View style={styles.chips}>
          {suggestions.map((item) => (
            <Pressable
              key={item.itemIdentity}
              onPress={() => void onPick(item)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>{displayName(item)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>{heading}</Text>
        <View style={styles.results}>
          {items.length === 0 ? (
            <Text style={styles.empty}>{t('correct.noResults')}</Text>
          ) : (
            items.map((item) => (
              <ResultRow
                key={item.itemIdentity}
                item={item}
                name={displayName(item)}
                kcalLabel={t('result.kcal')}
                perServingLabel={t('result.perServing')}
                gramsLabel={t('result.grams')}
                onPress={() => void onPick(item)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ResultRow({
  item,
  name,
  kcalLabel,
  perServingLabel,
  gramsLabel,
  onPress,
}: {
  item: NutritionItem;
  name: string;
  kcalLabel: string;
  perServingLabel: string;
  gramsLabel: string;
  onPress: () => void;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.initial}>
        <Text style={styles.initialText}>{initial}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.rowMeta}>
          {perServingLabel} · {Math.round(item.servingSizeG)}
          {gramsLabel}
        </Text>
      </View>
      <Text style={styles.kcal} numberOfLines={1}>
        {Math.round(item.caloriesKcal)} {kcalLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
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
  searchRing: {
    flex: 1,
    borderRadius: 16,
    padding: 3,
    backgroundColor: 'rgba(45,212,168,0.12)',
  },
  searchBox: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  content: {
    paddingHorizontal: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPressed: {
    borderColor: 'rgba(45,212,168,0.35)',
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  section: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  results: {
    gap: 8,
  },
  empty: {
    ...typography.bodySm,
    color: colors.textMuted,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.bgElevated,
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: typography.brandSm.fontFamily,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  kcal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    flexShrink: 0,
  },
});
