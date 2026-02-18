import Link from 'next/link';
import { ArrowRight, DollarSign, Shield, TrendingUp, Users, Wallet } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg">
              <DollarSign className="h-12 w-12 text-white" />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Streamflow
            <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Office Payroll
            </span>
          </h1>
          <p className="mt-6 text-xl leading-8 text-gray-600">
            Modern crypto payroll management system built on Solana. Streamline your payroll
            operations with automated payment streams, budget management, and comprehensive
            audit trails.
          </p>

          {/* Features Grid */}
          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Wallet className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Payment Streams</h3>
              <p className="mt-2 text-sm text-gray-600">
                Automated recurring payments powered by Streamflow on Solana blockchain
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Budget Management</h3>
              <p className="mt-2 text-sm text-gray-600">
                Track and manage budgets with real-time spending analytics and alerts
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Employee Management</h3>
              <p className="mt-2 text-sm text-gray-600">
                Comprehensive employee profiles, contracts, and payroll history
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
                <Shield className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Security & Audit</h3>
              <p className="mt-2 text-sm text-gray-600">
                Complete audit trails and role-based access control for compliance
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signin"
              className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-105"
            >
              Get Started
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center rounded-lg border-2 border-gray-300 bg-white px-8 py-3 text-base font-semibold text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50"
            >
              Sign In
            </Link>
          </div>

          {/* Additional Info */}
          <p className="mt-8 text-sm text-gray-500">
            Built with Next.js 15 • Powered by Solana • Secured by Design
          </p>
        </div>
      </div>
    </main>
  );
}

