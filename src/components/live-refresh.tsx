'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const POLL_MS = 15_000;

export function LiveRefresh({
  tripId,
  version,
}: {
  tripId: string;
  version: number;
}) {
  const router = useRouter();
  const seen = useRef(version);

  useEffect(() => {
    seen.current = version;
  }, [version]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/api/trips/${tripId}/version`);
        if (!res.ok) return;
        const data = (await res.json()) as { version: number };
        if (data.version !== seen.current) {
          seen.current = data.version;
          router.refresh();
        }
      } catch {
        // transient poll failure; try again next tick
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [tripId, router]);

  return null;
}
