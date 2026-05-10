'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  FileText,
  Wallet,
  DollarSign,
  CheckCircle2,
  Shield,
  Menu,
  X,
  TrendingUp,
  ClipboardList,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/finance/dashboard', icon: LayoutDashboard },
  { name: 'Streams', href: '/streams', icon: Wallet },
  { name: 'Employees', href: '/employees', icon: Users },
  { name: 'Contracts', href: '/contracts', icon: FileText },
  { name: 'Budgets', href: '/finance/budgets', icon: TrendingUp },
  { name: 'Approvals', href: '/approvals', icon: CheckCircle2 },
  { name: 'Audit', href: '/audit', icon: Shield },
];

const settingsNav: NavItem[] = [
  { name: 'Users', href: '/settings/users', icon: Users },
  { name: 'Wallets', href: '/settings/wallets', icon: Wallet },
  { name: 'Notifications', href: '/settings/notifications', icon: ClipboardList },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/finance/dashboard') {
      return pathname === '/finance/dashboard';
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:hidden">
        <button
          type="button"
          className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span className="sr-only">Open sidebar</span>
          {mobileMenuOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
        <div className="flex-1 text-sm font-semibold leading-6 text-gray-900">
          Streamflow Payroll
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center">
            <Link href="/finance/dashboard" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div className="ml-2">
                <h1 className="text-lg font-bold text-gray-900">Streamflow</h1>
                <p className="text-xs text-gray-500">Payroll System</p>
              </div>
            </Link>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-1">
              {navigation.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`
                        group flex gap-x-3 rounded-lg p-3 text-sm font-semibold leading-6 transition-all duration-200
                        ${
                          active
                            ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }
                      `}
                    >
                      <item.icon
                        className={`h-6 w-6 shrink-0 ${
                          active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                        }`}
                        aria-hidden="true"
                      />
                      {item.name}
                      {item.badge && (
                        <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto border-t border-gray-200 pt-4">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Settings
              </p>
              <ul role="list" className="mt-2 space-y-1">
                {settingsNav.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={`
                          group flex gap-x-3 rounded-lg p-3 text-sm font-semibold leading-6 transition-all duration-200
                          ${
                            active
                              ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm'
                              : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                          }
                        `}
                      >
                        <item.icon
                          className={`h-6 w-6 shrink-0 ${
                            active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                          }`}
                          aria-hidden="true"
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-gray-900/80" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-full overflow-y-auto bg-white px-6 pb-4 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10">
            <div className="flex h-16 shrink-0 items-center gap-x-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div className="ml-2">
                <h1 className="text-lg font-bold text-gray-900">Streamflow</h1>
                <p className="text-xs text-gray-500">Payroll System</p>
              </div>
              <button
                type="button"
                className="-m-2.5 rounded-md p-2.5 text-gray-700 ml-auto"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <nav className="mt-8 flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-1">
                {navigation.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`
                          group flex gap-x-3 rounded-lg p-3 text-sm font-semibold leading-6 transition-all duration-200
                          ${
                            active
                              ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm'
                              : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                          }
                        `}
                      >
                        <item.icon
                          className={`h-6 w-6 shrink-0 ${
                            active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                          }`}
                          aria-hidden="true"
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-auto border-t border-gray-200 pt-4">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Settings
                </p>
                <ul role="list" className="mt-2 space-y-1">
                  {settingsNav.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`
                            group flex gap-x-3 rounded-lg p-3 text-sm font-semibold leading-6 transition-all duration-200
                            ${
                              active
                                ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm'
                                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                            }
                          `}
                        >
                          <item.icon
                            className={`h-6 w-6 shrink-0 ${
                              active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                            }`}
                            aria-hidden="true"
                          />
                          {item.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

