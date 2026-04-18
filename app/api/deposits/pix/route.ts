import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const MIN_PIX_DEPOSIT = 10;
const MAX_PIX_DEPOSIT = 200;

const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
};

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

export async function POST(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
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

  const body = (await request.json().catch(() => ({}))) as PixBody;
  const amount = Number(body.amount || 0);

  if (!Number.isFinite(amount) || amount < MIN_PIX_DEPOSIT || amount > MAX_PIX_DEPOSIT) {
    return NextResponse.json(
      { error: `Valor inválido. Use entre R$ ${MIN_PIX_DEPOSIT} e R$ ${MAX_PIX_DEPOSIT}.` },
      { status: 400 }
    );
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado.' }, { status: 500 });
  }

  const siteUrl = getSiteUrl(request);
  if (!siteUrl) {
    return NextResponse.json({ error: 'Não foi possível determinar a URL do site.' }, { status: 500 });
  }

  const cpf = String(user.user_metadata?.cpf || '').replace(/\D/g, '');

  const mpClient = new MercadoPagoConfig({ accessToken });
  const paymentApi = new Payment(mpClient);

  try {
    const created = await paymentApi.create({
      body: {
        transaction_amount: amount,
        description: 'Depósito de saldo - VotaDF',
        payment_method_id: 'pix',
        payer: {
          email: user.email || 'usuario@votadf.app',
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
            'Sua conta Mercado Pago ainda não está habilitada para gerar QR PIX neste ambiente. Ative o recebimento PIX/chave PIX na conta e tente novamente.',
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
            'A conta do Mercado Pago usada no token não possui chave PIX habilitada para QR. Ative o PIX na conta (produção) e tente novamente.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: getErrorMessage(error, 'Falha ao criar cobrança PIX.') }, { status: 500 });
  }
}
