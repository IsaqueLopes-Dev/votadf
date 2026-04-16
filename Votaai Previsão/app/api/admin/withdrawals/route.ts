import { NextResponse } from 'next/server';
import {
  ensureAdminRequest,
  getUserDisplayName,
  listAllAuthUsers,
  toNumber,
} from '../utils';

type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

type WithdrawalRecord = {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  cpf: string;
  amount: number;
  status: WithdrawalStatus;
  createdAt: string;
  approvedAt: string;
  rejectedAt: string;
  decidedByEmail: string;
};

const parseStatus = (value: unknown): WithdrawalStatus => {
  const status = String(value || '').toLowerCase();
  if (status === 'approved' || status === 'rejected') return status;
  return 'pending';
};

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const users = await listAllAuthUsers(supabaseAdmin);

    const withdrawals = users
      .flatMap((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const displayName = getUserDisplayName(metadata, user.email);
        const requests = Array.isArray(metadata.withdrawal_requests) ? metadata.withdrawal_requests : [];

        return requests
          .map((item) => {
            const requestData = (item || {}) as Record<string, unknown>;
            return {
              id: String(requestData.id || ''),
              userId: user.id,
              userEmail: user.email || '',
              userDisplayName: displayName,
              cpf: String(requestData.cpf || ''),
              amount: toNumber(requestData.amount),
              status: parseStatus(requestData.status),
              createdAt: String(requestData.createdAt || ''),
              approvedAt: String(requestData.approvedAt || ''),
              rejectedAt: String(requestData.rejectedAt || ''),
              decidedByEmail: String(requestData.decidedByEmail || ''),
            } satisfies WithdrawalRecord;
          })
          .filter((item) => item.id && item.amount > 0 && item.createdAt);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totals = withdrawals.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === 'pending') {
          acc.pending += 1;
          acc.pendingAmount += item.amount;
        }
        if (item.status === 'approved') {
          acc.approved += 1;
          acc.approvedAmount += item.amount;
        }
        if (item.status === 'rejected') {
          acc.rejected += 1;
          acc.rejectedAmount += item.amount;
        }
        return acc;
      },
      {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        rejectedAmount: 0,
      }
    );

    return NextResponse.json({
      withdrawals,
      totals: {
        ...totals,
        pendingAmount: Math.round(totals.pendingAmount * 100) / 100,
        approvedAmount: Math.round(totals.approvedAmount * 100) / 100,
        rejectedAmount: Math.round(totals.rejectedAmount * 100) / 100,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar saques.' },
      { status: 500 }
    );
  }
}
