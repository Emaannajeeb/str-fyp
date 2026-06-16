/**
 * Google OAuth: redirect to Google consent screen
 */

import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = ['openid', 'email', 'profile'].join(' ');

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent('Google sign-in is not configured')}`, origin)
    );
  }

  // Use request origin so OAuth redirect_uri matches the host the browser used (avoids APP_BASE_URL drift on Vercel).
  const redirectUri = new URL('/api/auth/google/callback', origin).toString();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  return NextResponse.redirect(url);
}
