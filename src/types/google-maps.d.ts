/**
 * Minimal ambient types for the slice of the Google Maps JS API that
 * `venue-map.tsx` uses. Lets the integration be typed without pulling in the
 * full `@types/google.maps` dependency (the API is loaded at runtime by script
 * tag when a Maps key is present).
 */

interface GMapsLatLng {
  lat: number;
  lng: number;
}

/** Opaque map instance handle. */
interface GMap {
  readonly __gmap?: never;
}

/** Anything that can be attached to / detached from the map. */
interface GMapOverlay {
  setMap(map: GMap | null): void;
}

interface GMapOptions {
  center: GMapsLatLng;
  zoom: number;
  disableDefaultUI?: boolean;
  zoomControl?: boolean;
  styles?: unknown[];
}

interface GMarkerOptions {
  position: GMapsLatLng;
  map: GMap;
  title?: string;
}

interface GPolylineOptions {
  path: GMapsLatLng[];
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  map?: GMap;
}

interface GCircleOptions {
  center: GMapsLatLng;
  radius: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  map?: GMap;
}

interface GoogleMapsApi {
  Map: new (el: HTMLElement, opts: GMapOptions) => GMap;
  TrafficLayer: new () => GMapOverlay;
  Marker: new (opts: GMarkerOptions) => GMapOverlay;
  Polyline: new (opts: GPolylineOptions) => GMapOverlay;
  Circle: new (opts: GCircleOptions) => GMapOverlay;
}

interface Window {
  google?: { maps: GoogleMapsApi };
  __mdcMapInit?: () => void;
}
