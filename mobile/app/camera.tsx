import React, { createElement, useCallback, useRef, useState } from 'react';
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
import { useWebCamera } from '@/hooks/useWebCamera';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/tokens';
import { typography } from '@/theme/typography';

import demoMeal from '../assets/samples/demo-meal.jpg';

type ScanMode = 'food' | 'drink' | 'snack';

function WebLiveVideo({
  videoRef,
}: {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  return createElement('video', {
    ref: (node: HTMLVideoElement | null) => {
      videoRef.current = node;
    },
    autoPlay: true,
    muted: true,
    playsInline: true,
    'webkit-playsinline': 'true',
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      backgroundColor: '#070A09',
    },
  });
}

export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const webCamera = useWebCamera();
  const { scanning, scanStep, previewUri, scan, cancelScan } = useInference();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [mode, setMode] = useState<ScanMode>('food');
  const [flashOn, setFlashOn] = useState(false);

  const analyzingUri = previewUri ?? capturedUri;
  const showAnalyze = scanning && analyzingUri != null && scanStep != null;
  const frameW = Math.max(0, width - 72);
  const frameH = 300;
  const webReady = webCamera.status === 'ready';
  const webBlocked =
    webCamera.status === 'denied' || webCamera.status === 'unavailable';

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

  const onWebCapture = useCallback(async () => {
    if (scanning) return;
    if (webCamera.status !== 'ready') {
      const ok = await webCamera.start();
      if (!ok) return;
      await new Promise((r) => setTimeout(r, 220));
    }
    const snap = webCamera.capture() ?? (await waitAndCapture(webCamera.capture, 3));
    if (!snap) return;
    await runScan(snap);
  }, [runScan, scanning, webCamera]);

  const onWebDemo = useCallback(() => {
    void runScan('web-demo://meal');
  }, [runScan]);

  const onWebUploadFallback = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void runScan(URL.createObjectURL(file));
    };
    input.click();
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
        {/* Single stable video element — stream stays attached across UI states */}
        <WebLiveVideo videoRef={webCamera.videoRef} />

        {!webReady ? (
          <LinearGradient
            colors={['#101715', colors.bg, colors.bg]}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <LinearGradient
            colors={['rgba(7,10,9,0.4)', 'transparent', 'transparent', 'rgba(7,10,9,0.72)']}
            locations={[0, 0.28, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}

        {!webReady ? (
          <View style={styles.permission}>
            <View style={styles.permissionGlow} pointerEvents="none" />
            <View style={styles.permIcon}>
              <Ionicons name="camera-outline" size={32} color={colors.accent} />
            </View>
            <Text style={styles.permTitle}>{t('camera.permissionTitle')}</Text>
            <Text style={styles.permBody}>{t('camera.permissionBody')}</Text>
            <View style={styles.privacyPill}>
              <Ionicons name="shield-checkmark" size={14} color={colors.success} />
              <Text style={styles.privacyPillText}>{t('camera.permissionPrivacy')}</Text>
            </View>
            <Pressable
              style={styles.permBtn}
              onPress={() => void webCamera.start()}
              disabled={webCamera.status === 'requesting'}
            >
              <LinearGradient
                colors={[...colors.gradientPrimary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.permBtnGrad}
              >
                <Text style={styles.permBtnText}>
                  {webCamera.status === 'requesting'
                    ? t('common.loading')
                    : t('camera.grantPermission')}
                </Text>
              </LinearGradient>
            </Pressable>
            {webBlocked ? (
              <Pressable onPress={onWebUploadFallback} style={styles.notNow}>
                <Text style={styles.webFallbackAction}>{t('camera.uploadPhoto')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onWebUploadFallback} style={styles.notNow}>
                <Text style={styles.notNowText}>{t('camera.notNow')}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.phoneShell} pointerEvents="box-none">
            <View style={[styles.topChrome, { top: insets.top + 17 }]}>
              <Pressable style={styles.roundBtn} onPress={() => router.push('/history')}>
                <View style={styles.roundBtnBlur}>
                  <Ionicons name="time-outline" size={20} color={colors.text} />
                </View>
              </Pressable>
              <View style={styles.hintPill}>
                <Text style={styles.hint}>{t('camera.holdSteady')}</Text>
              </View>
              <Pressable style={styles.roundBtn} onPress={() => router.push('/settings')}>
                <View style={styles.roundBtnBlur}>
                  <Ionicons name="settings-outline" size={20} color={colors.text} />
                </View>
              </Pressable>
            </View>

            <View
              style={[
                styles.viewfinderWrap,
                { top: Math.max(140, insets.top + 100), width: frameW, height: frameH },
              ]}
              pointerEvents="none"
            >
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
                <ShutterButton onPress={() => void onWebCapture()} busy={scanning} />
              </View>
              <Pressable
                style={[styles.sideBtn, flashOn && styles.sideBtnActive]}
                onPress={() => {
                  setFlashOn((v) => !v);
                  onWebDemo();
                }}
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
          </View>
        )}

        {showAnalyze ? (
          <ScanProgressOverlay
            imageUri={analyzingUri!}
            step={scanStep!}
            onBack={onBackFromScan}
            imageSource={
              analyzingUri!.startsWith('web-demo:') || analyzingUri!.startsWith('demo:')
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
        enableTorch={flashOn}
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

async function waitAndCapture(
  capture: () => string | null,
  tries: number,
): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 160));
    const snap = capture();
    if (snap) return snap;
  }
  return null;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  phoneShell: {
    ...StyleSheet.absoluteFillObject,
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
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
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
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
  webFallbackAction: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    textAlign: 'center',
  },
});
