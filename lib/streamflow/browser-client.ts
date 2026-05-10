/**
 * Client-side Streamflow SDK helper for create stream and withdraw.
 * Uses dynamic import to avoid SSR issues. Run only in browser.
 */

import type { StreamflowAdapter } from '@/lib/wallet/client';
import type { ICreateStreamSolanaExt, IInteractStreamSolanaExt } from '@streamflow/stream/solana';

const getClusterUrl = (): string => {
  if (typeof window === 'undefined') return 'https://api.devnet.solana.com';
  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER_URL || 'https://api.devnet.solana.com';
};

const getCluster = (): 'mainnet-beta' | 'devnet' | 'testnet' => {
  if (typeof window === 'undefined') return 'devnet';
  return (
    (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as 'mainnet-beta' | 'devnet' | 'testnet') || 'devnet'
  );
};

export interface CreateStreamParams {
  recipient: string;
  tokenMint: string;
  totalAmount: string;
  amountPerPeriod?: string;
  startTime: number;
  endTime: number;
  period?: number;
  cliffTime?: number;
  cliffAmount?: string;
  decimals?: number;
  name?: string;
  isNative?: boolean;
}

export interface CreateStreamResult {
  streamId: string;
  txId: string;
}

/**
 * Create a stream on-chain using Streamflow SDK in the browser.
 * Requires a wallet adapter (e.g. from connectedWallet.getStreamflowAdapter()).
 */
export async function createStreamInBrowser(
  params: CreateStreamParams,
  walletAdapter: StreamflowAdapter
): Promise<CreateStreamResult> {
  const clusterUrl = getClusterUrl();
  const cluster = getCluster();

  const { GenericStreamClient, getBN, IChain, ICluster } = await import('@streamflow/stream');

  const clusterEnum =
    cluster === 'mainnet-beta'
      ? ICluster.Mainnet
      : cluster === 'testnet'
        ? ICluster.Testnet
        : ICluster.Devnet;

  const client = new GenericStreamClient<IChain.Solana>({
    chain: IChain.Solana,
    clusterUrl,
    cluster: clusterEnum,
  });

  const decimals = params.decimals ?? 9;
  const period = params.period ?? params.endTime - params.startTime;

  const streamParams = {
    recipient: params.recipient,
    tokenId: params.tokenMint,
    start: params.startTime,
    amount: getBN(Number(params.totalAmount), decimals),
    period,
    cliff: params.cliffTime ?? params.startTime,
    cliffAmount: params.cliffAmount
      ? getBN(Number(params.cliffAmount), decimals)
      : getBN(0, decimals),
    amountPerPeriod: params.amountPerPeriod
      ? getBN(Number(params.amountPerPeriod), decimals)
      : getBN(Number(params.totalAmount), decimals),
    name: params.name ?? `Stream ${params.recipient.slice(0, 8)}`,
    canTopup: false,
    cancelableBySender: true,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: false,
    automaticWithdrawal: false,
    withdrawalFrequency: 0,
  };

  const solanaParams: ICreateStreamSolanaExt = {
    sender: walletAdapter as unknown as ICreateStreamSolanaExt['sender'],
    isNative: params.isNative ?? false,
  };

  const result = await client.create(streamParams, solanaParams);
  return {
    streamId: result.metadataId,
    txId: result.txId,
  };
}

/**
 * Withdraw from a stream in the browser using Streamflow SDK.
 * Recipient (walletAdapter) must be the stream's recipient.
 */
export async function withdrawStreamInBrowser(
  streamId: string,
  amount: string,
  walletAdapter: StreamflowAdapter,
  decimals: number = 9
): Promise<string> {
  const { GenericStreamClient, getBN, IChain, ICluster } = await import('@streamflow/stream');

  const clusterName = getCluster();
  const clusterEnum =
    clusterName === 'mainnet-beta'
      ? ICluster.Mainnet
      : clusterName === 'testnet'
        ? ICluster.Testnet
        : ICluster.Devnet;

  const client = new GenericStreamClient<IChain.Solana>({
    chain: IChain.Solana,
    clusterUrl: getClusterUrl(),
    cluster: clusterEnum,
  });

  const withdrawData = {
    id: streamId,
    amount: getBN(Number(amount), decimals),
  };

  const solanaParams: IInteractStreamSolanaExt = {
    invoker: walletAdapter as unknown as IInteractStreamSolanaExt['invoker'],
  };

  const result = await client.withdraw(withdrawData, solanaParams);
  return result.txId;
}
