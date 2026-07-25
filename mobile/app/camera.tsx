import React, { createElement, useCallback, useEffect, useRef, useState } from 'react';
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

function WebLiveVideo({
  bindVideo,
}: {
  bindVideo: (node: HTMLVideoElement | null) => void;
}) {
  return createElement('video', {
    ref: (node: HTMLVideoElement | null) => {
      bindVideo(node);
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
      zIndex: 0,
      pointerEvents: 'none',
    },
  });
}

/** Extra bottom space so Safari toolbar never covers the shutter. */
function useWebBottomPad(insetsBottom: number) {
  const [pad, setPad] = useState(Math.max(insetsBottom, 24) + 88);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const update = () => {
      const vv = window.visualViewport;
      const gap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      setPad(Math.max(insetsBottom, 24) + Math.max(gap, 72) + 16);
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [insetsBottom]);

  return pad;
}

export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const webBottomPad = useWebBottomPad(insets.bottom);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const webCamera = useWebCamera();
  const { scanning, scanStep, previewUri, scan, cancelScan, error, resetError } = useInference();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const analyzingUri = previewUri ?? capturedUri;
  const showAnalyze = scanning && analyzingUri != null && scanStep != null;
  const frameW = Math.max(0, Math.min(width - 48, 360));
  const frameH = Math.min(280, Math.max(180, height * 0.32));
  const webReady = webCamera.status === 'ready';
  const bannerError = localError ?? error;

  const runScan = useCallback(
    async (uri: string) => {
      setLocalError(null);
      resetError();
      setCapturedUri(uri);
      const outcome = await scan(uri);
      if (outcome.status === 'ok') {
        router.replace('/result');
        return;
      }
      setCapturedUri(null);
      if (outcome.status === 'error') {
        setLocalError(outcome.message || t('camera.scanFailed'));
      }
      // cancelled → silent
    },
    [resetError, router, scan, t],
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
      if (!photo?.uri) {
        setLocalError(t('camera.captureFailed'));
        return;
      }
      await runScan(photo.uri);
    } catch (err) {
      console.warn('[calora/camera] capture failed', err);
      setLocalError(t('camera.captureFailed'));
    }
  }, [runScan, scanning, t]);

  const onWebCapture = useCallback(async () => {
    if (scanning) return;
    setLocalError(null);
    if (webCamera.status !== 'ready') {
      const ok = await webCamera.start();
      if (!ok) {
        setLocalError(t('camera.permissionTitle'));
        return;
      }
      await new Promise((r) => setTimeout(r, 220));
    }
    // Ensure play() happens on the shutter gesture (iOS Safari).
    try {
      await webCamera.videoRef.current?.play();
    } catch {
      // ignore
    }
    const snap = webCamera.capture() ?? (await waitAndCapture(webCamera.capture, 5));
    if (!snap) {
      setLocalError(t('camera.captureFailed'));
      return;
    }
    await runScan(snap);
  }, [runScan, scanning, t, webCamera]);

  /** Pick a photo from the device library / files (no fake demo scan). */
  const onUploadPhoto = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (dataUrl) void runScan(dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [runScan]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.fill}>
        <StatusBar style="light" />
        {/* Single stable video element — stream stays attached across UI states */}
        <WebLiveVideo bindVideo={webCamera.bindVideo} />

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

        {bannerError ? (
          <View style={[styles.errorBanner, { top: insets.top + 8 }]}>
            <Text style={styles.errorBannerText}>{bannerError}</Text>
            <Pressable
              onPress={() => {
                setLocalError(null);
                resetError();
              }}
              hitSlop={10}
            >
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
          </View>
        ) : null}

        {!webReady ? (
          <View style={styles.permission}>
            <View style={styles.permissionGlow} pointerEvents="none" />
            <View style={styles.permIcon}>
              <Ionicons name="camera-outline" size={32} color={colors.accent} />
            </View>
            {webCamera.status === 'denied' ? (
              <>
                <Text style={styles.permTitle}>{t('camera.permissionDeniedTitle')}</Text>
                <Text style={styles.permBody}>{t('camera.permissionDeniedBody')}</Text>
                <View style={styles.privacyPill}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                  <Text style={styles.privacyPillText}>{t('camera.permissionPrivacy')}</Text>
                </View>
                <Pressable style={styles.permBtn} onPress={onUploadPhoto}>
                  <LinearGradient
                    colors={[...colors.gradientPrimary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.permBtnGrad}
                  >
                    <Text style={styles.permBtnText}>{t('camera.uploadPhoto')}</Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : webCamera.status === 'unavailable' ? (
              <>
                <Text style={styles.permTitle}>{t('camera.permissionUnavailableTitle')}</Text>
                <Text style={styles.permBody}>{t('camera.permissionUnavailableBody')}</Text>
                <View style={styles.privacyPill}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                  <Text style={styles.privacyPillText}>{t('camera.permissionPrivacy')}</Text>
                </View>
                <Pressable style={styles.permBtn} onPress={onUploadPhoto}>
                  <LinearGradient
                    colors={[...colors.gradientPrimary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.permBtnGrad}
                  >
                    <Text style={styles.permBtnText}>{t('camera.uploadPhoto')}</Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <>
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
                <Pressable onPress={onUploadPhoto} style={styles.notNow}>
                  <Text style={styles.webFallbackAction}>{t('camera.uploadPhoto')}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={styles.webUi} pointerEvents="box-none">
            <View style={[styles.topChromeFlex, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
              <Pressable
                style={styles.roundBtn}
                onPress={() => router.push('/history')}
                accessibilityLabel={t('camera.history')}
              >
                <View style={styles.roundBtnBlur}>
                  <Ionicons name="time-outline" size={20} color={colors.text} />
                </View>
              </Pressable>
              <View style={styles.hintPill}>
                <Text style={styles.hint}>{t('camera.holdSteady')}</Text>
              </View>
              <Pressable
                style={styles.roundBtn}
                onPress={() => router.push('/settings')}
                accessibilityLabel={t('camera.settings')}
              >
                <View style={styles.roundBtnBlur}>
                  <Ionicons name="settings-outline" size={20} color={colors.text} />
                </View>
              </Pressable>
            </View>

            <View style={styles.webMiddle} pointerEvents="none">
              <ViewfinderFrame width={frameW} height={frameH} />
            </View>

            <View style={[styles.webDock, { paddingBottom: webBottomPad }]}>
              <View style={styles.bottomChromeFlex}>
                <Pressable
                  style={styles.sideBtn}
                  onPress={() => router.push('/correct')}
                  accessibilityLabel={t('camera.catalogSearch')}
                >
                  <Ionicons name="search" size={20} color={colors.textSecondary} />
                  <Text style={styles.sideLabel}>{t('camera.catalogSearch')}</Text>
                </Pressable>
                <View style={styles.shutterWrap}>
                  <ShutterButton
                    onPress={() => void onWebCapture()}
                    busy={scanning}
                    accessibilityLabel={t('camera.captureMeal')}
                  />
                </View>
                <Pressable
                  style={styles.sideBtn}
                  onPress={onUploadPhoto}
                  accessibilityLabel={t('camera.uploadPhoto')}
                >
                  <Ionicons name="images-outline" size={20} color={colors.textSecondary} />
                  <Text style={styles.sideLabel}>{t('camera.upload')}</Text>
                </Pressable>
              </View>
              <Text style={styles.tapHintFlex}>{t('camera.tapToScan')}</Text>
            </View>
          </View>
        )}

        {showAnalyze ? (
          <ScanProgressOverlay
            imageUri={analyzingUri!}
            step={scanStep!}
            onBack={onBackFromScan}
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
        <Pressable
          style={styles.roundBtn}
          onPress={() => router.push('/history')}
          accessibilityLabel={t('camera.history')}
        >
          <BlurView intensity={40} tint="dark" style={styles.roundBtnBlur}>
            <Ionicons name="time-outline" size={20} color={colors.text} />
          </BlurView>
        </Pressable>
        <View style={styles.hintPill}>
          <Text style={styles.hint}>{t('camera.holdSteady')}</Text>
        </View>
        <Pressable
          style={styles.roundBtn}
          onPress={() => router.push('/settings')}
          accessibilityLabel={t('camera.settings')}
        >
          <BlurView intensity={40} tint="dark" style={styles.roundBtnBlur}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </BlurView>
        </Pressable>
      </View>

      <View style={[styles.viewfinderWrap, { top: 160, width: frameW, height: frameH }]} pointerEvents="none">
        <ViewfinderFrame width={frameW} height={frameH} />
      </View>

      <View style={[styles.bottomChrome, { bottom: Math.max(64, insets.bottom + 30) }]}>
        <Pressable
          style={styles.sideBtn}
          onPress={() => router.push('/correct')}
          accessibilityLabel={t('camera.catalogSearch')}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <Text style={styles.sideLabel}>{t('camera.catalogSearch')}</Text>
        </Pressable>
        <View style={styles.shutterWrap}>
          <ShutterButton
            onPress={() => void onCapture()}
            busy={scanning}
            accessibilityLabel={t('camera.captureMeal')}
          />
        </View>
        <Pressable
          style={[styles.sideBtn, flashOn && styles.sideBtnActive]}
          onPress={() => setFlashOn((value) => !value)}
          accessibilityLabel={t('camera.flash')}
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
    position: 'relative',
    overflow: 'hidden',
  },
  webUi: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    justifyContent: 'space-between',
  },
  topChromeFlex: {
    zIndex: 22,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  webMiddle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 21,
  },
  webDock: {
    zIndex: 22,
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
    backgroundColor: 'rgba(7,10,9,0.35)',
  },
  bottomChromeFlex: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
    minHeight: 88,
  },
  tapHintFlex: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
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
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    zIndex: 2,
  },
  shutterWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtn: {
    minWidth: 64,
    height: 56,
    borderRadius: 18,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(28,38,34,0.8)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  sideLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
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
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
  },
});
