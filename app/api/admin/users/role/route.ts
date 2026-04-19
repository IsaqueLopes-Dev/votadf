import { NextResponse } from 'next/server';
import { ensureAdminRequest } from '../../utils';

const VALID_ROLES = new Set(['admin', 'user']);

export async function POST(request: Request) {
  const { user, supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin || !user) {
    return errorResponse;
  }

  let payload: { userId?: unknown; role?: unknown };
  try {
    payload = (await request.json()) as { userId?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const userId = String(payload.userId || '').trim();
  const role = String(payload.role || '').trim().toLowerCase();

  if (!userId || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'Informe userId e role válido (admin ou user).' }, { status: 400 });
  }

  if (userId === user.id && role !== 'admin') {
    return NextResponse.json({ error: 'Você não pode remover seu próprio acesso admin.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('users').upsert({ id: userId, role }, { onConflict: 'id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, role });
}
