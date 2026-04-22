import { NextResponse } from 'next/server';
import { ensureAdminRequest } from '../utils';
import {
  createEmptyHomeMarketsBannerConfig,
  HOME_MARKETS_BANNER_MANIFEST_PATH,
  normalizeHomeMarketsBannerConfig,
  SITE_BANNERS_BUCKET,
} from '../../../utils/site-banners';

type BannerPayload = {
  isActive?: unknown;
  desktopImageUrl?: unknown;
  mobileImageUrl?: unknown;
  targetUrl?: unknown;
  altText?: unknown;
};

const readHomeMarketsBannerConfig = async (
  supabaseAdmin: Awaited<ReturnType<typeof ensureAdminRequest>>['supabaseAdmin']
) => {
  const { data, error } = await supabaseAdmin.storage
    .from(SITE_BANNERS_BUCKET)
    .download(HOME_MARKETS_BANNER_MANIFEST_PATH);

  if (error) {
    const message = String(error.message || '').toLowerCase();

    if (message.includes('not found') || message.includes('no such object')) {
      return createEmptyHomeMarketsBannerConfig();
    }

    throw new Error(error.message);
  }

  const rawText = await data.text();

  if (!rawText.trim()) {
    return createEmptyHomeMarketsBannerConfig();
  }

  try {
    return normalizeHomeMarketsBannerConfig(JSON.parse(rawText));
  } catch {
    return createEmptyHomeMarketsBannerConfig();
  }
};

const validatePayload = (payload: BannerPayload) => {
  const config = normalizeHomeMarketsBannerConfig({
    isActive: payload.isActive,
    desktopImageUrl: payload.desktopImageUrl,
    mobileImageUrl: payload.mobileImageUrl,
    targetUrl: payload.targetUrl,
    altText: payload.altText,
    updatedAt: new Date().toISOString(),
  });

  if (config.isActive && !config.desktopImageUrl && !config.mobileImageUrl) {
    return { error: 'Envie pelo menos um banner para ativar a vitrine.' as const };
  }

  return { config };
};

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const banner = await readHomeMarketsBannerConfig(supabaseAdmin);

    return NextResponse.json({ banner });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a configuração dos banners.',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const payload = (await request.json()) as BannerPayload;
    const validation = validatePayload(payload);

    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const serialized = JSON.stringify(validation.config, null, 2);
    const file = new Blob([serialized], { type: 'application/json; charset=utf-8' });

    const { error } = await supabaseAdmin.storage
      .from(SITE_BANNERS_BUCKET)
      .upload(HOME_MARKETS_BANNER_MANIFEST_PATH, file, {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
      });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      banner: validation.config,
      message: 'Banner da home salvo com sucesso.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar a configuração dos banners.',
      },
      { status: 500 }
    );
  }
}

