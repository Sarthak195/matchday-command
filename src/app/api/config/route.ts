import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Client bootstrap. The Google Maps browser key is delivered at runtime (not
 * inlined at build) so it can be set with `gcloud run services update` without a
 * rebuild, and so the app degrades to the simulated map when no key is present.
 * Maps browser keys are meant to be client-visible; restrict by API + referrer.
 */
export async function GET() {
  const mapsApiKey = process.env.MAPS_API_KEY ?? null;
  return NextResponse.json({ mapsEnabled: Boolean(mapsApiKey), mapsApiKey });
}
