import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/colors';

type Props = {
  size?: number;
  color?: string;
  thickness?: number;
};

/**
 * Teal corner brackets for the live camera viewfinder (Design System §04).
 */
export function ViewfinderFrame({
  size = 280,
  color = colors.accent,
  thickness = 3,
}: Props) {
  const arm = Math.round(size * 0.1);
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: 24,
          borderWidth: 1.5,
          borderColor: colors.accentBorder,
        },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.corner,
          {
            top: -2,
            left: -2,
            width: arm,
            height: arm,
            borderTopWidth: thickness,
            borderLeftWidth: thickness,
            borderColor: color,
            borderTopLeftRadius: 24,
          },
        ]}
      />
      <View
        style={[
          styles.corner,
          {
            top: -2,
            right: -2,
            width: arm,
            height: arm,
            borderTopWidth: thickness,
            borderRightWidth: thickness,
            borderColor: color,
            borderTopRightRadius: 24,
          },
        ]}
      />
      <View
        style={[
          styles.corner,
          {
            bottom: -2,
            left: -2,
            width: arm,
            height: arm,
            borderBottomWidth: thickness,
            borderLeftWidth: thickness,
            borderColor: color,
            borderBottomLeftRadius: 24,
          },
        ]}
      />
      <View
        style={[
          styles.corner,
          {
            bottom: -2,
            right: -2,
            width: arm,
            height: arm,
            borderBottomWidth: thickness,
            borderRightWidth: thickness,
            borderColor: color,
            borderBottomRightRadius: 24,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'center',
  },
  corner: {
    position: 'absolute',
  },
});
