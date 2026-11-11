'use client';

import { Copy, Check } from 'lucide-react';
import { useActionState, useState } from 'react';
import {
  addTravelerAction,
  changeRoleAction,
  createInviteAction,
  removeMemberAction,
  renameTravelerAction,
  revokeInviteAction,
  type ActionState,
} from '@/lib/actions/people';

const inputCls =
  'rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30';
const btnCls =
  'rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50';
const smallBtnCls =
  'rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100';

export function CopyButton({ text, label = 'Copy invite link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={smallBtnCls}
      aria-label={label}
    >
      {copied ? (
        <Check className="inline h-3.5 w-3.5" />
      ) : (
        <Copy className="inline h-3.5 w-3.5" />
      )}{' '}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function InviteCreateForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createInviteAction,
    {},
  );
  return (
    <div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tripId" value={tripId} />
        <div>
          <label htmlFor="invite-role" className="block text-xs font-medium text-neutral-600">
            Role
          </label>
          <select id="invite-role" name="role" defaultValue="editor" className={inputCls}>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div>
          <label htmlFor="invite-days" className="block text-xs font-medium text-neutral-600">
            Expires in (days, max 30)
          </label>
          <input
            id="invite-days"
            name="expiryDays"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className={`${inputCls} w-24`}
          />
        </div>
        <button type="submit" disabled={pending} className={btnCls}>
          {pending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>
      {state.inviteUrl && (
        <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 p-3">
          <p className="mb-1 text-xs font-medium text-teal-800">
            Invite link — shown once. Copy it now:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">
              {state.inviteUrl}
            </code>
            <CopyButton text={state.inviteUrl} />
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

export function MemberControls({
  tripId,
  userId,
  role,
  isOwnerRow,
}: {
  tripId: string;
  userId: string;
  role: 'editor' | 'viewer';
  isOwnerRow: boolean;
}) {
  if (isOwnerRow) return null;
  return (
    <div className="flex items-center gap-2">
      <form action={changeRoleAction} className="flex items-center gap-1">
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="userId" value={userId} />
        <select
          name="role"
          defaultValue={role}
          aria-label="Change role"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={inputCls}
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </form>
      <form action={removeMemberAction}>
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="userId" value={userId} />
        <button type="submit" className={smallBtnCls}>
          Remove
        </button>
      </form>
    </div>
  );
}

export function RevokeInviteButton({
  tripId,
  inviteId,
}: {
  tripId: string;
  inviteId: string;
}) {
  return (
    <form action={revokeInviteAction}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="inviteId" value={inviteId} />
      <button type="submit" className={smallBtnCls}>
        Revoke
      </button>
    </form>
  );
}

export function AddTravelerForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addTravelerAction,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="tripId" value={tripId} />
      <input
        name="displayName"
        required
        placeholder="Add a traveler without an account"
        aria-label="Traveler name"
        className={`${inputCls} flex-1`}
      />
      <button type="submit" disabled={pending} className={btnCls}>
        Add
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RenameTravelerForm({
  tripId,
  travelerId,
  current,
}: {
  tripId: string;
  travelerId: string;
  current: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button type="button" className={smallBtnCls} onClick={() => setEditing(true)}>
        Rename
      </button>
    );
  }
  return (
    <form
      action={renameTravelerAction}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="travelerId" value={travelerId} />
      <input
        name="displayName"
        defaultValue={current}
        required
        aria-label="New name"
        className={`${inputCls} w-36`}
      />
      <button type="submit" className={smallBtnCls}>
        Save
      </button>
      <button
        type="button"
        className={smallBtnCls}
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </form>
  );
}
