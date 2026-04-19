import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { getAuthenticatedUnifiedProfileContext } from '../../profile/utils';

const toNumber = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export async function GET(request: Request) {
  const context = await getAuthenticatedUnifiedProfileContext(request);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { user, adminSupabase } = context;
  const { searchParams } = new URL(request.url);
  const paymentIdParam = searchParams.get('paymentId') || '';
  const paymentId = Number(paymentIdParam);

  if (!paymentIdParam || !Number.isFinite(paymentId)) {
    return NextResponse.json({ error: 'paymentId invÃ¡lido.' }, { status: 400 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: 'MERCADO_PAGO_ACCESS_TOKEN nÃ£o configurado.' }, { status: 500 });
  }

  const mpClient = new MercadoPagoConfig({ accessToken });
  const paymentApi = new Payment(mpClient);

  try {
    const payment = await paymentApi.get({ id: paymentId });

    if (payment.external_reference !== user.id) {
      return NextResponse.json({ error: 'Pagamento nÃ£o pertence ao usuÃ¡rio.' }, { status: 403 });
    }

    let creditedNow = false;
    if (payment.status === 'approved') {
      const { data: fetchedUser, error: userFetchError } = await adminSupabase.auth.admin.getUserById(user.id);

      if (!userFetchError && fetchedUser?.user) {
        const currentMetadata = fetchedUser.user.user_metadata || {};
        const creditedIds = Array.isArray(currentMetadata.credited_pix_payment_ids)
          ? currentMetadata.credited_pix_payment_ids.map((value: unknown) => String(value))
          : [];

        const paymentIdAsString = String(payment.id);
        if (!creditedIds.includes(paymentIdAsString)) {
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

          const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
            user_metadata: updatedMetadata,
          });

          if (!updateError) {
            creditedNow = true;
          }
        }
      }
    }

    return NextResponse.json({
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      transactionAmount: payment.transaction_amount,
      creditedNow,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Falha ao consultar pagamento.') }, { status: 500 });
  }
}
