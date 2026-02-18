/**
 * Streamflow service client
 * Real implementation using @streamflow/stream SDK
 */

import {
  GenericStreamClient,
  getBN,
  getNumberFromBN,
  IChain,
  type Stream,
  type ICreateStreamData,
  type ICreateResult,
  type IWithdrawData,
  type ITopUpData,
  type ITransferData,
  type ICancelData,
  type IGetOneData,
  type IGetAllData,
  type ITransactionResult,
  type SolanaStreamClientOptions,
  ICluster,
} from '@streamflow/stream';
import type {
  ICreateStreamSolanaExt,
  IInteractStreamSolanaExt,
  ITopUpStreamSolanaExt,
} from '@streamflow/stream/solana';
import type {
  IStreamflowClient,
  StreamflowClientConfig,
  CreateStreamInput,
  CreateStreamResponse,
  StreamDetails,
  StreamStatus,
} from './types';
import type { ConnectedWallet } from '@/lib/wallet/client';
import { createStreamflowWalletAdapter, getServerWalletAdapter } from './wallet-adapter';
import { env, IS_DEVNET, SOLANA_EXPLORER_BASE } from '@/lib/env';

/**
 * Normalize SDK stream status to our StreamStatus type
 * Stream status is determined by checking if the stream is closed/cancelled/completed
 */
function normalizeStatus(stream: Stream): StreamStatus {
  // Check if stream is closed (cancelled or completed)
  if (stream.closed) {
    // Check if all funds are withdrawn (completed) or cancelled
    const totalAmount = stream.depositedAmount;
    const withdrawnAmount = stream.withdrawnAmount;
    
    if (totalAmount.eq(withdrawnAmount)) {
      return 'COMPLETED';
    } else {
      return 'CANCELLED';
    }
  }
  
  // Stream is active if not closed
  return 'ACTIVE';
}

/**
 * Get Solana cluster type from string
 */
function getClusterType(cluster: string): ICluster {
  switch (cluster) {
    case 'mainnet-beta':
      return ICluster.Mainnet;
    case 'testnet':
      return ICluster.Testnet;
    case 'devnet':
    default:
      return ICluster.Devnet;
  }
}

/**
 * StreamflowClient - Real SDK implementation
 */
export class StreamflowClient implements IStreamflowClient {
  private client: GenericStreamClient<IChain.Solana>;
  private config: StreamflowClientConfig;

  constructor(config: StreamflowClientConfig) {
    this.config = config;
    
    // Initialize the SDK client
    const clientOptions: SolanaStreamClientOptions = {
      clusterUrl: config.clusterUrl,
      cluster: getClusterType(config.cluster),
      chain: IChain.Solana,
    };
    
    this.client = new GenericStreamClient<IChain.Solana>(clientOptions);
  }

