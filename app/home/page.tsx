'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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

// --- FUNÇÕES DE SUPORTE ---
const parsePollMetadata = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';
  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine =
      lineBreakIndex === -1
        ? rawDescription
        : rawDescription.slice(0, lineBreakIndex);
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
  CATEGORY_OPTIONS.find((c) => c.value === cat)?.label || 'Geral';

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

  const [avatarUrl, setAvatarUrl] = useState('');
  const [username, setUsername] = useState('');

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

  if (loading)
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );

  const userBalance = Number(user?.user_metadata?.balance ?? 0);
  const displayName =
    user?.user_metadata?.username || user?.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#0F172A]/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        ...
      </header>

      {/* resto do código permanece igual */}
    </div>
  );
}

// --- EXPORT ---
export default function UsuariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F172A]" />}>
      <UsuariosPageContent />
    </Suspense>
  );
}
