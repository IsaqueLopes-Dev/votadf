'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';

const META_PREFIX = '__meta__:';
const CATEGORY_OPTIONS = [
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'futebol', label: 'Futebol' },
] as const;

type PollType = 'opcoes-livres' | 'enquete-candidatos';
type PollCategory = 'politica' | 'entretenimento' | 'futebol' | '';

type PollMetadata = {
  tipo: PollType;
  categoria: PollCategory;
  encerramentoAposta: string;
  descricaoLimpa: string;
};

type PollOptionFormItem = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

type VotingFormState = {
  tipo: PollType;
  categoria: PollCategory;
  encerramentoAposta: string;
  titulo: string;
  descricao: string;
  opcoes: PollOptionFormItem[];
};

type VotingRecord = {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: string[];
  ativa: boolean;
};

const createEmptyOption = (): PollOptionFormItem => ({ label: '', imageUrl: '', odds: '', oddsNao: '' });

const serializePollOption = (option: PollOptionFormItem) => {
  const oddsValue = parseFloat(option.odds);
  const oddsNaoValue = parseFloat(option.oddsNao);
  return JSON.stringify({
    label: option.label.trim(),
    imageUrl: option.imageUrl.trim(),
    odds: Number.isFinite(oddsValue) && oddsValue > 0 ? oddsValue : null,
    oddsNao: Number.isFinite(oddsNaoValue) && oddsNaoValue > 0 ? oddsNaoValue : null,
  });
};

const parsePollOption = (option: unknown): PollOptionFormItem => {
  if (typeof option !== 'string') {
    return createEmptyOption();
  }

  try {
    const parsed = JSON.parse(option) as Partial<
      PollOptionFormItem & { odds: number | null; oddsNao: number | null; image_url: string; image: string; avatarUrl: string }
    >;
    if (typeof parsed.label === 'string') {
      return {
        label: parsed.label,
        imageUrl:
          typeof parsed.imageUrl === 'string'
            ? parsed.imageUrl
            : typeof parsed.image_url === 'string'
              ? parsed.image_url
              : typeof parsed.image === 'string'
                ? parsed.image
                : typeof parsed.avatarUrl === 'string'
                  ? parsed.avatarUrl
                  : '',
        odds: parsed.odds != null && Number.isFinite(Number(parsed.odds)) ? String(parsed.odds) : '',
        oddsNao: parsed.oddsNao != null && Number.isFinite(Number(parsed.oddsNao)) ? String(parsed.oddsNao) : '',
      };
    }
  } catch {
    // Mantém compatibilidade com votações antigas salvas como texto puro.
  }

  return {
    label: option,
    imageUrl: '',
    odds: '',
    oddsNao: '',
  };
};

const parsePollMetadata = (descricao: string | null | undefined): PollMetadata => {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as Partial<PollMetadata> & {
        encerramentoAposta?: string;
        bettingClosesAt?: string;
      };
      return {
        tipo: parsed.tipo === 'enquete-candidatos' ? 'enquete-candidatos' : 'opcoes-livres',
        categoria:
          parsed.categoria === 'politica' || parsed.categoria === 'entretenimento' || parsed.categoria === 'futebol'
            ? parsed.categoria
            : '',
        encerramentoAposta: String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim(),
        descricaoLimpa: cleanDescription,
      } satisfies PollMetadata;
    } catch {
      return {
        tipo: 'opcoes-livres',
        categoria: '',
        encerramentoAposta: '',
        descricaoLimpa: cleanDescription,
      } satisfies PollMetadata;
    }
  }

  if (rawDescription.startsWith('__tipo__:enquete-candidatos\n')) {
    return {
      tipo: 'enquete-candidatos' as const,
      categoria: '' as PollCategory,
      encerramentoAposta: '',
      descricaoLimpa: rawDescription.replace('__tipo__:enquete-candidatos\n', ''),
    };
  }

  return {
    tipo: 'opcoes-livres' as const,
    categoria: '' as PollCategory,
    encerramentoAposta: '',
    descricaoLimpa: rawDescription,
  };
};

const buildDescricaoWithMetadata = (
  tipo: PollType,
  categoria: Exclude<PollCategory, ''>,
  encerramentoAposta: string,
  descricao: string
) => {
  const metadata = JSON.stringify({ tipo, categoria, encerramentoAposta });
  return `${META_PREFIX}${metadata}\n${descricao}`;
};

