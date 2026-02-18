/**
 * Zustand store for wallet state management
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WalletProviderId, ConnectedWallet } from './client';

interface WalletState {
  // Current wallet state
  providerId: WalletProviderId | null;
  connectedWallet: ConnectedWallet | null;
  isConnecting: boolean;
  error: string | null;

  // Actions
  setProvider: (providerId: WalletProviderId | null) => void;
  setConnectedWallet: (wallet: ConnectedWallet | null) => void;
  setConnecting: (isConnecting: boolean) => void;
  setError: (error: string | null) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      providerId: null,
      connectedWallet: null,
      isConnecting: false,
      error: null,

      setProvider: (providerId) => set({ providerId }),
      setConnectedWallet: (wallet) => set({ connectedWallet: wallet }),
      setConnecting: (isConnecting) => set({ isConnecting }),
      setError: (error) => set({ error }),
      disconnect: () =>
        set({
          providerId: null,
          connectedWallet: null,
          isConnecting: false,
          error: null,
        }),
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          // Return a no-op storage for server-side
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        // Only persist provider ID, not the wallet instance
        providerId: state.providerId,
      }),
    }
  )
);

