import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { BrandMark } from '@/components/BrandMark';
import { ShutterButton } from '@/components/ShutterButton';
import { useInference } from '@/hooks/useInference';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';

export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { scanning, scan } = useInference();

  const runScan = useCallback(
    async (uri: string) => {
      const result = await scan(uri);
      if (result) router.push('/result');
    },
    [router, scan],
  );

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

  if (Platform.OS === 'web') {
    return (
      <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
        <View style={[styles.permission, { paddingTop: insets.top + 48 }]}>
          <BrandMark size="hero" subtitle={t('tagline')} />
          <Text style={styles.permTitle}>{t('camera.webTitle')}</Text>
          <Text style={styles.permBody}>{t('camera.webBody')}</Text>

          {scanning ? (
            <View style={styles.webScanning}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.scanningText}>{t('camera.scanning')}</Text>
            </View>
          ) : (
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
          )}
        </View>
      </LinearGradient>
    );
  }

  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={[...colors.gradientDeep]} style={styles.fill}>
        <View style={[styles.permission, { paddingTop: insets.top + 48 }]}>
          <BrandMark size="hero" subtitle={t('tagline')} />
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
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
      />

      {/* Atmospheric vignette — not flat */}
      <LinearGradient
        colors={['rgba(7,10,9,0.55)', 'transparent', 'transparent', 'rgba(7,10,9,0.85)']}
        locations={[0, 0.28, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[...colors.gradientTealWash]}
        style={styles.tealWash}
        pointerEvents="none"
      />

      <View style={[styles.topChrome, { paddingTop: insets.top + 8 }]}>
        <BrandMark size="hero" />
        <Text style={styles.hint}>{t('camera.holdSteady')}</Text>
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
          {scanning ? (
            <View style={styles.scanning}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.scanningText}>{t('camera.scanning')}</Text>
            </View>
          ) : (
            <ShutterButton onPress={() => void onCapture()} busy={scanning} />
          )}
        </View>

        <View style={styles.sideBtnSpacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tealWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 10,
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
  },
  shutterWrap: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanning: {
    alignItems: 'center',
    gap: 10,
  },
  scanningText: {
    ...typography.caption,
    color: colors.accent,
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
    borderColor: colors.border,
    borderRadius: 24,
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
    marginTop: 32,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
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
  webScanning: {
    marginTop: 40,
    alignItems: 'center',
    gap: 12,
  },
  secondaryBtn: {
    marginTop: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryBtnText: {
    ...typography.button,
    color: colors.text,
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
