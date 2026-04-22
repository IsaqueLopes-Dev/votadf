'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import UiverseLoader from '../../components/uiverse-loader';
import HomeMarketsBanner from '../../components/home-markets-banner';
import {
  createEmptyHomeMarketsBannerConfig,
  HOME_MARKETS_BANNER_UPLOAD_PREFIX,
  normalizeHomeMarketsBannerConfig,
  SITE_BANNERS_BUCKET,
} from '../../utils/site-banners';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const DESKTOP_BANNER_RECOMMENDED_WIDTH = 1600;
const DESKTOP_BANNER_RECOMMENDED_HEIGHT = 600;
const MOBILE_BANNER_RECOMMENDED_WIDTH = 1080;
const MOBILE_BANNER_RECOMMENDED_HEIGHT = 1350;

const buildUploadPath = (userId: string, suffix: string, file: File) => {
  const safeName = (file.name || suffix).replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${HOME_MARKETS_BANNER_UPLOAD_PREFIX}/${userId}/${Date.now()}-${suffix}-${safeName}`;
};

const releasePreview = (value?: string) => {
  if (value?.startsWith('blob:')) {
    URL.revokeObjectURL(value);
  }
};

const hasSelectedAsset = (previewUrl: string, storedUrl: string, selectedFile: File | null) =>
  Boolean(selectedFile || previewUrl || storedUrl);

export default function AdminBannersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [desktopImageUrl, setDesktopImageUrl] = useState('');
  const [mobileImageUrl, setMobileImageUrl] = useState('');
  const [desktopPreviewUrl, setDesktopPreviewUrl] = useState('');
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState('');
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);

  useEffect(() => {
    return () => {
      releasePreview(desktopPreviewUrl);
      releasePreview(mobilePreviewUrl);
    };
  }, [desktopPreviewUrl, mobilePreviewUrl]);

  useEffect(() => {
    const loadBanner = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?next=/admin/banners');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('Sessão administrativa não encontrada.');
        }

        const response = await fetch('/api/admin/banners', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json()) as {
          banner?: ReturnType<typeof createEmptyHomeMarketsBannerConfig>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível carregar o banner da home.');
        }

        const banner = normalizeHomeMarketsBannerConfig(payload.banner);
        setIsActive(banner.isActive);
        setTargetUrl(banner.targetUrl);
        setAltText(banner.altText);
        setDesktopImageUrl(banner.desktopImageUrl);
        setMobileImageUrl(banner.mobileImageUrl);
        setDesktopPreviewUrl(banner.desktopImageUrl);
        setMobilePreviewUrl(banner.mobileImageUrl);
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Erro ao carregar os banners.'));
      } finally {
        setLoading(false);
      }
    };

    void loadBanner();
  }, [router]);

  const previewBanner = useMemo(
    () =>
      normalizeHomeMarketsBannerConfig({
        isActive,
        targetUrl,
        altText,
        desktopImageUrl: desktopPreviewUrl || desktopImageUrl,
        mobileImageUrl: mobilePreviewUrl || mobileImageUrl,
      }),
    [altText, desktopImageUrl, desktopPreviewUrl, isActive, mobileImageUrl, mobilePreviewUrl, targetUrl]
  );

  const updateDesktopFile = (file: File | null) => {
    releasePreview(desktopPreviewUrl);
    setDesktopFile(file);
    setDesktopPreviewUrl(file ? URL.createObjectURL(file) : desktopImageUrl);
  };

  const updateMobileFile = (file: File | null) => {
    releasePreview(mobilePreviewUrl);
    setMobileFile(file);
    setMobilePreviewUrl(file ? URL.createObjectURL(file) : mobileImageUrl);
  };

  const clearDesktopBanner = () => {
    releasePreview(desktopPreviewUrl);
    setDesktopFile(null);
    setDesktopImageUrl('');
    setDesktopPreviewUrl('');
  };

  const clearMobileBanner = () => {
    releasePreview(mobilePreviewUrl);
    setMobileFile(null);
    setMobileImageUrl('');
    setMobilePreviewUrl('');
  };

  const uploadAssetIfNeeded = async (
    userId: string,
    existingUrl: string,
    file: File | null,
    suffix: string
  ) => {
    if (!file) {
      return existingUrl;
    }

    const filePath = buildUploadPath(userId, suffix, file);
    const { error: uploadError } = await supabase.storage
      .from(SITE_BANNERS_BUCKET)
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(SITE_BANNERS_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!user || !session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const nextDesktopUrl = await uploadAssetIfNeeded(
        user.id,
        desktopImageUrl,
        desktopFile,
        'desktop'
      );
      const nextMobileUrl = await uploadAssetIfNeeded(
        user.id,
        mobileImageUrl,
        mobileFile,
        'mobile'
      );

      const response = await fetch('/api/admin/banners', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          isActive,
          targetUrl,
          altText,
          desktopImageUrl: nextDesktopUrl,
          mobileImageUrl: nextMobileUrl,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível salvar os banners.');
      }

      setDesktopImageUrl(nextDesktopUrl);
      setMobileImageUrl(nextMobileUrl);
      setDesktopFile(null);
      setMobileFile(null);
      setDesktopPreviewUrl(nextDesktopUrl);
      setMobilePreviewUrl(nextMobileUrl);
      setFeedback(payload.message || 'Banner salvo com sucesso.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Erro ao salvar o banner.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <UiverseLoader label="Carregando banners..." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Administração</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Banners da home</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Esse banner será exibido exatamente abaixo do título “Mercados ativos” e acima dos filtros de categorias.
          </p>
          <p className="mt-2 max-w-2xl text-xs font-medium text-cyan-200/90">
            Desktop recomendado: {DESKTOP_BANNER_RECOMMENDED_WIDTH}x{DESKTOP_BANNER_RECOMMENDED_HEIGHT}px.
            Mobile recomendado: {MOBILE_BANNER_RECOMMENDED_WIDTH}x{MOBILE_BANNER_RECOMMENDED_HEIGHT}px.
          </p>
        </div>

        <Link
          href="/admin"
          className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
        >
          Voltar ao painel
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Configuração do banner</h2>
              <p className="mt-1 text-sm text-slate-300">
                Cadastre uma arte para desktop e outra para mobile. Se quiser, você também pode definir um link de destino.
              </p>
            </div>

            <label className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/15 px-4 py-2 text-sm font-semibold text-white">
              <span>Ativo</span>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
              <p className="text-sm font-semibold text-white">Banner desktop</p>
              <p className="mt-1 text-xs text-slate-400">
                Usado em telas maiores, com destaque horizontal.
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                Altura recomendada: {DESKTOP_BANNER_RECOMMENDED_HEIGHT}px
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tamanho sugerido: {DESKTOP_BANNER_RECOMMENDED_WIDTH}x{DESKTOP_BANNER_RECOMMENDED_HEIGHT}px
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => updateDesktopFile(event.target.files?.[0] || null)}
                className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950 hover:file:bg-cyan-300"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearDesktopBanner}
                  disabled={!hasSelectedAsset(desktopPreviewUrl, desktopImageUrl, desktopFile)}
                  className="rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Excluir banner desktop
                </button>
              </div>
              {desktopPreviewUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-slate-400">
                    <span>Prévia desktop</span>
                    <span>Molde de altura horizontal</span>
                  </div>
                  <div className="relative aspect-[8/3] w-full overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={desktopPreviewUrl} alt="Prévia desktop" className="block h-full w-full object-cover" />
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
                  Nenhuma arte desktop enviada.
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
              <p className="text-sm font-semibold text-white">Banner mobile</p>
              <p className="mt-1 text-xs text-slate-400">
                Usado em celular para manter leitura e proporção corretas.
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                Altura recomendada: {MOBILE_BANNER_RECOMMENDED_HEIGHT}px
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tamanho sugerido: {MOBILE_BANNER_RECOMMENDED_WIDTH}x{MOBILE_BANNER_RECOMMENDED_HEIGHT}px
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => updateMobileFile(event.target.files?.[0] || null)}
                className="mt-4 block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950 hover:file:bg-cyan-300"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearMobileBanner}
                  disabled={!hasSelectedAsset(mobilePreviewUrl, mobileImageUrl, mobileFile)}
                  className="rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Excluir banner mobile
                </button>
              </div>
              {mobilePreviewUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-slate-400">
                    <span>Prévia mobile</span>
                    <span>Molde de altura vertical</span>
                  </div>
                  <div className="relative mx-auto aspect-[4/5] max-w-[280px] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mobilePreviewUrl} alt="Prévia mobile" className="block h-full w-full object-cover" />
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
                  Nenhuma arte mobile enviada.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Link do banner</span>
              <input
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="Ex: /mercados ou https://..."
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Texto alternativo</span>
              <input
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="Ex: Promoção da rodada de mercados"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          {(feedback || error) && (
            <div
              className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
                error
                  ? 'border border-rose-400/20 bg-rose-500/10 text-rose-200'
                  : 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              {error || feedback}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-full bg-[linear-gradient(135deg,#22d3ee_0%,#2563eb_58%,#1d4ed8_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_20px_45px_-20px_rgba(37,99,235,0.75)] transition hover:brightness-110 disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar banners'}
            </button>
          </div>
        </section>

        <aside className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
          <h2 className="text-xl font-semibold text-white">Prévia da posição</h2>
          <p className="mt-1 text-sm text-slate-300">
            A prévia abaixo simula o lugar exato em que o banner ficará na home.
          </p>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-[#071120]/90 p-4">
            <section className="text-center text-white">
              <div>
                <h2 className="text-3xl font-bold leading-tight">Mercados ativos</h2>
                <p className="mt-4 text-sm leading-7 text-cyan-200">
                  Acompanhe os mercados em aberto, compare as principais opções e acesse os detalhes completos de cada votação.
                </p>
              </div>
            </section>

            <div className="mt-6">
              <HomeMarketsBanner banner={previewBanner} />
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-400">
              Depois do banner entram os filtros e a grade de mercados.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
