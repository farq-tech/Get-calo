import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';

interface ConfidenceBadgeProps {
  confidence: number;
  label: string;
}

function tone(confidence: number): string {
  if (confidence >= 0.7) return colors.confidenceHigh;
  if (confidence >= 0.45) return colors.confidenceMid;
  return colors.confidenceLow;
}

export function ConfidenceBadge({ confidence, label }: ConfidenceBadgeProps) {
  const color = tone(confidence);
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.pct, { color }]}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  pct: {
    ...typography.label,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
