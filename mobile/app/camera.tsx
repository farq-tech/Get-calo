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

import { BrandMark } from '@/components/BrandMark';
import { ScanProgressOverlay } from '@/components/ScanProgressOverlay';
import { ShutterButton } from '@/components/ShutterButton';
import { ViewfinderFrame } from '@/components/ViewfinderFrame';
import { useInference } from '@/hooks/useInference';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/tokens';
import { typography } from '@/theme/typography';

import demoMeal from '../assets/samples/demo-meal.jpg';

export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { scanning, scanStep, previewUri, scan, cancelScan } = useInference();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  const analyzingUri = previewUri ?? capturedUri;
  const showAnalyze = scanning && analyzingUri != null && scanStep != null;

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
      console.warn('[calora/camera] capture failed', err);
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

  const frameSize = Math.min(width - 56, 300);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.fill}>
        <StatusBar style={showAnalyze ? 'dark' : 'light'} />
        <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
          <View style={[styles.permission, { paddingTop: insets.top + 48 }]}>
            <BrandMark size="hero" subtitle={t('tagline')} showCredit />
            <Text style={styles.permTitle}>{t('camera.webTitle')}</Text>
            <Text style={styles.permBody}>{t('camera.webBody')}</Text>

            {!scanning ? (
              <View style={styles.webActions}>
                <Pressable style={styles.permBtn} onPress={onWebUpload}>
                  <Text style={styles.permBtnText}>{t('camera.uploadPhoto')}</Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={onWebDemo}>
                  <Text style={styles.secondaryBtnText}>{t('camera.demoScan')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('camera.settings')}
                  onPress={() => router.push('/settings')}
                  style={styles.settingsLink}
                >
                  <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.settingsLinkText}>{t('camera.settings')}</Text>
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
      <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
        <View style={[styles.permission, { paddingTop: insets.top + 48 }]}>
          <BrandMark size="hero" subtitle={t('tagline')} showCredit />
          <Text style={styles.permTitle}>{t('camera.permissionTitle')}</Text>
          <Text style={styles.permBody}>{t('camera.permissionBody')}</Text>
          <Pressable style={styles.permBtn} onPress={() => void requestPermission()}>
            <Text style={styles.permBtnText}>{t('camera.grantPermission')}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.fill}>
      <StatusBar style={showAnalyze ? 'dark' : 'light'} />
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

      <View style={[styles.topChrome, { paddingTop: insets.top + 8 }]}>
        <BrandMark size="hero" />
        <View style={styles.hintPill}>
          <Text style={styles.hint}>{t('camera.holdSteady')}</Text>
        </View>
      </View>

      <View style={styles.viewfinderWrap} pointerEvents="none">
        <ViewfinderFrame size={frameSize} />
      </View>

      <View style={[styles.bottomChrome, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('camera.settings')}
          onPress={() => router.push('/settings')}
          style={styles.sideBtn}
        >
          <BlurView intensity={40} tint="dark" style={styles.sideBtnBlur}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </BlurView>
        </Pressable>

        <View style={styles.shutterWrap}>
          <ShutterButton onPress={() => void onCapture()} busy={scanning} />
        </View>

        <View style={styles.sideBtnSpacer} />
      </View>

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
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 2,
  },
  hintPill: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    ...typography.bodySm,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  viewfinderWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    zIndex: 2,
  },
  shutterWrap: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  sideBtnBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 24,
    backgroundColor: 'rgba(28,38,34,0.8)',
  },
  sideBtnSpacer: {
    width: 48,
  },
  permission: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  permTitle: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
    marginTop: 48,
  },
  permBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 340,
  },
  permBtn: {
    marginTop: spacing.xl,
    minHeight: 52,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBtnText: {
    ...typography.button,
    color: colors.textInverse,
  },
  webActions: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  secondaryBtn: {
    marginTop: 14,
    minHeight: 52,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    ...typography.button,
    color: colors.accent,
  },
  settingsLink: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsLinkText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
});
