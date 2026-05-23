import { NextResponse } from "next/server";

import {
  deleteAppUserServer,
  getAppUserServer,
  isAppUsersServerConfigured,
  updateAppUserServer,
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

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  if (!isAppUsersServerConfigured()) {
    return notConfigured();
  }

  const { userId } = await context.params;
  const user = await getAppUserServer(userId);
  if (!user) {
    return NextResponse.json({ ok: false, message: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, user });
}

type UpdateBody = {
  username?: string;
  password?: string;
  fullName?: string;
  role?: Role;
  branchIds?: string[];
};

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAppUsersServerConfigured()) {
    return notConfigured();
  }

  const { userId } = await context.params;
  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = body.role;
  const branchIds = Array.isArray(body.branchIds) ? body.branchIds : [];
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!username || !fullName || !role) {
    return NextResponse.json(
      { ok: false, message: "username, fullName, and role are required." },
      { status: 400 }
    );
  }

  const result = await updateAppUserServer(userId, {
    username,
    password,
    fullName,
    role,
    branchIds,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(_req: Request, context: RouteContext) {
  if (!isAppUsersServerConfigured()) {
    return notConfigured();
  }

  const { userId } = await context.params;
  const result = await deleteAppUserServer(userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
