import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../admin/utils';
import {
  createEmptyHomeMarketsBannerConfig,
  HOME_MARKETS_BANNER_MANIFEST_PATH,
  normalizeHomeMarketsBannerConfig,
  SITE_BANNERS_BUCKET,
} from '../../utils/site-banners';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseAdmin = getAdminSupabase();

    const { data, error } = await supabaseAdmin.storage
      .from(SITE_BANNERS_BUCKET)
      .download(HOME_MARKETS_BANNER_MANIFEST_PATH);

    if (error) {
      const message = String(error.message || '').toLowerCase();

      if (message.includes('not found') || message.includes('no such object')) {
        return NextResponse.json({ banner: createEmptyHomeMarketsBannerConfig() });
      }

      throw new Error(error.message);
    }

    const rawText = await data.text();

    if (!rawText.trim()) {
      return NextResponse.json({ banner: createEmptyHomeMarketsBannerConfig() });
    }

    return NextResponse.json({ banner: normalizeHomeMarketsBannerConfig(JSON.parse(rawText)) });
  } catch {
    return NextResponse.json({ banner: createEmptyHomeMarketsBannerConfig() });
  }
}

