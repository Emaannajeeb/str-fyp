/**
 * Create on-chain contract transaction
 * Uses Solana Memo program to store contract metadata on-chain
 */

import { Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import { SOLANA_CLUSTER_URL } from '@/lib/env';

// Memo program ID on Solana
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface ContractMetadata {
  contractId: string;
  employeeId: string;
  employeeWallet?: string;
  tokenMint: string;
  tokenSymbol: string;
  rateType: string;
  amountPerPeriod: string;
  period: string;
  startDate: string;
  endDate?: string;
  organizationId: string;
}

/**
 * Create a Solana transaction with contract metadata in memo
 * This makes the contract visible on Solana explorer
 */
export async function createContractTransaction(
  metadata: ContractMetadata,
  senderAddress: string
): Promise<Transaction> {
  const connection = new Connection(SOLANA_CLUSTER_URL, 'confirmed');
  const sender = new PublicKey(senderAddress);

  // Create transaction
  const transaction = new Transaction();

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sender;

  // Create memo instruction with contract metadata
  // Format: JSON string with contract data
  const memoData = JSON.stringify({
    type: 'CONTRACT_CREATED',
    contractId: metadata.contractId,
    employeeId: metadata.employeeId,
    employeeWallet: metadata.employeeWallet,
    tokenMint: metadata.tokenMint,
    tokenSymbol: metadata.tokenSymbol,
    rateType: metadata.rateType,
    amountPerPeriod: metadata.amountPerPeriod,
    period: metadata.period,
    startDate: metadata.startDate,
    endDate: metadata.endDate,
    organizationId: metadata.organizationId,
    timestamp: new Date().toISOString(),
  });

  // Add memo instruction
  // Memo program instruction format: [instruction discriminator (0), memo data]
  const memoInstruction = {
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memoData, 'utf8'),
  };

  transaction.add(memoInstruction);

  return transaction;
}

/**
 * Get Solana explorer URL for a transaction
 */
export function getExplorerUrl(txSignature: string, cluster: string = 'devnet'): string {
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${txSignature}${clusterParam}`;
}

