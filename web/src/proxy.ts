import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: every admin page and Server Action re-verifies the
// session with requireOwner(). This just avoids rendering admin pages for
// visitors without a session cookie.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("tt_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
