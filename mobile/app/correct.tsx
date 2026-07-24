import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { searchNutrition } from '@/db/nutrition';
import { submitFeedback } from '@/services/feedback';
import { useScanStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import type { NutritionItem } from '@/types';

export default function CorrectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const result = useScanStore((s) => s.lastResult);
  const applyNutritionOverride = useScanStore((s) => s.applyNutritionOverride);
  const locale = useSettingsStore((s) => s.locale);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<NutritionItem[]>([]);
  const [selected, setSelected] = useState<NutritionItem | null>(null);
  const [customName, setCustomName] = useState('');
  const [includePhoto, setIncludePhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void searchNutrition(query, 80).then((rows) => {
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

  const onSubmit = async () => {
    const name = selected ? displayName(selected) : customName.trim();
    if (!name) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    // Always apply the pick locally so calories update for food/drink/anything.
    if (selected) {
      applyNutritionOverride(selected);
    }

    const feedback = await submitFeedback({
      predictedClassId: result?.topDetection?.classId ?? null,
      predictedItemIdentity: result?.nutrition?.itemIdentity ?? null,
      predictedConfidence: result?.confidence ?? null,
      correctedItemIdentity: selected?.itemIdentity ?? null,
      correctedName: name,
      imageUri: includePhoto ? result?.imageUri : null,
      locale,
    });

    setSubmitting(false);

    if (hapticsEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }

    // Local override already applied; feedback sync is best-effort.
    setMessage(feedback.ok ? t('correct.success') : t('correct.savedLocally'));
    setTimeout(() => router.back(), 700);
  };

  return (
    <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, paddingBottom: 12 },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.cancel}>{t('common.cancel')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('correct.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('correct.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.section}>{t('correct.suggested')}</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.itemIdentity}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('correct.noResults')}</Text>
        }
        renderItem={({ item }) => {
          const active = selected?.itemIdentity === item.itemIdentity;
          return (
            <Pressable
              onPress={() => {
                setSelected(item);
                setCustomName('');
              }}
              style={[styles.row, active && styles.rowActive]}
            >
              <Text style={styles.rowTitle}>{displayName(item)}</Text>
              <Text style={styles.rowMeta}>
                {Math.round(item.caloriesKcal)} {t('result.kcal')}
              </Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.section}>{t('correct.customName')}</Text>
            <TextInput
              value={customName}
              onChangeText={(text) => {
                setCustomName(text);
                setSelected(null);
              }}
              placeholder={t('correct.customPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('correct.includePhoto')}</Text>
              <Switch
                value={includePhoto}
                onValueChange={setIncludePhoto}
                trackColor={{ false: colors.bgMuted, true: colors.accentMuted }}
                thumbColor={includePhoto ? colors.accent : colors.textMuted}
              />
            </View>

            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[
                styles.submit,
                (!selected && !customName.trim()) || submitting
                  ? styles.submitDisabled
                  : null,
              ]}
              disabled={(!selected && !customName.trim()) || submitting}
              onPress={() => void onSubmit()}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.submitText}>
                  {submitting ? t('correct.submitting') : t('correct.submit')}
                </Text>
              )}
            </Pressable>
          </View>
        }
      />
    </LinearGradient>
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
    paddingHorizontal: 20,
  },
  cancel: {
    ...typography.body,
    color: colors.accent,
    width: 72,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 72,
  },
  searchWrap: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  section: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  empty: {
    ...typography.bodySm,
    color: colors.textMuted,
    paddingVertical: 12,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowActive: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginEnd: 12,
  },
  rowMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 12,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
  },
  submit: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    ...typography.button,
    color: colors.textInverse,
  },
  success: {
    ...typography.bodySm,
    color: colors.success,
    marginBottom: 8,
  },
  error: {
    ...typography.bodySm,
    color: colors.danger,
    marginBottom: 8,
  },
});
