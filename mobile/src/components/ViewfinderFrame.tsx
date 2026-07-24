import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/colors';

type Props = {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  thickness?: number;
  arm?: number;
  cornerRadius?: number;
};

/**
 * Teal corner brackets for the live camera viewfinder (Design System §04).
 */
export function ViewfinderFrame({
  size = 280,
  width,
  height,
  color = colors.accent,
  thickness = 3.5,
  arm = 34,
  cornerRadius = 26,
}: Props) {
  const frameWidth = width ?? size;
  const frameHeight = height ?? size;
  return (
    <View
      style={[
        styles.box,
        {
          width: frameWidth,
          height: frameHeight,
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
            borderTopLeftRadius: cornerRadius,
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
            borderTopRightRadius: cornerRadius,
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
            borderBottomLeftRadius: cornerRadius,
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
            borderBottomRightRadius: cornerRadius,
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
