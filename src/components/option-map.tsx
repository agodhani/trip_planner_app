'use client';

import dynamic from 'next/dynamic';

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  tone?: 'default' | 'pin' | 'center' | 'top';
};

export type OptionMapProps = {
  points: MapPoint[];
  height?: number;
  /** When set, clicking the map reports a pin location. */
  onPick?: (lat: number, lon: number) => void;
};

const OptionMapInner = dynamic(() => import('./option-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
      Loading map…
    </div>
  ),
});

export function OptionMap(props: OptionMapProps) {
  return <OptionMapInner {...props} />;
}
