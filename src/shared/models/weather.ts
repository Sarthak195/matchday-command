/** Weather signals that drive equipment/food demand. Sourced from Open-Meteo
 *  (live) or a simulated fallback — the `source` field says which. */

export type WeatherCondition = "clear" | "clouds" | "rain" | "storm" | "heat" | "cold";

export interface WeatherHorizon {
  /** Human label relative to now, e.g. "+1h", "+2h". */
  label: string;
  tempC: number;
  condition: WeatherCondition;
  precipProbPct: number;
}

export interface WeatherForecast {
  source: "live" | "simulated";
  observedAt: string; // ISO timestamp of the current reading
  tempC: number;
  feelsLikeC: number;
  condition: WeatherCondition;
  precipProbPct: number;
  windKph: number;
  humidityPct: number;
  /** One-line ops-facing summary. */
  summary: string;
  horizon: WeatherHorizon[];
}
