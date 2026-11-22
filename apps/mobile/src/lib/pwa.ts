import { create } from 'zustand';

// Phones: the native app is installed already, and alarms use local notifications (lib/alarms.ts).
export const usePwa = create<{ installEvent: null; installed: boolean }>(() => ({ installEvent: null, installed: true }));
export const setupPwa = () => {};
export const promptInstall = async () => {};
export type PushState = 'enabled' | 'denied' | 'unsupported' | 'off';
export const webPushState = async (): Promise<PushState> => 'unsupported';
export const enableWebPush = async (): Promise<PushState> => 'unsupported';
export const disableWebPush = async (): Promise<PushState> => 'unsupported';
