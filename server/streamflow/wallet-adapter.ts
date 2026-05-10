/**
 * Wallet adapter bridge for Streamflow SDK
 * Converts wallet addresses to SDK-compatible format
 *
 * Note: For server-side operations, this creates a minimal adapter.
 * In production, you would use a server-side keypair or require
 * client-side transaction signing.
 */

import type { ConnectedWallet } from '@/lib/wallet/client';
import { PublicKey, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
/**
 * Create a server-side wallet adapter from a keypair
 * Used for server-side operations when you have a private key
 * Returns a Keypair directly which the SDK accepts
 */
/** Ed25519 detached signature for arbitrary bytes (Streamflow server wallet). */
export function signDetachedWithKeypair(keypair: Keypair, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, keypair.secretKey);
}

export function createServerWalletAdapter(privateKey?: string): Keypair {
  let keypair: Keypair;

  if (privateKey) {
    // Use provided private key (base58 or array format)
    try {
      const keyBytes =
        typeof privateKey === 'string'
          ? Uint8Array.from(JSON.parse(privateKey))
          : new Uint8Array(privateKey);
      keypair = Keypair.fromSecretKey(keyBytes);
    } catch {
      keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    }
  } else {
    // Generate a new keypair (for development/testing only)
    // In production, you should always provide a private key
    console.warn('[Streamflow] No private key provided, generating new keypair (development only)');
    keypair = Keypair.generate();
  }

  return keypair;
}

/**
 * Create a wallet adapter from a ConnectedWallet (client-side)
 * Note: This requires the wallet to be connected and available
 * For Phantom wallets, this will use the wallet's signTransaction method
 */
export function createStreamflowWalletAdapter(wallet: ConnectedWallet) {
  return {
    publicKey: new PublicKey(wallet.address),

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      // For Phantom and other client-side wallets, we need to sign the transaction
      // The Streamflow SDK builds the transaction and expects us to sign it
      // Then the SDK will send it

      // Check if we're in a browser environment and have access to Phantom
      if (typeof window !== 'undefined' && window.solana?.isPhantom) {
        try {
          // Use Phantom's signTransaction (which only signs, doesn't send)
          const signed = await window.solana.signTransaction(tx);
          return signed as T;
        } catch (error) {
          // Fallback: if signTransaction fails, try signAndSendTransaction
          // but extract just the signature (this is not ideal but works as fallback)
          console.warn('[Streamflow] Phantom signTransaction failed, using fallback:', error);
          // For fallback, we'll need to sign and send, then return the original tx
          // This is not ideal but necessary if Phantom doesn't support signTransaction
          await wallet.signAndSendTransaction(tx);
          return tx;
        }
      }

      // For other wallet types or server-side, we need to handle differently
      // If the wallet has a way to just sign (not send), use that
      // Otherwise, we'll need to work with what we have

      // Try to sign via the wallet's interface
      // Note: This might send the transaction, which is not ideal
      // But for now, this is the best we can do without wallet-specific logic
      try {
        // For wallets that support it, we can try to just sign
        // But most ConnectedWallet implementations sign and send together
        // So we'll sign and send, and the SDK will handle the result
        await wallet.signAndSendTransaction(tx);
        return tx;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to sign transaction: ${errorMessage}`);
      }
    },

    async signAllTransactions<T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> {
      // For Phantom, use signAllTransactions if available
      if (
        typeof window !== 'undefined' &&
        window.solana?.isPhantom &&
        window.solana.signAllTransactions
      ) {
        try {
          const signed = await window.solana.signAllTransactions(txs);
          return signed as T[];
        } catch (error) {
          console.warn(
            '[Streamflow] Phantom signAllTransactions failed, signing individually:',
            error
          );
          // Fallback to individual signing
          return Promise.all(txs.map((tx) => this.signTransaction(tx)));
        }
      }

      // For other wallets, sign individually
      return Promise.all(txs.map((tx) => this.signTransaction(tx)));
    },

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      return wallet.signMessage(message);
    },
  };
}

/**
 * Get server-side wallet adapter from environment or wallet address
 * For server-side operations, we use a keypair from env or generate one
 */
export function getServerWalletAdapter() {
  // Try to get private key from environment
  const privateKey = process.env.STREAMFLOW_SENDER_PRIVATE_KEY;

  if (privateKey) {
    return createServerWalletAdapter(privateKey);
  }

  // If no private key, try to use address (will need keypair lookup)
  // For now, generate a new one (development only)
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'STREAMFLOW_SENDER_PRIVATE_KEY must be set in production for server-side operations'
    );
  }

  console.warn(
    '[Streamflow] No STREAMFLOW_SENDER_PRIVATE_KEY found, using generated keypair (development only)'
  );
  return createServerWalletAdapter();
}
