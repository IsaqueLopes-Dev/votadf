import { NextResponse } from 'next/server';
import {
  ensureAdminRequest,
  getUserDisplayName,
  listAllAuthUsers,
  toNumber,
  toStringArray,
} from '../utils';

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const users = await listAllAuthUsers(supabaseAdmin);

    const transactions = users
      .map((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const creditedPixPaymentIds = toStringArray(metadata.credited_pix_payment_ids);
        const balance = toNumber(metadata.balance ?? metadata.saldo);
        const lastPixCreditAt = String(metadata.last_pix_credit_at || '');

        if (!creditedPixPaymentIds.length && !lastPixCreditAt && balance <= 0) {
          return null;
        }

        return {
          id: user.id,
          email: user.email || '',
          displayName: getUserDisplayName(metadata, user.email),
          balance,
          transactionCount: creditedPixPaymentIds.length,
          lastPixCreditAt,
          creditedPixPaymentIds,
          createdAt: user.created_at || '',
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const aDate = new Date(a.lastPixCreditAt || a.createdAt).getTime();
        const bDate = new Date(b.lastPixCreditAt || b.createdAt).getTime();
        return bDate - aDate;
      });

    const totals = transactions.reduce(
      (acc, item) => {
        acc.totalTransactions += item.transactionCount;
        acc.totalBalance += item.balance;
        return acc;
      },
      { totalTransactions: 0, totalBalance: 0 }
    );

    return NextResponse.json({
      transactions,
      totals: {
        totalTransactions: totals.totalTransactions,
        totalBalance: Math.round(totals.totalBalance * 100) / 100,
        activeAccounts: transactions.length,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar transações.' },
      { status: 500 }
    );
  }
}