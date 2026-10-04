import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Intention, Locale } from './i18n';

export type Phase = 'idle' | 'holding' | 'releasing' | 'done';
export type Wallet = 'apple' | 'google' | 'card';
export type ThemePreference = 'system' | 'light' | 'dark';
interface RitualState {
  locale: Locale; intention: Intention; amount: string; wallet: Wallet; musicOn: boolean; phase: Phase; theme: ThemePreference;
  setLocale: (value: Locale) => void;
  setIntention: (value: Intention) => void;
  setAmount: (value: string) => void;
  setWallet: (value: Wallet) => void;
  setMusic: (value: boolean) => void;
  setPhase: (value: Phase) => void;
  setTheme: (value: ThemePreference) => void;
}

export const useRitualStore = create<RitualState>()(persist((set) => ({
  locale: 'en', intention: 'wealth', amount: '1', wallet: 'apple', musicOn: true, phase: 'idle', theme: 'system',
  setLocale: (locale) => set({ locale }),
  setIntention: (intention) => set({ intention, phase: 'idle' }),
  setAmount: (amount) => set({ amount }),
  setWallet: (wallet) => set({ wallet }),
  setMusic: (musicOn) => set({ musicOn }),
  setPhase: (phase) => set({ phase }),
  setTheme: (theme) => set({ theme }),
}), {
  name: 'into-nowhere-preferences',
  partialize: ({ locale, intention, theme }) => ({ locale, intention, theme }),
  merge: (saved, current) => {
    const value = saved as Partial<RitualState> | undefined;
    return { ...current,
      locale: ['ru', 'en', 'az'].includes(value?.locale ?? '') ? value!.locale! : current.locale,
      intention: ['wealth','health','success','love','gratitude'].includes(value?.intention ?? '') ? value!.intention! : current.intention,
      theme: ['system', 'light', 'dark'].includes(value?.theme ?? '') ? value!.theme! : current.theme,
    };
  },
}));
