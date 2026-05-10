/**
 * Wallet abstraction layer
 * Supports multiple wallet providers through a registry pattern
 */

import type { Transaction, VersionedTransaction } from '@solana/web3.js';
import { PhantomWalletAdapter as PhantomWalletAdapterProvider } from './providers/phantom';

export type WalletProviderId = 'metamask-solana-snap' | 'phantom' | 'solflare' | 'mock';

/** Streamflow SDK-compatible adapter (publicKey + signTransaction/signAllTransactions) */
export interface StreamflowAdapter {
  publicKey: { toBase58(): string };
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ) => Promise<T[]>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export interface ConnectedWallet {
  address: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signAndSendTransaction: (transaction: unknown) => Promise<string>;
  disconnect: () => Promise<void>;
  /** Optional: for Streamflow SDK in browser (Phantom provides this) */
  getStreamflowAdapter?: () => StreamflowAdapter;
}

/** EIP-1193 subset for MetaMask detection and Snap APIs */
interface MetaMaskEthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
}

export interface WalletAdapter {
  name: string;
  providerId: WalletProviderId;
  icon?: string;
  connect: () => Promise<ConnectedWallet>;
  disconnect: () => Promise<void>;
  isAvailable: () => boolean | Promise<boolean>;
  reinstallSnap?: () => Promise<void>; // Optional method for Snaps that support reinstallation
}

/**
 * Wallet registry - stores available wallet adapters
 */
class WalletRegistry {
  private adapters = new Map<WalletProviderId, WalletAdapter>();

  register(adapter: WalletAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  get(providerId: WalletProviderId): WalletAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getAll(): WalletAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAvailable(): Promise<WalletAdapter[]> {
    return Promise.all(
      this.getAll().map(async (adapter) => {
        const available = await adapter.isAvailable();
        return available ? adapter : null;
      })
    ).then((adapters) => adapters.filter((a): a is WalletAdapter => a !== null));
  }
}

// Global registry instance
export const walletRegistry = new WalletRegistry();

/**
 * Mock Wallet Adapter (Development only)
 * Returns a fixed fake address and simulates signing operations
 */
class MockWalletAdapter implements WalletAdapter {
  name = 'Mock (dev)';
  providerId = 'mock' as const;
  icon = '🔧';

  private readonly mockAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  private connectedWallet: ConnectedWallet | null = null;

  async isAvailable(): Promise<boolean> {
    // Only available if WALLET_ALLOW_MOCK=true is set
    if (typeof window === 'undefined') return false;

    // Check for WALLET_ALLOW_MOCK env var (client-side via NEXT_PUBLIC_ prefix)
    const allowMock =
      typeof process !== 'undefined'
        ? process.env?.NEXT_PUBLIC_WALLET_ALLOW_MOCK === 'true'
        : false;

    // Only allow mock if explicitly enabled via env flag
    // Do not allow in development mode by default - require explicit flag
    return allowMock;
  }

  async connect(): Promise<ConnectedWallet> {
    if (this.connectedWallet) {
      return this.connectedWallet;
    }

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.connectedWallet = {
      address: this.mockAddress,
      signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
        // Mock: return a fake signature
        console.log('[Mock] Signing message:', new TextDecoder().decode(message));
        // Return a mock signature (44 bytes, base58-like)
        return new Uint8Array(64).fill(0).map((_, i) => i % 256);
      },
      signAndSendTransaction: async (transaction: unknown): Promise<string> => {
        // Mock: return a fake transaction signature
        console.log('[Mock] Signing and sending transaction:', transaction);
        // Return a mock transaction signature (88 chars, base58-like)
        const mockSig = '5'.repeat(88);
        return mockSig;
      },
      disconnect: async (): Promise<void> => {
        this.connectedWallet = null;
      },
    };

    return this.connectedWallet;
  }

  async disconnect(): Promise<void> {
    if (this.connectedWallet) {
      await this.connectedWallet.disconnect();
      this.connectedWallet = null;
    }
  }
}

