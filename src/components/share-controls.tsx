'use client';

import { useActionState } from 'react';
import {
  createShareLinkAction,
  revokeShareLinkAction,
  type ShareActionState,
} from '@/lib/actions/share';
import { CopyButton } from '@/components/people-controls';

const btnCls =
  'rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const smallBtnCls =
  'rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100';

export function ShareLinkCreateForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<ShareActionState, FormData>(
    createShareLinkAction,
    {},
  );
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="tripId" value={tripId} />
        <button type="submit" disabled={pending} className={btnCls}>
          {pending ? 'Creating…' : 'Create public link'}
        </button>
      </form>
      {state.shareUrl && (
        <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 p-3">
          <p className="mb-1 text-xs font-medium text-teal-800">
            Public link — shown once. Copy it now:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">
              {state.shareUrl}
            </code>
            <CopyButton text={state.shareUrl} label="Copy public link" />
          </div>
        </div>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}

export function RevokeShareLinkButton({
  tripId,
  linkId,
}: {
  tripId: string;
  linkId: string;
}) {
  return (
    <form action={revokeShareLinkAction}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="linkId" value={linkId} />
      <button type="submit" className={smallBtnCls}>
        Revoke
      </button>
    </form>
  );
}
