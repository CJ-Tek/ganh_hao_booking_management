import { NextResponse } from "next/server";
import { runBookingMaintenanceInSupabase } from "@/lib/supabase-store-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maintenanceSecret(): string | undefined {
  return process.env.BOOKING_MAINTENANCE_SECRET ?? process.env.CRON_SECRET;
}

function isAuthorized(req: Request): boolean {
  const secret = maintenanceSecret();
  if (!secret) {
    return false;
  }
  const headerValue = req.headers.get("x-booking-maintenance-secret");
  if (headerValue === secret) {
    return true;
  }
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

async function runMaintenance() {
  if (!maintenanceSecret()) {
    return NextResponse.json(
      { ok: false, message: "BOOKING_MAINTENANCE_SECRET or CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const result = await runBookingMaintenanceInSupabase();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  return runMaintenance();
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  return runMaintenance();
}