  /**
   * Create a new payment stream
   */
  async createStream(
    input: CreateStreamInput,
    senderWallet: ConnectedWallet
  ): Promise<CreateStreamResponse> {
    const decimals = input.decimals ?? 9;
    
    // Use the provided senderWallet (Phantom adapter) instead of server-side keypair
    // This ensures transactions are signed by the actual connected wallet
    const walletAdapter = createStreamflowWalletAdapter(senderWallet);

    // Prepare stream parameters
    const streamParams: ICreateStreamData = {
      recipient: input.recipient,
      tokenId: input.tokenMint,
      start: input.startTime,
      amount: getBN(Number(input.totalAmount), decimals),
      period: input.period ?? input.endTime - input.startTime,
      cliff: input.cliffTime ?? input.startTime,
      cliffAmount: input.cliffAmount ? getBN(Number(input.cliffAmount), decimals) : getBN(0, decimals),
      amountPerPeriod: input.amountPerPeriod
        ? getBN(Number(input.amountPerPeriod), decimals)
        : getBN(Number(input.totalAmount), decimals),
      name: input.name ?? `Stream ${input.recipient.slice(0, 8)}`,
      canTopup: input.canTopup ?? false,
      cancelableBySender: input.cancelableBySender ?? true,
      cancelableByRecipient: input.cancelableByRecipient ?? false,
      transferableBySender: input.transferableBySender ?? false,
      transferableByRecipient: input.transferableByRecipient ?? false,
      automaticWithdrawal: input.automaticWithdrawal ?? false,
      withdrawalFrequency: input.withdrawalFrequency ?? 0,
      partner: input.partner ?? undefined,
    };

      const solanaParams: ICreateStreamSolanaExt = {
        sender: walletAdapter as any, // Type assertion to handle version mismatch
        isNative: input.isNative ?? false,
      };

    try {
      const result: ICreateResult = await this.client.create(streamParams, solanaParams);
      
      return {
        streamId: result.metadataId,
        onchainTx: result.txId,
        status: 'ACTIVE', // Newly created streams are always active
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create stream: ${errorMessage}`);
    }
  }

  /**
   * Create multiple streams in a batch
   */
  async createMultiple(
    inputs: CreateStreamInput[],
    senderWallet: ConnectedWallet
  ): Promise<CreateStreamResponse[]> {
    const walletAdapter = createStreamflowWalletAdapter(senderWallet);
    const results: CreateStreamResponse[] = [];

    // Create streams sequentially to avoid rate limiting
    for (const input of inputs) {
      const result = await this.createStream(input, senderWallet);
      results.push(result);
    }

    return results;
  }

  /**
   * Withdraw from a stream
   */
  async withdraw(
    streamId: string,
    amount: string,
    recipientWallet: ConnectedWallet
  ): Promise<string> {
    // For client-side wallets, use the wallet adapter bridge
    const walletAdapter = createStreamflowWalletAdapter(recipientWallet);
    const decimals = 9; // Default to SOL decimals, should be determined from stream

    try {
      const withdrawData: IWithdrawData = {
        id: streamId,
        amount: getBN(Number(amount), decimals),
      };
      
      const solanaParams: IInteractStreamSolanaExt = {
        invoker: walletAdapter as any, // Type assertion to handle version mismatch
      };
      
      const result: ITransactionResult = await this.client.withdraw(withdrawData, solanaParams);

      return result.txId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to withdraw from stream: ${errorMessage}`);
    }
  }

