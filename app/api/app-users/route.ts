import { NextResponse } from "next/server";

import {
  addAppUserServer,
  isAppUsersServerConfigured,
  listAppUsersServer,
} from "@/lib/app-users-server";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notConfigured() {
  return NextResponse.json(
    { ok: false, message: "Server auth is not configured (SUPABASE_SERVICE_ROLE_KEY)." },
    { status: 503 }
  );
}

export async function GET() {
  if (!isAppUsersServerConfigured()) {
    return notConfigured();
  }

  try {
    const users = await listAppUsersServer();
    if (!users) {
      return notConfigured();
    }
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load users.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

type CreateBody = {
  username?: string;
  password?: string;
  fullName?: string;
  role?: Role;
  branchIds?: string[];
};

export async function POST(req: Request) {
  if (!isAppUsersServerConfigured()) {
    return notConfigured();
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = body.role;
  const branchIds = Array.isArray(body.branchIds) ? body.branchIds : [];

  if (!username || !password || !fullName || !role) {
    return NextResponse.json(
      { ok: false, message: "username, password, fullName, and role are required." },
      { status: 400 }
    );
  }

  const result = await addAppUserServer({
    username,
    password,
    fullName,
    role,
    branchIds,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
