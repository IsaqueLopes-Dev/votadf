import { NextResponse } from 'next/server';
import { ensureAdminRequest } from './utils';

export async function GET(request: Request) {
  console.log('CHEGOU NA ROTA ADMIN 🔥');

  const { errorResponse, user } = await ensureAdminRequest(request);

  if (errorResponse) {
    return errorResponse;
  }

  return NextResponse.json({
    message: 'Acesso liberado',
    email: user.email,
  });
}
