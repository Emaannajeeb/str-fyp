/**
 * Worker Health Check Endpoint
 * Used by Docker healthcheck to verify worker is running
 */

import { NextResponse } from 'next/server';

export async function GET() {
  // Simple health check - just verify the endpoint is accessible
  // In a real implementation, you might check worker status, queue depth, etc.
  return NextResponse.json({
    ok: true,
    service: 'reconciliation-worker',
    timestamp: new Date().toISOString(),
  });
}


