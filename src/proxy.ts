import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/server/auth/token";

/** Cheap presence check; pages and actions verify the signature server-side. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login" || request.cookies.get(ADMIN_COOKIE)?.value) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
