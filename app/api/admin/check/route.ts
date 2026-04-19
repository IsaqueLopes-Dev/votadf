import { NextResponse } from 'next/server';
import { ensureAdminRequest } from '../utils';

export async function GET(request: Request) {
  const { user, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !user) {
    return errorResponse;
  }

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: 'admin',
    },
  });
}
