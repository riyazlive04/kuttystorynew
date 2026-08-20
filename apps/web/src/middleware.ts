import { NextResponse, type NextRequest } from "next/server";

import { GATE_COOKIE, GATE_PATH, UNLOCK_PATH, gateToken, safeEqual } from "@/lib/site-gate";

export const config = {
  // Everything except Next's own build output and the favicon. Those must stay
  // reachable or the gate page itself can't load its CSS, JS and fonts.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(request: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD;

  // Gate not configured -> site is open, exactly as before.
  if (!password) return NextResponse.next();

  // The unlock endpoint has to stay open or there's no way in.
  if (request.nextUrl.pathname.startsWith(UNLOCK_PATH)) {
    return NextResponse.next();
  }

  const submitted = request.cookies.get(GATE_COOKIE)?.value;
  if (submitted && safeEqual(submitted, await gateToken(password))) {
    return NextResponse.next();
  }

  // Rewrite, not redirect. The visitor's URL is preserved, so unlocking lands
  // them on the page they actually asked for instead of dumping them at /.
  return NextResponse.rewrite(new URL(GATE_PATH, request.url));
}
