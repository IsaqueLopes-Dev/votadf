import { NextResponse } from 'next/server';
import { ensureAdminRequest } from '../../utils';

export async function POST(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const body = (await request.json()) as { userId?: unknown; newPassword?: unknown };
    const { userId, newPassword } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'ID do usuário inválido.' }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao redefinir senha.' },
      { status: 500 }
    );
  }
}
