import {
  hasHomeMarketsBannerAsset,
  type HomeMarketsBannerConfig,
} from '../utils/site-banners';

type HomeMarketsBannerProps = {
  banner: HomeMarketsBannerConfig;
};

export default function HomeMarketsBanner({ banner }: HomeMarketsBannerProps) {
  if (!banner.isActive || !hasHomeMarketsBannerAsset(banner)) {
    return null;
  }

  const imageAlt = banner.altText || 'Banner dos mercados ativos';
  const imageSrc = banner.desktopImageUrl || banner.mobileImageUrl;

  const content = (
    <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] shadow-[0_30px_80px_-40px_rgba(2,6,23,0.9)]">
      <picture className="block h-[170px] w-full sm:h-[190px] md:h-[210px] lg:h-[230px] xl:h-[250px]">
        {banner.mobileImageUrl ? <source media="(max-width: 767px)" srcSet={banner.mobileImageUrl} /> : null}
        <img
          src={imageSrc}
          alt={imageAlt}
          className="block h-full w-full object-cover"
        />
      </picture>
    </div>
  );

  if (banner.targetUrl) {
    return (
      <a
        href={banner.targetUrl}
        className="block transition hover:scale-[1.01]"
      >
        {content}
      </a>
    );
  }

  return content;
}
