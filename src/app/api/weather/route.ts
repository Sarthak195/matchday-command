import { NextResponse } from "next/server";
import { getForecast } from "@/lib/weather/client";

export const dynamic = "force-dynamic";

/** Current venue forecast — live from Open-Meteo, or a simulated fallback. */
export async function GET() {
  const forecast = await getForecast();
  return NextResponse.json(forecast);
}