const isoToDateTimeLocal = (isoValue: string) => {
  if (!isoValue) return '';

  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const dateTimeLocalToIso = (localValue: string) => {
  if (!localValue) return '';
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const getCategoryLabel = (categoria: string) => {
  return CATEGORY_OPTIONS.find((option) => option.value === categoria)?.label || 'Sem categoria';
};

const createEmptyFormData = (): VotingFormState => ({
  tipo: 'opcoes-livres',
  categoria: '',
  encerramentoAposta: '',
  titulo: '',
  descricao: '',
  opcoes: [createEmptyOption(), createEmptyOption()],
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Erro inesperado.';
};

type ToastState = { message: string; type: 'success' | 'error' } | null;

export default function VotacoesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [votacoes, setVotacoes] = useState<VotingRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingVotacaoId, setEditingVotacaoId] = useState<string | null>(null);
  const [formData, setFormData] = useState<VotingFormState>(createEmptyFormData());
  const [submitting, setSubmitting] = useState(false);
  const [uploadingOptionIndex, setUploadingOptionIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const showToast = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login');
          return;
        }

        setUser(user);

        const { data, error } = await supabase
          .from('votacoes')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setVotacoes((data || []) as VotingRecord[]);
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        showToast(getErrorMessage(error), 'error');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();
  }, [router]);

  const loadVotacoes = async () => {
    try {
      const { data, error } = await supabase
        .from('votacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar votações:', error);
        return;
      }

      setVotacoes((data || []) as VotingRecord[]);
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  const resetForm = () => {
    setFormData(createEmptyFormData());
    setEditingVotacaoId(null);
    setShowForm(false);
  };

  const handleAddOpcao = () => {
    setFormData({
      ...formData,
      opcoes: [...formData.opcoes, createEmptyOption()],
    });
  };

  const handleRemoveOpcao = (index: number) => {
    setFormData({
      ...formData,
      opcoes: formData.opcoes.filter((_, i) => i !== index),
    });
  };

  const handleOpcaoChange = (index: number, value: string) => {
    const newOpcoes = [...formData.opcoes];
    newOpcoes[index] = {
      ...newOpcoes[index],
      label: value,
    };
    setFormData({ ...formData, opcoes: newOpcoes });
  };

  const handleOptionImageUpload = async (index: number, file: File) => {
    if (!user?.id) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Formato inválido. Use JPG, PNG ou WEBP.', 'error');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      showToast('Arquivo muito grande. Use uma imagem de até 4MB.', 'error');
      return;
    }

    setUploadingOptionIndex(index);
    try {
      const extension = file.name.split('.').pop() || 'jpg';
      const filePath = `poll-options/${user.id}/${Date.now()}-${index}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        showToast(`Erro ao enviar imagem: ${uploadError.message}`, 'error');
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const nextOptions = [...formData.opcoes];
      nextOptions[index] = {
        ...nextOptions[index],
        imageUrl: data.publicUrl,
      };
      setFormData({ ...formData, opcoes: nextOptions });
    } catch (error) {
      showToast(`Erro ao enviar imagem: ${getErrorMessage(error)}`, 'error');
    } finally {
      setUploadingOptionIndex(null);
    }
  };

  const handleRemoveOptionImage = (index: number) => {
    const nextOptions = [...formData.opcoes];
    nextOptions[index] = {
      ...nextOptions[index],
      imageUrl: '',
    };
    setFormData({ ...formData, opcoes: nextOptions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const opcoesFiltradas = formData.opcoes
        .map((option) => ({
          label: option.label.trim(),
          imageUrl: option.imageUrl.trim(),
          odds: option.odds.trim(),
          oddsNao: option.oddsNao.trim(),
        }))
        .filter((option) => option.label !== '');

      if (!formData.categoria) {
        showToast('Selecione uma categoria para a votação.', 'error');
        setSubmitting(false);
        return;
      }

      const encerramentoApostaIso = dateTimeLocalToIso(formData.encerramentoAposta);
      if (!encerramentoApostaIso) {
        showToast('Informe uma data e hora válidas para encerrar as apostas.', 'error');
        setSubmitting(false);
        return;
      }

      if (!formData.titulo.trim() || opcoesFiltradas.length < 2) {
        showToast(
          formData.tipo === 'enquete-candidatos'
            ? 'Preencha o título e pelo menos 2 candidatos!'
            : 'Preencha o título e pelo menos 2 opções!',
          'error'
        );
        setSubmitting(false);
        return;
      }

      const payload = {
        titulo: formData.titulo,
        descricao: buildDescricaoWithMetadata(
          formData.tipo,
          formData.categoria as Exclude<PollCategory, ''>,
          encerramentoApostaIso,
          formData.descricao
        ),
        opcoes: opcoesFiltradas.map(serializePollOption),
      };

      const { data, error } = editingVotacaoId
        ? await supabase
            .from('votacoes')
            .update(payload)
            .eq('id', editingVotacaoId)
            .select()
        : await supabase
            .from('votacoes')
            .insert([
              {
                ...payload,
                ativa: true,
              },
            ])
            .select();

      if (error) {
        showToast(`Erro ao ${editingVotacaoId ? 'salvar' : 'criar'} votação: ` + error.message, 'error');
        return;
      }

      if (!data) {
        showToast('Nenhum dado foi retornado pela atualização da votação.', 'error');
        return;
      }

      showToast(editingVotacaoId ? 'Votação atualizada com sucesso!' : 'Votação criada com sucesso!');
      resetForm();
      await loadVotacoes();
    } catch (error) {
      showToast('Erro: ' + getErrorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAtiva = async (id: string, ativa: boolean) => {
    try {
      const { error } = await supabase
        .from('votacoes')
        .update({ ativa: !ativa })
        .eq('id', id);

      if (error) {
        showToast('Erro ao atualizar: ' + error.message, 'error');
        return;
      }

      await loadVotacoes();
    } catch (error) {
      showToast('Erro: ' + getErrorMessage(error), 'error');
    }
  };

  const handleEditVotacao = (votacao: VotingRecord) => {
    const metadata = parsePollMetadata(votacao.descricao);
    const parsedOptions = Array.isArray(votacao.opcoes)
      ? votacao.opcoes.map((option: unknown) => parsePollOption(option))
      : [createEmptyOption(), createEmptyOption()];

    setEditingVotacaoId(votacao.id);
    setFormData({
      tipo: metadata.tipo,
      categoria: metadata.categoria as PollCategory,
      encerramentoAposta: isoToDateTimeLocal(metadata.encerramentoAposta),
      titulo: votacao.titulo || '',
      descricao: metadata.descricaoLimpa || '',
      opcoes: parsedOptions.length >= 2 ? parsedOptions : [createEmptyOption(), createEmptyOption()],
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 flex items-center justify-center" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      {/* Header */}
      <header className="bg-blue-600 shadow-md">
        <div className="flex w-full items-center gap-4 py-4">
          <Link href="/admin" className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Administração</p>
            <h1 className="text-2xl font-bold text-white">Votações</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-0 py-6 sm:py-10">
        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm mb-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Votações</h2>
            <button
              onClick={() => {
                if (showForm) {
                  resetForm();
                  return;
                }

                setEditingVotacaoId(null);
                setFormData(createEmptyFormData());
                setShowForm(true);
              }}
              className="rounded-full bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition font-medium"
            >
              {showForm ? 'Cancelar' : '+ Nova Votação'}
            </button>
          </div>

          {/* Form Nova Votação */}
          {showForm && (
            <form onSubmit={handleSubmit} className="mb-8 rounded-2xl border border-blue-100 bg-blue-50/40 p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingVotacaoId ? 'Editar Votação' : 'Criar Nova Votação'}
                </h3>
                {editingVotacaoId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">Formato da votação</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo: 'opcoes-livres', opcoes: [createEmptyOption(), createEmptyOption()] })}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      formData.tipo === 'opcoes-livres'
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
                    }`}
                  >
                    <p className="font-semibold">Opções livres</p>
                    <p className="mt-1 text-xs">Ex.: Candidato A, Candidato B, Nulo</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo: 'enquete-candidatos', opcoes: [createEmptyOption(), createEmptyOption()] })}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      formData.tipo === 'enquete-candidatos'
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
                    }`}
                  >
                    <p className="font-semibold">Enquete por candidato</p>
                    <p className="mt-1 text-xs">Cada candidato recebe sua própria odd</p>
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">Categoria</label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value as PollCategory })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione uma categoria</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">Título</label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  placeholder="Ex: Quem vencerá as eleições?"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">Data e hora de encerramento das apostas</label>
                <input
                  type="datetime-local"
                  value={formData.encerramentoAposta}
                  onChange={(e) => setFormData({ ...formData, encerramentoAposta: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-slate-500">Após este horário, novos palpites serão bloqueados para usuários e visitantes.</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-900 mb-2">Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descreva a votação..."
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-900 mb-3">
                  {formData.tipo === 'enquete-candidatos' ? 'Candidatos' : 'Opções'}
                </label>
                <div className="space-y-2">
                  {formData.opcoes.map((opcao, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex gap-3">
                        <div className="shrink-0">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                            {opcao.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={opcao.imageUrl} alt={opcao.label || `Opcao ${index + 1}`} className="h-full w-full object-cover" />
                            ) : (
                              <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <circle cx="12" cy="8" r="4" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                              </svg>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={opcao.label}
                            onChange={(e) => handleOpcaoChange(index, e.target.value)}
                            placeholder={formData.tipo === 'enquete-candidatos' ? `Candidato ${index + 1}` : `Opção ${index + 1}`}
                            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {formData.tipo === 'enquete-candidatos' && (
                            <div className="flex gap-2">
                              <div className="flex flex-1 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <span className="shrink-0 text-xs font-semibold text-emerald-700">Odd</span>
                                <input
                                  type="number"
                                  min="1.01"
                                  step="0.01"
                                  value={opcao.odds}
                                  onChange={(e) => {
                                    const next = [...formData.opcoes];
                                    next[index] = { ...next[index], odds: e.target.value };
                                    setFormData({ ...formData, opcoes: next });
                                  }}
                                  placeholder="1.80"
                                  className="w-full bg-transparent text-center text-sm font-bold text-emerald-800 outline-none placeholder-emerald-400"
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                              {uploadingOptionIndex === index ? 'Enviando...' : 'Adicionar foto'}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) {
                                    void handleOptionImageUpload(index, file);
                                    event.currentTarget.value = '';
                                  }
                                }}
                              />
                            </label>

                            {opcao.imageUrl && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOptionImage(index)}
                                className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                              >
                                Remover foto
                              </button>
                            )}

                            {formData.opcoes.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOpcao(index)}
                                className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                              >
                                Remover opção
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddOpcao}
                  className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  {formData.tipo === 'enquete-candidatos' ? '+ Adicionar candidato' : '+ Adicionar opção'}
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submitting ? (editingVotacaoId ? 'Salvando...' : 'Criando...') : (editingVotacaoId ? 'Salvar alterações' : 'Criar Votação')}
              </button>
            </form>
          )}

          {/* Lista de Votações */}
          {votacoes.length > 0 ? (
            <div className="space-y-4">
              {votacoes.map((votacao) => (
                <div key={votacao.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {(() => {
                        const metadata = parsePollMetadata(votacao.descricao);

                        return (
                          <>
                            <div className="mb-2 flex items-center gap-2">
                              <h3 className="font-semibold text-slate-900">{votacao.titulo}</h3>
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                {getCategoryLabel(metadata.categoria)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                metadata.tipo === 'enquete-candidatos'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {metadata.tipo === 'enquete-candidatos' ? 'Enquete por candidato' : 'Opções livres'}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{metadata.descricaoLimpa}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Encerramento das apostas:{' '}
                              {metadata.encerramentoAposta
                                ? new Date(metadata.encerramentoAposta).toLocaleString('pt-BR')
                                : 'Não definido'}
                            </p>
                            {metadata.tipo === 'enquete-candidatos' ? (
                              <div className="mt-3 space-y-2">
                                {votacao.opcoes.map((candidato: string, idx: number) => {
                                  const parsedOption = parsePollOption(candidato);

                                  return (
                                  <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                                        {parsedOption.imageUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                        ) : (
                                          <span className="text-xs font-semibold text-slate-400">{parsedOption.label.slice(0, 1).toUpperCase()}</span>
                                        )}
                                      </div>
                                      <span className="text-sm font-medium text-slate-800">{parsedOption.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                        {parsedOption.odds || '-'}
                                      </span>
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex gap-2 mt-3">
                                {votacao.opcoes.map((opcao: string, idx: number) => {
                                  const parsedOption = parsePollOption(opcao);

                                  return (
                                    <span key={idx} className="inline-flex items-center gap-2 text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                                      {parsedOption.imageUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-5 w-5 rounded-full object-cover" />
                                      )}
                                      {parsedOption.label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="ml-4 flex shrink-0 flex-col items-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        votacao.ativa
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {votacao.ativa ? 'Ativa' : 'Inativa'}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditVotacao(votacao)}
                          className="rounded-full border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggleAtiva(votacao.id, votacao.ativa)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            votacao.ativa
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {votacao.ativa ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-center py-8">Nenhuma votação criada ainda</p>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-6 py-4 shadow-lg text-sm font-semibold transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
