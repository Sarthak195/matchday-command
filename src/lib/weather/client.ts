import { VENUE_LOCATION } from "@/shared/constants";
import type { WeatherCondition, WeatherForecast, WeatherHorizon } from "@/shared/models";

/**
 * Live weather from Open-Meteo (free, keyless) with a deterministic simulated
 * fallback so the demo never depends on the network. Open-Meteo returns WMO
 * weather codes, which we collapse into our coarse WeatherCondition.
 */

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

function wmoToCondition(code: number, tempC: number): WeatherCondition {
  if (code >= 95) return "storm";
  if (code >= 51) return "rain"; // drizzle/rain/showers
  if (tempC >= 34) return "heat";
  if (tempC <= 12) return "cold";
  if (code >= 1 && code <= 3) return "clouds";
  return "clear";
}

function summarize(f: Omit<WeatherForecast, "summary">): string {
  const bits: string[] = [`${f.condition}, ${Math.round(f.tempC)}°C`];
  if (f.precipProbPct >= 40) bits.push(`${f.precipProbPct}% rain`);
  if (f.windKph >= 25) bits.push(`wind ${Math.round(f.windKph)} kph`);
  if (f.feelsLikeC - f.tempC >= 3) bits.push(`feels ${Math.round(f.feelsLikeC)}°C`);
  return bits.join(" · ");
}

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
}

export async function getForecast(): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: String(VENUE_LOCATION.lat),
    longitude: String(VENUE_LOCATION.lng),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    forecast_hours: "4",
    timezone: "auto",
  });

  try {
    const res = await fetch(`${OPEN_METEO}?${params}`, {
      // Cache for a few minutes; weather doesn't change second-to-second.
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;
    if (!data.current) throw new Error("Open-Meteo: no current block");

    const tempC = data.current.temperature_2m;
    const horizon: WeatherHorizon[] = (data.hourly?.time ?? [])
      .slice(1, 4)
      .map((_, i) => ({
        label: `+${i + 1}h`,
        tempC: data.hourly!.temperature_2m[i + 1],
        condition: wmoToCondition(data.hourly!.weather_code[i + 1], data.hourly!.temperature_2m[i + 1]),
        precipProbPct: data.hourly!.precipitation_probability[i + 1] ?? 0,
      }));

    const base = {
      source: "live" as const,
      observedAt: data.current.time,
      tempC,
      feelsLikeC: data.current.apparent_temperature,
      condition: wmoToCondition(data.current.weather_code, tempC),
      precipProbPct: data.hourly?.precipitation_probability?.[0] ?? 0,
      windKph: data.current.wind_speed_10m,
      humidityPct: data.current.relative_humidity_2m,
      horizon,
    };
    return { ...base, summary: summarize(base) };
  } catch {
    return simulatedForecast();
  }
}

/** Monsoon-season Indore fallback — hot, humid, storm building, which lines up
 *  with the scripted storm beat at minute 75. */
export function simulatedForecast(): WeatherForecast {
  const base = {
    source: "simulated" as const,
    observedAt: "1970-01-01T00:00:00Z",
    tempC: 29,
    feelsLikeC: 34,
    condition: "clouds" as WeatherCondition,
    precipProbPct: 55,
    windKph: 18,
    humidityPct: 74,
    horizon: [
      { label: "+1h", tempC: 28, condition: "rain" as WeatherCondition, precipProbPct: 70 },
      { label: "+2h", tempC: 27, condition: "storm" as WeatherCondition, precipProbPct: 85 },
      { label: "+3h", tempC: 26, condition: "rain" as WeatherCondition, precipProbPct: 60 },
    ],
  };
  return { ...base, summary: summarize(base) };
}
