'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Provider thumbnail that degrades to a neutral icon tile instead of a broken image. */
export function Thumb({ src, className, icon: Icon }: { src?: string; className: string; icon: LucideIcon }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`${className} flex shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400`}>
        <Icon aria-hidden className="h-4 w-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} shrink-0 rounded object-cover`} />
  );
}
