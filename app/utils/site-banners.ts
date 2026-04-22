export const SITE_BANNERS_BUCKET = 'avatars';
export const HOME_MARKETS_BANNER_MANIFEST_PATH = 'site-settings/home-markets-banner.json';
export const HOME_MARKETS_BANNER_UPLOAD_PREFIX = 'site-banners/home-markets';

export type HomeMarketsBannerConfig = {
  isActive: boolean;
  desktopImageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  altText: string;
  updatedAt: string;
};

export const createEmptyHomeMarketsBannerConfig = (): HomeMarketsBannerConfig => ({
  isActive: false,
  desktopImageUrl: '',
  mobileImageUrl: '',
  targetUrl: '',
  altText: '',
  updatedAt: '',
});

export const normalizeHomeMarketsBannerConfig = (
  input: unknown
): HomeMarketsBannerConfig => {
  if (!input || typeof input !== 'object') {
    return createEmptyHomeMarketsBannerConfig();
  }

  const record = input as Record<string, unknown>;

  return {
    isActive: record.isActive === true,
    desktopImageUrl: String(record.desktopImageUrl || '').trim(),
    mobileImageUrl: String(record.mobileImageUrl || '').trim(),
    targetUrl: String(record.targetUrl || '').trim(),
    altText: String(record.altText || '').trim(),
    updatedAt: String(record.updatedAt || '').trim(),
  };
};

export const hasHomeMarketsBannerAsset = (config: HomeMarketsBannerConfig) =>
  Boolean(config.desktopImageUrl || config.mobileImageUrl);

