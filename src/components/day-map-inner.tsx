'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { DayMapProps } from './day-map';

const TEAL = '#0d9488';

function FitBounds({ points }: { points: DayMapProps['points'] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds: LatLngBoundsExpression = points.map((p) => [p.lat, p.lon]);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  }, [map, points]);
  return null;
}

const numberIcon = (n: number) =>
  L.divIcon({
    className: 'day-map-marker',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${TEAL};color:#fff;font-size:11px;font-weight:600;box-shadow:0 0 0 2px #fff">${n}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

export default function DayMapInner({ points, height = 224 }: DayMapProps) {
  const center = points[0] ? [points[0].lat, points[0].lon] as [number, number] : [0, 0] as [number, number];
  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height, width: '100%' }}
      className="rounded-lg border border-neutral-200"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {points.length > 1 && (
        <Polyline
          positions={points.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{ color: TEAL, weight: 3, opacity: 0.7, dashArray: '4 6' }}
        />
      )}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={numberIcon(p.n)}>
          <Popup>
            <strong>{p.n}. {p.title}</strong>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
