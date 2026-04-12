import { NextResponse } from 'next/server';
import { ensureAdminRequest, toNumber } from '../../utils';

export async function POST(request: Request) {
  const { user, supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin || !user) {
    return errorResponse;
  }

  let payload: { userId?: string; amount?: number; reason?: string };
  try {
    payload = (await request.json()) as { userId?: string; amount?: number; reason?: string };
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const userId = String(payload.userId || '').trim();
  const amount = toNumber(payload.amount);
  const reason = String(payload.reason || '').trim();

  if (!userId || amount <= 0) {
    return NextResponse.json({ error: 'Informe userId e um valor maior que zero.' }, { status: 400 });
  }

  const { data: fetchedUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (userError || !fetchedUser?.user) {
    return NextResponse.json({ error: userError?.message || 'Usuário não encontrado.' }, { status: 404 });
  }

  const currentMetadata = (fetchedUser.user.user_metadata || {}) as Record<string, unknown>;
  const currentBalance = toNumber(currentMetadata.balance ?? currentMetadata.saldo);
  const newBalance = Math.round((currentBalance + amount) * 100) / 100;

  const adjustments = Array.isArray(currentMetadata.admin_balance_adjustments)
    ? currentMetadata.admin_balance_adjustments
    : [];

  const nextAdjustments = [
    ...adjustments,
    {
      id: crypto.randomUUID(),
      amount,
      reason,
      createdAt: new Date().toISOString(),
      adminId: user.id,
      adminEmail: user.email || '',
      type: 'credit',
    },
  ];

  const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      balance: newBalance,
      saldo: newBalance,
      admin_balance_adjustments: nextAdjustments,
    },
  });

  if (updateError || !updated.user) {
    return NextResponse.json(
      { error: updateError?.message || 'Não foi possível adicionar saldo.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'Saldo adicionado com sucesso.',
    balance: newBalance,
  });
}
