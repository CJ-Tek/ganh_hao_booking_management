import { NextResponse } from "next/server";
import {
  isMaintenanceCronAuthorized,
  maintenanceSecrets,
  maintenanceSecretsMissingResponse,
} from "@/lib/maintenance-cron-auth";
import { runTableLayoutExpiryMaintenance } from "@/lib/supabase-store-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runMaintenance() {
  if (maintenanceSecrets().length === 0) {
    return NextResponse.json(maintenanceSecretsMissingResponse(), { status: 503 });
  }
  const result = await runTableLayoutExpiryMaintenance();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  if (!isMaintenanceCronAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  return runMaintenance();
}

export async function POST(req: Request) {
  if (!isMaintenanceCronAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  return runMaintenance();
}
