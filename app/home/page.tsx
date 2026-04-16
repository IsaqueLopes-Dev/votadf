'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import CategoryCarousel from '../components/category-carousel';
import BottomNavigation from '../../components/bottom-navigation';

// --- CONFIGURAÇÕES E TIPOS ---
const META_PREFIX = '__meta__:';

// Removido o "as const" para evitar o erro de 'readonly' no CategoryCarousel
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
      return { tipo: parsed.tipo, categoria: parsed.categoria || '' };
    } catch {
      return { tipo: 'opcoes-livres', categoria: '' };
    }
  }
  return { tipo: 'opcoes-livres', categoria: '' };
};

const parsePollOption = (option: any): PollOption => {
  try {
    const parsed = JSON.parse(option);
    return { label: parsed.label, imageUrl: parsed.imageUrl, odds: parsed.odds };
  } catch {
    return { label: option, imageUrl: '', odds: '1.00' };
  }
};

const getCategoryLabel = (cat: string) => CATEGORY_OPTIONS.find(c => c.value === cat)?.label || 'Geral';

// --- COMPONENTE INTERNO ---
function UsuariosPageContent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [votacoesAtivas, setVotacoesAtivas] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [betModal, setBetModal] = useState<any>(null);
  const [betAmount, setBetAmount] = useState('');
  const [placingBet, setPlacingBet] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);

  // Estados de Perfil/Avatar
  const [avatarUrl, setAvatarUrl] = useState('');
  const [username, setUsername] = useState('');
  
  // Refs para controle de toque/mouse (Avatar Zoom/Pan)
  const pointerMapRef = useRef<Map<number, any>>(new Map());
  const dragStartRef = useRef<any>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);

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
        setUsername(user.user_metadata.username);
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
    // Simulação de delay de rede
    setTimeout(() => {
        setBetFeedback("Aposta realizada com sucesso!");
        setPlacingBet(false);
        setTimeout(() => setBetModal(null), 1500);
    }, 1000);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  );

  const userBalance = Number(user?.user_metadata?.balance ?? 0);
  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0F172A]/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
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
        <button className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-xs font-bold text-white transition-colors">
            DEPOSITAR
        </button>
      </header>

      <main className="p-4 space-y-6">
        {/* CARROSSEL DE CATEGORIAS (Corrigido para evitar erro de readonly) */}
        <CategoryCarousel 
          categories={CATEGORY_OPTIONS} 
          selected={selectedCategory} 
          onSelect={(val: any) => setSelectedCategory(val)} 
        />
        
        {/* LISTAGEM DE CARDS */}
        <section className="grid gap-4">
          {votacoesAtivas
            .filter(v => selectedCategory === 'todos' || parsePollMetadata(v.descricao).categoria === selectedCategory)
            .map((votacao) => {
              const meta = parsePollMetadata(votacao.descricao);
              return (
                <div key={votacao.id} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
                      {getCategoryLabel(meta.categoria)}
                    </span>
                  </div>
                  <h3 className="text-white font-bold mb-4">{votacao.titulo}</h3>
                  <div className="grid gap-2">
                    {votacao.opcoes.map((opt: any, idx: number) => {
                      const option = parsePollOption(opt);
                      return (
                        <button 
                          key={idx} 
                          onClick={() => setBetModal({ votacaoTitulo: votacao.titulo, candidato: option.label, odd: option.odds })}
                          className="flex justify-between items-center p-3 bg-slate-900/50 hover:bg-slate-700/50 border border-slate-700 rounded-xl transition-all"
                        >
                          <span className="text-sm">{option.label}</span>
                          <span className="font-mono font-bold text-emerald-400">{option.odds || '1.00'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </section>
      </main>

      {/* NAVEGAÇÃO INFERIOR */}
      <BottomNavigation 
        onChatOpen={() => {}} 
        onHistoryOpen={() => {}} 
        onProfileOpen={() => {}} 
      />

      {/* MODAL DE APOSTA */}
      {betModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border-t border-slate-700">
            <h2 className="text-xl font-bold text-white mb-1">{betModal.votacaoTitulo}</h2>
            <p className="text-slate-400 text-sm mb-6 italic">Apostando em: <span className="text-indigo-400 font-bold">{betModal.candidato}</span></p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Valor da Aposta</label>
                <input 
                  type="number" 
                  value={betAmount} 
                  onChange={(e) => setBetAmount(e.target.value)} 
                  placeholder="R$ 0,00" 
                  className="w-full bg-slate-900 border border-slate-700 p-4 rounded-xl text-white font-mono text-xl outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>

              {betAmount && !isNaN(Number(betAmount)) && (
                <div className="bg-emerald-400/5 p-3 rounded-lg border border-emerald-400/10 flex justify-between">
                  <span className="text-xs text-slate-400">Retorno Potencial:</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    R$ {(Number(betAmount) * Number(betModal.odd)).toFixed(2)}
                  </span>
                </div>
              )}

              {betFeedback && <p className="text-center text-sm font-bold text-indigo-400 py-2">{betFeedback}</p>}

              <div className="flex gap-3">
                <button onClick={() => setBetModal(null)} className="flex-1 py-4 text-slate-400 font-bold hover:text-white transition-colors">
                  Cancelar
                </button>
                <button 
                  onClick={handlePlaceBet} 
                  disabled={placingBet} 
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
                >
                  {placingBet ? 'Processando...' : 'Confirmar Aposta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- EXPORTE COM SUSPENSE ---
export default function UsuariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F172A]" />}>
      <UsuariosPageContent />
    </Suspense>
  );
}
