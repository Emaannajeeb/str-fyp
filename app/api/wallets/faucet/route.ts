/**
 * Request devnet/testnet SOL airdrop (faucet)
 * Only allowed when SOLANA_CLUSTER is devnet or testnet.
 * Rate limited per user (1 request per 5 minutes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { db } from '@/server/db';
import { SOLANA_CLUSTER_URL, env } from '@/lib/env';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';

// Use 0.5 SOL; public devnet RPCs often reject or rate-limit 1 SOL requests
const LAMPORTS_PER_AIRDROP = 500_000_000; // 0.5 SOL
const FAUCET_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FAUCET_RETRIES = 3;
const FAUCET_RETRY_DELAY_MS = 2000;

const faucetLastRequest = new Map<string, number>();

function checkFaucetRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const last = faucetLastRequest.get(userId);
  if (last !== undefined && now - last < FAUCET_WINDOW_MS) {
    return { allowed: false, retryAfterMs: FAUCET_WINDOW_MS - (now - last) };
  }
  return { allowed: true };
}

async function faucetHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  if (env.SOLANA_CLUSTER !== 'devnet' && env.SOLANA_CLUSTER !== 'testnet') {
    return NextResponse.json(
      { success: false, error: 'Faucet is only available on devnet and testnet' },
      { status: 400 }
    );
  }

  const rate = checkFaucetRateLimit(session.userId);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded. Please wait before requesting again.',
        retryAfterSeconds: rate.retryAfterMs ? Math.ceil(rate.retryAfterMs / 1000) : 300,
      },
      { status: 429 }
    );
  }

  try {
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const address = (body.address as string) || undefined;

    let walletAddress: string;

    if (address) {
      const wallet = await db.wallet.findFirst({
        where: {
          address,
          userId: session.userId,
          organizationId: session.organizationId,
        },
      });
      if (!wallet) {
        return NextResponse.json(
          { success: false, error: 'Wallet not found or access denied' },
          { status: 403 }
        );
      }
      walletAddress = address;
    } else {
      const primaryWallet = await db.wallet.findFirst({
        where: {
          userId: session.userId,
          organizationId: session.organizationId,
          isPrimary: true,
        },
      });
      if (!primaryWallet) {
        return NextResponse.json(
          {
            success: false,
            error: 'No primary wallet linked. Link a wallet in Settings > Wallets.',
          },
          { status: 400 }
        );
      }
      walletAddress = primaryWallet.address;
    }

    const connection = new Connection(SOLANA_CLUSTER_URL, 'confirmed');
    const publicKey = new PublicKey(walletAddress);

    let signature: string | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= FAUCET_RETRIES; attempt++) {
      try {
        signature = await connection.requestAirdrop(publicKey, LAMPORTS_PER_AIRDROP);
        break;
      } catch (err) {
        lastError = err;
        const code = (err as { code?: number })?.code;
        // -32603 = internal RPC error (often rate limit or busy)
        if (code === -32603 && attempt < FAUCET_RETRIES) {
          await new Promise((r) => setTimeout(r, FAUCET_RETRY_DELAY_MS));
          continue;
        }
        throw err;
      }
    }

    if (!signature) {
      throw lastError ?? new Error('Airdrop failed after retries');
    }

    await connection.confirmTransaction(signature, 'confirmed');

    faucetLastRequest.set(session.userId, Date.now());

    const solAmount = (LAMPORTS_PER_AIRDROP / 1_000_000_000).toFixed(1);
    return NextResponse.json({
      success: true,
      signature,
      message: `Airdropped ${solAmount} SOL to ${walletAddress.slice(0, 8)}...`,
    });
  } catch (error) {
    console.error('Faucet error:', error);
    const err = error as { code?: number; message?: string };
    const code = err?.code;
    const message = err?.message ?? (error instanceof Error ? error.message : 'Unknown error');

    let userMessage = message;
    if (code === -32603) {
      userMessage =
        'Devnet airdrop failed (RPC rate limit or busy). Try again in a few minutes, or use https://faucet.solana.com to request SOL manually.';
    }

    return NextResponse.json(
      { success: false, error: 'Faucet request failed', message: userMessage },
      { status: 500 }
    );
  }
}

export const POST = withAuthAndRBAC(faucetHandler, {
  requiredPermissions: [],
});
