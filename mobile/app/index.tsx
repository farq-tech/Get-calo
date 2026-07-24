import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';

function LoadingDot({ delay }: { delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      progress.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.35, 1, 0.35]),
    transform: [{ translateY: interpolate(progress.value, [0, 0.5, 1], [0, -4, 0]) }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

export default function Index() {
  const { t } = useTranslation();
  const router = useRouter();
  const ring = useSharedValue(0);

  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [ring]);

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/camera'), 1800);
    return () => clearTimeout(timer);
  }, [router]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.72, 1], [0.4, 0.18, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.92, 1.18]) }],
  }));

  return (
    <View style={styles.fill}>
      <StatusBar style="light" />
      <LinearGradient colors={['#101715', colors.bg, colors.bg]} style={styles.fill}>
        <View style={styles.wash} pointerEvents="none" />
        <View style={styles.center}>
          <View style={styles.iconStage}>
            <Animated.View style={[styles.ring, ringStyle]} />
            <LinearGradient
              colors={[...colors.gradientPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBox}
            >
              <Ionicons name="camera-outline" size={40} color={colors.textInverse} />
            </LinearGradient>
          </View>
          <Text style={styles.brand}>{t('brand')}</Text>
          <Text style={styles.tagline}>{t('tagline')}</Text>
        </View>
        <Text style={styles.credit}>{t('credit')}</Text>
        <View style={styles.dots}>
          <LoadingDot delay={0} />
          <LoadingDot delay={200} />
          <LoadingDot delay={400} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  wash: {
    position: 'absolute',
    top: '25%',
    left: '50%',
    width: 500,
    height: 500,
    marginLeft: -250,
    borderRadius: 250,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconStage: {
    position: 'relative',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(45,212,168,0.4)',
  },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accentStrong,
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  brand: {
    marginTop: 28,
    fontFamily: typography.brand.fontFamily,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.2,
    color: colors.text,
  },
  tagline: {
    marginTop: 8,
    fontSize: 15,
    color: colors.textSecondary,
  },
  credit: {
    position: 'absolute',
    bottom: 92,
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
  dots: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
