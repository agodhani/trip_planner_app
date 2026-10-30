'use client';

import { useActionState } from 'react';
import { joinTripAction, type ActionState } from '@/lib/actions/people';

export function JoinForm({ token, tripName }: { token: string; tripName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    joinTripAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {pending ? 'Joining…' : `Join ${tripName}`}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
