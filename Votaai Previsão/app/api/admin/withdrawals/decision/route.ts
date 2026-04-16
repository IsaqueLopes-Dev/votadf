import { NextResponse } from 'next/server';
import { ensureAdminRequest, toNumber } from '../../utils';

type Decision = 'approved' | 'rejected';

const isDecision = (value: unknown): value is Decision => {
  return value === 'approved' || value === 'rejected';
};

export async function POST(request: Request) {
  const { user, supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin || !user) {
    return errorResponse;
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const userId = String(payload.userId || '').trim();
  const requestId = String(payload.requestId || '').trim();
  const decision = payload.decision;

  if (!userId || !requestId || !isDecision(decision)) {
    return NextResponse.json(
      { error: 'Informe userId, requestId e decision (approved/rejected).' },
      { status: 400 }
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (userError || !userData?.user) {
    return NextResponse.json({ error: userError?.message || 'Usuário não encontrado.' }, { status: 404 });
  }

  const targetUser = userData.user;
  const metadata = ((targetUser.user_metadata || {}) as Record<string, unknown>) || {};
  const requests = Array.isArray(metadata.withdrawal_requests) ? metadata.withdrawal_requests : [];
  const reqIndex = requests.findIndex((item) => {
    const record = (item || {}) as Record<string, unknown>;
    return String(record.id || '') === requestId;
  });

  if (reqIndex === -1) {
    return NextResponse.json({ error: 'Solicitação de saque não encontrada.' }, { status: 404 });
  }

  const current = ((requests[reqIndex] || {}) as Record<string, unknown>) || {};
  const currentStatus = String(current.status || 'pending').toLowerCase();

  if (currentStatus !== 'pending') {
    return NextResponse.json(
      { error: 'Esta solicitação já foi processada.' },
      { status: 409 }
    );
  }

  let nextBalance = toNumber(metadata.balance ?? metadata.saldo);
  if (decision === 'rejected') {
    nextBalance = Math.round((nextBalance + toNumber(current.amount)) * 100) / 100;
  }

  const nextRequest = {
    ...current,
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedBy: user.id,
    decidedByEmail: user.email || '',
    approvedAt: decision === 'approved' ? new Date().toISOString() : String(current.approvedAt || ''),
    rejectedAt: decision === 'rejected' ? new Date().toISOString() : String(current.rejectedAt || ''),
  };

  const nextRequests = requests.slice();
  nextRequests[reqIndex] = nextRequest;

  const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      balance: nextBalance,
      saldo: nextBalance,
      withdrawal_requests: nextRequests,
    },
  });

  if (updateError || !updated.user) {
    return NextResponse.json(
      { error: updateError?.message || 'Não foi possível atualizar saque.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: decision === 'approved' ? 'Saque aprovado com sucesso.' : 'Saque recusado e saldo estornado.',
  });
}
