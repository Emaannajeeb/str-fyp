/**
 * Client-side Streamflow SDK helper for create stream and withdraw.
 * Uses dynamic import to avoid SSR issues. Run only in browser.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { StreamflowAdapter } from '@/lib/wallet/client';
import type { ICreateStreamExt, IInteractStreamExt } from '@streamflow/stream';

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

const getClusterUrl = (): string => {
  if (typeof window === 'undefined') return 'https://api.devnet.solana.com';
  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER_URL || 'https://api.devnet.solana.com';
};

interface MintInfo {
  decimals: number;
  isToken2022: boolean;
}

/**
 * Validate that the token mint is a real, initialized SPL mint on the active
 * cluster and read its on-chain decimals. Throws a clear, user-facing error
 * instead of letting Streamflow fail later with an opaque `InvalidAccountData`.
 */
async function getMintInfo(clusterUrl: string, mint: string, cluster: string): Promise<MintInfo> {
  if (mint === WRAPPED_SOL_MINT) {
    return { decimals: 9, isToken2022: false };
  }

  let mintKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
  } catch {
    throw new Error(`Invalid token mint address: "${mint}".`);
  }

  const connection = new Connection(clusterUrl, 'confirmed');
  const info = await connection.getParsedAccountInfo(mintKey);
  const value = info.value;

  if (!value) {
    throw new Error(
      `Token mint ${mint} does not exist on ${cluster}. Use a valid ${cluster} SPL token mint (or native SOL) for this contract.`
    );
  }

  const owner = value.owner.toBase58();
  const isClassic = owner === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const isToken2022 = owner === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

  if (!isClassic && !isToken2022) {
    throw new Error(
      `Account ${mint} is not an SPL token mint on ${cluster}. Check the token mint in the contract.`
    );
  }

  const parsed =
    'parsed' in value.data && value.data.parsed?.type === 'mint'
      ? (value.data.parsed.info as { decimals?: number })
      : null;

  if (!parsed || typeof parsed.decimals !== 'number') {
    throw new Error(`Could not read decimals for token mint ${mint} on ${cluster}.`);
  }

  return { decimals: parsed.decimals, isToken2022 };
}

/**
 * Ensure the recipient is a valid on-curve wallet address. The Associated Token
 * Account program rejects creating an ATA for an owner that is off-curve
 * (a PDA / program-owned / token account), which otherwise fails the
 * simulation with an opaque `IllegalOwner` ("Provided owner is not allowed").
 */
function assertValidRecipient(recipient: string): void {
  let recipientKey: PublicKey;
  try {
    recipientKey = new PublicKey(recipient);
  } catch {
    throw new Error(`Invalid recipient wallet address: "${recipient}".`);
  }

  if (!PublicKey.isOnCurve(recipientKey.toBytes())) {
    throw new Error(
      `Recipient wallet ${recipient} is not a valid personal wallet address (it looks like a program or token account). The employee must link a standard Phantom/Solana wallet as their primary wallet.`
    );
  }
}

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

  const { SolanaStreamClient, getBN, ICluster } = await import('@streamflow/stream');

  const clusterEnum =
    cluster === 'mainnet-beta'
      ? ICluster.Mainnet
      : cluster === 'testnet'
        ? ICluster.Testnet
        : ICluster.Devnet;

  const client = new SolanaStreamClient({
    clusterUrl,
    cluster: clusterEnum,
  });

  // Validate the recipient is a real on-curve wallet before building the tx.
  assertValidRecipient(params.recipient);

  // Validate the mint on-chain and use its real decimals. This both surfaces a
  // clear error for bad/placeholder mints and prevents wrong-decimals amounts.
  const mintInfo = await getMintInfo(clusterUrl, params.tokenMint, cluster);
  const decimals = mintInfo.decimals;
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

  const solanaParams: ICreateStreamExt = {
    sender: walletAdapter as unknown as ICreateStreamExt['sender'],
    isNative: params.isNative ?? false,
  };

  // Confirm the recipient ATA does not already exist owned by something
  // unexpected, which produces a runtime `IllegalOwner` during creation.
  await assertRecipientAtaCreatable(
    clusterUrl,
    params.recipient,
    params.tokenMint,
    mintInfo.isToken2022
  );

  try {
    const result = params.isNative
      ? await client.createUnchecked(streamParams, solanaParams)
      : await client.create(streamParams, solanaParams);
    return {
      streamId: result.metadataId,
      txId: result.txId,
    };
  } catch (error) {
    throw await enrichSolanaError(error);
  }
}

const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/**
 * Derive the recipient's associated token account for the given mint and make
 * sure that, if it already exists on-chain, it is a proper token account owned
 * by the (Token | Token-2022) program. If it exists but is owned by something
 * else, ATA creation hits the runtime `IllegalOwner` error.
 */
async function assertRecipientAtaCreatable(
  clusterUrl: string,
  recipient: string,
  mint: string,
  isToken2022: boolean
): Promise<void> {
  const tokenProgramId = new PublicKey(isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
  const recipientKey = new PublicKey(recipient);
  const mintKey = new PublicKey(mint);
  const [ata] = PublicKey.findProgramAddressSync(
    [recipientKey.toBytes(), tokenProgramId.toBytes(), mintKey.toBytes()],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
  );

  const connection = new Connection(clusterUrl, 'confirmed');
  const info = await connection.getAccountInfo(ata);
  if (!info) return; // Will be created fresh - fine.

  const owner = info.owner.toBase58();
  if (owner !== TOKEN_PROGRAM_ID && owner !== TOKEN_2022_PROGRAM_ID) {
    throw new Error(
      `The recipient's token account ${ata.toBase58()} already exists but is owned by ${owner}, not the token program. This causes an "IllegalOwner" failure. The recipient wallet address is likely wrong.`
    );
  }
}

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

interface SolanaErrorWithLogs {
  getLogs?: () => Promise<string[] | null> | string[] | null;
  logs?: string[];
  message?: string;
}

/**
 * Pull on-chain simulation logs off a Streamflow/Solana error so the surfaced
 * message is actionable instead of an opaque instruction error.
 */
async function enrichSolanaError(error: unknown): Promise<Error> {
  const base = error instanceof Error ? error : new Error(String(error));
  const candidate = error as SolanaErrorWithLogs;
  let logs: string[] | null | undefined = candidate.logs;
  if (!logs && typeof candidate.getLogs === 'function') {
    try {
      logs = await candidate.getLogs();
    } catch {
      logs = undefined;
    }
  }
  if (logs && logs.length) {
    console.error('[Streamflow] on-chain logs:', logs);
  }
  return base;
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
  const { SolanaStreamClient, getBN, ICluster } = await import('@streamflow/stream');

  const clusterName = getCluster();
  const clusterEnum =
    clusterName === 'mainnet-beta'
      ? ICluster.Mainnet
      : clusterName === 'testnet'
        ? ICluster.Testnet
        : ICluster.Devnet;

  const client = new SolanaStreamClient({
    clusterUrl: getClusterUrl(),
    cluster: clusterEnum,
  });

  const withdrawData = {
    id: streamId,
    amount: getBN(Number(amount), decimals),
  };

  const solanaParams: IInteractStreamExt = {
    invoker: walletAdapter as unknown as IInteractStreamExt['invoker'],
  };

  const result = await client.withdraw(withdrawData, solanaParams);
  return result.txId;
}
