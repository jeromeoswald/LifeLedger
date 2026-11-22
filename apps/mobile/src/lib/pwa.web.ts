import { create } from 'zustand';
import { api } from './api';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const usePwa = create<{ installEvent: InstallEvent | null; installed: boolean }>(() => ({
  installEvent: null,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
}));

function addHead(tag: string, attrs: Record<string, string>) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
}

/** Web only: manifest + icons in <head>, the service worker (production builds), and the install prompt. */
export function setupPwa() {
  if (typeof document === 'undefined') return;
  addHead('link', { rel: 'manifest', href: '/manifest.json' });
  addHead('meta', { name: 'theme-color', content: '#0F766E' });
  addHead('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' });
  addHead('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  addHead('meta', { name: 'apple-mobile-web-app-title', content: 'LifeLedger' });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own "Install app" button
    usePwa.setState({ installEvent: e as InstallEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installEvent: null, installed: true }));
  // Not in development: a caching worker would serve stale dev bundles.
  if (!__DEV__ && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
}

export async function promptInstall() {
  const e = usePwa.getState().installEvent;
  if (!e) return;
  await e.prompt();
  await e.userChoice;
  usePwa.setState({ installEvent: null });
}

export type PushState = 'enabled' | 'denied' | 'unsupported' | 'off';

export async function webPushState(): Promise<PushState> {
  if (__DEV__ || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'enabled' : 'off';
}

const toKey = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Asks permission, subscribes this browser, and registers it with the API (alarms + habit reminders). */
export async function enableWebPush(): Promise<PushState> {
  if ((await webPushState()) === 'unsupported') return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/push/public-key');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return 'enabled';
}

export async function disableWebPush(): Promise<PushState> {
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}
