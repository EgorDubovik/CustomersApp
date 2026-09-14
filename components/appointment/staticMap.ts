import { MAPBOX_TOKEN } from '@/constants/Config';

interface StaticMapOptions {
  lat: number | string | null | undefined;
  lon: number | string | null | undefined;
  /** Logical (dp) size — the request is made at @2x */
  width: number;
  height: number;
  isDark: boolean;
  /** Hex without '#', used for the marker */
  markerColor: string;
  zoom?: number;
}

/**
 * Builds a Mapbox Static Images URL centred on the job address with a "home" pin.
 * Returns null when the token or coordinates are missing so the caller can fall back
 * to the plain gradient hero.
 */
export function buildStaticMapUrl({ lat, lon, width, height, isDark, markerColor, zoom = 13.5 }: StaticMapOptions): string | null {
  if (!MAPBOX_TOKEN) return null;
  const la = typeof lat === 'string' ? parseFloat(lat) : lat;
  const lo = typeof lon === 'string' ? parseFloat(lon) : lon;
  if (la == null || lo == null || isNaN(la) || isNaN(lo) || (la === 0 && lo === 0)) return null;

  // Static API caps images at 1280px per side (before the @2x multiplier is applied server-side)
  const w = Math.min(1280, Math.max(1, Math.round(width)));
  const h = Math.min(1280, Math.max(1, Math.round(height)));
  const style = isDark ? 'mapbox/dark-v11' : 'mapbox/streets-v12';
  const coords = `${lo.toFixed(6)},${la.toFixed(6)}`;
  const pin = `pin-l-home+${markerColor.replace('#', '')}(${coords})`;

  return `https://api.mapbox.com/styles/v1/${style}/static/${pin}/${coords},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}`;
}
