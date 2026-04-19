import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MIN_WITHDRAWAL = 50;

const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
};

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export async function POST(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  let body: { amount?: number };
  try {
    body = (await request.json()) as { amount?: number };
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const requestedAmount = toNumber(body.amount);
  if (requestedAmount < MIN_WITHDRAWAL) {
    return NextResponse.json({ error: `Valor mínimo para saque é R$ ${MIN_WITHDRAWAL}.` }, { status: 400 });
  }

  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const {
    data: { user },
    error: userError,
  } = await anonSupabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: 'Servidor sem configuração de saque.' }, { status: 500 });
  }

  const cpf = String(user.user_metadata?.cpf || '').trim();
  if (!cpf) {
    return NextResponse.json({ error: 'CPF não cadastrado. Atualize seu perfil antes de sacar.' }, { status: 400 });
  }

  const currentBalance = toNumber(user.user_metadata?.balance ?? user.user_metadata?.saldo);
  if (requestedAmount > currentBalance) {
    return NextResponse.json({ error: 'Saldo insuficiente para este saque.' }, { status: 400 });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRole);

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
      { error: updateError?.message || 'Não foi possível registrar o saque.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'Solicitação de saque enviada com sucesso.',
    withdrawal: {
      amount: requestedAmount,
      cpf,
      status: 'pending',
    },
    balance: nextBalance,
  });
}
