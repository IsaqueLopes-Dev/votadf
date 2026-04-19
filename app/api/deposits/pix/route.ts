import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { getAuthenticatedUnifiedProfileContext } from '../../profile/utils';

const getSiteUrl = (request: Request) => {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';

  if (!host) return null;
  return `${protocol}://${host}`;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

type PixBody = {
  amount?: unknown;
};

const MIN_PIX_DEPOSIT = 10;

export async function POST(request: Request) {
  const context = await getAuthenticatedUnifiedProfileContext(request);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { user, profile } = context;
  const body = (await request.json().catch(() => ({}))) as PixBody;
  const amount = Number(body.amount || 0);

  if (!Number.isFinite(amount) || amount < MIN_PIX_DEPOSIT) {
    return NextResponse.json({ error: 'Valor invalido. O deposito minimo e de R$ 10,00.' }, { status: 400 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: 'MERCADO_PAGO_ACCESS_TOKEN nao configurado.' }, { status: 500 });
  }

  const siteUrl = getSiteUrl(request);
  if (!siteUrl) {
    return NextResponse.json({ error: 'Nao foi possivel determinar a URL do site.' }, { status: 500 });
  }

  const cpf = profile.cpf.replace(/\D/g, '');
  const mpClient = new MercadoPagoConfig({ accessToken });
  const paymentApi = new Payment(mpClient);

  try {
    const created = await paymentApi.create({
      body: {
        transaction_amount: amount,
        description: 'Deposito de saldo - VotaDF',
        payment_method_id: 'pix',
        payer: {
          email: profile.email || user.email || 'usuario@votadf.app',
          ...(cpf.length === 11
            ? {
                identification: {
                  type: 'CPF',
                  number: cpf,
                },
              }
            : {}),
        },
        external_reference: user.id,
        metadata: {
          user_id: user.id,
          kind: 'wallet_deposit',
        },
        notification_url: `${siteUrl}/api/mercado-pago/webhook`,
      },
      requestOptions: {
        idempotencyKey: `${user.id}-${Date.now()}`,
      },
    });

    const transactionData = created.point_of_interaction?.transaction_data;

    if (!transactionData?.qr_code || !transactionData?.qr_code_base64) {
      return NextResponse.json(
        {
          error:
            'Sua conta Mercado Pago ainda nao esta habilitada para gerar QR PIX neste ambiente. Ative o recebimento PIX/chave PIX na conta e tente novamente.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      paymentId: created.id,
      status: created.status,
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      ticketUrl: transactionData.ticket_url || null,
    });
  } catch (error: unknown) {
    const rawMessage = getErrorMessage(error, '');
    const normalized = rawMessage.toLowerCase();

    if (normalized.includes('collector user without key enabled for qr render')) {
      return NextResponse.json(
        {
          error:
            'A conta do Mercado Pago usada no token nao possui chave PIX habilitada para QR. Ative o PIX na conta (producao) e tente novamente.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: getErrorMessage(error, 'Falha ao criar cobranca PIX.') }, { status: 500 });
  }
}
