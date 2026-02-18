/**
 * Get SOL balance for a wallet address
 * Fetches real balance from Solana RPC
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_CLUSTER_URL } from "@/lib/env";

/**
 * Get SOL balance for a given address
 * @param address Solana wallet address (base58 string)
 * @returns Balance in SOL (not lamports)
 */
export async function getSolBalance(address: string): Promise<number> {
  try {
    const connection = new Connection(SOLANA_CLUSTER_URL, "confirmed");
    const publicKey = new PublicKey(address);
    const lamports = await connection.getBalance(publicKey);
    
    // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
    return lamports / 1_000_000_000;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch SOL balance for ${address}: ${errorMessage}`);
  }
}

/**
 * Get SOL balance for multiple addresses
 * @param addresses Array of Solana wallet addresses
 * @returns Map of address to balance in SOL
 */
export async function getSolBalances(addresses: string[]): Promise<Map<string, number>> {
  try {
    const connection = new Connection(SOLANA_CLUSTER_URL, "confirmed");
    const publicKeys = addresses.map(addr => new PublicKey(addr));
    
    // Fetch all balances in parallel
    const balances = await connection.getMultipleAccountsBalances(publicKeys);
    
    const result = new Map<string, number>();
    addresses.forEach((address, index) => {
      const lamports = balances[index] || 0;
      result.set(address, lamports / 1_000_000_000);
    });
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch SOL balances: ${errorMessage}`);
  }
}

