import React, { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { ScanProgressOverlay } from '@/components/ScanProgressOverlay';
import { ShutterButton } from '@/components/ShutterButton';
import { ViewfinderFrame } from '@/components/ViewfinderFrame';
import { useInference } from '@/hooks/useInference';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';

import demoMeal from '../assets/samples/demo-meal.jpg';

type ScanMode = 'food' | 'drink' | 'snack';

export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { scanning, scanStep, previewUri, scan, cancelScan } = useInference();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [mode, setMode] = useState<ScanMode>('food');
  const [flashOn, setFlashOn] = useState(false);

  const analyzingUri = previewUri ?? capturedUri;
  const showAnalyze = scanning && analyzingUri != null && scanStep != null;
  const frameW = Math.max(0, width - 72);
  const frameH = 300;

  const runScan = useCallback(
    async (uri: string) => {
      setCapturedUri(uri);
      const result = await scan(uri);
      if (result) {
        router.push('/result');
      } else {
        setCapturedUri(null);
      }
    },
    [router, scan],
  );

  const onBackFromScan = useCallback(() => {
    cancelScan();
    setCapturedUri(null);
  }, [cancelScan]);

  const onCapture = useCallback(async () => {
    if (!cameraRef.current || scanning) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (!photo?.uri) return;
      await runScan(photo.uri);
    } catch (err) {
      console.warn('[snapcal/camera] capture failed', err);
    }
  }, [runScan, scanning]);

  const onWebUpload = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void runScan(URL.createObjectURL(file));
    };
    input.click();
  }, [runScan]);

  const onWebDemo = useCallback(() => {
    void runScan('web-demo://meal');
  }, [runScan]);

  const modeChip = (id: ScanMode, label: string) => (
    <Pressable
      key={id}
      onPress={() => setMode(id)}
      style={[styles.modeChip, mode === id && styles.modeChipActive]}
    >
      <Text style={[styles.modeChipText, mode === id && styles.modeChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.fill}>
        <StatusBar style="light" />
        <LinearGradient colors={['#101715', colors.bg, colors.bg]} style={styles.fill}>
          <View style={styles.permissionGlow} pointerEvents="none" />
          <View style={[styles.permission, { paddingTop: insets.top + 32 }]}>
            <View style={styles.permIcon}>
              <Ionicons name="camera-outline" size={32} color={colors.accent} />
            </View>
            <Text style={styles.permTitle}>{t('camera.webTitle')}</Text>
            <Text style={styles.permBody}>{t('camera.webBody')}</Text>

            {!scanning ? (
              <View style={styles.webActions}>
                <Pressable style={styles.permBtn} onPress={onWebUpload}>
                  <LinearGradient
                    colors={[...colors.gradientPrimary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.permBtnGrad}
                  >
                    <Text style={styles.permBtnText}>{t('camera.uploadPhoto')}</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={onWebDemo}>
                  <Text style={styles.secondaryBtnText}>{t('camera.demoScan')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {showAnalyze ? (
          <ScanProgressOverlay
            imageUri={analyzingUri}
            step={scanStep}
            onBack={onBackFromScan}
            imageSource={
              analyzingUri.startsWith('web-demo:') || analyzingUri.startsWith('demo:')
                ? demoMeal
                : undefined
            }
          />
        ) : null}
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={['#101715', colors.bg, colors.bg]} style={styles.fill}>
        <StatusBar style="light" />
        <View style={styles.permissionGlow} pointerEvents="none" />
        <View style={styles.permission}>
          <View style={styles.permIcon}>
            <Ionicons name="camera-outline" size={32} color={colors.accent} />
          </View>
          <Text style={styles.permTitle}>{t('camera.permissionTitle')}</Text>
          <Text style={styles.permBody}>{t('camera.permissionBody')}</Text>
          <View style={styles.privacyPill}>
            <Ionicons name="shield-checkmark" size={14} color={colors.success} />
            <Text style={styles.privacyPillText}>{t('camera.permissionPrivacy')}</Text>
          </View>
          <Pressable style={styles.permBtn} onPress={() => void requestPermission()}>
            <LinearGradient
              colors={[...colors.gradientPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.permBtnGrad}
            >
              <Text style={styles.permBtnText}>{t('camera.grantPermission')}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} style={styles.notNow}>
            <Text style={styles.notNowText}>{t('camera.notNow')}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.fill}>
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
      />

      <LinearGradient
        colors={['rgba(7,10,9,0.55)', 'transparent', 'transparent', 'rgba(7,10,9,0.85)']}
        locations={[0, 0.28, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.topChrome, { top: insets.top + 17 }]}>
        <Pressable style={styles.roundBtn} onPress={() => router.push('/history')}>
          <BlurView intensity={40} tint="dark" style={styles.roundBtnBlur}>
            <Ionicons name="time-outline" size={20} color={colors.text} />
          </BlurView>
        </Pressable>
        <View style={styles.hintPill}>
          <Text style={styles.hint}>{t('camera.holdSteady')}</Text>
        </View>
        <Pressable style={styles.roundBtn} onPress={() => router.push('/settings')}>
          <BlurView intensity={40} tint="dark" style={styles.roundBtnBlur}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </BlurView>
        </Pressable>
      </View>

      <View style={[styles.viewfinderWrap, { top: 160, width: frameW, height: frameH }]} pointerEvents="none">
        <ViewfinderFrame width={frameW} height={frameH} />
      </View>

      <View style={[styles.modes, { bottom: Math.max(206, insets.bottom + 172) }]}>
        <View style={styles.modeRow}>
          {modeChip('food', t('camera.modeFood'))}
          {modeChip('drink', t('camera.modeDrink'))}
          {modeChip('snack', t('camera.modeSnack'))}
        </View>
      </View>

      <View style={[styles.bottomChrome, { bottom: Math.max(64, insets.bottom + 30) }]}>
        <Pressable style={styles.sideBtn} onPress={() => router.push('/correct')}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.shutterWrap}>
          <ShutterButton onPress={() => void onCapture()} busy={scanning} />
        </View>
        <Pressable
          style={[styles.sideBtn, flashOn && styles.sideBtnActive]}
          onPress={() => setFlashOn((value) => !value)}
        >
          <Ionicons
            name="flash-outline"
            size={20}
            color={flashOn ? colors.accent : colors.textSecondary}
          />
        </Pressable>
      </View>
      <Text style={[styles.tapHint, { bottom: Math.max(36, insets.bottom + 2) }]}>
        {t('camera.tapToScan')}
      </Text>

      {showAnalyze ? (
        <ScanProgressOverlay
          imageUri={analyzingUri}
          step={scanStep}
          onBack={onBackFromScan}
          imageSource={
            analyzingUri.startsWith('web-demo:') || analyzingUri.startsWith('demo:')
              ? demoMeal
              : undefined
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  roundBtnBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 22,
    backgroundColor: 'rgba(28,38,34,0.75)',
  },
  hintPill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  viewfinderWrap: {
    position: 'absolute',
    left: 36,
    zIndex: 1,
  },
  modes: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    padding: 3,
  },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  modeChipActive: {
    backgroundColor: 'rgba(45,212,168,0.16)',
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  modeChipTextActive: {
    fontWeight: '600',
    color: colors.accent,
  },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
    zIndex: 2,
  },
  shutterWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(28,38,34,0.8)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnActive: {
    backgroundColor: 'rgba(45,212,168,0.2)',
  },
  tapHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    zIndex: 2,
  },
  permission: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionGlow: {
    position: 'absolute',
    top: '26%',
    left: '50%',
    width: 500,
    height: 500,
    marginLeft: -250,
    borderRadius: 250,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  permIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(45,212,168,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,168,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  permTitle: {
    ...typography.h1,
    fontSize: 26,
    color: colors.text,
    textAlign: 'center',
    maxWidth: 280,
  },
  permBody: {
    ...typography.bodySm,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 300,
  },
  privacyPill: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(52,211,153,0.1)',
  },
  privacyPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  permBtn: {
    marginTop: 40,
    width: '100%',
    maxWidth: 300,
    borderRadius: 16,
    overflow: 'hidden',
  },
  permBtnGrad: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  permBtnText: {
    ...typography.button,
    fontWeight: '700',
    color: colors.textInverse,
  },
  notNow: {
    marginTop: 12,
    padding: 8,
  },
  notNowText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
  webActions: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    marginTop: 8,
  },
  secondaryBtn: {
    marginTop: 14,
    minHeight: 54,
    width: '100%',
    maxWidth: 300,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    ...typography.button,
    fontWeight: '600',
    color: colors.text,
  },
});
