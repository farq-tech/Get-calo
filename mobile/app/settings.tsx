import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  I18nManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { setAppLanguage } from '@/i18n';
import { useMealStore } from '@/hooks/useMealStore';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { radius, spacing } from '@/theme/tokens';
import type { LocaleCode } from '@/types';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const dailyGoalKcal = useSettingsStore((s) => s.dailyGoalKcal);
  const cycleDailyGoal = useSettingsStore((s) => s.cycleDailyGoal);
  const shareFeedbackEnabled = useSettingsStore((s) => s.shareFeedbackEnabled);
  const setShareFeedbackEnabled = useSettingsStore((s) => s.setShareFeedbackEnabled);
  const clearMeals = useMealStore((s) => s.clearMeals);
  const localeTag = locale === 'ar' ? 'ar-SA' : 'en-US';

  const changeLanguage = async (next: LocaleCode) => {
    if (next === locale) return;
    const needsReload = await setAppLanguage(next);
    setLocale(next);
    if (needsReload) {
      Alert.alert(t('settings.rtlRestartTitle'), t('settings.rtlRestartBody'), [
        { text: t('common.done') },
      ]);
    }
  };

  const onClearLocalData = () => {
    Alert.alert(t('settings.clearDataConfirmTitle'), t('settings.clearDataConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.clearData'),
        style: 'destructive',
        onPress: () => {
          clearMeals();
          Alert.alert(t('settings.clearDataDone'));
        },
      },
    ]);
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
      >
        <SectionTitle label={t('settings.goals')} first />
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t('settings.tapToChangeGoal')}
            onPress={() => cycleDailyGoal()}
            style={[styles.row, styles.lastRow]}
          >
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('settings.dailyGoal')}</Text>
              <Text style={styles.rowSub}>{t('settings.tapToChangeGoal')}</Text>
            </View>
            <Text style={[styles.rowValue, styles.rowValueAccent]}>
              {dailyGoalKcal.toLocaleString(localeTag)} {t('result.kcal')}
            </Text>
          </Pressable>
        </View>

        <SectionTitle label={t('settings.language')} />
        <View style={styles.card}>
          <LanguageRow
            label={t('settings.english')}
            active={locale === 'en'}
            onPress={() => void changeLanguage('en')}
          />
          <LanguageRow
            label={t('settings.arabic')}
            active={locale === 'ar'}
            onPress={() => void changeLanguage('ar')}
            last
          />
        </View>

        <SectionTitle label={t('settings.privacySection')} />
        <View style={styles.card}>
          <View style={styles.privacyRow}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('settings.onDevice')}</Text>
              <Text style={styles.rowSub}>{t('settings.onDeviceSub')}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('settings.always')}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: shareFeedbackEnabled }}
            onPress={() => setShareFeedbackEnabled(!shareFeedbackEnabled)}
            style={[styles.privacyRow, styles.lastRow]}
          >
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('settings.share')}</Text>
              <Text style={styles.rowSub}>{t('settings.shareSub')}</Text>
            </View>
            <View style={[styles.toggle, shareFeedbackEnabled && styles.toggleOn]}>
              <View style={[styles.knob, shareFeedbackEnabled && styles.knobOn]} />
            </View>
          </Pressable>
        </View>

        <View style={[styles.card, styles.linkCard]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/privacy')}
            style={[styles.row, styles.lastRow]}
          >
            <Text style={styles.rowLabel}>{t('settings.privacyPolicy')}</Text>
            <Ionicons
              name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        <View style={[styles.card, styles.linkCard]}>
          <Pressable
            accessibilityRole="button"
            onPress={onClearLocalData}
            style={[styles.row, styles.lastRow]}
          >
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowLabel, styles.dangerLabel]}>{t('settings.clearData')}</Text>
              <Text style={styles.rowSub}>{t('settings.clearDataSub')}</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerMeta}>{t('settings.versionLabel')}</Text>
          <Text style={styles.footerCredit}>{t('madeWithLove')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ label, first = false }: { label: string; first?: boolean }) {
  return <Text style={[styles.section, first && styles.sectionFirst]}>{label}</Text>;
}

function LanguageRow({
  label,
  active,
  onPress,
  last = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, last && styles.lastRow]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {active ? <Ionicons name="checkmark" size={17} color={colors.accent} /> : null}
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
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
  spacer: {
    width: 44,
  },
  content: {
    paddingHorizontal: 20,
  },
  section: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionFirst: {
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  linkCard: {
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.text,
    flexShrink: 1,
  },
  dangerLabel: {
    color: colors.danger,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueAccent: {
    color: colors.accent,
    fontWeight: '600',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  badge: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(52,211,153,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgMuted,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: colors.accentStrong,
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 6,
  },
  footerMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  footerCredit: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
