'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Key, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteFromUrl = useMemo(() => searchParams.get('invite') ?? '', [searchParams]);
  const errorFromUrl = useMemo(() => searchParams.get('error') ?? null, [searchParams]);
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [method, setMethod] = useState<'email' | 'invite'>(inviteFromUrl ? 'invite' : 'email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorFromUrl);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    if (inviteFromUrl) {
      setInviteCode(inviteFromUrl);
      setMethod('invite');
    }
  }, [inviteFromUrl]);
  useEffect(() => {
    if (errorFromUrl) setError(errorFromUrl);
  }, [errorFromUrl]);

  // Fetch CSRF token on mount
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await fetch('/api/csrf-token', {
          credentials: 'include',
        });
        const data = await response.json();
        setCsrfToken(data.token);
      } catch (err) {
        console.error('Failed to fetch CSRF token:', err);
      }
    };
    fetchCsrfToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Ensure we have a CSRF token
    let token = csrfToken;
    if (!token) {
      try {
        const response = await fetch('/api/csrf-token', {
          credentials: 'include',
        });
        const data = await response.json();
        token = data.token;
        setCsrfToken(token);
      } catch {
        setError('Failed to get security token. Please refresh the page.');
        setLoading(false);
        return;
      }
    }

    try {
      if (!token) {
        setError('CSRF token is missing. Please refresh the page.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        credentials: 'include',
        body: JSON.stringify(
          method === 'email'
            ? { email }
            : { inviteCode: inviteCode.trim(), email, name: email ? undefined : undefined }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sign-in failed');
      }

      // Redirect to app (settings page as default)
      router.push('/settings/wallets');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="animate-fade-in w-full max-w-md space-y-8">
        <div>
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg">
              <Mail className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Streamflow Payroll
            </span>
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Use your email or organization invite code
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={
              method === 'invite' && inviteCode
                ? `/api/auth/google?inviteCode=${encodeURIComponent(inviteCode.trim())}`
                : '/api/auth/google'
            }
            className="flex items-center justify-center gap-2 rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
            <ExternalLink className="h-4 w-4 opacity-70" />
          </Link>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-gradient-to-br from-blue-50 via-white to-purple-50 px-2 text-gray-500">
              or continue with email / invite code
            </span>
          </div>
        </div>

        <div className="flex rounded-xl border-2 border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setMethod('email');
              setError(null);
            }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
              method === 'email'
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Mail className="mr-2 inline h-4 w-4" />
            Email
          </button>
          <button
            type="button"
            onClick={() => {
              setMethod('invite');
              setError(null);
            }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
              method === 'invite'
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Key className="mr-2 inline h-4 w-4" />
            Invite Code
          </button>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {method === 'email' ? (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="you@example.com"
              />
              <p className="mt-2 text-xs text-gray-500">
                For demo: Enter any email. A user account will be created if it does not already
                exist.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700">
                  Invite Code
                </label>
                <input
                  id="inviteCode"
                  name="inviteCode"
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  placeholder="Paste the code from your invite link"
                />
              </div>
              <div>
                <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="inviteEmail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  placeholder="you@example.com"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter your email to join with this invite. An account will be created if needed.
                </p>
              </div>
            </>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-lg border border-transparent bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
