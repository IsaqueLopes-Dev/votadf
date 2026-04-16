import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const toNumber = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizePaymentId = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

export async function POST(request: Request) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!accessToken || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'server-misconfigured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const queryPaymentId = normalizePaymentId(url.searchParams.get('data.id') || url.searchParams.get('id'));

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const bodyPaymentId = normalizePaymentId(body?.data?.id || body?.id);
  const paymentId = bodyPaymentId || queryPaymentId;

  if (!paymentId) {
    return NextResponse.json({ ok: true, ignored: 'missing-payment-id' });
  }

  const mpClient = new MercadoPagoConfig({ accessToken });
  const paymentApi = new Payment(mpClient);
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payment = await paymentApi.get({ id: paymentId });

    if (payment.status !== 'approved') {
      return NextResponse.json({ ok: true, status: payment.status });
    }

    const userId =
      (payment.external_reference as string | undefined) ||
      (payment.metadata?.user_id as string | undefined);

    if (!userId) {
      return NextResponse.json({ ok: true, ignored: 'missing-user-id' });
    }

    const { data: fetchedUser, error: userFetchError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userFetchError || !fetchedUser?.user) {
      return NextResponse.json({ ok: false, error: 'user-not-found' }, { status: 404 });
    }

    const currentMetadata = fetchedUser.user.user_metadata || {};
    const creditedIds = Array.isArray(currentMetadata.credited_pix_payment_ids)
      ? currentMetadata.credited_pix_payment_ids.map((value: unknown) => String(value))
      : [];

    const paymentIdAsString = String(payment.id);
    if (creditedIds.includes(paymentIdAsString)) {
      return NextResponse.json({ ok: true, alreadyCredited: true });
    }

    const currentBalanceRaw = currentMetadata.balance ?? currentMetadata.saldo ?? 0;
    const currentBalance = toNumber(currentBalanceRaw);
    const amount = toNumber(payment.transaction_amount);
    const newBalance = Math.round((currentBalance + amount) * 100) / 100;
    const existingDepositHistory = Array.isArray(currentMetadata.deposit_history)
      ? currentMetadata.deposit_history
      : [];
    const nextDepositHistory = [
      ...existingDepositHistory,
      {
        id: crypto.randomUUID(),
        paymentId: paymentIdAsString,
        amount,
        status: 'approved',
        createdAt: new Date().toISOString(),
      },
    ];

    const updatedMetadata = {
      ...currentMetadata,
      balance: newBalance,
      saldo: newBalance,
      credited_pix_payment_ids: [...creditedIds, paymentIdAsString],
      last_pix_credit_at: new Date().toISOString(),
      deposit_history: nextDepositHistory,
    };

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: updatedMetadata,
    });

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, credited: true, paymentId: payment.id, newBalance });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'webhook-processing-failed' },
      { status: 500 }
    );
  }
}
