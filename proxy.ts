import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Admin permission is validated server-side in the admin APIs.
  // The browser Supabase client persists auth client-side, so
  // cookie-based edge redirects would bounce valid admins back to /login.
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
