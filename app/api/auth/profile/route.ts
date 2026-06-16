import { NextResponse } from "next/server";

import { updateOwnAppUserProfileServer } from "@/lib/app-users-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileBody = {
  userId?: string;
  currentPassword?: string;
  fullName?: string;
  newPassword?: string;
};

export async function POST(req: Request) {
  let body: ProfileBody;
  try {
    body = (await req.json()) as ProfileBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const fullName = typeof body.fullName === "string" ? body.fullName : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : undefined;

  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId is required." }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        ok: false,
        message: "Server auth is not configured (SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 503 }
    );
  }

  const result = await updateOwnAppUserProfileServer({
    userId,
    currentPassword,
    fullName,
    newPassword,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
