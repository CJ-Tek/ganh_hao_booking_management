import { NextResponse } from "next/server";

import { verifyAppUserLogin } from "@/lib/verify-app-user-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LoginBody = {
  username?: string;
  password?: string;
};

export async function POST(req: Request) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, message: "Username and password are required." },
      { status: 400 }
    );
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

  const user = await verifyAppUserLogin(username, password);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Invalid credentials." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user });
}
