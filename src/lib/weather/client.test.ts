import { afterEach, describe, expect, it, vi } from "vitest";
import { getForecast, simulatedForecast } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("simulatedForecast", () => {
  it("is a deterministic monsoon-season fallback", () => {
    const a = simulatedForecast();
    const b = simulatedForecast();
    expect(a).toEqual(b);
    expect(a.source).toBe("simulated");
    expect(a.horizon).toHaveLength(3);
  });

  it("builds a summary string from the notable conditions", () => {
    // clouds/29°C, 55% precip (≥40 shown), 18 kph wind (<25 hidden), feels 34°C (+5 shown).
    expect(simulatedForecast().summary).toBe("clouds, 29°C · 55% rain · feels 34°C");
  });
});

describe("getForecast", () => {
  it("maps a live Open-Meteo response into a forecast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          current: {
            time: "2026-07-15T18:00",
            temperature_2m: 25,
            apparent_temperature: 26,
            relative_humidity_2m: 50,
            precipitation: 0,
            weather_code: 0,
            wind_speed_10m: 10,
          },
          hourly: {
            time: ["18:00", "19:00", "20:00", "21:00"],
            temperature_2m: [25, 24, 23, 22],
            precipitation_probability: [10, 20, 30, 40],
            weather_code: [0, 0, 0, 0],
          },
        }),
      }),
    );

    const f = await getForecast();
    expect(f.source).toBe("live");
    expect(f.tempC).toBe(25);
    expect(f.condition).toBe("clear"); // WMO code 0, mild temp
    expect(f.horizon).toHaveLength(3);
  });

  it("falls back to the simulated forecast when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await getForecast()).source).toBe("simulated");
  });

  it("falls back when Open-Meteo returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect((await getForecast()).source).toBe("simulated");
  });
});
