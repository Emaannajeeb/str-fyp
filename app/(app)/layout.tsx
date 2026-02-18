import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ToastContainerWrapper } from '@/components/ui/ToastContainerWrapper';
import { Sidebar } from '@/components/ui/Sidebar';
import { Header } from '@/components/ui/Header';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:pl-72">
        <Header />
        <main className="py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <ToastContainerWrapper />
    </div>
  );
}
