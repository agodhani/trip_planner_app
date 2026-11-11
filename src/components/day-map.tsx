'use client';

import dynamic from 'next/dynamic';

export type DayMapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  /** 1-based position among the day's located items — shown inside the marker. */
  n: number;
};

export type DayMapProps = {
  points: DayMapPoint[];
  height?: number;
};

const DayMapInner = dynamic(() => import('./day-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
      Loading map…
    </div>
  ),
});

export function DayMap(props: DayMapProps) {
  return <DayMapInner {...props} />;
}
