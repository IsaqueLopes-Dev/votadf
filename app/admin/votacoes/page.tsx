'use client';

import { Suspense, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import BottomNavigation from '../../../components/bottom-navigation';
import CategoryCarousel from '../../components/category-carousel';
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

// --- FUNÇÕES DE SUPORTE ---
const parsePollMetadata = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';
  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, ''));
      return { 
        tipo: parsed.tipo || 'opcoes-livres',
        categoria: parsed.categoria || '',
        banner: parsed.banner || ''
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
    return { label: parsed.label, imageUrl: parsed.imageUrl, odds: parsed.odds };
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
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user?.user_metadata) {
        setAvatarUrl(user.user_metadata.avatar_url);
      }

      const resp = await fetch('/api/votacoes/public');
      const data = await resp.json();
      setVotacoesAtivas(data.votacoes || []);
      setLoading(false);
    };

    loadData();
  }, []);

  const handlePlaceBet = async () => {
    if (!betAmount || Number(betAmount) <= 0) {
      setBetFeedback("Insira um valor válido");
      return;
    }

    setPlacingBet(true);

    setTimeout(() => {
      setBetFeedback("Aposta realizada com sucesso!");
      setPlacingBet(false);
      setTimeout(() => setBetModal(null), 1500);
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const userBalance = Number(user?.user_metadata?.balance ?? 0);
  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 pb-24">
      
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0F172A]/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar do usuário" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">
                {displayName?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-white">Olá, {displayName}</p>
            <p className="text-xs text-emerald-400 font-mono">
              R$ {userBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <button className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-xs font-bold text-white">
          DEPOSITAR
        </button>
      </header>

      <main className="p-4 space-y-6">

        {/* CATEGORIAS */}
        <CategoryCarousel
          categories={CATEGORY_OPTIONS}
          selectedCategory={selectedCategory}
          onCategoryChange={(val: any) => setSelectedCategory(val)}
          basePath="/admin/votacoes"
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
                        odds: votacao.odd_sim || '1.80'
                      }),
                      JSON.stringify({
                        label: 'Não',
                        odds: votacao.odd_nao || '1.80'
                      }),
                    ]
                  : votacao.opcoes;

              return (
                <div key={votacao.id} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">

                  {/* BANNER */}
                  {meta.banner && (
                    <img
                      src={meta.banner}
                      alt=""
                      className="w-full h-40 object-cover rounded-xl mb-3"
                    />
                  )}

                  {/* CATEGORIA */}
                  <div className="mb-2">
                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
                      {getCategoryLabel(meta.categoria)}
                    </span>
                  </div>

                  <h3 className="text-white font-bold mb-4">
                    {votacao.titulo}
                  </h3>

                  {/* OPÇÕES */}
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
                              odd: option.odds
                            })
                          }
                          className="flex justify-between items-center p-3 bg-slate-900/50 hover:bg-slate-700/50 border border-slate-700 rounded-xl"
                        >
                          <div className="flex items-center gap-2">
                            {option.imageUrl && (
                              <img
                                src={option.imageUrl}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            )}
                            <span>{option.label}</span>
                          </div>

                          <span className="font-mono font-bold text-emerald-400">
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

      <BottomNavigation />

      {/* MODAL */}
      {betModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6">

            <h2 className="text-xl font-bold text-white">
              {betModal.votacaoTitulo}
            </h2>

            <p className="text-sm text-slate-400 mb-4">
              Apostando em <b>{betModal.candidato}</b>
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
                Retorno: R$ {(Number(betAmount) * Number(betModal.odd)).toFixed(2)}
              </p>
            )}

            {betFeedback && (
              <p className="text-indigo-400 mt-2">{betFeedback}</p>
            )}

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

export default function UsuariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F172A]" />}>
      <UsuariosPageContent />
    </Suspense>
  );
}
