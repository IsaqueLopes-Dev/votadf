'use client';

import { Suspense, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import CategoryCarousel from '@/app/components/category-carousel';
import BottomNavigation from '@/app/components/bottom-navigation';

// --- CONFIGURAÇÕES E TIPOS ---
const META_PREFIX = '__meta__:';

const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'futebol', label: 'Futebol' },
];

type PollOption = {
  label: string;
  imageUrl: string;
  odds: string;
};

// --- FUNÇÕES ---
const parsePollMetadata = (descricao: string | null | undefined) => {
  const raw = descricao || '';

  if (raw.startsWith(META_PREFIX)) {
    const lineBreak = raw.indexOf('\n');
    const metaLine = lineBreak === -1 ? raw : raw.slice(0, lineBreak);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, ''));
      return {
        tipo: parsed.tipo || 'opcoes-livres',
        categoria: parsed.categoria || '',
        banner: parsed.banner || '',
      };
    } catch {
      return { tipo: 'opcoes-livres', categoria: '', banner: '' };
    }
  }

  return { tipo: 'opcoes-livres', categoria: '', banner: '' };
};

const parsePollOption = (option: any): PollOption => {
  try {
    const parsed = JSON.parse(option);
    return {
      label: parsed.label,
      imageUrl: parsed.imageUrl,
      odds: parsed.odds,
    };
  } catch {
    return { label: option, imageUrl: '', odds: '1.00' };
  }
};

const getCategoryLabel = (cat: string) =>
  CATEGORY_OPTIONS.find(c => c.value === cat)?.label || 'Geral';

// --- COMPONENTE ---
function UsuariosPageContent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [votacoesAtivas, setVotacoesAtivas] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('todos');

  const [betModal, setBetModal] = useState<any>(null);
  const [betAmount, setBetAmount] = useState('');
  const [placingBet, setPlacingBet] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState('');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user?.user_metadata?.avatar_url) {
        setAvatarUrl(user.user_metadata.avatar_url);
      }

      const resp = await fetch('/api/votacoes/public');
      const data = await resp.json();

      setVotacoesAtivas(data.votacoes || []);
      setLoading(false);
    };

    load();
  }, []);

  const handlePlaceBet = async () => {
    if (!betAmount || Number(betAmount) <= 0) {
      setBetFeedback('Insira um valor válido');
      return;
    }

    setPlacingBet(true);

    setTimeout(() => {
      setBetFeedback('Aposta realizada com sucesso!');
      setPlacingBet(false);
      setTimeout(() => setBetModal(null), 1500);
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-b-2 border-indigo-500 rounded-full" />
      </div>
    );
  }

  const userBalance = Number(user?.user_metadata?.balance ?? 0);
  const displayName =
    user?.user_metadata?.username || user?.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 pb-24">

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0F172A]/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-bold">
                {displayName?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div>
            <p className="text-white font-bold text-sm">
              Olá, {displayName}
            </p>
            <p className="text-xs text-emerald-400">
              R$ {userBalance.toFixed(2)}
            </p>
          </div>
        </div>

        <button className="bg-emerald-600 px-3 py-2 rounded-lg text-xs font-bold">
          DEPOSITAR
        </button>
      </header>

      <main className="p-4 space-y-6">

        {/* CATEGORIAS */}
        <CategoryCarousel
          categories={CATEGORY_OPTIONS}
          selectedCategory={selectedCategory}
          onCategoryChange={(val: string) => setSelectedCategory(val)}
        />

        {/* VOTAÇÕES */}
        <section className="grid gap-4">
          {votacoesAtivas
            .filter(v =>
              selectedCategory === 'todos' ||
              parsePollMetadata(v.descricao).categoria === selectedCategory
            )
            .map((votacao) => {
              const meta = parsePollMetadata(votacao.descricao);

              const optionsToRender =
                meta.tipo === 'sim-nao'
                  ? [
                      JSON.stringify({
                        label: 'Sim',
                        odds: votacao.odd_sim || '1.80',
                      }),
                      JSON.stringify({
                        label: 'Não',
                        odds: votacao.odd_nao || '1.80',
                      }),
                    ]
                  : votacao.opcoes;

              return (
                <div key={votacao.id} className="bg-slate-800 p-4 rounded-2xl">

                  {/* BANNER */}
                  {meta.banner && (
                    <img
                      src={meta.banner}
                      className="w-full h-40 object-cover rounded-xl mb-3"
                    />
                  )}

                  <span className="text-xs text-indigo-400">
                    {getCategoryLabel(meta.categoria)}
                  </span>

                  <h3 className="text-white font-bold mt-2 mb-4">
                    {votacao.titulo}
                  </h3>

                  <div className="grid gap-2">
                    {optionsToRender.map((opt: any, idx: number) => {
                      const option = parsePollOption(opt);

                      return (
                        <button
                          key={idx}
                          onClick={() =>
                            setBetModal({
                              votacaoTitulo: votacao.titulo,
                              candidato: option.label,
                              odd: option.odds,
                            })
                          }
                          className="flex justify-between items-center p-3 bg-slate-900 rounded-xl"
                        >
                          <div className="flex items-center gap-2">
                            {option.imageUrl && (
                              <img
                                src={option.imageUrl}
                                className="w-6 h-6 rounded-full"
                              />
                            )}
                            <span>{option.label}</span>
                          </div>

                          <span className="text-emerald-400 font-bold">
                            {option.odds}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </section>
      </main>

      <BottomNavigation
        onChatOpen={() => {}}
        onHistoryOpen={() => {}}
        onProfileOpen={() => {}}
      />

      {/* MODAL */}
      {betModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center p-4">
          <div className="bg-slate-800 w-full max-w-md p-6 rounded-2xl">

            <h2 className="text-white font-bold">
              {betModal.votacaoTitulo}
            </h2>

            <p className="text-sm text-slate-400 mb-4">
              {betModal.candidato}
            </p>

            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full p-4 bg-slate-900 rounded-xl text-white"
              placeholder="R$ 0,00"
            />

            {betAmount && (
              <p className="text-emerald-400 mt-2">
                R$ {(Number(betAmount) * Number(betModal.odd)).toFixed(2)}
              </p>
            )}

            {betFeedback && <p>{betFeedback}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setBetModal(null)}>Cancelar</button>
              <button onClick={handlePlaceBet}>
                {placingBet ? 'Processando...' : 'Confirmar'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// EXPORT
export default function UsuariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F172A]" />}>
      <UsuariosPageContent />
    </Suspense>
  );
}