/**
 * Phantom Wallet Adapter
 * Uses the provider implementation for Streamflow SDK compatibility
 */
class PhantomWalletAdapter implements WalletAdapter {
  private provider: PhantomWalletAdapterProvider;

  constructor() {
    this.provider = new PhantomWalletAdapterProvider();
  }

  get name() {
    return this.provider.name;
  }

  get providerId() {
    return this.provider.providerId;
  }

  get icon() {
    return this.provider.icon;
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  async connect(): Promise<ConnectedWallet> {
    return this.provider.connect();
  }

  async disconnect(): Promise<void> {
    return this.provider.disconnect();
  }

  /**
   * Get Streamflow SDK-compatible adapter
   */
  getStreamflowAdapter(): StreamflowAdapter {
    return this.provider.getStreamflowAdapter();
  }
}

/**
 * Solflare Wallet Adapter (Placeholder)
 * Will be implemented when Solflare SDK is integrated
 */
class SolflareWalletAdapter implements WalletAdapter {
  name = 'Solflare';
  providerId = 'solflare' as const;
  icon = '🔥';

  async isAvailable(): Promise<boolean> {
    // Check if Solflare is installed
    if (typeof window === 'undefined') return false;
    return !!(window as unknown as { solflare?: unknown }).solflare;
  }

  async connect(): Promise<ConnectedWallet> {
    throw new Error('Solflare adapter not yet implemented');
  }

  async disconnect(): Promise<void> {
    throw new Error('Solflare adapter not yet implemented');
  }
}

/**
 * MetaMask Solana Snap Adapter
 * Integrates with MetaMask's Solana Snap for Solana wallet functionality
 */
class MetaMaskSolanaSnapAdapter implements WalletAdapter {
  name = 'MetaMask (Solana Snap)';
  providerId = 'metamask-solana-snap' as const;
  icon = '🦊';

  private readonly SNAP_ID = 'npm:@solflare-wallet/solana-snap';
  private connectedWallet: ConnectedWallet | null = null;

  async isAvailable(): Promise<boolean> {
    // Check if MetaMask is installed
    if (typeof window === 'undefined') return false;
    const ethereum = (window as unknown as { ethereum?: MetaMaskEthereumProvider }).ethereum;
    if (!ethereum?.isMetaMask) return false;

    // Check if Snaps are supported (MetaMask Flask or newer versions)
    try {
      await ethereum.request({ method: 'wallet_getSnaps' });
      return true;
    } catch {
      // Snaps not supported (likely regular MetaMask, not Flask)
      return false;
    }
  }

