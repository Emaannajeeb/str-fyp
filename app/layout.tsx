import type { Metadata } from 'next';
import './globals.css';
// Initialize environment validation on app startup
import '@/lib/env';

export const metadata: Metadata = {
  title: 'Streamflow Office Payroll',
  description: 'Crypto payroll management system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

