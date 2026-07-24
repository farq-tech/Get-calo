import React, { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Syne_500Medium,
  Syne_600SemiBold,
  Syne_700Bold,
} from '@expo-google-fonts/syne';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initI18n } from '@/i18n';
import { initNutritionDb } from '@/db/nutrition';
import { loadModel } from '@/inference/yolo';
import { checkForModelUpdates, getLocalModelInfo } from '@/inference/modelManager';
import { useModelStore, useSettingsStore } from '@/hooks/useSettingsStore';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const setHydrated = useSettingsStore((s) => s.setHydrated);
  const setModelInfo = useModelStore((s) => s.setInfo);

  const [fontsLoaded, fontError] = useFonts({
    Syne_500Medium,
    Syne_600SemiBold,
    Syne_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const locale = await initI18n();
        if (!cancelled) setLocale(locale);

        await initNutritionDb();
        await loadModel();

        const info = await getLocalModelInfo();
        if (!cancelled) setModelInfo(info);

        // Fire-and-forget OTA check — never block first paint
        void checkForModelUpdates()
          .then((result) => {
            if (!cancelled) setModelInfo(result.current);
          })
          .catch(() => undefined);
      } catch (err) {
        console.warn('[calora] boot warning', err);
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setReady(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [setHydrated, setLocale, setModelInfo]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && ready) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError, ready]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return <View style={styles.boot} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="camera" />
        <Stack.Screen
          name="result"
          options={{ animation: 'fade_from_bottom', presentation: 'card' }}
        />
        <Stack.Screen name="correct" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
