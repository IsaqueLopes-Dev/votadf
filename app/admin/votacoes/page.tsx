'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import UiverseLoader from '../../components/uiverse-loader';

type PollCategory =
  | 'politica'
  | 'entretenimento'
  | 'esportes'
  | 'financeiro'
  | 'celebridades'
  | 'criptomoedas';

type PollType = 'opcoes-livres' | 'enquete-candidatos' | 'bitcoin-direcao';
type OpenStatusLabel = 'ao-vivo' | 'em-aberto';

type VotingOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
  imageFile?: File | null;
  imagePreview?: string;
};

type VotingItem = {
  id: string;
  title: string;
  description: string;
  category: PollCategory;
  pollType: PollType;
  openStatusLabel: OpenStatusLabel;
  closesAt: string;
  result: string;
  isActive: boolean;
  createdAt: string;
  options: VotingOption[];
};

type VotacoesResponse = {
  votacoes: VotingItem[];
  error?: string;
};

const SPORTS_OPTION_LABELS = ['CASA', 'X', 'FORA'] as const;
const BITCOIN_OPTION_LABELS = ['Sobe', 'Desce'] as const;

const CATEGORY_OPTIONS: Array<{ value: PollCategory; label: string }> = [
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'celebridades', label: 'Celebridades' },
  { value: 'criptomoedas', label: 'Criptomoedas' },
];

const emptyOption = (label = ''): VotingOption => ({
  label,
  imageUrl: '',
  odds: '',
  oddsNao: '',
  imageFile: null,
  imagePreview: '',
});

const toEditableOption = (option?: Partial<VotingOption>): VotingOption => ({
  label: String(option?.label || ''),
  imageUrl: String(option?.imageUrl || ''),
  odds: String(option?.odds || ''),
  oddsNao: String(option?.oddsNao || ''),
  imageFile: null,
  imagePreview: String(option?.imageUrl || ''),
});

const buildSportsOptions = (existingOptions: VotingOption[] = []) =>
  SPORTS_OPTION_LABELS.map((label, index) => {
    const current = existingOptions[index];
    return {
      label,
      imageUrl: String(current?.imageUrl || ''),
      odds: String(current?.odds || ''),
      oddsNao: String(current?.oddsNao || ''),
      imageFile: current?.imageFile || null,
      imagePreview: String(current?.imagePreview || current?.imageUrl || ''),
    };
  });

const buildBitcoinOptions = (existingOptions: VotingOption[] = []) =>
  BITCOIN_OPTION_LABELS.map((label, index) => {
    const current = existingOptions[index];
    return {
      label,
      imageUrl: String(current?.imageUrl || ''),
      odds: String(current?.odds || ''),
      oddsNao: String(current?.oddsNao || ''),
      imageFile: current?.imageFile || null,
      imagePreview: String(current?.imagePreview || current?.imageUrl || ''),
    };
  });

