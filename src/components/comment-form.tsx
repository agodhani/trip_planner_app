'use client';

import { useActionState, useRef } from 'react';
import { addCommentAction, type ActionState } from '@/lib/actions/people';

export function CommentForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addCommentAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await action(fd);
        ref.current?.reset();
      }}
      className="flex gap-2"
    >
      <input type="hidden" name="tripId" value={tripId} />
      <input
        name="body"
        required
        maxLength={4000}
        placeholder="Write a comment…"
        aria-label="Comment"
        className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        Post
      </button>
      {state.error && (
        <p role="alert" className="self-center text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
