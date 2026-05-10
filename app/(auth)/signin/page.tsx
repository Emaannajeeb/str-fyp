import { Suspense, type ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import { SignInForm } from './signin-form';

export default function SignInPage(): ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-label="Loading" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
