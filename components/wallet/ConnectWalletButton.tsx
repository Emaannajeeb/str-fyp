'use client';

import { useState, useEffect } from 'react';
import { Wallet, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { walletRegistry, type WalletProviderId } from '@/lib/wallet/client';
import { useWalletStore } from '@/lib/wallet/store';

// Get WALLET_ALLOW_MOCK from client-side env
const WALLET_ALLOW_MOCK = typeof process !== 'undefined' 
  ? process.env?.NEXT_PUBLIC_WALLET_ALLOW_MOCK === 'true'
  : false;

export default function ConnectWalletButton() {
  const {
    providerId: _providerId,
    connectedWallet,
    isConnecting,
    error,
    setProvider,
    setConnectedWallet,
    setConnecting,
    setError,
    disconnect,
  } = useWalletStore();

  const [availableAdapters, setAvailableAdapters] = useState(
    walletRegistry.getAll()
  );
  const [selectedProviderId, setSelectedProviderId] = useState<WalletProviderId | ''>('');
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  useEffect(() => {
    // Load available adapters
    walletRegistry.getAvailable().then((adapters) => {
      // Filter out mock if not allowed
      const filtered = WALLET_ALLOW_MOCK 
        ? adapters 
        : adapters.filter(a => a.providerId !== 'mock');
      setAvailableAdapters(filtered);
      
      // Default to Phantom if available
      const phantom = filtered.find(a => a.providerId === 'phantom');
      if (phantom && !selectedProviderId) {
        setSelectedProviderId('phantom');
      }
    });

    // Check Phantom network if available
    if (typeof window !== 'undefined' && window.solana?.isPhantom) {
      checkPhantomNetwork();
    }
  }, []);

  const checkPhantomNetwork = async () => {
    try {
      // Try to detect Phantom's network by checking if it's connected
      // Note: Phantom doesn't expose network directly, so we check via RPC
      const expectedCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
      
      // We can't directly check Phantom's network, but we can show a warning
      // if the expected cluster is devnet/testnet
      if (expectedCluster === 'devnet' || expectedCluster === 'testnet') {
        setNetworkWarning(
          `Please ensure Phantom is set to ${expectedCluster === 'devnet' ? 'Devnet' : 'Testnet'} mode. ` +
          'You can change this in Phantom settings.'
        );
      }
    } catch (error) {
      console.error('Error checking network:', error);
    }
  };

  const handleConnect = async () => {
    if (!selectedProviderId) {
      setError('Please select a wallet provider');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const adapter = walletRegistry.get(selectedProviderId as WalletProviderId);
      if (!adapter) {
        throw new Error(`Wallet provider ${selectedProviderId} not found`);
      }

      // Check availability
      const available = await adapter.isAvailable();
      if (!available) {
        throw new Error(`${adapter.name} is not available`);
      }

      // Connect wallet
      const wallet = await adapter.connect();

      // Store in Zustand
      setProvider(selectedProviderId as WalletProviderId);
      setConnectedWallet(wallet);

      // Auto-link to backend if not already linked
      try {
        const response = await fetch('/api/wallets/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address: wallet.address,
            provider: selectedProviderId,
            // Network will be set from env on server side
            network: 'devnet', // Placeholder, server will use SOLANA_CLUSTER from env
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          // If wallet already exists, that's okay
          if (data.error && !data.error.includes('already linked')) {
            console.warn('Failed to link wallet to backend:', data.error);
          }
        }
      } catch (linkError) {
        console.warn('Failed to auto-link wallet:', linkError);
        // Don't fail the connection if linking fails
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      setConnectedWallet(null);
      setProvider(null);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (connectedWallet) {
      try {
        await connectedWallet.disconnect();
      } catch (err) {
        console.error('Error disconnecting wallet:', err);
      }
    }
    disconnect();
  };

  const selectedAdapter = selectedProviderId
    ? walletRegistry.get(selectedProviderId as WalletProviderId)
    : null;

  return (
    <div className="space-y-4">
      {connectedWallet ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">Wallet Connected</p>
                <p className="font-mono text-xs text-green-700">
                  {connectedWallet.address.slice(0, 8)}...{connectedWallet.address.slice(-8)}
                </p>
                {selectedAdapter && (
                  <p className="text-xs text-green-600">{selectedAdapter.name}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-green-300 bg-white px-3 py-1 text-sm font-medium text-green-700 hover:bg-green-100"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="wallet-provider"
                className="block text-sm font-medium text-gray-700"
              >
                Select Wallet Provider
              </label>
              <select
                id="wallet-provider"
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value as WalletProviderId | '')}
                disabled={isConnecting}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm disabled:opacity-50"
              >
                <option value="">-- Select a wallet --</option>
                {availableAdapters
                  .filter((adapter) => {
                    // Filter out mock if not allowed
                    if (adapter.providerId === 'mock' && !WALLET_ALLOW_MOCK) {
                      return false;
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    // Prioritize Phantom
                    if (a.providerId === 'phantom') return -1;
                    if (b.providerId === 'phantom') return 1;
                    // Then Solflare
                    if (a.providerId === 'solflare') return -1;
                    if (b.providerId === 'solflare') return 1;
                    // Then MetaMask
                    if (a.providerId === 'metamask-solana-snap') return -1;
                    if (b.providerId === 'metamask-solana-snap') return 1;
                    // Mock last
                    return 0;
                  })
                  .map((adapter) => (
                    <option key={adapter.providerId} value={adapter.providerId}>
                      {adapter.icon} {adapter.name}
                      {adapter.providerId === 'phantom' && ' (Solana Testnet/Devnet)'}
                    </option>
                  ))}
              </select>
            </div>

            {selectedProviderId === 'phantom' && networkWarning && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Network Check</p>
                    <p className="text-xs">{networkWarning}</p>
                  </div>
                </div>
              </div>
            )}

            {selectedProviderId === 'phantom' && typeof window !== 'undefined' && !window.solana?.isPhantom && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="text-blue-600 mt-0.5">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Phantom Not Detected</p>
                    <p className="text-xs mb-2">
                      Please install{' '}
                      <a
                        href="https://phantom.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-900 font-medium"
                      >
                        Phantom wallet
                      </a>{' '}
                      and refresh this page.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedProviderId === 'metamask-solana-snap' && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="text-yellow-600 mt-0.5">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">MetaMask Flask Required</p>
                    <p className="text-xs mb-2">
                      This uses the{' '}
                      <a
                        href="https://permissionless.snaps.metamask.io/snap/npm/solflare-wallet/solana-snap/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-900"
                      >
                        Solflare Solana Snap
                      </a>
                      . Regular MetaMask does not support Snaps yet — you need{' '}
                      <a
                        href="https://metamask.io/flask/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-900 font-medium"
                      >
                        MetaMask Flask
                      </a>{' '}
                      (experimental version).
                    </p>
                    <div className="text-xs space-y-1">
                      <p className="font-medium">Quick Setup:</p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-1">
                        <li>Download Flask from{' '}
                          <a
                            href="https://metamask.io/flask/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-yellow-900"
                          >
                            metamask.io/flask
                          </a>
                        </li>
                        <li>Install it (can run alongside regular MetaMask)</li>
                        <li>Refresh this page and try connecting again</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-4">
                <div className="flex items-start gap-2">
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900 mb-2">{error}</p>
                    
                    {/* Phantom-specific error handling */}
                    {selectedProviderId === 'phantom' && (
                      <>
                        {error.includes('not installed') || error.includes('not found') ? (
                          <div className="text-xs text-red-700 bg-red-100 rounded p-3 mt-2 space-y-2">
                            <p className="font-medium mb-1">Setup Instructions:</p>
                            <ol className="list-decimal list-inside space-y-1 ml-1">
                              <li>
                                Install Phantom from{' '}
                                <a
                                  href="https://phantom.app/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-red-900 font-medium"
                                >
                                  phantom.app
                                </a>
                              </li>
                              <li>Refresh this page after installation</li>
                              <li>Click Connect again</li>
                            </ol>
                          </div>
                        ) : error.includes('rejected') || error.includes('denied') ? (
                          <div className="text-xs text-red-700 bg-red-100 rounded p-3 mt-2">
                            <p className="font-medium mb-1">Connection Rejected</p>
                            <p>Please click Connect again and approve the connection request in Phantom.</p>
                          </div>
                        ) : error.includes('network') || error.includes('cluster') ? (
                          <div className="text-xs text-red-700 bg-red-100 rounded p-3 mt-2 space-y-2">
                            <p className="font-medium mb-1">Network Mismatch</p>
                            <ol className="list-decimal list-inside space-y-1 ml-1">
                              <li>Open Phantom wallet</li>
                              <li>Click the network selector (top right)</li>
                              <li>Switch to the correct network (devnet/mainnet)</li>
                              <li>Try connecting again</li>
                            </ol>
                          </div>
                        ) : null}
                      </>
                    )}
                    
                    {/* MetaMask-specific error handling */}
                    {error.includes('permission') || error.includes('does not have permission') ? (
                      <div className="text-xs text-red-700 bg-red-100 rounded p-2 mt-2 space-y-2">
                        <p className="font-medium mb-1">How to fix:</p>
                        {selectedProviderId === 'metamask-solana-snap' && (
                          <button
                            onClick={async () => {
                              setError(null);
                              setConnecting(true);
                              try {
                                const adapter = walletRegistry.get('metamask-solana-snap');
                                if (adapter && 'reinstallSnap' in adapter && typeof adapter.reinstallSnap === 'function') {
                                  await adapter.reinstallSnap();
                                  setError(null);
                                  // Try connecting again after reinstall
                                  setTimeout(() => {
                                    handleConnect();
                                  }, 500);
                                } else {
                                  throw new Error('Reinstall not available');
                                }
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Failed to reinstall Snap');
                              } finally {
                                setConnecting(false);
                              }
                            }}
                            disabled={isConnecting}
                            className="w-full rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isConnecting ? 'Reinstalling...' : 'Reinstall Snap (Recommended)'}
                          </button>
                        )}
                        <div className="space-y-2">
                          <p className="font-medium text-red-800">Option 1: Grant Permission in MetaMask</p>
                          <ol className="list-decimal list-inside space-y-1 ml-1 text-xs">
                            <li>Click the MetaMask Flask extension icon in your browser</li>
                            <li>Click on &quot;Solana Wallet&quot; (the installed Snap)</li>
                            <li>Scroll down to &quot;Connected sites&quot; section</li>
                            <li>Make sure <code className="bg-red-200 px-1 rounded">http://localhost:3000</code> is listed</li>
                            <li>If not listed, click &quot;Connect&quot; or approve the connection</li>
                            <li>Refresh this page and try connecting again</li>
                          </ol>
                          <p className="font-medium text-red-800 mt-2">Option 2: Reinstall Snap</p>
                          <p className="text-xs ml-1">
                            Use the &quot;Reinstall Snap&quot; button above to trigger permission prompts again
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={!selectedProviderId || isConnecting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