  async connect(): Promise<ConnectedWallet> {
    if (this.connectedWallet) {
      return this.connectedWallet;
    }

    if (typeof window === 'undefined') {
      throw new Error('MetaMask is only available in browser environment');
    }

    const ethereum = (window as unknown as { ethereum?: MetaMaskEthereumProvider }).ethereum;

    if (!ethereum?.isMetaMask) {
      throw new Error('MetaMask is not installed. Please install MetaMask extension.');
    }

    try {
      // First, check if Snaps are supported
      try {
        await ethereum.request({ method: 'wallet_getSnaps' });
      } catch {
        throw new Error(
          'MetaMask Snaps are not supported. Please install MetaMask Flask ' +
            '(https://metamask.io/flask/) or update to a version that supports Snaps. ' +
            'Regular MetaMask does not support Solana Snaps yet.'
        );
      }

      // Check if Solana Snap is installed
      let snapInstalled = false;
      let installedSnaps: Record<string, { id: string; version: string }> = {};

      try {
        installedSnaps = (await ethereum.request({
          method: 'wallet_getSnaps',
        })) as Record<string, { id: string; version: string }>;

        // Check if our specific Snap is installed
        if (installedSnaps[this.SNAP_ID]) {
          snapInstalled = true;
          console.log('[MetaMask] Solana Snap already installed');
        } else {
          // Check if any Solana snap is installed (different version/package)
          const solanaSnapIds = Object.keys(installedSnaps).filter(
            (id) => id.includes('solana') || id.includes('@solana')
          );
          if (solanaSnapIds.length > 0) {
            console.log('[MetaMask] Found Solana Snap:', solanaSnapIds[0]);
            // Use the installed one
            snapInstalled = true;
            // Update SNAP_ID to use the installed one
            (this as unknown as { SNAP_ID: string }).SNAP_ID = solanaSnapIds[0];
          }
        }
      } catch (error) {
        console.error('[MetaMask] Error checking for Snaps:', error);
        throw new Error('Failed to check for installed Snaps. Please try again.');
      }

      // Install Solana Snap if not installed
      if (!snapInstalled) {
        try {
          // Request Snap installation with permissions
          // The Snap will prompt for permissions during installation
          const snapParams: Record<string, unknown> = {};
          snapParams[this.SNAP_ID] = {};

          console.log('[MetaMask] Installing Solana Snap:', this.SNAP_ID);
          const installResult = (await ethereum.request({
            method: 'wallet_requestSnaps',
            params: snapParams,
          })) as Record<string, { enabled: boolean; id: string }>;

          // Verify the Snap was installed and enabled
          const installedSnap = installResult?.[this.SNAP_ID];
          if (!installedSnap || !installedSnap.enabled) {
            throw new Error(
              'Snap was installed but not enabled. Please check MetaMask permissions.'
            );
          }

          console.log('[MetaMask] Solana Snap installed and enabled successfully');
        } catch (error) {
          // Better error message extraction
          let errorMessage = 'Unknown error';
          let errorCode: string | undefined;
          let errorData: unknown;

          if (error instanceof Error) {
            errorMessage = error.message;
            errorData = error;
          } else if (typeof error === 'object' && error !== null) {
            // Handle MetaMask RPC errors
            const rpcError = error as {
              code?: number | string;
              message?: string;
              data?: unknown;
            };
            errorCode = String(rpcError.code || '');
            errorMessage = rpcError.message || JSON.stringify(error);
            errorData = rpcError.data || error;
          } else {
            errorMessage = String(error);
          }

          console.error('[MetaMask] Snap installation error:', {
            message: errorMessage,
            code: errorCode,
            data: errorData,
            fullError: error,
          });

          // Provide more helpful error messages based on error code/message
          const lowerMessage = errorMessage.toLowerCase();
          const codeStr = String(errorCode || '').toLowerCase();

          if (
            lowerMessage.includes('rejected') ||
            lowerMessage.includes('denied') ||
            lowerMessage.includes('user rejected') ||
            codeStr.includes('4001')
          ) {
            throw new Error(
              'Snap installation was rejected. Please approve the installation in MetaMask Flask.'
            );
          } else if (
            lowerMessage.includes('not found') ||
            lowerMessage.includes('404') ||
            codeStr.includes('404')
          ) {
            throw new Error(
              `Solana Snap "${this.SNAP_ID}" not found. ` +
                'The Snap may not be published yet or the ID may be incorrect. ' +
                'Please check the MetaMask Snap registry or try a different Snap ID.'
            );
          } else if (
            lowerMessage.includes('snap') &&
            (lowerMessage.includes('not supported') || lowerMessage.includes('unsupported'))
          ) {
            throw new Error(
              'MetaMask Snaps are not supported. Please install MetaMask Flask ' +
                '(https://metamask.io/flask/) - regular MetaMask does not support Snaps yet.'
            );
          } else if (lowerMessage.includes('flask') || lowerMessage.includes('experimental')) {
            throw new Error(
              'MetaMask Flask is required for Solana Snaps. ' +
                'Please install MetaMask Flask from https://metamask.io/flask/'
            );
          } else {
            // Show the actual error message if we can extract it
            const displayMessage =
              errorMessage !== 'Unknown error' ? errorMessage : 'An unknown error occurred';
            throw new Error(
              `Failed to install Solana Snap: ${displayMessage}. ` +
                'Please make sure you have MetaMask Flask installed and try again. ' +
                'Download Flask: https://metamask.io/flask/'
            );
          }
        }
      }

      // Verify we have permission to invoke the Snap
      // If not, request permission explicitly
      try {
        const snaps = (await ethereum.request({
          method: 'wallet_getSnaps',
        })) as Record<string, { enabled: boolean; id: string; permissionName?: string }>;

        const currentSnap = snaps[this.SNAP_ID];
        if (!currentSnap || !currentSnap.enabled) {
          throw new Error(
            'Snap is not enabled. Please enable it in MetaMask settings or reinstall it.'
          );
        }
      } catch (error) {
        console.error('[MetaMask] Error checking Snap status:', error);
        throw new Error('Failed to verify Snap installation. Please check MetaMask and try again.');
      }

      // Connect to Solana Snap and get account
      // If we get a permission error, try requesting the Snap again to trigger permission prompts
      let response: { address: string } | undefined;
      let retryWithPermissionRequest = false;

      try {
        response = (await ethereum.request({
          method: 'wallet_invokeSnap',
          params: {
            snapId: this.SNAP_ID,
            request: {
              method: 'solana_getAccount',
            },
          } as unknown,
        })) as { address: string };
      } catch (error) {
        // Better error message extraction
        let errorMessage = 'Unknown error';
        let errorCode: string | undefined;

        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          const rpcError = error as {
            code?: number | string;
            message?: string;
          };
          errorCode = String(rpcError.code || '');
          errorMessage = rpcError.message || JSON.stringify(error);
        } else {
          errorMessage = String(error);
        }

        console.error('[MetaMask] Error getting account:', {
          message: errorMessage,
          code: errorCode,
          fullError: error,
        });

        // Check if it's a permission error
        const lowerMessage = errorMessage.toLowerCase();
        if (
          lowerMessage.includes('permission') ||
          lowerMessage.includes('does not have permission') ||
          lowerMessage.includes('invalid origin')
        ) {
          // Try requesting the Snap again - this should trigger permission prompts
          console.log(
            '[MetaMask] Permission error detected, requesting Snap again to trigger permission prompts...'
          );
          retryWithPermissionRequest = true;
        } else {
          throw new Error(
            `Failed to get Solana account from MetaMask: ${errorMessage}. ` +
              'Make sure the Solana Snap is properly installed and try again.'
          );
        }
      }

      // If we got a permission error, try requesting the Snap again
      if (retryWithPermissionRequest) {
        try {
          console.log('[MetaMask] Requesting Snap installation to trigger permission prompts...');
          const snapParams: Record<string, unknown> = {};
          snapParams[this.SNAP_ID] = {};

          await ethereum.request({
            method: 'wallet_requestSnaps',
            params: snapParams,
          });

          // Wait a moment for permission to be granted
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Try again
          response = (await ethereum.request({
            method: 'wallet_invokeSnap',
            params: {
              snapId: this.SNAP_ID,
              request: {
                method: 'solana_getAccount',
              },
            } as unknown,
          })) as { address: string };
        } catch (retryError) {
          const retryErrorMessage =
            retryError instanceof Error ? retryError.message : String(retryError);
          console.error('[MetaMask] Retry after permission request failed:', retryErrorMessage);

          throw new Error(
            'This website does not have permission to use the Solana Snap. ' +
              'Please approve the permission request in MetaMask Flask, or go to ' +
              'MetaMask Flask → Settings → Snaps → "Solflare Solana Snap" → ' +
              `and grant permission to this website (${window.location.origin}).`
          );
        }
      }

      if (!response?.address) {
        throw new Error('Failed to get Solana account from MetaMask: No address returned');
      }

      const address = response.address;

      // Create connected wallet interface
      this.connectedWallet = {
        address,
        signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
          if (!ethereum) {
            throw new Error('MetaMask not available');
          }

          const response = (await ethereum.request({
            method: 'wallet_invokeSnap',
            params: {
              snapId: this.SNAP_ID,
              request: {
                method: 'solana_signMessage',
                params: {
                  message: Array.from(message),
                },
              },
            } as unknown,
          })) as { signature: number[] };

          if (!response?.signature) {
            throw new Error('Failed to sign message');
          }

          return new Uint8Array(response.signature);
        },
        signAndSendTransaction: async (transaction: unknown): Promise<string> => {
          if (!ethereum) {
            throw new Error('MetaMask not available');
          }

          // Convert transaction to format expected by Snap
          // In production, you'd serialize the Solana transaction properly
          const response = (await ethereum.request({
            method: 'wallet_invokeSnap',
            params: {
              snapId: this.SNAP_ID,
              request: {
                method: 'solana_signTransaction',
                params: {
                  transaction: transaction,
                },
              },
            } as unknown,
          })) as { signature: string };

          if (!response?.signature) {
            throw new Error('Failed to sign and send transaction');
          }

          // TODO: Send the signed transaction to the network
          // For now, return the signature
          return response.signature;
        },
        disconnect: async (): Promise<void> => {
          this.connectedWallet = null;
        },
      };

