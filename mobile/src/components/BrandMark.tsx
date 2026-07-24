import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';

interface BrandMarkProps {
  size?: 'hero' | 'sm' | 'nav';
  subtitle?: string;
  /** Show designer credit under the brand */
  showCredit?: boolean;
  /** Override brand text; defaults to i18n `brand` (SnapCal) */
  title?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function BrandMark({
  size = 'hero',
  subtitle,
  showCredit = false,
  title,
  style,
  textStyle,
}: BrandMarkProps) {
  const { t } = useTranslation();
  const brandStyle =
    size === 'hero' ? typography.brand : size === 'sm' ? typography.brandSm : styles.navBrand;

  return (
    <View style={[styles.wrap, style]} accessibilityRole="header">
      <Text style={[brandStyle, styles.brand, textStyle]}>{title ?? t('brand')}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {showCredit ? <Text style={styles.credit}>{t('credit')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  brand: {
    color: colors.text,
    textShadowColor: 'rgba(45,212,168,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  navBrand: {
    fontFamily: typography.brandSm.fontFamily,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  credit: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 280,
  },
});
