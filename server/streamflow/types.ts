/**
 * Streamflow service types
 * Type definitions for Streamflow SDK interactions
 */

import type { ConnectedWallet } from '@/lib/wallet/client';

export type StreamStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';

/**
 * Input for creating a new stream
 * Matches SDK ICreateStreamData structure
 */
export interface CreateStreamInput {
  /** Recipient wallet address */
  recipient: string;
  /** Token mint address (e.g., SOL mint) */
  tokenMint: string;
  /** Total amount to stream (as string to avoid precision loss) */
  totalAmount: string;
  /** Amount per period (as string) */
  amountPerPeriod?: string;
  /** Stream start time (Unix timestamp in seconds) */
  startTime: number;
  /** Stream end time (Unix timestamp in seconds) */
  endTime: number;
  /** Period in seconds (for periodic streams) */
  period?: number;
  /** Optional cliff time (Unix timestamp in seconds) */
  cliffTime?: number;
  /** Optional cliff amount (as string) */
  cliffAmount?: string;
  /** Token decimals (default: 9 for SOL) */
  decimals?: number;
  /** Stream name */
  name?: string;
  /** Can topup stream */
  canTopup?: boolean;
  /** Cancelable by sender */
  cancelableBySender?: boolean;
  /** Cancelable by recipient */
  cancelableByRecipient?: boolean;
  /** Transferable by sender */
  transferableBySender?: boolean;
  /** Transferable by recipient */
  transferableByRecipient?: boolean;
  /** Automatic withdrawal enabled */
  automaticWithdrawal?: boolean;
  /** Withdrawal frequency in seconds */
  withdrawalFrequency?: number;
  /** Partner address (optional) */
  partner?: string | null;
  /** Is native SOL (default: false) */
  isNative?: boolean;
}

/**
 * Stream creation response
 */
export interface CreateStreamResponse {
  /** Streamflow stream ID */
  streamId: string;
  /** On-chain transaction signature */
  onchainTx: string;
  /** Stream status */
  status: StreamStatus;
}

/**
 * Stream details response
 */
export interface StreamDetails {
  /** Streamflow stream ID */
  streamId: string;
  /** On-chain transaction signature */
  onchainTx: string | null;
  /** Current stream status */
  status: StreamStatus;
  /** Recipient wallet address */
  recipient: string;
  /** Token mint address */
  tokenMint: string;
  /** Total amount to stream */
  totalAmount: string;
  /** Amount already withdrawn */
  withdrawnAmount: string;
  /** Amount available to withdraw */
  availableAmount: string;
  /** Stream start time (Unix timestamp in seconds) */
  startTime: number;
  /** Stream end time (Unix timestamp in seconds) */
  endTime: number;
  /** Cliff time if set (Unix timestamp in seconds) */
  cliffTime: number | null;
  /** Last sync timestamp */
  lastSyncedAt: number | null;
}

/**
 * Streamflow client configuration
 */
export interface StreamflowClientConfig {
  /** Solana cluster URL (RPC endpoint) */
  clusterUrl: string;
  /** Solana cluster name */
  cluster: SolanaCluster;
}

/**
 * Streamflow client interface
 * Allows for dependency inversion - can swap implementations for testing
 */
export interface IStreamflowClient {
  /**
   * Create a new payment stream
   * @param input Stream creation parameters
   * @param senderWallet Wallet adapter for signing transactions
   */
  createStream(input: CreateStreamInput, senderWallet: ConnectedWallet): Promise<CreateStreamResponse>;

  /**
   * Create multiple streams in a batch
   * @param inputs Array of stream creation parameters
   * @param senderWallet Wallet adapter for signing transactions
   */
  createMultiple(inputs: CreateStreamInput[], senderWallet: ConnectedWallet): Promise<CreateStreamResponse[]>;

  /**
   * Withdraw from a stream
   * @param streamId Stream ID
   * @param amount Amount to withdraw (as string)
   * @param recipientWallet Wallet adapter for signing transactions
   */
  withdraw(streamId: string, amount: string, recipientWallet: ConnectedWallet): Promise<string>;

  /**
   * Top up a stream with additional funds
   * @param streamId Stream ID
   * @param amount Amount to top up (as string)
   * @param senderWallet Wallet adapter for signing transactions
   */
  topup(streamId: string, amount: string, senderWallet: ConnectedWallet): Promise<string>;

  /**
   * Transfer stream to a new recipient
   * @param streamId Stream ID
   * @param newRecipient New recipient address
   * @param wallet Wallet adapter for signing transactions
   */
  transfer(streamId: string, newRecipient: string, wallet: ConnectedWallet): Promise<string>;

  /**
   * Cancel a stream (active or paused)
   * @param streamId Stream ID
   * @param wallet Wallet adapter for signing transactions
   */
  cancelStream(streamId: string, wallet: ConnectedWallet): Promise<string>;

  /**
   * Get stream details and current status
   * @param streamId Stream ID
   */
  getOne(streamId: string): Promise<StreamDetails>;

  /**
   * Get multiple streams
   * @param streamIds Array of stream IDs
   */
  get(streamIds: string[]): Promise<StreamDetails[]>;

  /**
   * Pause an active stream (deprecated - use cancel instead)
   * @deprecated Streamflow SDK doesn't support pause, use cancel
   */
  pauseStream(streamId: string): Promise<void>;

  /**
   * Resume a paused stream (deprecated - not supported by SDK)
   * @deprecated Streamflow SDK doesn't support resume
   */
  resumeStream(streamId: string): Promise<void>;
}

