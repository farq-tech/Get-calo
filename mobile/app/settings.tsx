import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { setAppLanguage } from '@/i18n';
import { checkForModelUpdates, getBundledVersion } from '@/inference/modelManager';
import { getSession } from '@/inference/yolo';
import { getSupabaseConfigStatus } from '@/services/supabase';
import { useModelStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import type { LocaleCode } from '@/types';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const modelInfo = useModelStore((s) => s.info);
  const setModelInfo = useModelStore((s) => s.setInfo);

  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const supabaseStatus = getSupabaseConfigStatus();
  const session = getSession();

  const changeLanguage = async (next: LocaleCode) => {
    if (next === locale) return;
    const needsReload = await setAppLanguage(next);
    setLocale(next);
    if (needsReload) {
      Alert.alert(
        t('settings.language'),
        next === 'ar'
          ? 'Arabic RTL is enabled. Fully restart the app to apply layout direction.'
          : 'LTR is enabled. Fully restart the app to apply layout direction.',
        [{ text: t('common.done') }],
      );
    }
  };

  const onCheckUpdates = async () => {
    setChecking(true);
    setStatusMsg(t('settings.checking'));
    try {
      const result = await checkForModelUpdates();
      setModelInfo(result.current);
      setStatusMsg(
        result.updateAvailable ? t('settings.updateAvailable') : t('settings.upToDate'),
      );
    } catch {
      setStatusMsg(t('common.error'));
    } finally {
      setChecking(false);
    }
  };

  const offlineLabel = !supabaseStatus.configured
    ? t('settings.offlineLimited')
    : modelInfo?.offline
      ? t('settings.offlineReady')
      : t('settings.online');

  return (
    <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.done}>{t('common.done')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
      >
        <Text style={styles.section}>{t('settings.language')}</Text>
        <View style={styles.segment}>
          <Pressable
            style={[styles.segBtn, locale === 'en' && styles.segActive]}
            onPress={() => void changeLanguage('en')}
          >
            <Text style={[styles.segText, locale === 'en' && styles.segTextActive]}>
              {t('settings.english')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segBtn, locale === 'ar' && styles.segActive]}
            onPress={() => void changeLanguage('ar')}
          >
            <Text style={[styles.segText, locale === 'ar' && styles.segTextActive]}>
              {t('settings.arabic')}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.section}>{t('settings.model')}</Text>
        <View style={styles.card}>
          <Row label={t('settings.modelVersion')} value={modelInfo?.version ?? getBundledVersion()} />
          <Row
            label={t('settings.modelBackend')}
            value={(modelInfo?.backend ?? session?.backend ?? 'mock').toUpperCase()}
          />
          <Row label={t('settings.offline')} value={offlineLabel} />
        </View>

        <Pressable
          style={styles.checkBtn}
          onPress={() => void onCheckUpdates()}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.checkBtnText}>{t('settings.checkUpdates')}</Text>
          )}
        </Pressable>
        {statusMsg ? <Text style={styles.statusMsg}>{statusMsg}</Text> : null}

        <Text style={styles.section}>{t('settings.haptics')}</Text>
        <View style={styles.switchCard}>
          <Text style={styles.switchLabel}>{t('settings.haptics')}</Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ false: colors.bgMuted, true: colors.accentMuted }}
            thumbColor={hapticsEnabled ? colors.accent : colors.textMuted}
          />
        </View>

        <Text style={styles.section}>{t('settings.about')}</Text>
        <Text style={styles.about}>{t('settings.aboutBody')}</Text>
        <Text style={styles.privacy}>{t('settings.privacy')}</Text>
      </ScrollView>
    </LinearGradient>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
    paddingBottom: 12,
  },
  done: {
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
  spacer: {
    width: 72,
  },
  content: {
    paddingHorizontal: 20,
  },
  section: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 10,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  segActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  segText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  segTextActive: {
    color: colors.accent,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowLabel: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.bodySm,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  checkBtn: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkBtnText: {
    ...typography.button,
    color: colors.accent,
  },
  statusMsg: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
  },
  about: {
    ...typography.body,
    color: colors.textSecondary,
  },
  privacy: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: 10,
  },
});