      return this.connectedWallet;
    } catch (error) {
      console.error('[MetaMask] Connection error:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to connect to MetaMask Solana Snap'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedWallet) {
      await this.connectedWallet.disconnect();
      this.connectedWallet = null;
    }
  }

  /**
   * Force reinstall the Snap - useful for fixing permission issues
   * This will trigger the installation/permission prompts again
   */
  async reinstallSnap(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('MetaMask is only available in browser environment');
    }

    const ethereum = (
      window as unknown as {
        ethereum?: {
          isMetaMask?: boolean;
          request: (args: { method: string; params?: unknown }) => Promise<unknown>;
        };
      }
    ).ethereum;

    if (!ethereum?.isMetaMask) {
      throw new Error('MetaMask is not installed. Please install MetaMask Flask extension.');
    }

    try {
      // Force reinstall by requesting the Snap again
      // This will trigger permission prompts even if already installed
      const snapParams: Record<string, unknown> = {};
      snapParams[this.SNAP_ID] = {};

      console.log('[MetaMask] Reinstalling Solana Snap:', this.SNAP_ID);
      const installResult = (await ethereum.request({
        method: 'wallet_requestSnaps',
        params: snapParams,
      })) as Record<string, { enabled: boolean; id: string }>;

      // Verify the Snap was installed and enabled
      const installedSnap = installResult?.[this.SNAP_ID];
      if (!installedSnap || !installedSnap.enabled) {
        throw new Error('Snap was installed but not enabled. Please check MetaMask permissions.');
      }

      console.log('[MetaMask] Solana Snap reinstalled successfully');

      // Clear any cached connection
      this.connectedWallet = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MetaMask] Snap reinstallation error:', errorMessage);
      throw new Error(`Failed to reinstall Solana Snap: ${errorMessage}`);
    }
  }
}

// Register all adapters
if (typeof window !== 'undefined') {
  // Register Phantom first (primary option)
  walletRegistry.register(new PhantomWalletAdapter());
  walletRegistry.register(new SolflareWalletAdapter());
  walletRegistry.register(new MetaMaskSolanaSnapAdapter());

  // Register Mock only if allowed via env flag (checked dynamically via isAvailable)
  // Even if registered, isAvailable() will filter it out when WALLET_ALLOW_MOCK=false
  const mockAdapter = new MockWalletAdapter();
  walletRegistry.register(mockAdapter);
} else {
  // In server environment, only register mock if allowed
  // Use client-side env check (NEXT_PUBLIC_ prefix) since we can't import lib/env here
  const allowMock =
    typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_WALLET_ALLOW_MOCK === 'true' ||
        process.env?.WALLET_ALLOW_MOCK === 'true'
      : false;
  if (allowMock) {
    const mockAdapter = new MockWalletAdapter();
    walletRegistry.register(mockAdapter);
  }
}
