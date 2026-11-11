'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';

const btn2 =
  'inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';

/** Print + "Copy as text" — read-only chrome for the recap page. */
export function RecapActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (permission, insecure context): legacy path.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-2" data-no-print>
      <button type="button" className={btn2} onClick={() => window.print()}>
        <Printer aria-hidden className="h-3.5 w-3.5" />
        Print
      </button>
      <button type="button" className={btn2} onClick={copy} aria-live="polite">
        {copied ? (
          <Check aria-hidden className="h-3.5 w-3.5 text-teal-600" />
        ) : (
          <Copy aria-hidden className="h-3.5 w-3.5" />
        )}
        {copied ? 'Copied' : 'Copy as text'}
      </button>
    </div>
  );
}
