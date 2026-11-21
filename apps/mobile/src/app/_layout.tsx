import '../global.css';

import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { colorScheme } from 'nativewind';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/stores/auth';
import { boot } from '@/lib/session';
import { useAutoLock } from '@/lib/useAutoLock';
import { OfflineScreen } from '@/components/OfflineScreen';

void SplashScreen.preventAutoHideAsync();

const brandLight = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: '#0F766E', background: '#f8fafc' } };
const brandDark = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: '#14B8A6', background: '#020617', card: '#0f172a' } };

export default function RootLayout() {
  const scheme = useColorScheme();
  const status = useAuth((s) => s.status);
  useAutoLock();

  // Web: dark mode is class-based, so mirror the OS preference onto <html class="dark">.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => colorScheme.set(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    boot().catch((e) => {
      console.error(e);
      useAuth.setState({ status: 'signedOut' });
    });
  }, []);

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={scheme === 'dark' ? brandDark : brandLight}>
        {status === 'offline' ? (
          <OfflineScreen />
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={status === 'signedIn'}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
            <Stack.Protected guard={status === 'locked'}>
              <Stack.Screen name="lock" options={{ animation: 'fade' }} />
            </Stack.Protected>
            <Stack.Protected guard={status === 'signedOut'}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
