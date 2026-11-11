'use client';

import { useActionState, useEffect, useRef } from 'react';
import {
  login,
  signup,
  type AuthFormState,
} from '@/lib/actions/auth';

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30';
const labelCls = 'block text-sm font-medium text-neutral-700';
const btnCls =
  'w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signup,
    {},
  );
  const tzRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tzRef.current) {
      tzRef.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    }
  }, []);

  // suppressHydrationWarning: password managers decorate inputs at runtime,
  // which otherwise trips a hydration-mismatch warning in dev.
  return (
    <form action={action} className="flex flex-col gap-4" suppressHydrationWarning>
      <input type="hidden" name="timezone" ref={tzRef} />
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <label htmlFor="name" className={labelCls}>
          Name
        </label>
        <input id="name" name="name" required className={inputCls} />
      </div>
      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelCls}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-neutral-500">At least 8 characters.</p>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? 'Creating account…' : 'Sign up'}
      </button>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    login,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4" suppressHydrationWarning>
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelCls}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className={inputCls}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
