'use client';

import { useActionState } from 'react';
import { updateProfileAction, type SettingsState } from '@/lib/actions/settings';

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30';
const labelCls = 'block text-sm font-medium text-neutral-700';

export function ProfileForm({
  name,
  homeTimezone,
  defaultCurrency,
}: {
  name: string;
  homeTimezone: string;
  defaultCurrency: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateProfileAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="profile-name" className={labelCls}>
          Name
        </label>
        <input
          id="profile-name"
          name="name"
          defaultValue={name}
          required
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="profile-tz" className={labelCls}>
          Home timezone
        </label>
        <input
          id="profile-tz"
          name="homeTimezone"
          defaultValue={homeTimezone}
          required
          placeholder="America/New_York"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-neutral-500">An IANA timezone name.</p>
      </div>
      <div>
        <label htmlFor="profile-currency" className={labelCls}>
          Default currency
        </label>
        <input
          id="profile-currency"
          name="defaultCurrency"
          defaultValue={defaultCurrency}
          required
          maxLength={3}
          className={`${inputCls} w-24 uppercase`}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm text-teal-700">
          Saved.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}
