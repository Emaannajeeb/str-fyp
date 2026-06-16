'use client';

import Link from 'next/link';
import { User, LogOut, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';

const IS_DEVNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
const IS_TESTNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'testnet';
const SHOW_BALANCE = IS_DEVNET || IS_TESTNET;

export function Header() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!SHOW_BALANCE) return;
    let cancelled = false;
    fetch('/api/wallets/balance', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && typeof data.balance === 'number') {
          setBalance(data.balance);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        window.location.href = '/signin';
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="relative flex flex-1 items-center">
          {/* Breadcrumb or page title can go here */}
        </div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          {/* Devnet/Testnet Badge + Balance */}
          {SHOW_BALANCE && (
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                <Wallet className="h-3.5 w-3.5" />
                {balance !== null ? `${balance.toFixed(4)} SOL` : '— SOL'}
              </div>
              {IS_DEVNET && (
                <div className="flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-600" />
                  Devnet
                </div>
              )}
              {IS_TESTNET && !IS_DEVNET && (
                <div className="flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-600" />
                  Testnet
                </div>
              )}
            </div>
          )}
          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-x-2 rounded-full bg-white p-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <User className="h-5 w-5" />
              </div>
              <span className="hidden lg:block">Account</span>
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <Link
                    href="/settings/wallets"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
