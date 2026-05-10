'use client';

import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { StreamflowAdapter, WalletAdapter } from '../client';

// Get cluster URL from client-side env (must be prefixed with NEXT_PUBLIC_)
const getClusterUrl = () => {
  if (typeof window === 'undefined') {
    return 'https://api.devnet.solana.com'; // Default for SSR
  }
  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER_URL || 'https://api.devnet.solana.com';
};

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
      disconnect: () => Promise<void>;
      signTransaction: (
        transaction: Transaction | VersionedTransaction
      ) => Promise<Transaction | VersionedTransaction>;
      signAllTransactions: (
        transactions: (Transaction | VersionedTransaction)[]
      ) => Promise<(Transaction | VersionedTransaction)[]>;
      signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
      publicKey?: PublicKey | null;
      isConnected: boolean;
      on: (event: string, callback: () => void) => void;
      off: (event: string, callback: () => void) => void;
    };
  }
}

/**
 * Phantom Wallet Adapter
 * Implements WalletAdapter interface and provides Streamflow SDK compatibility
 */
export class PhantomWalletAdapter implements WalletAdapter {
  name = 'Phantom';
  providerId = 'phantom' as const;
  icon = '👻';

  private _publicKey: PublicKey | null = null;
  private _connection: Connection;
  private _connectedWallet: import('../client').ConnectedWallet | null = null;

  constructor() {
    this._connection = new Connection(getClusterUrl(), 'confirmed');
  }

  get connected(): boolean {
    return !!this._publicKey;
  }

  get address(): string | null {
    return this._publicKey?.toBase58() ?? null;
  }

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check for Phantom extension
    const solana = window.solana;
    const isPhantomInstalled = !!solana?.isPhantom;

    // Also check if Phantom is being injected (sometimes takes a moment)
    if (!isPhantomInstalled) {
      // Wait a bit for Phantom to inject if it's still loading
      await new Promise((resolve) => setTimeout(resolve, 100));
      const solanaAfterWait = window.solana;
      return !!solanaAfterWait?.isPhantom;
    }

    return isPhantomInstalled;
  }

  async connect(): Promise<import('../client').ConnectedWallet> {
    if (this._connectedWallet) {
      return this._connectedWallet;
    }

    if (typeof window === 'undefined') {
      throw new Error('Phantom is only available in browser environment');
    }

    const solana = window.solana;

    if (!solana?.isPhantom) {
      throw new Error(
        'Phantom wallet is not installed. Please install the Phantom extension from ' +
          'https://phantom.app/'
      );
    }

    try {
      // Connect to Phantom
      const response = await solana.connect();
      this._publicKey = response.publicKey;

      // Create connected wallet interface
      this._connectedWallet = {
        address: this._publicKey.toBase58(),
        getStreamflowAdapter: () => this.getStreamflowAdapter(),
        signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
          if (!solana) {
            throw new Error('Phantom not available');
          }

          try {
            // Phantom's signMessage API expects an object with message and optional display
            const result = await solana.signMessage(message, 'utf8');
            return result.signature;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to sign message: ${errorMessage}`);
          }
        },
        signAndSendTransaction: async (transaction: unknown): Promise<string> => {
          if (!this._publicKey || !solana) {
            throw new Error('Wallet not connected');
          }

          try {
            // Ensure transaction is properly formatted
            let tx: Transaction | VersionedTransaction;
            if (transaction instanceof Transaction || transaction instanceof VersionedTransaction) {
              tx = transaction;
            } else {
              // Try to deserialize if it's a buffer/array
              tx = Transaction.from(transaction as Uint8Array);
            }

            // Set fee payer if not set
            if (tx instanceof Transaction && !tx.feePayer) {
              tx.feePayer = this._publicKey;
            }

            // Get recent blockhash if not set
            if (tx instanceof Transaction && !tx.recentBlockhash) {
              const blockhash = await this._connection.getLatestBlockhash('confirmed');
              tx.recentBlockhash = blockhash.blockhash;
            }

            // Sign transaction via Phantom
            const signed = await solana.signTransaction(tx);

            // Send transaction
            const txId = await this._connection.sendRawTransaction(signed.serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            });

            // Confirm transaction
            await this._connection.confirmTransaction(txId, 'confirmed');

            return txId;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to sign and send transaction: ${errorMessage}`);
          }
        },
        disconnect: async (): Promise<void> => {
          if (solana && solana.isConnected) {
            try {
              await solana.disconnect();
            } catch (error) {
              console.error('[Phantom] Error disconnecting:', error);
            }
          }
          this._publicKey = null;
          this._connectedWallet = null;
        },
      };

      return this._connectedWallet;
    } catch (error) {
      console.error('[Phantom] Connection error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: number })?.code;

      // Handle specific error cases
      if (
        errorCode === 4001 ||
        errorMessage.includes('rejected') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('User rejected')
      ) {
        throw new Error(
          'Connection was rejected. Please approve the connection request in Phantom.'
        );
      }

      if (errorMessage.includes('not installed') || errorMessage.includes('not found')) {
        throw new Error(
          'Phantom wallet is not installed. Please install the Phantom extension from ' +
            'https://phantom.app/ and refresh this page.'
        );
      }

      if (errorMessage.includes('network') || errorMessage.includes('cluster')) {
        throw new Error(
          'Network mismatch. Please switch to the correct network in Phantom wallet settings.'
        );
      }

      throw new Error(
        `Failed to connect to Phantom: ${errorMessage}. ` +
          'Make sure Phantom is installed and unlocked.'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this._connectedWallet) {
      await this._connectedWallet.disconnect();
      this._connectedWallet = null;
    }
    this._publicKey = null;
  }

  /**
   * Get a Streamflow SDK-compatible adapter
   * This returns an object that implements SignerWalletAdapter interface
   */
  getStreamflowAdapter(): StreamflowAdapter {
    if (!this._publicKey) {
      throw new Error('Wallet not connected');
    }

    return {
      publicKey: this._publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        if (!window.solana) {
          throw new Error('Phantom not available');
        }

        // Ensure transaction is properly formatted
        const transaction: Transaction | VersionedTransaction = tx;

        // Set fee payer if not set
        if (transaction instanceof Transaction && !transaction.feePayer) {
          transaction.feePayer = this._publicKey!;
        }

        // Get recent blockhash if not set
        if (transaction instanceof Transaction && !transaction.recentBlockhash) {
          const blockhash = await this._connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash.blockhash;
        }

        // Sign via Phantom
        const signed = await window.solana!.signTransaction(transaction);
        return signed as T;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(
        txs: T[]
      ): Promise<T[]> => {
        if (!window.solana) {
          throw new Error('Phantom not available');
        }

        const signed = await window.solana.signAllTransactions(txs);
        return signed as T[];
      },
      signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
        if (!window.solana) {
          throw new Error('Phantom not available');
        }

        const result = await window.solana.signMessage(message, 'utf8');
        return result.signature;
      },
    };
  }
}
