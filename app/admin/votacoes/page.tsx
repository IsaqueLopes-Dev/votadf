'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type PollCategory =
  | 'politica'
  | 'entretenimento'
  | 'esportes'
  | 'financeiro'
  | 'celebridades'
  | 'criptomoedas';

type PollType = 'opcoes-livres' | 'enquete-candidatos';

type VotingOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

type VotingItem = {
  id: string;
  title: string;
  description: string;
  category: PollCategory;
  pollType: PollType;
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

const CATEGORY_OPTIONS: Array<{ value: PollCategory; label: string }> = [
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'celebridades', label: 'Celebridades' },
  { value: 'criptomoedas', label: 'Criptomoedas' },
];

const emptyOption = (): VotingOption => ({
  label: '',
  imageUrl: '',
  odds: '',
  oddsNao: '',
});

const initialForm = {
  title: '',
  description: '',
  category: 'politica' as PollCategory,
  pollType: 'enquete-candidatos' as PollType,
  closesAt: '',
  result: '',
  isActive: true,
  options: [emptyOption(), emptyOption()],
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [form, setForm] = useState(initialForm);

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
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao carregar votações.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadVotacoes();
  }, [loadVotacoes]);

  const filteredVotacoes = useMemo(() => {
    if (filter === 'active') return votacoes.filter((item) => item.isActive);
    if (filter === 'inactive') return votacoes.filter((item) => !item.isActive);
    return votacoes;
  }, [filter, votacoes]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setFeedbackMessage('');
  };

  const handleOptionChange = (index: number, field: keyof VotingOption, value: string) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: value } : option
      ),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setFeedbackMessage('');

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const endpoint = editingId ? `/api/admin/votacoes/${editingId}` : '/api/admin/votacoes';
      const method = editingId ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível salvar a votação.');
      }

      setFeedbackMessage(payload.message || 'Votação salva com sucesso.');
      resetForm();
      await loadVotacoes();
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível salvar a votação.');
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
          body: JSON.stringify({ ...current, isActive: !current.isActive }),
        });

        const payload = (await response.json()) as { error?: string; message?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível atualizar o status da votação.');
        }
      }

      await loadVotacoes();
      setFeedbackMessage(action === 'delete' ? 'Votação excluída com sucesso.' : 'Status da votação atualizado.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Ação em votação falhou.');
    } finally {
      setBusyVotingId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Carregando votações...</div>;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#dbeafe_0%,#eff6ff_24%,#f8fafc_100%)]">
      <header className="border-b border-blue-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Voltar ao dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Votações</h1>
            <p className="mt-1 text-sm text-slate-600">Crie, edite, publique e remova mercados de previsão.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetForm();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Nova votação
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[30px] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingId ? 'Editar votação' : 'Criar votação'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Defina conteúdo, tipo, opções e publicação.</p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar edição
              </button>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Título</label>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                placeholder="Ex: Quem vence a eleição?"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Categoria</label>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value as PollCategory }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Tipo de mercado</label>
                <select
                  value={form.pollType}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pollType: event.target.value as PollType }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  <option value="enquete-candidatos">Enquete com candidatos</option>
                  <option value="opcoes-livres">Opções livres</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Descrição</label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                placeholder="Contexto do mercado e o que define o resultado."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Encerramento das apostas</label>
                <input
                  type="datetime-local"
                  value={form.closesAt}
                  onChange={(event) => setForm((current) => ({ ...current, closesAt: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Resultado vencedor</label>
                <input
                  value={form.result}
                  onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Publicar imediatamente como ativa
            </label>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Opções da votação</h3>
                  <p className="mt-1 text-xs text-slate-500">Cadastre pelo menos duas opções.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, options: [...current.options, emptyOption()] }))}
                  className="rounded-full border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  Adicionar opção
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {form.options.map((option, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">Opção {index + 1}</p>
                      {form.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              options: current.options.filter((_, optionIndex) => optionIndex !== index),
                            }))
                          }
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                        >
                          Remover
                        </button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        value={option.label}
                        onChange={(event) => handleOptionChange(index, 'label', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                        placeholder="Nome da opção"
                      />
                      <input
                        value={option.imageUrl}
                        onChange={(event) => handleOptionChange(index, 'imageUrl', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                        placeholder="URL da imagem opcional"
                      />
                      <input
                        value={option.odds}
                        onChange={(event) => handleOptionChange(index, 'odds', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                        placeholder="Odd principal"
                      />
                      <input
                        value={option.oddsNao}
                        onChange={(event) => handleOptionChange(index, 'oddsNao', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                        placeholder="Odd NÃO opcional"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {feedbackMessage && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {feedbackMessage}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar votação'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Limpar formulário
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Mercados cadastrados</h2>
              <p className="mt-1 text-sm text-slate-500">Gerencie publicação, edição e remoção das votações.</p>
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
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                Nenhuma votação encontrada para o filtro atual.
              </div>
            )}

            {filteredVotacoes.map((item) => {
              const isBusy = busyVotingId === item.id;

              return (
                <div key={item.id} className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                          {CATEGORY_OPTIONS.find((option) => option.value === item.category)?.label || item.category}
                        </span>
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                          {item.pollType === 'enquete-candidatos' ? 'Enquete com candidatos' : 'Opções livres'}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">{item.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.description}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Criada em {new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                        <span>
                          Encerra em {item.closesAt ? new Date(item.closesAt).toLocaleString('pt-BR') : 'Não definido'}
                        </span>
                        <span>Resultado: {item.result || 'Não definido'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingId(item.id);
                          setForm({
                            title: item.title,
                            description: item.description,
                            category: item.category,
                            pollType: item.pollType,
                            closesAt: item.closesAt ? item.closesAt.slice(0, 16) : '',
                            result: item.result,
                            isActive: item.isActive,
                            options: item.options.length ? item.options : [emptyOption(), emptyOption()],
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void runVotingAction(item.id, 'toggle')}
                        className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
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
                        className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4">
                    {item.options.map((option, index) => (
                      <div key={`${item.id}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{option.label || `Opção ${index + 1}`}</p>
                          {option.imageUrl && <p className="mt-1 text-xs text-slate-500">{option.imageUrl}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {option.odds && <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">Odd {option.odds}</span>}
                          {option.oddsNao && <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">Odd não {option.oddsNao}</span>}
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