  /**
   * Top up a stream with additional funds
   */
  async topup(
    streamId: string,
    amount: string,
    senderWallet: ConnectedWallet
  ): Promise<string> {
    // Use the provided senderWallet (Phantom adapter)
    const walletAdapter = createStreamflowWalletAdapter(senderWallet);
    const decimals = 9; // Default to SOL decimals

    try {
      const topupData: ITopUpData = {
        id: streamId,
        amount: getBN(Number(amount), decimals),
      };
      
      const solanaParams: ITopUpStreamSolanaExt = {
        invoker: walletAdapter as any, // Type assertion to handle version mismatch
      };
      
      const result: ITransactionResult = await this.client.topup(topupData, solanaParams);

      return result.txId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to top up stream: ${errorMessage}`);
    }
  }

  /**
   * Transfer stream to a new recipient
   */
  async transfer(
    streamId: string,
    newRecipient: string,
    wallet: ConnectedWallet
  ): Promise<string> {
    // Use the provided wallet (Phantom adapter)
    const walletAdapter = createStreamflowWalletAdapter(wallet);

    try {
      const transferData: ITransferData = {
        id: streamId,
        newRecipient,
      };
      
      const solanaParams: IInteractStreamSolanaExt = {
        invoker: walletAdapter as any, // Type assertion to handle version mismatch
      };
      
      const result: ITransactionResult = await this.client.transfer(transferData, solanaParams);

      return result.txId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to transfer stream: ${errorMessage}`);
    }
  }

  /**
   * Cancel a stream
   */
  async cancelStream(streamId: string, wallet: ConnectedWallet): Promise<string> {
    // Use the provided wallet (Phantom adapter)
    const walletAdapter = createStreamflowWalletAdapter(wallet);

    try {
      const cancelData: ICancelData = {
        id: streamId,
      };
      
      const solanaParams: IInteractStreamSolanaExt = {
        invoker: walletAdapter as any, // Type assertion to handle version mismatch
      };
      
      const result: ITransactionResult = await this.client.cancel(cancelData, solanaParams);

      return result.txId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to cancel stream: ${errorMessage}`);
    }
  }

  /**
   * Get stream details by ID
   */
  async getOne(streamId: string): Promise<StreamDetails> {
    try {
      const getOneData: IGetOneData = {
        id: streamId,
      };
      
      const stream: Stream = await this.client.getOne(getOneData);

      return this.normalizeStreamDetails(stream, streamId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get stream: ${errorMessage}`);
    }
  }

  /**
   * Get multiple streams
   */
  async get(streamIds: string[]): Promise<StreamDetails[]> {
    try {
      // SDK get method fetches by sender or recipient, not by IDs
      // For multiple IDs, we need to call getOne for each
      const streams = await Promise.all(
        streamIds.map((id) => this.getOne(id).catch(() => null))
      );

      return streams.filter((s): s is StreamDetails => s !== null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get streams: ${errorMessage}`);
    }
  }

  /**
   * Normalize SDK stream object to our StreamDetails format
   */
  private normalizeStreamDetails(stream: Stream, streamId: string): StreamDetails {
    // Stream can be LinearStream or AlignedStream
    // Both have the same base properties
    const decimals = 9; // Default to SOL decimals, should be determined from token
    const status = normalizeStatus(stream);
    
    // Calculate available amount (unlocked - withdrawn)
    const unlocked = stream.unlocked(Math.floor(Date.now() / 1000));
    const availableAmount = unlocked.sub(stream.withdrawnAmount);

    return {
      streamId, // Use the passed streamId (contract address)
      onchainTx: null, // SDK doesn't provide txHash directly, would need to fetch separately
      status,
      recipient: stream.recipient,
      tokenMint: stream.mint,
      totalAmount: getNumberFromBN(stream.depositedAmount, decimals).toString(),
      withdrawnAmount: getNumberFromBN(stream.withdrawnAmount, decimals).toString(),
      availableAmount: getNumberFromBN(availableAmount, decimals).toString(),
      startTime: stream.start,
      endTime: stream.end,
      cliffTime: stream.cliff ?? null,
      lastSyncedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Pause stream (deprecated - not supported by SDK)
   */
  async pauseStream(streamId: string): Promise<void> {
    throw new Error('Pause is not supported by Streamflow SDK. Use cancel instead.');
  }

  /**
   * Resume stream (deprecated - not supported by SDK)
   */
  async resumeStream(streamId: string): Promise<void> {
    throw new Error('Resume is not supported by Streamflow SDK.');
  }
}

/**
 * Mock Streamflow Client - For development and testing
 * Returns deterministic mock data without making actual SDK calls
 */
export class MockStreamflowClient implements IStreamflowClient {
  private config: StreamflowClientConfig;
  private streams: Map<string, StreamDetails> = new Map();
  private streamCounter = 0;

  constructor(config: StreamflowClientConfig) {
    this.config = config;
  }

  async createStream(
    input: CreateStreamInput,
    senderWallet: ConnectedWallet
  ): Promise<CreateStreamResponse> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.streamCounter++;
    const streamId = `mock_stream_${this.streamCounter}_${Date.now()}`;
    const onchainTx = `mock_tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const streamDetails: StreamDetails = {
      streamId,
      onchainTx,
      status: 'ACTIVE',
      recipient: input.recipient,
      tokenMint: input.tokenMint,
      totalAmount: input.totalAmount,
      withdrawnAmount: '0',
      availableAmount: '0',
      startTime: input.startTime,
      endTime: input.endTime,
      cliffTime: input.cliffTime || null,
      lastSyncedAt: Math.floor(Date.now() / 1000),
    };

    this.streams.set(streamId, streamDetails);

    return {
      streamId,
      onchainTx,
      status: 'ACTIVE',
    };
  }

  async createMultiple(
    inputs: CreateStreamInput[],
    senderWallet: ConnectedWallet
  ): Promise<CreateStreamResponse[]> {
    return Promise.all(inputs.map((input) => this.createStream(input, senderWallet)));
  }

  async withdraw(
    streamId: string,
    amount: string,
    recipientWallet: ConnectedWallet
  ): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `mock_withdraw_tx_${Date.now()}`;
  }

  async topup(
    streamId: string,
    amount: string,
    senderWallet: ConnectedWallet
  ): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `mock_topup_tx_${Date.now()}`;
  }

  async transfer(
    streamId: string,
    newRecipient: string,
    wallet: ConnectedWallet
  ): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `mock_transfer_tx_${Date.now()}`;
  }

  async cancelStream(streamId: string, wallet: ConnectedWallet): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.status = 'CANCELLED';
    }
    return `mock_cancel_tx_${Date.now()}`;
  }

  async getOne(streamId: string): Promise<StreamDetails> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Calculate available amount based on time
    const now = Math.floor(Date.now() / 1000);
    const totalAmount = BigInt(stream.totalAmount);
    const withdrawnAmount = BigInt(stream.withdrawnAmount);

    let availableAmount = BigInt(0);

    if (stream.status === 'ACTIVE' && now >= stream.startTime) {
      const totalDuration = stream.endTime - stream.startTime;
      const elapsed = Math.min(now, stream.endTime) - stream.startTime;

      if (!stream.cliffTime || now >= stream.cliffTime) {
        const accrued = (totalAmount * BigInt(elapsed)) / BigInt(totalDuration);
        availableAmount = accrued - withdrawnAmount;
      }
    }

    const updatedStream: StreamDetails = {
      ...stream,
      availableAmount: availableAmount.toString(),
      lastSyncedAt: now,
    };

    if (now >= stream.endTime && stream.status === 'ACTIVE') {
      updatedStream.status = 'COMPLETED';
    }

    this.streams.set(streamId, updatedStream);
    return updatedStream;
  }

  async get(streamIds: string[]): Promise<StreamDetails[]> {
    return Promise.all(
      streamIds.map((id) => this.getOne(id).catch(() => null))
    ).then((streams) => streams.filter((s): s is StreamDetails => s !== null));
  }

  async pauseStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.status = 'PAUSED';
    }
  }

  async resumeStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.status = 'ACTIVE';
    }
  }

  clearStreams(): void {
    this.streams.clear();
    this.streamCounter = 0;
  }

  getAllStreams(): StreamDetails[] {
    return Array.from(this.streams.values());
  }
}

