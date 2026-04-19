import { NextResponse } from 'next/server';
import { ensureAdminRequest } from '../../utils';

export async function POST(request: Request) {
  const { user, supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin || !user) {
    return errorResponse;
  }

  let payload: { userId?: unknown };
  try {
    payload = (await request.json()) as { userId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const userId = String(payload.userId || '').trim();

  if (!userId) {
    return NextResponse.json({ error: 'Informe o userId.' }, { status: 400 });
  }

  if (userId === user.id) {
    return NextResponse.json({ error: 'Você não pode excluir seu próprio usuário admin.' }, { status: 400 });
  }

  const { error: rpcError } = await supabaseAdmin.rpc('delete_user_and_related', { user_id: userId });
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
