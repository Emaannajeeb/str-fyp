import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/constants';

/**
 * Health Check Endpoint
 * Used by Docker healthcheck and monitoring services
 */
export async function GET() {
  try {
    // Optional: Add database connectivity check
    // const db = await import('@/server/db');
    // await db.db.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

