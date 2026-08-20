import { NextResponse } from "next/server";

import { GATE_COOKIE, GATE_MAX_AGE, gateToken, safeEqual } from "@/lib/site-gate";

// Not under /api/ on purpose: nginx proxies /api/* straight to FastAPI, so a
// route handler there would be unreachable in production.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "The gate is not configured." }, { status: 404 });
  }

  let submitted = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    submitted = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Compare digests, not raw strings — equal length every time, so the compare
  // can't leak the password's length.
  if (!safeEqual(await gateToken(submitted), await gateToken(password))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE,
  });
  return response;
}
