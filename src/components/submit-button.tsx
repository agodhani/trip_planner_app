'use client';

import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

/**
 * Form submit button that disables itself and shows a spinner while the
 * enclosing form's action runs — prevents double submits, gives feedback.
 * The label never changes, so its accessible name stays stable.
 */
export function SubmitButton({
  children, className = '', disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center gap-1.5 ${className}`}
      {...rest}
    >
      {pending && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
