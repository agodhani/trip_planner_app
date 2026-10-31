'use client';
import { useActionState } from 'react';
import { testGoogleFlightsAction, type TestState } from '@/lib/actions/providerTest';
export function GfTestButton() {
  const [state, action, pending] = useActionState<TestState, void>(testGoogleFlightsAction, {});
  return (
    <div className="mt-2 flex items-center gap-2">
      <form action={() => action()}><button type="submit" disabled={pending} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100">{pending ? 'Testing…' : 'Test'}</button></form>
      {state.ok && <span className="text-xs text-teal-700">OK — {state.count} results</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </div>
  );
}