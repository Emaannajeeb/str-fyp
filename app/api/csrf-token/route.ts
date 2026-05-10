/**
 * CSRF Token API
 * GET: Returns the current CSRF token for client-side use
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSecureToken } from '@/lib/crypto';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_TOKEN_LENGTH = 32;

export async function GET(request: NextRequest) {
  let token = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  
  if (!token) {
    // Generate new token
    token = generateSecureToken(CSRF_TOKEN_LENGTH);
    const response = NextResponse.json({ token });
    // Set the cookie with the generated token
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });
    return response;
  }
  
  // Token exists, just return it (cookie is already set)
  return NextResponse.json({ token });
}


