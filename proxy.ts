import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const hasSupabaseSessionCookie = (request: NextRequest) => {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.startsWith('sb-') && name.includes('auth-token');
  });
};

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!hasSupabaseSessionCookie(request)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
