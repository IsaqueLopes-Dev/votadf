import { NextResponse } from 'next/server';
import { getAuthenticatedUnifiedProfileContext } from '../../profile/utils';

const MIN_WITHDRAWAL = 50;

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export async function POST(request: Request) {
  let body: { amount?: number };
  try {
    body = (await request.json()) as { amount?: number };
  } catch {
    return NextResponse.json({ error: 'NÃ£o foi possÃ­vel ler a solicitaÃ§Ã£o.' }, { status: 400 });
  }

  const requestedAmount = toNumber(body.amount);
  if (requestedAmount < MIN_WITHDRAWAL) {
    return NextResponse.json({ error: `Valor mÃ­nimo para saque Ã© R$ ${MIN_WITHDRAWAL}.` }, { status: 400 });
  }

  const context = await getAuthenticatedUnifiedProfileContext(request);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { user, adminSupabase, profile } = context;
  const cpf = profile.cpf;

  if (!cpf) {
    return NextResponse.json({ error: 'CPF nÃ£o cadastrado. Atualize seu perfil antes de sacar.' }, { status: 400 });
  }

  const currentBalance = toNumber(user.user_metadata?.balance ?? user.user_metadata?.saldo);
  if (requestedAmount > currentBalance) {
    return NextResponse.json({ error: 'Saldo insuficiente para este saque.' }, { status: 400 });
  }

  const existingRequests = Array.isArray(user.user_metadata?.withdrawal_requests)
    ? user.user_metadata.withdrawal_requests
    : [];

  const nextBalance = Math.round((currentBalance - requestedAmount) * 100) / 100;
  const nextRequests = [
    ...existingRequests,
    {
      id: crypto.randomUUID(),
      amount: requestedAmount,
      cpf,
      status: 'pending',
      createdAt: new Date().toISOString(),
      requestedBy: user.id,
    },
  ];

  const { data: updated, error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      balance: nextBalance,
      withdrawal_requests: nextRequests,
    },
  });

  if (updateError || !updated.user) {
    return NextResponse.json(
      { error: updateError?.message || 'NÃ£o foi possÃ­vel registrar o saque.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'SolicitaÃ§Ã£o de saque enviada com sucesso.',
    withdrawal: {
      amount: requestedAmount,
      cpf,
      status: 'pending',
    },
    balance: nextBalance,
  });
}
