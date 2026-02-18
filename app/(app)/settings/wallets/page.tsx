'use client';

import { useState, useEffect } from 'react';
import { Wallet, Plus, Trash2, Star, Loader2 } from 'lucide-react';
import ConnectWalletButton from '@/components/wallet/ConnectWalletButton';

interface WalletData {
  id: string;
  address: string;
  provider: string;
  network: string;
  isPrimary: boolean;
  createdAt: string;
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [address, setAddress] = useState('');
  const [provider, setProvider] = useState('phantom');
  const [network, setNetwork] = useState('devnet');

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      const response = await fetch('/api/wallets/list');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load wallets');
      }

      setWallets(data.wallets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallets');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinking(true);
    setError(null);

    try {
      const response = await fetch('/api/wallets/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          provider,
          network,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to link wallet');
      }

      // Reset form and reload wallets
      setAddress('');
      setShowForm(false);
      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link wallet');
    } finally {
      setLinking(false);
    }
  };

  const handleSetPrimary = async (walletId: string) => {
    try {
      const response = await fetch('/api/wallets/primary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to set primary wallet');
      }

      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set primary wallet');
    }
  };

  const handleUnlink = async (walletId: string) => {
    if (!confirm('Are you sure you want to unlink this wallet?')) {
      return;
    }

    try {
      const response = await fetch('/api/wallets/unlink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unlink wallet');
      }

      await loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink wallet');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Wallet Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your connected wallets for payroll and payments
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="mb-6 space-y-4">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Connect Wallet</h2>
          <ConnectWalletButton />
        </div>
        <div className="border-t pt-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Link Wallet Manually
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleLinkWallet}
          className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold">Link Wallet</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                Wallet Address
              </label>
              <input
                id="address"
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter wallet address (e.g., 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU)"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                For demo: Enter any wallet address. No chain verification yet.
              </p>
            </div>

            <div>
              <label htmlFor="provider" className="block text-sm font-medium text-gray-700">
                Provider
              </label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="phantom">Phantom</option>
                <option value="solflare">Solflare</option>
                <option value="ledger">Ledger</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="network" className="block text-sm font-medium text-gray-700">
                Network
              </label>
              <select
                id="network"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              >
                <option value="mainnet-beta">Mainnet</option>
                <option value="devnet">Devnet</option>
                <option value="testnet">Testnet</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={linking}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {linking ? 'Linking...' : 'Link Wallet'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setAddress('');
                  setError(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {wallets.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <Wallet className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-sm text-gray-600">No wallets linked yet</p>
            <p className="mt-2 text-xs text-gray-500">
              Link a wallet to start receiving payroll payments
            </p>
          </div>
        ) : (
          wallets.map((wallet) => (
            <div
              key={wallet.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-gray-400" />
                    {wallet.isPrimary && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        <Star className="h-3 w-3 fill-current" />
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-sm text-gray-900">{wallet.address}</p>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>Provider: {wallet.provider}</span>
                    <span>Network: {wallet.network}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!wallet.isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(wallet.id)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      title="Set as primary"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleUnlink(wallet.id)}
                    className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    title="Unlink wallet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