/**
 * Factory function to create Streamflow client
 * Uses feature flag STREAMFLOW_ENABLED to determine which implementation to use
 */
export function createStreamflowClient(
  config: StreamflowClientConfig
): IStreamflowClient {
  const streamflowEnabled = env.STREAMFLOW_ENABLED === true;
  const useMock =
    !streamflowEnabled ||
    process.env.USE_MOCK_STREAMFLOW === 'true';

  if (useMock) {
    console.log(
      '[Streamflow] ⚠️  Using MockStreamflowClient (STREAMFLOW_ENABLED=false or USE_MOCK_STREAMFLOW=true)'
    );
    return new MockStreamflowClient(config);
  }

  console.log('[Streamflow] ✅ Using StreamflowClient (real SDK calls enabled)');
  return new StreamflowClient(config);
}

/**
 * Build Solana Explorer transaction URL
 * @param txId Transaction signature
 * @returns Full explorer URL with cluster parameter
 */
export function buildExplorerTxUrl(txId: string): string {
  const clusterParam = IS_DEVNET ? '?cluster=devnet' : '';
  return `${SOLANA_EXPLORER_BASE}/tx/${txId}${clusterParam}`;
}

/**
 * Get or create a singleton Streamflow client instance
 * Note: This is for read-only operations (getOne, get)
 * For write operations, use createStreamflowClient with proper wallet adapter
 */
let clientInstance: IStreamflowClient | null = null;

export function getStreamflowClient(): IStreamflowClient {
  if (!clientInstance) {
    clientInstance = createStreamflowClient({
      clusterUrl: env.SOLANA_CLUSTER_URL,
      cluster: env.SOLANA_CLUSTER,
    });
  }
  return clientInstance;
}
