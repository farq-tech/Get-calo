import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  size?: number;
  color?: string;
  thickness?: number;
};

/**
 * Commercial viewfinder corners for the live camera preview.
 */
export function ViewfinderFrame({
  size = 280,
  color = 'rgba(255,255,255,0.92)',
  thickness = 3,
}: Props) {
  const arm = Math.round(size * 0.12);
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      <View
        style={[
          styles.corner,
          {
            top: 0,
            left: 0,
            width: arm,
            height: arm,
            borderTopWidth: thickness,
            borderLeftWidth: thickness,
            borderColor: color,
            borderTopLeftRadius: 8,
          },
        ]}
      />
      <View
        style={[
          styles.corner,
          {
            top: 0,
            right: 0,
            width: arm,
            height: arm,
            borderTopWidth: thickness,
            borderRightWidth: thickness,
            borderColor: color,
            borderTopRightRadius: 8,
          },
        ]}
      />
      <View
        style={[
          styles.corner,
          {
            bottom: 0,
            left: 0,
            width: arm,
            height: arm,
            borderBottomWidth: thickness,
            borderLeftWidth: thickness,
            borderColor: color,
            borderBottomLeftRadius: 8,
          },
        ]}
      />
      <View
        style={[
          styles.corner,
          {
            bottom: 0,
            right: 0,
            width: arm,
            height: arm,
            borderBottomWidth: thickness,
            borderRightWidth: thickness,
            borderColor: color,
            borderBottomRightRadius: 8,
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