const createInitialForm = () => ({
  title: '',
  description: '',
  category: 'politica' as PollCategory,
  pollType: 'enquete-candidatos' as PollType,
  openStatusLabel: 'ao-vivo' as OpenStatusLabel,
  closesAt: '',
  result: '',
  isActive: true,
  options: [emptyOption(), emptyOption()],
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatDateTime = (value: string) => {
  if (!value) return 'Não definido';
  return new Date(value).toLocaleString('pt-BR');
};

const releasePreview = (url?: string) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const uploadVotingOptionImage = async (userId: string, option: VotingOption, index: number) => {
  if (!option.imageFile) {
    return option.imageUrl;
  }

  const originalName = option.imageFile.name || `opcao-${index + 1}.jpg`;
  const cleanName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `votacoes/${userId}/${Date.now()}-${index}-${cleanName}`;

  const { error } = await supabase.storage.from('avatars').upload(filePath, option.imageFile, {
    upsert: true,
    contentType: option.imageFile.type || 'image/jpeg',
  });

  if (error) {
    throw new Error(
      `Erro ao enviar imagem da opção ${index + 1}: ${error.message}. Verifique se o bucket avatars permite upload para usuários autenticados.`
    );
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return data.publicUrl;
};

export default function AdminVotacoesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyVotingId, setBusyVotingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [votacoes, setVotacoes] = useState<VotingItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [form, setForm] = useState(createInitialForm);

  const isSportsCategory = form.category === 'esportes';
  const isBitcoinMarket = form.pollType === 'bitcoin-direcao';

  const releaseFormPreviews = useCallback((options: VotingOption[]) => {
    options.forEach((option) => releasePreview(option.imagePreview));
  }, []);

  const loadVotacoes = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?next=/admin/votacoes');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch('/api/admin/votacoes', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json()) as VotacoesResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível carregar as votações.');
      }

      setVotacoes(payload.votacoes || []);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Erro ao carregar votações.'));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadVotacoes();
  }, [loadVotacoes]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadVotacoes();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadVotacoes]);

  useEffect(() => {
    return () => {
      releaseFormPreviews(form.options);
    };
  }, [form.options, releaseFormPreviews]);

  const filteredVotacoes = useMemo(() => {
    if (filter === 'active') return votacoes.filter((item) => item.isActive);
    if (filter === 'inactive') return votacoes.filter((item) => !item.isActive);
    return votacoes;
  }, [filter, votacoes]);

  const analytics = useMemo(() => {
    const now = Date.now();
    const active = votacoes.filter((item) => item.isActive);
    const closesSoon = active.filter((item) => {
      if (!item.closesAt) return false;
      const diff = new Date(item.closesAt).getTime() - now;
      return diff > 0 && diff <= 24 * 60 * 60 * 1000;
    });

    return {
      activeCount: active.length,
      closesSoon: closesSoon.length,
      noResult: votacoes.filter((item) => !item.result.trim()).length,
      avgOptions: votacoes.length ? votacoes.reduce((sum, item) => sum + item.options.length, 0) / votacoes.length : 0,
    };
  }, [votacoes]);

  const resetForm = useCallback(() => {
    releaseFormPreviews(form.options);
    setForm(createInitialForm());
    setEditingId(null);
    setFeedbackMessage('');
  }, [form.options, releaseFormPreviews]);

  const handleCategoryChange = (category: PollCategory) => {
    setForm((current) => {
      if (category === 'esportes') {
        return {
          ...current,
          category,
          pollType: 'opcoes-livres',
          result: SPORTS_OPTION_LABELS.includes(current.result as (typeof SPORTS_OPTION_LABELS)[number]) ? current.result : '',
          options: buildSportsOptions(current.options),
        };
      }

      if (current.pollType === 'bitcoin-direcao' && category !== 'criptomoedas') {
        return {
          ...current,
          category,
          pollType: 'opcoes-livres',
          options: current.options.length ? current.options : [emptyOption(), emptyOption()],
        };
      }

      return {
        ...current,
        category,
        options: current.options.length ? current.options : [emptyOption(), emptyOption()],
      };
    });
  };

  const handlePollTypeChange = (pollType: PollType) => {
    setForm((current) => {
      if (pollType === 'bitcoin-direcao') {
        return {
          ...current,
          category: 'criptomoedas',
          pollType,
          result: '',
          options: buildBitcoinOptions(current.options),
        };
      }

      return {
        ...current,
        pollType,
        options:
          current.pollType === 'bitcoin-direcao'
            ? [emptyOption(), emptyOption()]
            : current.options.length
              ? current.options
              : [emptyOption(), emptyOption()],
      };
    });
  };

  const handleOptionChange = (index: number, field: keyof VotingOption, value: string) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        if ((isSportsCategory || isBitcoinMarket) && field === 'label') return option;
        return { ...option, [field]: value };
      }),
    }));
  };

  const handleOptionImageChange = (index: number, file: File | null) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => {
        if (optionIndex !== index) return option;

        releasePreview(option.imagePreview);
        const nextPreview = file ? URL.createObjectURL(file) : option.imageUrl;

        return {
          ...option,
          imageFile: file,
          imagePreview: nextPreview,
        };
      }),
    }));
  };

  const clearOptionImage = (index: number) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        releasePreview(option.imagePreview);
        return {
          ...option,
          imageUrl: '',
          imageFile: null,
          imagePreview: '',
        };
      }),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setFeedbackMessage('');

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!user?.id || !session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const uploadedOptions = await Promise.all(
        form.options.map(async (option, index) => {
          const uploadedImageUrl = await uploadVotingOptionImage(user.id, option, index);
          return {
            label: option.label,
            imageUrl: uploadedImageUrl,
            odds: option.odds,
            oddsNao: option.oddsNao,
          };
        })
      );

      const endpoint = editingId ? `/api/admin/votacoes/${editingId}` : '/api/admin/votacoes';
      const method = editingId ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...form,
          pollType: form.category === 'esportes' ? 'opcoes-livres' : form.pollType,
          result: form.pollType === 'bitcoin-direcao' ? '' : form.result,
          options: uploadedOptions,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível salvar a votação.');
      }

      setFeedbackMessage(payload.message || 'Votação salva com sucesso.');
      resetForm();
      await loadVotacoes();
    } catch (error) {
      setFeedbackMessage(getErrorMessage(error, 'Não foi possível salvar a votação.'));
    } finally {
      setSaving(false);
    }
  };

  const runVotingAction = async (votingId: string, action: 'delete' | 'toggle') => {
    try {
      setBusyVotingId(votingId);
      setFeedbackMessage('');

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      if (action === 'delete') {
        const response = await fetch(`/api/admin/votacoes/${votingId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível excluir a votação.');
        }
      } else {
        const current = votacoes.find((item) => item.id === votingId);
        if (!current) return;

        const response = await fetch(`/api/admin/votacoes/${votingId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...current,
            isActive: !current.isActive,
            options: current.options.map((option) => ({
              label: option.label,
              imageUrl: option.imageUrl,
              odds: option.odds,
              oddsNao: option.oddsNao,
            })),
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível atualizar o status da votação.');
        }
      }

      await loadVotacoes();
      setFeedbackMessage(action === 'delete' ? 'Votação excluída com sucesso.' : 'Status da votação atualizado.');
    } catch (error) {
      setFeedbackMessage(getErrorMessage(error, 'Ação na votação falhou.'));
    } finally {
      setBusyVotingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <UiverseLoader label="Carregando votações..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Voltar ao dashboard
            </Link>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Votações</h1>
            <p className="mt-1 text-sm text-slate-300">Crie, edite e publique mercados com uma operação mais profissional.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="rounded-full bg-[linear-gradient(135deg,#00c3ff,#0099cc)] px-5 py-2.5 text-sm font-semibold text-[#03111f] transition hover:brightness-105"
          >
            Nova votação
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="grid gap-4 md:grid-cols-2 xl:col-span-2 xl:grid-cols-4">
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-cyan-300">Mercados ativos</p>
            <p className="mt-2 text-3xl font-bold text-white">{analytics.activeCount}</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-amber-300">Fecham em 24h</p>
            <p className="mt-2 text-3xl font-bold text-white">{analytics.closesSoon}</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-rose-300">Sem resultado</p>
            <p className="mt-2 text-3xl font-bold text-white">{analytics.noResult}</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-emerald-300">Média de opções</p>
            <p className="mt-2 text-3xl font-bold text-white">{analytics.avgOptions.toFixed(1)}</p>
          </div>
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,16,28,0.96),rgba(10,18,30,0.98))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                Configuração de mercado
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {editingId ? 'Editar votação' : 'Criar votação'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Defina conteúdo, categoria, publicação, odds e imagens das opções com upload direto.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Cancelar edição
              </button>
            )}
          </div>

          <div className="mt-6 space-y-5">
            <div className="grid gap-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-100">Título</label>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="Ex: Quem vence a eleição?"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-100">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(event) => handleCategoryChange(event.target.value as PollCategory)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="text-slate-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-100">Tipo de mercado</label>
                  <select
                    value={isSportsCategory ? 'opcoes-livres' : form.pollType}
                    disabled={isSportsCategory}
                    onChange={(event) => handlePollTypeChange(event.target.value as PollType)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="enquete-candidatos" className="text-slate-900">
                      Enquete com candidatos
                    </option>
                    <option value="opcoes-livres" className="text-slate-900">
                      Opções livres
                    </option>
                    <option value="bitcoin-direcao" className="text-slate-900">
                      Bitcoin - Direção
                    </option>
                  </select>
                </div>
              </div>

              {isSportsCategory && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  A categoria <strong>Esportes</strong> usa o modelo profissional <strong>CASA / X / FORA</strong>.
                  Você define manualmente as odds de cada cenário.
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-100">Descrição</label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="Contexto do mercado e o que define o resultado."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-100">Encerramento das apostas</label>
                  <input
                    type="datetime-local"
                    value={form.closesAt}
                    onChange={(event) => setForm((current) => ({ ...current, closesAt: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-100">Rótulo da votação aberta</label>
                  <select
                    value={form.openStatusLabel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, openStatusLabel: event.target.value as OpenStatusLabel }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="ao-vivo" className="text-slate-900">
                      Ao vivo
                    </option>
                    <option value="em-aberto" className="text-slate-900">
                      Em aberto
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-100">Resultado vencedor</label>
                  {isBitcoinMarket ? (
                    <input
                      value="Calculado automaticamente pela rodada"
                      disabled
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400 outline-none disabled:cursor-not-allowed disabled:opacity-80"
                    />
                  ) : isSportsCategory ? (
                    <select
                      value={form.result}
                      onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                    >
                      <option value="" className="text-slate-900">
                        Opcional
                      </option>
                      {SPORTS_OPTION_LABELS.map((label) => (
                        <option key={label} value={label} className="text-slate-900">
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={form.result}
                      onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                      placeholder="Opcional"
                    />
                  )}
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Publicar imediatamente como ativa
              </label>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Opções da votação</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {isSportsCategory
                      ? 'Modelo esportivo com três resultados fixos.'
                      : isBitcoinMarket
                        ? 'Mercado Bitcoin com duas direcoes fixas e liquidacao automatica.'
                        : 'Cadastre pelo menos duas opções e envie as imagens diretamente do seu computador.'}
                  </p>
                </div>

                {!isSportsCategory && !isBitcoinMarket && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        options: [...current.options, emptyOption()],
                      }))
                    }
                    className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
                  >
                    Adicionar opção
                  </button>
                )}
              </div>

              <div className="mt-5 space-y-4">
                {form.options.map((option, index) => {
                  const preview = option.imagePreview || option.imageUrl;

                  return (
                    <div key={index} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">Opção {index + 1}</p>
                        {!isSportsCategory && !isBitcoinMarket && form.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              releasePreview(option.imagePreview);
                              setForm((current) => ({
                                ...current,
                                options: current.options.filter((_, optionIndex) => optionIndex !== index),
                              }));
                            }}
                            className="rounded-full border border-rose-300/30 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/15"
                          >
                            Remover
                          </button>
                        )}
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                              Nome da opção
                            </label>
                            <input
                              value={option.label}
                              disabled={isSportsCategory || isBitcoinMarket}
                              onChange={(event) => handleOptionChange(index, 'label', event.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-80"
                              placeholder="Nome da opção"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                              Odd principal
                            </label>
                            <input
                              value={option.odds}
                              onChange={(event) => handleOptionChange(index, 'odds', event.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                              placeholder="Ex: 1.85"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                              Odd NÃO
                            </label>
                            <input
                              value={option.oddsNao}
                              onChange={(event) => handleOptionChange(index, 'oddsNao', event.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                              placeholder="Opcional"
                            />
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-dashed border-white/15 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                                Imagem da opção
                              </p>
                              <p className="mt-1 text-xs text-slate-500">Envio por upload, sem URL manual.</p>
                            </div>
                            {preview && (
                              <button
                                type="button"
                                onClick={() => clearOptionImage(index)}
                                className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
                              >
                                Limpar
                              </button>
                            )}
                          </div>

                          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center transition hover:bg-white/10">
                            {preview ? (
                              <div className="flex w-full flex-col items-center gap-3">
                                <div className="relative h-28 w-28 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                                  <Image
                                    src={preview}
                                    alt={option.label || `Opção ${index + 1}`}
                                    fill
                                    sizes="112px"
                                    className="object-cover"
                                    unoptimized
                                  />
                                </div>
                                <span className="text-xs font-medium text-slate-300">
                                  {option.imageFile ? option.imageFile.name : 'Imagem atual da opção'}
                                </span>
                                <span className="text-[11px] text-slate-500">Clique para substituir</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <div className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-300">
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 0 4 4m-4-4-4 4M4 16.5v1.25A2.25 2.25 0 0 0 6.25 20h11.5A2.25 2.25 0 0 0 20 17.75V16.5" />
                                  </svg>
                                </div>
                                <span className="text-sm font-medium text-slate-200">Selecionar imagem</span>
                                <span className="text-[11px] text-slate-500">PNG, JPG ou WEBP</span>
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => handleOptionImageChange(index, event.target.files?.[0] || null)}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {feedbackMessage && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                {feedbackMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[linear-gradient(135deg,#00c3ff,#0099cc)] px-5 py-3 text-sm font-semibold text-[#03111f] transition hover:brightness-105 disabled:opacity-60"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar votação'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Limpar formulário
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[34px] border border-cyan-500/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,rgba(10,14,24,0.98),rgba(15,23,42,0.98))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Mercados cadastrados</h2>
              <p className="mt-1 text-sm text-slate-300">Gerencie publicação, edição e remoção das votações criadas.</p>
            </div>

            <div className="flex gap-2">
              {[
                { value: 'all', label: 'Todas' },
                { value: 'active', label: 'Ativas' },
                { value: 'inactive', label: 'Inativas' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value as 'all' | 'active' | 'inactive')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filter === option.value
                      ? 'bg-cyan-600 text-white'
                      : 'border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {errorMessage && <p className="mt-4 text-sm text-rose-600">{errorMessage}</p>}

          <div className="mt-6 space-y-4">
            {filteredVotacoes.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
                Nenhuma votação encontrada para o filtro atual.
              </div>
            )}

            {filteredVotacoes.map((item) => {
              const isBusy = busyVotingId === item.id;

              return (
                <div key={item.id} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {item.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                        <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">
                          {CATEGORY_OPTIONS.find((option) => option.value === item.category)?.label || item.category}
                        </span>
                        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300">
                          {item.pollType === 'enquete-candidatos'
                            ? 'Enquete com candidatos'
                            : item.pollType === 'bitcoin-direcao'
                              ? 'Bitcoin - Direção'
                              : 'Opções livres'}
                        </span>
                        <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">
                          {item.openStatusLabel === 'em-aberto' ? 'Em aberto' : 'Ao vivo'}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{item.description}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                        <span>Criada em {formatDateTime(item.createdAt)}</span>
                        <span>Encerra em {item.closesAt ? formatDateTime(item.closesAt) : 'Não definido'}</span>
                        <span>Resultado: {item.result || 'Não definido'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          releaseFormPreviews(form.options);
                          const loadedOptions = item.category === 'esportes'
                            ? buildSportsOptions(item.options.map((option) => toEditableOption(option)))
                            : (item.options.length ? item.options.map((option) => toEditableOption(option)) : [emptyOption(), emptyOption()]);

                          setEditingId(item.id);
                          setForm({
                            title: item.title,
                            description: item.description,
                            category: item.category,
                            pollType: item.category === 'esportes' ? 'opcoes-livres' : item.pollType,
                            openStatusLabel: item.openStatusLabel,
                            closesAt: item.closesAt ? item.closesAt.slice(0, 16) : '',
                            result: item.pollType === 'bitcoin-direcao' ? '' : item.result,
                            isActive: item.isActive,
                            options:
                              item.pollType === 'bitcoin-direcao'
                                ? buildBitcoinOptions(loadedOptions)
                                : loadedOptions,
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runVotingAction(item.id, 'toggle')}
                        className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-60"
                      >
                        {item.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (window.confirm(`Excluir a votação "${item.title}"? Essa ação é irreversível.`)) {
                            void runVotingAction(item.id, 'delete');
                          }
                        }}
                        className="rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-60"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-[24px] border border-white/10 bg-black/10 p-4">
                    {item.options.map((option, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {option.imageUrl ? (
                            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-sm">
                              <Image
                                src={option.imageUrl}
                                alt={option.label || `Opção ${index + 1}`}
                                fill
                                sizes="64px"
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.04] text-[11px] font-semibold text-slate-400">
                              IMG
                            </div>
                          )}

                          <div>
                            <p className="text-sm font-semibold text-white">{option.label || `Opção ${index + 1}`}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {item.isActive ? 'Votação aberta' : 'Votação cadastrada'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {option.odds && (
                            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-semibold text-emerald-300">
                              Odd {option.odds}x
                            </span>
                          )}
                          {option.oddsNao && (
                            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 font-semibold text-rose-300">
                              Odd não {option.oddsNao}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
