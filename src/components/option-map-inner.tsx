'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { OptionMapProps } from './option-map';

const COLORS: Record<NonNullable<OptionMapProps['points'][number]['tone']>, string> = {
  default: '#0d9488',
  top: '#b45309',
  pin: '#dc2626',
  center: '#525252',
};

function FitBounds({ points }: { points: OptionMapProps['points'] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds: LatLngBoundsExpression = points.map((p) => [p.lat, p.lon]);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }, [map, points]);
  return null;
}

function ClickHandler({ onPick }: { onPick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => onPick?.(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

export default function OptionMapInner({ points, height = 320, onPick }: OptionMapProps) {
  const center = points[0] ? [points[0].lat, points[0].lon] as [number, number] : [0, 0] as [number, number];
  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ height, width: '100%' }}
      className="rounded-xl border border-neutral-200"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      <ClickHandler onPick={onPick} />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lon]}
          radius={p.tone === 'top' ? 9 : 7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: COLORS[p.tone ?? 'default'], fillOpacity: 0.9 }}
        >
          <Popup>
            <strong>{p.title}</strong>
            {p.subtitle && <><br />{p.subtitle}</>}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
