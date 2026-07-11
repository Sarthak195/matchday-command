/** Approach-traffic and parking state around the venue, for the map + advisories. */

export type CongestionLevel = "clear" | "moderate" | "heavy" | "severe";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Corridor {
  id: string;
  name: string; // e.g. "AB Road approach (north)"
  congestion: CongestionLevel;
  /** Estimated drive time to the venue, minutes. */
  etaMin: number;
  /** Polyline from the approach edge to the venue, for the map. */
  path: LatLng[];
}

export interface ParkingLot {
  id: string;
  name: string;
  capacity: number;
  occupancy: number;
  location: LatLng;
}

export interface TrafficAdvisory {
  id: string;
  message: string; // e.g. "Divert north arrivals to Lot C via Ring Road"
  severity: "info" | "warning";
}

export interface TrafficState {
  atMinute: number;
  corridors: Corridor[];
  lots: ParkingLot[];
  advisories: TrafficAdvisory[];
}
