'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import CategoryCarousel from '../components/category-carousel';
import BottomNavigation from '../../components/bottom-navigation';

// --- CONFIGURAÇÕES E TIPOS ---
const META_PREFIX = '__meta__:';
const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'futebol', label: 'Futebol' },
] as const;

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
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<any>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);

  // Refs para controle de toque/mouse
  const pointerMapRef = useRef<Map<number, any>>(new Map());
  const dragStartRef = useRef<any>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

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

  // Lógica de Movimentação do Avatar (O que você enviou agora)
  const handleAvatarPointerDown = (event: React.PointerEvent) => {
    pointerMapRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointerMapRef.current.size >= 2) {
      const points = Array.from(pointerMapRef.current.values());
      const dx = points[0].clientX - points[1].clientX;
      const dy = points[0].clientY - points[1].clientY;
      pinchStartDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoomRef.current = avatarZoom;
    } else {
      dragStartRef.current = { 
        clientX: event.clientX, 
        clientY: event.clientY, 
        startOffsetX: avatarOffsetX, 
        startOffsetY: avatarOffsetY 
      };
    }
  };

  const handleAvatarPointerMove = (event: React.PointerEvent) => {
    pointerMapRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointerMapRef.current.size >= 2 && pinchStartDistanceRef.current) {
      const points = Array.from(pointerMapRef.current.values());
      const dx = points[0].clientX - points[1].clientX;
      const dy = points[0].clientY - points[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setAvatarZoom(pinchStartZoomRef.current * (dist / pinchStartDistanceRef.current));
    } else if (dragStartRef.current) {
      const dx = event.clientX - dragStartRef.current.clientX;
      const dy = event.clientY - dragStartRef.current.clientY;
      setAvatarOffsetX(dragStartRef.current.startOffsetX + dx);
      setAvatarOffsetY(dragStartRef.current.startOffsetY + dy);
    }
  };

  const handleAvatarPointerUp = (event: React.PointerEvent) => {
    pointerMapRef.current.delete(event.pointerId);
    if (pointerMapRef.current.size < 2) pinchStartDistanceRef.current = null;
    if (pointerMapRef.current.size === 0) dragStartRef.current = null;
  };

  const handlePlaceBet = async () => {
    setPlacingBet(true);
    // Lógica de aposta aqui
    setTimeout(() => {
        setBetFeedback("Aposta realizada com sucesso!");
        setPlacingBet(false);
    }, 1000);
  };

  if (loading) return <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-white">Carregando...</div>;

  const userBalance = Number(user?.user_metadata?.balance ?? 0);
  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 pb-24">
      <header className="sticky top-0 z-40 bg-[#0F172A]/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 overflow-hidden">
            {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">U</div>}
          </div>
          <div>
            <p className="text-sm font-bold text-white">Olá, {displayName}</p>
            <p className="text-xs text-emerald-400 font-mono">R$ {userBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <button className="bg-emerald-600 px-3 py-2 rounded-lg text-xs font-bold text-white">DEPOSITAR</button>
      </header>

      <main className="p-4 space-y-6">
        <CategoryCarousel categories={CATEGORY_OPTIONS} selected={selectedCategory} onSelect={(val: any) => setSelectedCategory(val)} />
        
        <section className="grid gap-4">
          {votacoesAtivas
            .filter(v => selectedCategory === 'todos' || parsePollMetadata(v.descricao).categoria === selectedCategory)
            .map((votacao) => {
              const meta = parsePollMetadata(votacao.descricao);
              return (
                <div key={votacao.id} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded">
                    {getCategoryLabel(meta.categoria)}
                  </span>
                  <h3 className="text-white font-bold my-3">{votacao.titulo}</h3>
                  <div className="grid gap-2">
                    {votacao.opcoes.map((opt: any, idx: number) => {
                      const option = parsePollOption(opt);
                      return (
                        <button key={idx} onClick={() => setBetModal({ votacaoTitulo: votacao.titulo, candidato: option.label, odd: option.odds })} className="flex justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-xl">
                          <span className="text-sm">{option.label}</span>
                          <span className="font-mono font-bold text-emerald-400">{option.odds}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </section>
      </main>

      <BottomNavigation onChatOpen={() => {}} onHistoryOpen={() => {}} onProfileOpen={() => {}} />

      {betModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 w-full max-w-md rounded-t-3xl p-6">
            <h2 className="text-xl font-bold text-white">{betModal.votacaoTitulo}</h2>
            <p className="text-slate-400 text-sm mb-6">Aposta em: <span className="text-indigo-400 font-bold">{betModal.candidato}</span></p>
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} placeholder="R$ 0,00" className="w-full bg-slate-900 border border-slate-700 p-4 rounded-xl text-white mb-4" />
            <button onClick={handlePlaceBet} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-white">
              {placingBet ? 'Processando...' : 'Confirmar Aposta'}
            </button>
            <button onClick={() => setBetModal(null)} className="w-full py-4 text-slate-400 text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- EXPORTE COM SUSPENSE ---
export default function UsuariosPage() {
  return (
    <Suspense fallback={null}>
      <UsuariosPageContent />
    </Suspense>
  );
}
