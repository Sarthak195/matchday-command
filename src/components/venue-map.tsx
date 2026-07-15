"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_VENUE, VENUE_LOCATION } from "@/shared/constants";
import type { LatLng, TrafficState } from "@/shared/models";
import { CONGESTION_COLOR, STATUS } from "@/lib/theme";

// The Maps JS API is typed via src/types/google-maps.d.ts (a minimal local
// surface, so we avoid the full @types/google.maps dependency).

let mapsPromise: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(key: string): Promise<GoogleMapsApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    window.__mdcMapInit = () => resolve(window.google!.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__mdcMapInit&v=weekly`;
    s.async = true;
    s.onerror = () => reject(new Error("maps script failed"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a19" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#898781" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d0d0d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b2a" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

function lotColor(ratio: number): string {
  if (ratio >= 0.9) return STATUS.critical;
  if (ratio >= 0.7) return STATUS.warning;
  return STATUS.good;
}

export function VenueMap({ traffic }: { traffic: TrafficState }) {
  const [mode, setMode] = useState<"loading" | "google" | "sim">("loading");
  const divRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<GoogleMapsApi | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const overlaysRef = useRef<GMapOverlay[]>([]);
  const trafficRef = useRef(traffic);
  trafficRef.current = traffic;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cancelled) return;
        if (!cfg.mapsApiKey) {
          setMode("sim");
          return;
        }
        loadGoogleMaps(cfg.mapsApiKey)
          .then((maps) => {
            if (cancelled || !divRef.current) return;
            mapsRef.current = maps;
            const map = new maps.Map(divRef.current, {
              center: VENUE_LOCATION,
              zoom: 14,
              disableDefaultUI: true,
              zoomControl: true,
              styles: DARK_STYLE,
            });
            mapRef.current = map;
            new maps.TrafficLayer().setMap(map);
            new maps.Marker({ position: VENUE_LOCATION, map, title: DEMO_VENUE.name });
            setMode("google");
            drawOverlays();
          })
          .catch(() => !cancelled && setMode("sim"));
      })
      .catch(() => !cancelled && setMode("sim"));
    return () => {
      cancelled = true;
      // Detach the drawn overlays so they don't leak when the map unmounts.
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
      mapsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mode === "google") drawOverlays();
  }, [traffic, mode]);

  function drawOverlays() {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    const t = trafficRef.current;
    for (const c of t.corridors) {
      overlaysRef.current.push(
        new maps.Polyline({
          path: c.path,
          strokeColor: CONGESTION_COLOR[c.congestion],
          strokeWeight: 5,
          strokeOpacity: 0.9,
          map,
        }),
      );
    }
    for (const lot of t.lots) {
      overlaysRef.current.push(
        new maps.Circle({
          center: lot.location,
          radius: 130,
          fillColor: lotColor(lot.occupancy / lot.capacity),
          fillOpacity: 0.35,
          strokeColor: "#ffffff",
          strokeOpacity: 0.4,
          strokeWeight: 1,
          map,
        }),
      );
    }
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded">
        {mode !== "sim" ? (
          <div ref={divRef} className="h-[300px] w-full bg-[#0d0d0d]" />
        ) : (
          <SchematicMap traffic={traffic} />
        )}
        {mode === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[#898781]">
            Loading map…
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-[#898781]">
        {mode === "google" ? "● Google live traffic" : "● Simulated traffic model"} · overlays show
        approach congestion &amp; lot fill
      </p>
    </div>
  );
}

/** Keyless fallback: a schematic of approaches and lots projected from the same
 *  coordinates, colored by the simulated traffic state. */
function SchematicMap({ traffic }: { traffic: TrafficState }) {
  const W = 600;
  const H = 300;
  const pad = 34;
  const all: LatLng[] = [
    VENUE_LOCATION,
    ...traffic.corridors.flatMap((c) => c.path),
    ...traffic.lots.map((l) => l.location),
  ];
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-4;
  const spanLng = maxLng - minLng || 1e-4;
  const px = (p: LatLng) => ({
    x: pad + ((p.lng - minLng) / spanLng) * (W - 2 * pad),
    y: pad + ((maxLat - p.lat) / spanLat) * (H - 2 * pad),
  });
  const venue = px(VENUE_LOCATION);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[300px] w-full bg-[#0d0d0d]"
      role="img"
      aria-label="Venue approach schematic"
    >
      <rect width={W} height={H} fill="#0d0d0d" />
      {traffic.corridors.map((c) => {
        const edge = px(c.path[0]);
        return (
          <g key={c.id}>
            <line
              x1={edge.x}
              y1={edge.y}
              x2={venue.x}
              y2={venue.y}
              stroke={CONGESTION_COLOR[c.congestion]}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.9}
            />
            <text x={edge.x} y={edge.y - 8} fill="#c3c2b7" fontSize={11} textAnchor="middle">
              {c.etaMin}′
            </text>
          </g>
        );
      })}
      {traffic.lots.map((l) => {
        const p = px(l.location);
        const ratio = l.occupancy / l.capacity;
        return (
          <g key={l.id}>
            <rect
              x={p.x - 12}
              y={p.y - 12}
              width={24}
              height={24}
              rx={4}
              fill={lotColor(ratio)}
              opacity={0.85}
            />
            <text x={p.x} y={p.y + 26} fill="#898781" fontSize={10} textAnchor="middle">
              {Math.round(ratio * 100)}%
            </text>
          </g>
        );
      })}
      <circle cx={venue.x} cy={venue.y} r={9} fill="#3987e5" stroke="#ffffff" strokeWidth={2} />
      <text
        x={venue.x}
        y={venue.y - 14}
        fill="#ffffff"
        fontSize={11}
        textAnchor="middle"
        fontWeight="600"
      >
        {DEMO_VENUE.name}
      </text>
    </svg>
  );
}
