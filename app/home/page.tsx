'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import CategoryCarousel from '../components/category-carousel';
import BottomNavigation from '../../components/bottom-navigation';
import { getSupabaseClient } from '../utils/supabaseClient';

const META_PREFIX = '__meta__:';
const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'celebridades', label: 'Celebridades' },
  { value: 'criptomoedas', label: 'Criptomoedas' },
] as const;

type PollType = 'opcoes-livres' | 'enquete-candidatos';
type PollCategory = 'politica' | 'entretenimento' | 'esportes' | 'financeiro' | 'celebridades' | 'criptomoedas' | '';

type PollOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

type VotingRecord = {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: string[];
  ativa: boolean;
};

type BetHistoryItem = {
  id: string;
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  amount: number;
  potentialReturn: number;
  createdAt: string;
  status: 'aguardando' | 'ganhou' | 'perdeu';
};

type FinancialHistoryItem = {
  id: string;
  tipo: 'deposito' | 'saque';
  status: 'aprovado' | 'pendente' | 'recusado';
  amount: number;
  createdAt: string;
  cpf?: string;
  paymentId?: string;
};

type ChatMessageItem = {
  id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

type BetCommentItem = {
  id: string;
  votacao_id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

type BetCountsMap = Record<string, Record<string, number>>;
type UserProfile = {
  id: string;
  email: string;
  username: string;
  cpf: string;
  birth_date: string;
  avatar_url: string;
  role: string;
};

type ProfileNotice = {
  tone: 'success' | 'error' | 'warning';
  title: string;
  message: string;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const normalizePollCategory = (value: unknown): PollCategory => {
  if (value === 'futebol' || value === 'esportes') return 'esportes';
  if (value === 'politica' || value === 'entretenimento' || value === 'financeiro' || value === 'celebridades' || value === 'criptomoedas') {
    return value;
  }

  return '';
};

const parsePollMetadata = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as {
        tipo?: PollType;
        categoria?: PollCategory;
        encerramentoAposta?: string;
        bettingClosesAt?: string;
      };
      return {
        tipo: parsed.tipo === 'enquete-candidatos' ? 'enquete-candidatos' : 'opcoes-livres',
        categoria: normalizePollCategory(parsed.categoria),
        encerramentoAposta: String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim(),
        descricaoLimpa: cleanDescription,
      };
    } catch {
      return {
        tipo: 'opcoes-livres' as const,
        categoria: '' as PollCategory,
        encerramentoAposta: '',
        descricaoLimpa: cleanDescription,
      };
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

const parsePollOption = (option: unknown): PollOption => {
  if (typeof option !== 'string') {
    return { label: '', imageUrl: '', odds: '', oddsNao: '' };
  }

  try {
    const parsed = JSON.parse(option) as Partial<
      PollOption & { odds: number | null; oddsNao: number | null; image_url: string; image: string; avatarUrl: string }
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
    // Compatibilidade com opções antigas em texto puro.
  }

  return {
    label: option,
    imageUrl: '',
    odds: '',
    oddsNao: '',
  };
};

const getDeterministicHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const normalizeCandidate = (value: string) => value.trim().toLowerCase();

const getSimulatedBaseBets = (votacaoId: string, option: PollOption, index: number) => {
  const hash = getDeterministicHash(`${votacaoId}:${option.label}:${index}:base`);
  return 18 + (hash % 73);
};

const getRealBetCount = (counts: BetCountsMap, votacaoId: string, candidateLabel: string) => {
  return counts[votacaoId]?.[normalizeCandidate(candidateLabel)] || 0;
};

const getDisplayedOdd = (value: string) => {
  if (value === '') return '-';
  return `${value}x`;
};

const getCategoryLabel = (categoria: string) => {
  return CATEGORY_OPTIONS.find((option) => option.value === categoria)?.label || 'Sem categoria';
};

function UsuariosPageContent() {
  type BetModalState = {
    votacaoId: string;
    votacaoTitulo: string;
    candidato: string;
    odd: number;
    imageUrl: string;
  };

  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [cpfConfirmation, setCpfConfirmation] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [confirmIdentityLock, setConfirmIdentityLock] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const [profileNotice, setProfileNotice] = useState<ProfileNotice | null>(null);
  const [balanceMenuOpen, setBalanceMenuOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [requestingWithdraw, setRequestingWithdraw] = useState(false);
  const [withdrawStatusMessage, setWithdrawStatusMessage] = useState<string | null>(null);
  const [creatingPix, setCreatingPix] = useState(false);
  const [pixPaymentId, setPixPaymentId] = useState<string | null>(null);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [pixStatusMessage, setPixStatusMessage] = useState<string | null>(null);
  const [votacoesAtivas, setVotacoesAtivas] = useState<VotingRecord[]>([]);
  const [votacoesError, setVotacoesError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<
    'todos' | 'politica' | 'entretenimento' | 'esportes' | 'financeiro' | 'celebridades' | 'criptomoedas'
  >('todos');
  const [betHistory, setBetHistory] = useState<BetHistoryItem[]>([]);
  const [betHistoryError, setBetHistoryError] = useState<string | null>(null);
  const [betHistoryOpen, setBetHistoryOpen] = useState(false);
  const [financialHistoryOpen, setFinancialHistoryOpen] = useState(false);
  const [financialHistory, setFinancialHistory] = useState<FinancialHistoryItem[]>([]);
  const [financialHistoryError, setFinancialHistoryError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [betCounts, setBetCounts] = useState<BetCountsMap>({});
  const [betModal, setBetModal] = useState<BetModalState | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [placingBet, setPlacingBet] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [commentsByVotingId, setCommentsByVotingId] = useState<Record<string, BetCommentItem[]>>({});
  const [commentDraftByVotingId, setCommentDraftByVotingId] = useState<Record<string, string>>({});
  const [commentStatusByVotingId, setCommentStatusByVotingId] = useState<Record<string, string | null>>({});
  const [loadingCommentsByVotingId, setLoadingCommentsByVotingId] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const avatarPreviewRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const pointerMapRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const wheelUnlockTimeoutRef = useRef<number | null>(null);

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
  const MIN_AVATAR_ZOOM = 1;
  const MAX_AVATAR_ZOOM = 3;
  const MIN_PIX_DEPOSIT = 10;
  const MIN_WITHDRAWAL = 50;

  useEffect(() => {
    // Cleanup
    return () => {
      if (pendingAvatarPreview) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (wheelUnlockTimeoutRef.current) {
        window.clearTimeout(wheelUnlockTimeoutRef.current);
      }
    };
  }, [pendingAvatarPreview]);

  // Carrega user e role após login
  useEffect(() => {
    const fetchUserAndRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          const response = await fetch('/api/profile/me', {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (response.ok) {
            const payload = (await response.json()) as { profile?: UserProfile };
            setUserRole(payload.profile?.role || null);
            return;
          }
        }

        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        const roleProfile = profile as { role?: string | null } | null;
        setUserRole(roleProfile?.role || null);
      } else {
        setUserRole(null);
      }
    };
    fetchUserAndRole();
  }, []);

  const lockPageScroll = () => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  };

  const unlockPageScroll = () => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  };

  const normalizeUsername = (value: string) => {
    const withoutSpaces = value.replace(/\s+/g, '');
    if (!withoutSpaces) return '';
    const normalized = withoutSpaces.startsWith('@') ? withoutSpaces : `@${withoutSpaces.replace(/^@+/, '')}`;
    return normalized.toLowerCase();
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const isValidCpf = (value: string) => {
    const digits = value.replace(/\D/g, '');

    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
      return false;
    }

    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += Number(digits[i]) * (10 - i);
    }
    let firstDigit = (sum * 10) % 11;
    if (firstDigit === 10) firstDigit = 0;
    if (firstDigit !== Number(digits[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i += 1) {
      sum += Number(digits[i]) * (11 - i);
    }
    let secondDigit = (sum * 10) % 11;
    if (secondDigit === 10) secondDigit = 0;
    return secondDigit === Number(digits[10]);
  };

  const isValidUsername = (value: string) => /^@[^\s]+$/.test(value) && value.length >= 4;

  const cpfDigits = (value: string) => value.replace(/\D/g, '');

  const parseCurrencyToNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits ? Number(digits) : 0;
  };

  const resetPixState = () => {
    setPixPaymentId(null);
    setPixQrCode(null);
    setPixQrBase64(null);
    setPixStatusMessage(null);
  };

  const resetWithdrawState = () => {
    setWithdrawAmount('');
    setWithdrawStatusMessage(null);
  };

  const checkUsernameAvailability = async (value: string) => {
    const params = new URLSearchParams({
      username: value,
      excludeUserId: user?.id || '',
    });

    const response = await fetch(`/api/username-availability?${params.toString()}`);
    const result = await response.json();
    return result.available === true;
  };

  const loadVotacoesAtivas = async () => {
    try {
      const response = await fetch('/api/votacoes/public', { method: 'GET', cache: 'default' });
      const payload = (await response.json()) as { votacoes?: VotingRecord[]; error?: string };

      if (!response.ok) {
        setVotacoesError(payload.error || 'Não foi possível carregar as votações ativas.');
        return;
      }

      setVotacoesAtivas(Array.isArray(payload.votacoes) ? payload.votacoes : []);
      setVotacoesError(null);
    } catch {
      setVotacoesError('Não foi possível carregar as votações ativas.');
    }
  };

  const loadBetHistory = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setBetHistory([]);
        return;
      }

      const response = await fetch('/api/usuarios/bets-history', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json()) as { history?: BetHistoryItem[]; error?: string };

      if (!response.ok) {
        setBetHistoryError(payload.error || 'Não foi possível carregar histórico de apostas.');
        return;
      }

      setBetHistory(Array.isArray(payload.history) ? payload.history : []);
      setBetHistoryError(null);
    } catch {
      setBetHistoryError('Não foi possível carregar histórico de apostas.');
    }
  };

  const loadFinancialHistory = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setFinancialHistory([]);
        return;
      }

      const response = await fetch('/api/usuarios/financial-history', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json()) as { history?: FinancialHistoryItem[]; error?: string };

      if (!response.ok) {
        setFinancialHistoryError(payload.error || 'Não foi possível carregar histórico financeiro.');
        return;
      }

      setFinancialHistory(Array.isArray(payload.history) ? payload.history : []);
      setFinancialHistoryError(null);
    } catch {
      setFinancialHistoryError('Não foi possível carregar histórico financeiro.');
    }
  };

  const loadBetCounts = async () => {
    try {
      const response = await fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' });
      const payload = (await response.json()) as { counts?: BetCountsMap };
      setBetCounts(payload.counts || {});
    } catch {
      setBetCounts({});
    }
  };

  const loadChatMessages = async (showLoader = false) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setChatMessages([]);
        return;
      }

      if (showLoader) {
        setLoadingChat(true);
      }
      const response = await fetch('/api/chat/messages', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json()) as { messages?: ChatMessageItem[]; error?: string };

      if (!response.ok) {
        setChatError(payload.error || 'Não foi possível carregar o chat ao vivo.');
        return;
      }

      setChatMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setChatError(null);
    } catch {
      setChatError('Não foi possível carregar o chat ao vivo.');
    } finally {
      if (showLoader) {
        setLoadingChat(false);
      }
    }
  };

  const identityLocked = Boolean(String(user?.user_metadata?.identity_confirmed_at || '').trim());

  const hasRequiredBetProfile = (currentUser: User | null) => {
    return Boolean(
      String(cpf || currentUser?.user_metadata?.cpf || '').trim() &&
      String(birthDate || currentUser?.user_metadata?.birth_date || '').trim()
    );
  };

  const loadComments = async (votacaoId: string) => {
    setLoadingCommentsByVotingId((current) => ({ ...current, [votacaoId]: true }));

    try {
      const response = await fetch(`/api/votacoes/comments?votacaoId=${encodeURIComponent(votacaoId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as { comments?: BetCommentItem[]; error?: string };

      if (!response.ok) {
        setCommentStatusByVotingId((current) => ({
          ...current,
          [votacaoId]: payload.error || 'Não foi possível carregar os comentários.',
        }));
        return;
      }

      setCommentsByVotingId((current) => ({
        ...current,
        [votacaoId]: Array.isArray(payload.comments) ? payload.comments : [],
      }));
      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: null }));
    } catch {
      setCommentStatusByVotingId((current) => ({
        ...current,
        [votacaoId]: 'Não foi possível carregar os comentários.',
      }));
    } finally {
      setLoadingCommentsByVotingId((current) => ({ ...current, [votacaoId]: false }));
    }
  };

  useEffect(() => {
    const votacaoIds = votacoesAtivas.map((votacao) => votacao.id).filter(Boolean);

    if (votacaoIds.length === 0) {
      return;
    }

    const missingIds = votacaoIds.filter((votacaoId) => commentsByVotingId[votacaoId] === undefined);
    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const preloadCommentCounts = async () => {
      try {
        const responses = await Promise.all(
          missingIds.map(async (votacaoId) => {
            const response = await fetch(`/api/votacoes/comments?votacaoId=${encodeURIComponent(votacaoId)}`, {
              method: 'GET',
              cache: 'no-store',
            });

            const payload = (await response.json()) as { comments?: BetCommentItem[] };
            return {
              votacaoId,
              comments: response.ok && Array.isArray(payload.comments) ? payload.comments : [],
            };
          })
        );

        if (cancelled) {
          return;
        }

        setCommentsByVotingId((current) => {
          const next = { ...current };

          for (const item of responses) {
            next[item.votacaoId] = item.comments;
          }

          return next;
        });
      } catch {
        // Mantém o contador em zero se o preload falhar.
      }
    };

    void preloadCommentCounts();

    return () => {
      cancelled = true;
    };
  }, [commentsByVotingId, votacoesAtivas]);

  const toggleComments = async (votacaoId: string) => {
    const shouldOpen = expandedCommentsId !== votacaoId;
    setExpandedCommentsId(shouldOpen ? votacaoId : null);

    if (shouldOpen && commentsByVotingId[votacaoId] === undefined) {
      await loadComments(votacaoId);
    }
  };

  const submitComment = async (votacaoId: string) => {
    const message = String(commentDraftByVotingId[votacaoId] || '').trim();

    if (!user) {
      router.push('/login?next=%2Fhome');
      return;
    }

    if (!message) {
      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Digite um comentário.' }));
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Sessão inválida. Faça login novamente.' }));
        return;
      }

      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Enviando comentário...' }));

      const response = await fetch('/api/votacoes/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ votacaoId, message }),
      });

      const payload = (await response.json()) as { comment?: BetCommentItem; error?: string };

      const nextComment = payload.comment;

      if (!response.ok || !nextComment) {
        setCommentStatusByVotingId((current) => ({
          ...current,
          [votacaoId]: payload.error || 'Não foi possível publicar o comentário.',
        }));
        return;
      }

      setCommentsByVotingId((current) => ({
        ...current,
        [votacaoId]: [...(current[votacaoId] || []), nextComment],
      }));
      setCommentDraftByVotingId((current) => ({ ...current, [votacaoId]: '' }));
      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Comentário publicado.' }));
    } catch {
      setCommentStatusByVotingId((current) => ({
        ...current,
        [votacaoId]: 'Não foi possível publicar o comentário.',
      }));
    }
  };

  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
        if (user) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            const response = await fetch('/api/profile/me', {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });

            if (response.ok) {
              const payload = (await response.json()) as { profile?: UserProfile };
              const profile = payload.profile;

              if (profile) {
                setUsername(profile.username || (user.email ? `@${user.email.split('@')[0]}` : '') || '');
                setCpf(profile.cpf || '');
                setCpfConfirmation(profile.cpf || '');
                setBirthDate(profile.birth_date || '');
                setAvatarUrl(profile.avatar_url || '');
                setUserRole(profile.role || null);
              }
            } else {
              setUsername(user.user_metadata?.username || (user.email ? `@${user.email.split('@')[0]}` : '') || '');
              setCpf(user.user_metadata?.cpf || '');
              setCpfConfirmation(user.user_metadata?.cpf || '');
              setBirthDate(user.user_metadata?.birth_date || '');
              setAvatarUrl(user.user_metadata?.avatar_url || '');
            }
          } else {
            setUsername(user.user_metadata?.username || (user.email ? `@${user.email.split('@')[0]}` : '') || '');
            setCpf(user.user_metadata?.cpf || '');
            setCpfConfirmation(user.user_metadata?.cpf || '');
            setBirthDate(user.user_metadata?.birth_date || '');
            setAvatarUrl(user.user_metadata?.avatar_url || '');
          }
        }
        await Promise.all([loadVotacoesAtivas(), loadBetHistory(), loadBetCounts(), loadChatMessages(true)]);

        if (searchParams.get('deposit') === '1') {
          setDepositOpen(true);
          setProfileOpen(false);
          resetPixState();
        }
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [searchParams]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const openBetModal = (votacao: VotingRecord, option: PollOption) => {
    // Não exige mais CPF/data de nascimento para apostar

    const metadata = parsePollMetadata(votacao.descricao);
    const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
    const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();
    if (isBetClosed) {
      alert('O prazo para apostar nesta votação já foi encerrado.');
      return;
    }

    const odd = Number(option.odds);
    if (option.odds === '' || !Number.isFinite(odd) || odd <= 0) {
      alert('Esta opção ainda não possui odd configurada.');
      return;
    }

    setBetModal({
      votacaoId: votacao.id,
      votacaoTitulo: votacao.titulo,
      candidato: option.label,
      odd,
      imageUrl: option.imageUrl,
    });
    setBetAmount('');
    setBetFeedback(null);
  };

  const handlePlaceBet = async () => {
    if (!betModal || !user) return;

    const amount = Number(betAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBetFeedback('Digite um valor válido para apostar.');
      return;
    }

    const currentBalance = Number(user.user_metadata?.balance ?? user.user_metadata?.saldo ?? 0);
    if (!Number.isFinite(currentBalance) || amount > currentBalance) {
      setBetFeedback('Saldo insuficiente para essa aposta.');
      return;
    }

    setPlacingBet(true);
    setBetFeedback(null);

    try {
      const existingBets = Array.isArray(user.user_metadata?.bets) ? user.user_metadata.bets : [];
      const nextBalance = Math.round((currentBalance - amount) * 100) / 100;
      const nextBets = [
        ...existingBets,
        {
          id: crypto.randomUUID(),
          votacaoId: betModal.votacaoId,
          votacaoTitulo: betModal.votacaoTitulo,
          candidato: betModal.candidato,
          odd: betModal.odd,
          amount,
          potentialReturn: Math.round(amount * betModal.odd * 100) / 100,
          createdAt: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          balance: nextBalance,
          bets: nextBets,
        },
      });

      if (error) {
        setBetFeedback(`Erro ao registrar aposta: ${error.message}`);
        return;
      }

      if (data.user) {
        setUser(data.user);
      }

      await Promise.all([loadBetHistory(), loadBetCounts()]);

      setBetFeedback('Aposta registrada com sucesso.');
      setTimeout(() => {
        setBetModal(null);
        setBetAmount('');
        setBetFeedback(null);
      }, 900);
    } catch {
      setBetFeedback('Erro ao registrar aposta. Tente novamente.');
    } finally {
      setPlacingBet(false);
    }
  };

  const refreshAuthenticatedUser = async () => {
    const {
      data: { user: refreshedUser },
    } = await supabase.auth.getUser();

    if (refreshedUser) {
      setUser(refreshedUser);
    }
  };

  const handleCreatePixDeposit = async () => {
    if (depositAmount < MIN_PIX_DEPOSIT) {
      setPixStatusMessage('Digite um valor minimo de R$ 10.');
      return;
    }

    setCreatingPix(true);
    setPixStatusMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setPixStatusMessage('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/deposits/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount: depositAmount }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setPixStatusMessage(payload?.error || 'Não foi possível gerar o PIX.');
        return;
      }

      setPixPaymentId(String(payload.paymentId));
      setPixQrCode(payload.qrCode || null);
      setPixQrBase64(payload.qrCodeBase64 || null);
      setPixStatusMessage('PIX gerado. Aguarde a confirmação do pagamento.');
    } catch (createPixError: unknown) {
      setPixStatusMessage(getErrorMessage(createPixError, 'Erro ao gerar PIX.'));
    } finally {
      setCreatingPix(false);
    }
  };

  const handleRequestWithdraw = async () => {
    const amountToWithdraw = Number(withdrawAmount.replace(',', '.'));

    if (!Number.isFinite(amountToWithdraw) || amountToWithdraw <= 0) {
      setWithdrawStatusMessage('Digite um valor válido para sacar.');
      return;
    }

    if (amountToWithdraw < MIN_WITHDRAWAL) {
      setWithdrawStatusMessage(`Valor mínimo para saque é R$ ${MIN_WITHDRAWAL}.`);
      return;
    }

    if (amountToWithdraw > userBalance) {
      setWithdrawStatusMessage('Saldo insuficiente para este saque.');
      return;
    }

    const cpfValue = String(cpf || user?.user_metadata?.cpf || '').trim();
    if (!cpfValue) {
      setWithdrawStatusMessage('CPF não cadastrado. Atualize seu perfil antes de sacar.');
      return;
    }

    setRequestingWithdraw(true);
    setWithdrawStatusMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setWithdrawStatusMessage('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount: amountToWithdraw }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setWithdrawStatusMessage(payload.error || 'Não foi possível solicitar saque.');
        return;
      }

      setWithdrawStatusMessage(payload.message || 'Solicitação enviada com sucesso.');
      await refreshAuthenticatedUser();
      await loadFinancialHistory();
      setTimeout(() => {
        setWithdrawOpen(false);
        resetWithdrawState();
      }, 1200);
    } catch {
      setWithdrawStatusMessage('Erro ao solicitar saque. Tente novamente.');
    } finally {
      setRequestingWithdraw(false);
    }
  };

  const handleSendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message) return;

    setSendingChatMessage(true);

    const temporaryMessageId = `tmp-${Date.now()}`;
    const currentAvatarUrl = String(user?.user_metadata?.avatar_url || avatarUrl || '').trim();
    const optimisticMessage: ChatMessageItem = {
      id: temporaryMessageId,
      user_id: String(user?.id || ''),
      username: displayName || '@usuario',
      message,
      avatar_url: currentAvatarUrl,
      created_at: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, optimisticMessage]);
    setChatInput('');
    setChatError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setChatMessages((prev) => prev.filter((item) => item.id !== temporaryMessageId));
        setChatError('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message }),
      });

      const payload = (await response.json()) as { message?: ChatMessageItem; error?: string };

      if (!response.ok) {
        setChatMessages((prev) => prev.filter((item) => item.id !== temporaryMessageId));
        setChatError(payload.error || 'Não foi possível enviar a mensagem.');
        return;
      }

      setChatMessages((prev) => prev.map((item) => (item.id === temporaryMessageId ? (payload.message as ChatMessageItem) : item)));
    } catch {
      setChatMessages((prev) => prev.filter((item) => item.id !== temporaryMessageId));
      setChatError('Não foi possível enviar a mensagem.');
    } finally {
      setSendingChatMessage(false);
    }
  };

  useEffect(() => {
    if (!pixPaymentId) return;

    let active = true;

    const checkPaymentStatus = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          return;
        }

        const response = await fetch(`/api/deposits/status?paymentId=${encodeURIComponent(pixPaymentId)}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const payload = await response.json();

        if (!response.ok || !active) {
          return;
        }

        if (payload.status === 'approved') {
          setPixStatusMessage('Pagamento confirmado! Seu saldo foi atualizado.');
          await refreshAuthenticatedUser();
          await loadFinancialHistory();
          setTimeout(() => {
            if (!active) return;
            setDepositOpen(false);
            resetPixState();
          }, 1200);
        }
      } catch {
        // Ignora falhas transitórias de polling
      }
    };

    checkPaymentStatus();
    const intervalId = window.setInterval(checkPaymentStatus, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [pixPaymentId]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      void loadBetCounts();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !chatPanelOpen) return;

    const intervalId = window.setInterval(() => {
      void loadChatMessages(false);
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user, chatPanelOpen]);

  const optimizeAvatarImage = async (
    file: File,
    zoom = 1,
    offsetX = 0,
    offsetY = 0
  ): Promise<File> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'));
      img.src = dataUrl;
    });

    const minSide = Math.min(image.width, image.height);
    const side = Math.max(64, Math.floor(minSide / zoom));
    const maxShiftX = Math.max(0, Math.floor((image.width - side) / 2));
    const maxShiftY = Math.max(0, Math.floor((image.height - side) / 2));

    const sx = Math.max(
      0,
      Math.min(
        image.width - side,
        Math.floor((image.width - side) / 2 + (offsetX / 100) * maxShiftX)
      )
    );

    const sy = Math.max(
      0,
      Math.min(
        image.height - side,
        Math.floor((image.height - side) / 2 + (offsetY / 100) * maxShiftY)
      )
    );

    const targetSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Nao foi possivel processar a imagem.');
    }

    ctx.drawImage(image, sx, sy, side, side, 0, 0, targetSize, targetSize);

    const toBlob = (quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Nao foi possivel comprimir a imagem.'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      });

    let blob = await toBlob(0.85);
    if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
      blob = await toBlob(0.7);
    }

    if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error('A imagem final ainda ficou acima de 2MB. Use uma imagem menor.');
    }

    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  };

  const handleSelectAvatarFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('Formato invalido. Use JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('Arquivo muito grande. Use uma imagem de ate 8MB.');
      return;
    }

    if (pendingAvatarPreview) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }

    setPendingAvatarFile(file);
    setPendingAvatarPreview(URL.createObjectURL(file));
    setAvatarZoom(1);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
  };

  const clampOffset = (value: number) => Math.max(-100, Math.min(100, value));
  const clampZoom = (value: number) => Math.max(MIN_AVATAR_ZOOM, Math.min(MAX_AVATAR_ZOOM, value));

  const getDistanceBetweenPointers = (points: Array<{ clientX: number; clientY: number }>) => {
    if (points.length < 2) return 0;
    const [a, b] = points;
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleAvatarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pendingAvatarPreview) return;

    event.preventDefault();
    lockPageScroll();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerMapRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (pointerMapRef.current.size >= 2) {
      const points = Array.from(pointerMapRef.current.values());
      pinchStartDistanceRef.current = getDistanceBetweenPointers(points);
      pinchStartZoomRef.current = avatarZoom;
      dragStartRef.current = null;
      setIsDraggingAvatar(false);
      return;
    }

    dragStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      startOffsetX: avatarOffsetX,
      startOffsetY: avatarOffsetY,
    };
    setIsDraggingAvatar(true);
  };

  const handleAvatarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pendingAvatarPreview) return;

    pointerMapRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (pointerMapRef.current.size >= 2 && pinchStartDistanceRef.current) {
      const points = Array.from(pointerMapRef.current.values());
      const currentDistance = getDistanceBetweenPointers(points);
      if (currentDistance > 0) {
        const nextZoom = clampZoom((currentDistance / pinchStartDistanceRef.current) * pinchStartZoomRef.current);
        setAvatarZoom(nextZoom);
      }
      return;
    }

    if (!dragStartRef.current) return;

    const deltaX = event.clientX - dragStartRef.current.clientX;
    const deltaY = event.clientY - dragStartRef.current.clientY;

    setAvatarOffsetX(clampOffset(dragStartRef.current.startOffsetX + deltaX * 0.6));
    setAvatarOffsetY(clampOffset(dragStartRef.current.startOffsetY + deltaY * 0.6));
  };

  const handleAvatarPointerEnd = () => {
    pointerMapRef.current.clear();
    pinchStartDistanceRef.current = null;
    dragStartRef.current = null;
    setIsDraggingAvatar(false);
    unlockPageScroll();
  };

  const handleAvatarWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!pendingAvatarPreview) return;
    event.preventDefault();
    event.stopPropagation();
    lockPageScroll();

    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    setAvatarZoom((prev) => clampZoom(prev + delta));

    if (wheelUnlockTimeoutRef.current) {
      window.clearTimeout(wheelUnlockTimeoutRef.current);
    }

    wheelUnlockTimeoutRef.current = window.setTimeout(() => {
      unlockPageScroll();
    }, 150);
  };

  useEffect(() => {
    const element = avatarPreviewRef.current;
    if (!element || !pendingAvatarPreview) return;

    const onNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      lockPageScroll();

      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      setAvatarZoom((prev) => clampZoom(prev + delta));

      if (wheelUnlockTimeoutRef.current) {
        window.clearTimeout(wheelUnlockTimeoutRef.current);
      }

      wheelUnlockTimeoutRef.current = window.setTimeout(() => {
        unlockPageScroll();
      }, 150);
    };

    element.addEventListener('wheel', onNativeWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', onNativeWheel);
    };
  }, [pendingAvatarPreview]);

  const handleUploadAvatar = async () => {
    if (!user?.id) return;

    if (!pendingAvatarFile) {
      alert('Selecione uma imagem primeiro.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const optimized = await optimizeAvatarImage(
        pendingAvatarFile,
        avatarZoom,
        avatarOffsetX,
        avatarOffsetY
      );
      const cleanName = optimized.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `profiles/${user.id}/${Date.now()}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, optimized, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) {
        alert(
          `Erro ao enviar foto: ${uploadError.message}. Verifique se o bucket avatars existe e se as policies de insert/update para usuario autenticado estao ativas.`
        );
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
      if (pendingAvatarPreview) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
      setPendingAvatarFile(null);
      setPendingAvatarPreview(null);
    } catch (uploadUnexpectedError: unknown) {
      alert('Erro no upload: ' + getErrorMessage(uploadUnexpectedError, 'Erro desconhecido.'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);

    try {
      const normalizedUsername = normalizeUsername(username);

      if (!isValidUsername(normalizedUsername)) {
        alert('Nome de usuário inválido. Use @ no início e não use espaços.');
        return;
      }

      if (!isValidCpf(cpf)) {
        alert('CPF inválido.');
        return;
      }

      if (!birthDate) {
        alert('Data de nascimento obrigatória.');
        return;
      }

      if (!identityLocked && cpfDigits(cpf) !== cpfDigits(cpfConfirmation)) {
        alert('Os CPFs informados não são iguais.');
        return;
      }

      if (identityLocked) {
        alert('CPF e data de nascimento ja confirmados. Somente o admin pode alterar esses dados.');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const isAvailable = await checkUsernameAvailability(normalizedUsername);
      if (!isAvailable) {
        alert('Esse nome de usuário já está em uso.');
        return;
      }

      const response = await fetch('/api/profile/me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          username: normalizedUsername,
          cpf,
          birth_date: birthDate,
          avatar_url: avatarUrl.trim(),
          identity_confirmed: confirmIdentityLock,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        profile?: UserProfile;
        identityConfirmedAt?: string | null;
      };

      if (!response.ok || !payload.profile) {
        alert('Erro ao salvar perfil: ' + (payload.error || 'Erro desconhecido.'));
        return;
      }

      setUsername(payload.profile.username || normalizedUsername);
      setCpf(payload.profile.cpf || cpf);
      setCpfConfirmation(payload.profile.cpf || cpf);
      setBirthDate(payload.profile.birth_date || birthDate);
      setAvatarUrl(payload.profile.avatar_url || avatarUrl.trim());
      setUserRole(payload.profile.role || userRole);
      setUser((currentUser) => {
        if (!currentUser) return currentUser;

        return {
          ...currentUser,
          user_metadata: {
            ...(currentUser.user_metadata || {}),
            username: payload.profile?.username || normalizedUsername,
            cpf: payload.profile?.cpf || cpf,
            birth_date: payload.profile?.birth_date || birthDate,
            avatar_url: payload.profile?.avatar_url || avatarUrl.trim(),
            identity_confirmed_at: payload.identityConfirmedAt || currentUser.user_metadata?.identity_confirmed_at,
          },
        } as User;
      });

      setConfirmIdentityLock(false);
      setProfileNotice(
        payload.identityConfirmedAt
          ? {
              tone: 'success',
              title: 'Dados confirmados',
              message: 'Perfil atualizado e dados pessoais confirmados com sucesso.',
            }
          : {
              tone: 'success',
              title: 'Perfil atualizado',
              message: 'Você ainda pode revisar CPF e data de nascimento antes de confirmar o bloqueio.',
            }
      );
    } catch (profileError: unknown) {
      setProfileNotice({
        tone: 'error',
        title: 'Não foi possível salvar',
        message: getErrorMessage(profileError, 'Erro desconhecido.'),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const emailHandle = user?.email?.split('@')?.[0]?.trim();
  const displayName =
    String(username || '').trim() ||
    String(user?.user_metadata?.username || '').trim() ||
    (emailHandle ? `@${emailHandle}` : '@usuario');
  const rawBalance = user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0;
  const parsedBalance = typeof rawBalance === 'number'
    ? rawBalance
    : Number(String(rawBalance).replace(',', '.'));
  const userBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  const formattedUserBalance = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(userBalance);
  const formattedDepositAmount = new Intl.NumberFormat('pt-BR').format(depositAmount);
  const parsedBetAmount = Number(betAmount.replace(',', '.'));
  const potentialReturn = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0 && betModal
    ? parsedBetAmount * betModal.odd
    : 0;
  const parsedWithdrawAmount = Number(withdrawAmount.replace(',', '.'));
  const filteredVotacoes = votacoesAtivas.filter((votacao) => {
    const metadata = parsePollMetadata(votacao.descricao);
    const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
    const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= nowTimestamp;

    if (isBetClosed) return false;
    if (selectedCategory === 'todos') return true;
    return metadata.categoria === selectedCategory;
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e5e7eb] animate-pulse">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-blue-200 mb-4 animate-pulse" />
          <div className="h-4 w-40 bg-blue-100 rounded mb-2 animate-pulse" />
          <div className="h-4 w-24 bg-blue-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Estilo de fundo igual ao login
  const loginBgStyle = {
    margin: 0,
    minHeight: '100vh',
    height: '100%',
    display: 'flex',
    flexDirection: "column" as React.CSSProperties['flexDirection'],
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#111111',
    backgroundImage: 'linear-gradient(32deg, rgba(8,8,8,0.74) 30px, transparent)',
    backgroundSize: '60px 60px',
    backgroundPosition: '-5px -5px',
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
  };
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={loginBgStyle}
    >
      {profileNotice && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
          <div
            className={`pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${
              profileNotice.tone === 'success'
                ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-50'
                : profileNotice.tone === 'error'
                  ? 'border-rose-400/30 bg-rose-500/12 text-rose-50'
                  : 'border-amber-400/30 bg-amber-500/12 text-amber-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  profileNotice.tone === 'success'
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : profileNotice.tone === 'error'
                      ? 'bg-rose-400/20 text-rose-200'
                      : 'bg-amber-400/20 text-amber-200'
                }`}
              >
                {profileNotice.tone === 'success' ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.75-3.75a1 1 0 111.414-1.414l3.043 3.043 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10A8 8 0 112 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 002 0V6zm-1 8a1.25 1.25 0 100-2.5A1.25 1.25 0 0010 14z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{profileNotice.title}</p>
                <p className="mt-1 text-xs leading-5 opacity-90 sm:text-sm">{profileNotice.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setProfileNotice(null)}
                className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar aviso"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-10 sm:py-4" style={{maxWidth: 1200, margin: '0 auto'}}>
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo VP"
              style={{ height: 36, width: 36, objectFit: 'contain', marginRight: 8 }}
            />
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1}}>
              <span className="text-xl sm:text-2xl font-bold text-white shrink-0 tracking-tight" style={{fontFamily: 'inherit', marginBottom: -8, letterSpacing: 0}}>Votaai</span>
              <span className="text-xs sm:text-sm font-medium text-cyan-200" style={{marginTop: 0, fontFamily: 'inherit', textAlign: 'center'}}>Previsão</span>
            </div>
          </div>
          <div className="relative flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap sm:gap-3 min-w-0">
            {/* Saldo */}
              <button
                type="button"
                onClick={() => {
                  setBalanceMenuOpen((prev) => !prev);
                  setProfileOpen(false);
                  setBetHistoryOpen(false);
                  setDepositOpen(false);
                }}
                className="flex min-w-0 flex-none items-center gap-1.5 rounded-full border border-white/15 bg-white/12 px-2.5 py-1.5 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.65)] transition hover:bg-white/20 sm:flex-none sm:gap-2 sm:px-4 sm:py-2"
              >
                <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-white/12 sm:flex">
                  <svg className="h-3.5 w-3.5 text-blue-100" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
                  </svg>
                </span>
                <span className="text-left leading-none">
                  <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/75">Saldo</span>
                  <span className="text-[11px] sm:text-sm font-semibold text-white">
                    {formattedUserBalance}
                  </span>
                </span>
                <svg
                  className={`h-3.5 w-3.5 text-blue-100 transition-transform ${balanceMenuOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
                </svg>
              </button>
              {balanceMenuOpen && (
                <div className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-2rem)]">
                  <div className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 shadow-[0_28px_60px_-24px_rgba(2,6,23,0.9)]">
                    <div className="border-b border-white/10 bg-gradient-to-r from-cyan-500/12 via-transparent to-blue-500/10 px-5 pb-5 pt-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/90">Painel financeiro</p>
                      <p className="mt-2 text-xs text-blue-100/75">Saldo disponível</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-white">{formattedUserBalance}</p>
                    </div>

                    <div className="px-5 py-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">CPF para saque</p>
                        <p className="mt-2 text-sm font-semibold text-white">{cpf || user?.user_metadata?.cpf || 'Não definido'}</p>
                        <p className="mt-1 text-xs leading-5 text-blue-100/65">O valor solicitado será enviado para o CPF cadastrado na sua conta.</p>
                      </div>

                      <div className="mt-4 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                        setWithdrawOpen(true);
                        setBalanceMenuOpen(false);
                        setProfileOpen(false);
                        setBetHistoryOpen(false);
                        setDepositOpen(false);
                        resetPixState();
                      }}
                        className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 shadow-[0_16px_30px_-18px_rgba(16,185,129,0.85)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        Solicitar saque
                      </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.matchMedia('(max-width: 639px)').matches) {
                          setBalanceMenuOpen(false);
                          router.push('/home/historico-financeiro');
                          return;
                        }

                        setFinancialHistoryOpen(true);
                        setBalanceMenuOpen(false);
                        setProfileOpen(false);
                        setBetHistoryOpen(false);
                        setDepositOpen(false);
                        void loadFinancialHistory();
                      }}
                        className="w-full rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100 shadow-[0_14px_28px_-22px_rgba(34,211,238,0.7)] transition hover:bg-cyan-400/15 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      >
                        Ver histórico financeiro
                      </button>
                      </div>
                    </div>
                  </div>
                </div>
            )}
            {/* Botão Depositar */}
            <button
              type="button"
              onClick={() => {
                setDepositOpen(true);
                setProfileOpen(false);
                setBetHistoryOpen(false);
                setBalanceMenuOpen(false);
                resetPixState();
              }}
              className="flex-none rounded-full bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-600 shadow-sm transition hover:bg-blue-50 active:scale-95 sm:flex-none sm:px-4 sm:py-2 sm:text-sm shrink-0"
            >
              Depositar
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.matchMedia('(max-width: 639px)').matches) {
                  router.push('/home/historico');
                  return;
                }

                setBetHistoryOpen((prev) => !prev);
                setProfileOpen(false);
                setDepositOpen(false);
                setBalanceMenuOpen(false);
                void loadBetHistory();
              }}
              className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-blue-500 text-white shadow-sm transition hover:border-white/80"
              title="Histórico de apostas"
              aria-label="Histórico de apostas"
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.5A2.5 2.5 0 017 4h10a2.5 2.5 0 012.5 2.5v11A2.5 2.5 0 0117 20H7a2.5 2.5 0 01-2.5-2.5v-11z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 4v16" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 8h5M11 11h5M11 14h4" />
              </svg>
            </button>
            {/* Avatar */}
            <button
              type="button"
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setBetHistoryOpen(false);
                setBalanceMenuOpen(false);
              }}
              className="h-9 w-9 sm:h-10 sm:w-10 overflow-hidden rounded-full border-2 border-white/40 bg-blue-500 shadow-sm transition hover:border-white/80"
              title="Perfil"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Perfil" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </button>
            {betHistoryOpen && (
              <div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-9.5rem)] w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 shadow-2xl sm:absolute sm:right-0 sm:top-14 sm:left-auto sm:w-[min(560px,calc(100vw-1rem))] sm:translate-x-0 sm:translate-y-0 sm:max-h-[70vh] sm:rounded-3xl"
                style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 pb-3 pt-3 text-white sm:px-6 sm:pb-5 sm:pt-6">
                  <div>
                    <h3 className="mt-0.5 text-sm font-bold sm:mt-1 sm:text-lg">Histórico de apostas</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBetHistoryOpen(false)}
                    className="rounded-full border border-white/30 p-2 text-white transition hover:bg-white/15"
                    aria-label="Fechar histórico"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                  {betHistoryError && (
                    <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:mb-4 sm:p-4 sm:text-sm">
                      {betHistoryError}
                    </div>
                  )}

                  {betHistory.length > 0 ? (
                    <div className="space-y-2 sm:space-y-3">
                      {betHistory.map((bet) => (
                        <div key={bet.id} className="rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-5 shadow-2xl sm:p-7 flex flex-col gap-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-bold text-cyan-100 sm:text-lg mb-1">{bet.votacaoTitulo}</p>
                              <p className="text-sm text-cyan-300">Candidato: <span className="font-semibold text-white">{bet.candidato}</span></p>
                              <p className="mt-1 text-xs text-cyan-500">{new Date(bet.createdAt).toLocaleString('pt-BR')}</p>
                            </div>

                            <div className="grid gap-1 text-right">
                              <span className="text-xs text-cyan-400">Aposta</span>
                              <span className="text-lg font-extrabold text-cyan-100">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.amount)}
                              </span>
                              <span className="text-xs text-cyan-400">Retorno potencial</span>
                              <span className="text-lg font-extrabold text-cyan-200">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.potentialReturn)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-cyan-900 pt-4 mt-2">
                            <span className="text-xs text-cyan-400">Cotação <span className="font-bold text-cyan-200">{bet.odd.toFixed(2)}x</span></span>
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold shadow-lg tracking-tight ${
                                bet.status === 'ganhou'
                                  ? 'bg-emerald-700/40 text-emerald-200 animate-pulse'
                                  : bet.status === 'perdeu'
                                    ? 'bg-rose-900/50 text-rose-200'
                                    : 'bg-amber-900/50 text-amber-200'
                              }`}
                            >
                              {bet.status === 'ganhou' && (
                                <svg className="h-5 w-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              )}
                              {bet.status === 'perdeu' && (
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              )}
                              {bet.status === 'ganhou'
                                ? 'Você ganhou'
                                : bet.status === 'perdeu'
                                  ? 'Você perdeu'
                                  : (<><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-200" />Aguardando resultado</>)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-cyan-900 bg-gradient-to-br from-slate-900 to-blue-900 p-4 text-center text-xs text-cyan-200 sm:p-6 sm:text-sm">
                      Você ainda não fez apostas.
                    </div>
                  )}
                </div>
              </div>
            )}
            {financialHistoryOpen && (
              <div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 shadow-2xl sm:absolute sm:right-0 sm:top-14 sm:left-auto sm:w-[min(560px,calc(100vw-1rem))] sm:translate-x-0 sm:translate-y-0 sm:max-h-[70vh]"
                style={{ fontFamily: 'var(--font-poppins), sans-serif', boxShadow: '0 8px 32px 0 rgba(0, 255, 255, 0.15)' }}
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-6 pb-5 pt-6 text-white">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Área financeira</p>
                    <h3 className="mt-1 text-lg font-bold">Histórico de depósitos e saques</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFinancialHistoryOpen(false)}
                    className="rounded-full border border-white/30 p-2 text-white transition hover:bg-white/15"
                    aria-label="Fechar histórico financeiro"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  {financialHistoryError && (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {financialHistoryError}
                    </div>
                  )}

                  {financialHistory.length > 0 ? (
                    <div className="space-y-3">
                      {financialHistory.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 p-4 shadow-lg">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-cyan-200">
                                {item.tipo === 'deposito' ? 'Depósito PIX' : 'Solicitação de saque'}
                              </p>
                              <p className="mt-1 text-xs text-blue-200">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
                            </div>
                            <p className={`text-base font-bold ${item.tipo === 'deposito' ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {item.tipo === 'deposito' ? '+' : '-'}
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                            </p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cyan-800 pt-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold shadow-md ${
                              item.status === 'aprovado'
                                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-400'
                                : item.status === 'recusado'
                                  ? 'bg-rose-700/20 text-rose-300 border border-rose-400'
                                  : 'bg-amber-600/20 text-amber-200 border border-amber-400'
                            }`}>
                              {item.status === 'aprovado' && (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              )}
                              {item.status === 'recusado' && (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              )}
                              {item.status === 'aprovado'
                                ? 'Aprovado'
                                : item.status === 'recusado'
                                  ? 'Recusado'
                                  : (<><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300" />Pendente</>)}
                            </span>
                            {item.tipo === 'saque' && item.cpf && (
                              <span className="text-xs text-cyan-200">CPF: {item.cpf}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-cyan-900 bg-gradient-to-br from-slate-900 to-blue-900 p-6 text-center text-sm text-cyan-200">
                      Você ainda não possui histórico de depósitos ou saques.
                    </div>
                  )}
                </div>
              </div>
            )}
            {profileOpen && (
              <div
                className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[calc(100vh-9.5rem)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#171b22] shadow-2xl sm:top-14 sm:w-[min(380px,calc(100vw-1rem))] sm:max-h-[70vh]"
                style={{ fontFamily: 'var(--font-poppins), sans-serif', boxShadow: '0 8px 32px 0 rgba(0, 255, 255, 0.15)' }}
              >
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,#243042,transparent_70%)] px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white sm:text-base">Perfil da conta</h3>
                      <p className="mt-0.5 text-[11px] text-cyan-200 sm:mt-1 sm:text-xs">Atualize seus dados de exibição.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      className="rounded-full border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      aria-label="Fechar perfil"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 sm:p-5">
                <form onSubmit={handleSaveProfile} className="space-y-2.5 sm:space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                    <div className="flex items-center gap-3">
                    <div className="group relative h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-[#0f1115] shadow-lg sm:h-16 sm:w-16">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover group-hover:ring-4 group-hover:ring-cyan-400/60 transition" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-300">
                          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="12" cy="8" r="4" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                          </svg>
                        </div>
                      )}


                      <label
                        className="absolute bottom-0 right-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-green-500 text-[#0f1115] shadow-lg transition hover:scale-105 sm:h-7 sm:w-7"
                        title="Alterar foto"
                      >
                        {uploadingAvatar ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h4l2-2h6l2 2h4v12H3V7z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) handleSelectAvatarFile(file);
                          }}
                        />
                      </label>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{displayName}</p>
                      <p className="mt-1 text-xs text-zinc-400 sm:text-sm">Atualize sua foto de perfil.</p>
                    </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Email</p>
                    <p className="mt-1 break-all text-xs font-medium text-white sm:text-sm">{user?.email}</p>
                    {/* Botão admin removido */}

                    {/* Exibição do id removida */}
                  </div>

                  {pendingAvatarPreview && (
                    <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                      <p className="mb-2 text-xs font-medium text-white sm:text-sm">Ajuste sua foto</p>
                      <div className="mb-3 flex items-center justify-center">
                        <div
                          ref={avatarPreviewRef}
                          className={`h-24 w-24 overflow-hidden rounded-full border border-white/10 bg-[#0f1115] touch-none sm:h-28 sm:w-28 ${
                            isDraggingAvatar ? 'cursor-grabbing' : 'cursor-grab'
                          }`}
                          style={{ touchAction: 'none' }}
                          onPointerDown={handleAvatarPointerDown}
                          onPointerMove={handleAvatarPointerMove}
                          onPointerUp={handleAvatarPointerEnd}
                          onPointerCancel={handleAvatarPointerEnd}
                          onPointerLeave={handleAvatarPointerEnd}
                          onWheel={handleAvatarWheel}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pendingAvatarPreview}
                            alt="Pre-visualizacao"
                            className="h-full w-full select-none object-cover pointer-events-none"
                            draggable={false}
                            style={{
                              transform: `scale(${avatarZoom}) translate(${avatarOffsetX / 2}%, ${avatarOffsetY / 2}%)`,
                              transformOrigin: 'center',
                            }}
                          />
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400">Arraste para mover.</p>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (pendingAvatarPreview) {
                              URL.revokeObjectURL(pendingAvatarPreview);
                            }
                            setPendingAvatarFile(null);
                            setPendingAvatarPreview(null);
                          }}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10"
                        >
                          Cancelar foto
                        </button>
                        <button
                          type="button"
                          onClick={handleUploadAvatar}
                          disabled={uploadingAvatar}
                          className="rounded-xl bg-green-500 px-3 py-2 text-xs font-semibold text-[#0f1115] transition hover:bg-green-400 disabled:opacity-50"
                        >
                          {uploadingAvatar ? 'Enviando...' : 'Aplicar foto'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                    <label htmlFor="profile-username" className="mb-1 block text-xs font-medium text-zinc-300 sm:text-sm">
                      Nome de usuário
                    </label>
                    <input
                      id="profile-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                      minLength={3}
                      required
                      placeholder="Nome de usuário (@seunome)"
                      className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-[#0f1115] disabled:text-zinc-500"
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                    <label htmlFor="profile-cpf" className="mb-1 block text-xs font-medium text-zinc-300 sm:text-sm">
                      CPF
                    </label>
                      <input
                        id="profile-cpf"
                        type="text"
                      inputMode="numeric"
                      value={cpf}
                      onChange={(e) => setCpf(formatCpf(e.target.value))}
                      placeholder="CPF (000.000.000-00)"
                      required
                      disabled={identityLocked}
                      className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-[#0f1115] disabled:text-zinc-500"
                      />
                    </div>

                  {!identityLocked && (
                    <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                      <label htmlFor="profile-cpf-confirm" className="mb-1 block text-xs font-medium text-zinc-300 sm:text-sm">
                        Confirme seu CPF
                      </label>
                      <input
                        id="profile-cpf-confirm"
                        type="text"
                        inputMode="numeric"
                        value={cpfConfirmation}
                        onChange={(e) => setCpfConfirmation(formatCpf(e.target.value))}
                        placeholder="Confirme seu CPF"
                        required
                        className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/10 bg-[#11151b] p-3 sm:p-4">
                    <label htmlFor="profile-birthDate" className="mb-1 block text-xs font-medium text-zinc-300 sm:text-sm">
                      Data de nascimento
                    </label>
                    <input
                      id="profile-birthDate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                      disabled={identityLocked}
                      className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-3 py-2 text-sm text-white shadow-sm disabled:cursor-not-allowed disabled:text-zinc-500"
                    />
                  </div>

                  {!identityLocked ? (
                    <label className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100 sm:text-sm">
                      <input
                        type="checkbox"
                        checked={confirmIdentityLock}
                        onChange={(event) => setConfirmIdentityLock(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#0f1115] text-amber-400 focus:ring-amber-400"
                      />
                      <span>
                        Confirmo que meu CPF e minha data de nascimento estão corretos. Depois disso, esses dados serão bloqueados e só o admin poderá alterar.
                      </span>
                    </label>
                  ) : (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200 sm:text-sm">
                      CPF e data de nascimento confirmados. Para alterar esses dados, entre em contato com o admin.
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1.5 sm:pt-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/15 hover:text-white sm:text-sm"
                    >
                      Sair
                    </button>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="flex-1 rounded-xl bg-green-500 px-3 py-2 text-xs font-semibold text-[#0f1115] shadow-lg transition hover:bg-green-400 disabled:opacity-50 sm:text-sm"
                    >
                      {savingProfile ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className={
          depositOpen
            ? 'min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 py-6 pb-24 sm:py-10 sm:pb-28'
            : withdrawOpen
              ? 'flex min-h-screen w-full items-start justify-center px-3 py-6 pb-24 sm:px-6 sm:py-10 sm:pb-28'
            : 'flex flex-1 flex-col items-center w-full px-2 py-10 pb-24 sm:pb-28'
        }
      >
        {depositOpen ? (
          <>
          <div
            className="mx-auto max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_34%),linear-gradient(160deg,#020617_0%,#082f49_46%,#0f172a_100%)] shadow-[0_32px_90px_-30px_rgba(2,6,23,0.95)]"
            style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
          >
            {/* Cabeçalho */}
            <div className="relative overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,47,73,0.96)_0%,rgba(8,145,178,0.86)_52%,rgba(30,64,175,0.92)_100%)] px-6 pb-10 pt-6 text-center">
              <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_68%)]" />
              <div className="mb-1 flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => setDepositOpen(false)}
                  className="relative z-10 flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium text-cyan-50 transition hover:bg-white/15 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Voltar
                </button>
              </div>
              <div className="relative z-10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/15 bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                <svg className="h-8 w-8 text-cyan-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <p className="relative z-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/75">Adicionar saldo</p>
              <h2 className="relative z-10 mt-2 text-3xl font-bold text-white">Depósito via PIX</h2>
              <p className="relative z-10 mt-2 text-sm leading-6 text-cyan-50/85">Adicione saldo com confirmação rápida, código instantâneo e liberação automática após o pagamento.</p>
            </div>

            {/* Conteúdo */}
            <div className="-mt-5 rounded-t-[30px] border-t border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.94)_0%,rgba(15,23,42,0.98)_100%)] px-5 pb-6 pt-6 sm:px-7 sm:pb-8">

              {/* Card valor */}
              <div className="mb-5 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_20px_45px_-30px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                <div className="border-b border-white/8 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Valor do depósito</p>
                </div>

                <div className="flex items-end gap-2 px-4 py-5">
                  <span className="pb-1 text-lg font-semibold text-cyan-300">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formattedDepositAmount}
                    onChange={(e) => setDepositAmount(parseCurrencyToNumber(e.target.value))}
                    className="w-full bg-transparent text-3xl font-bold tracking-tight text-white outline-none sm:text-5xl"
                    aria-label="Valor do deposito"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4">
                  {[10, 50, 100, 200].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setDepositAmount(amount)}
                      className={`rounded-xl py-2 text-sm font-semibold transition active:scale-95 ${
                        depositAmount === amount
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-[0_14px_26px_-18px_rgba(34,211,238,0.9)]'
                          : 'border border-white/10 bg-slate-950/70 text-cyan-100/85 hover:border-cyan-400/30 hover:bg-slate-900'
                      }`}
                    >
                      {`R$\u00a0${amount}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avisos */}
              {depositAmount < MIN_PIX_DEPOSIT && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3">
                  <svg className="h-4 w-4 shrink-0 text-amber-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-sm text-amber-200">Informe um valor minimo de <strong>R$ 10,00</strong>.</p>
                </div>
              )}
              {/* Botão principal */}
              <div className="mb-4 rounded-[24px] border border-cyan-400/12 bg-cyan-400/[0.04] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Resumo do depósito</p>
                <div className="mt-3 flex items-center justify-between text-sm text-blue-100/80">
                  <span>Forma de pagamento</span>
                  <span className="font-semibold text-white">PIX</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-blue-100/80">
                  <span>Valor selecionado</span>
                  <span className="font-semibold text-cyan-100">R$ {formattedDepositAmount}</span>
                </div>
              </div>

                <button
                  type="button"
                  onClick={handleCreatePixDeposit}
                  disabled={depositAmount < MIN_PIX_DEPOSIT || creatingPix}
                  className="w-full rounded-[22px] bg-[linear-gradient(135deg,#22d3ee_0%,#2563eb_58%,#1d4ed8_100%)] py-4 text-base font-bold text-white shadow-[0_24px_40px_-22px_rgba(37,99,235,0.9)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                {creatingPix ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Gerando PIX...
                  </span>
                ) : 'Depositar via PIX'}
              </button>

              {pixStatusMessage && !(pixQrBase64 || pixQrCode) && (
                <p className="mt-3 text-center text-sm text-cyan-300">{pixStatusMessage}</p>
              )}

              <p className="mt-5 text-center text-xs leading-5 text-cyan-100/70">
                O depósito será creditado assim que o pagamento for confirmado pela instituição bancária.
              </p>
              <p className="mt-3 text-center text-sm text-blue-100/80">Logado como {displayName}. Escolha uma votação para apostar.</p>
            </div>
          </div>

          {/* Modal overlay do QR Code */}
          {(pixQrBase64 || pixQrCode) && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
              <div className="relative w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>

                {/* Header colorido */}
                <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_58%,#06b6d4_100%)] px-6 pb-7 pt-5 text-center sm:pb-8 sm:pt-6">
                  <button
                    type="button"
                    onClick={() => { setPixQrCode(null); setPixQrBase64(null); setPixPaymentId(null); setPixStatusMessage(null); }}
                    className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-1.5 text-blue-100 transition hover:bg-white/20 hover:text-white"
                    aria-label="Fechar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {/* Ícone PIX */}
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/15">
                    <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                      <path d="M12 22V12M2 7L12 12M22 7L12 12" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <p className="text-xl font-bold text-white">Pague com PIX</p>
                  <p className="mt-1 text-sm text-blue-100">Escaneie o QR Code ou copie o código para concluir o pagamento</p>
                </div>

                {/* Conteúdo */}
                <div className="px-6 pb-6">
                  {pixQrBase64 && (
                    <div className="-mt-6 flex justify-center">
                      <div className="rounded-2xl border-4 border-white bg-white shadow-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:image/png;base64,${pixQrBase64}`}
                          alt="QR Code PIX"
                          className="h-44 w-44 sm:h-52 sm:w-52 rounded-xl p-1"
                        />
                      </div>
                    </div>
                  )}

                  {pixQrCode && (
                    <div className={pixQrBase64 ? 'mt-5' : 'mt-6'}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {pixQrBase64 ? 'Ou copie o código abaixo' : 'Copie o código PIX'}
                      </p>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 break-all font-mono text-xs leading-relaxed text-slate-600">
                        {pixQrCode}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(pixQrCode);
                          setPixStatusMessage('Código PIX copiado!');
                        }}
                        className="mt-3 w-full rounded-2xl bg-[linear-gradient(135deg,#2563eb_0%,#0891b2_100%)] py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
                      >
                        Copiar código PIX
                      </button>
                    </div>
                  )}

                  {pixStatusMessage && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
                      <svg className="h-4 w-4 shrink-0 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      <p className="text-sm font-semibold text-emerald-700">{pixStatusMessage}</p>
                    </div>
                  )}

                  {/* Rodapé aguardando */}
                  <div className="mt-4 flex items-center justify-center gap-2 text-slate-400">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    <p className="text-xs">Aguardando confirmação do pagamento...</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          </>
        ) : withdrawOpen ? (
          <>
            <div
              className="mx-auto w-full max-w-md overflow-hidden rounded-[34px] border border-white/12 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.2),transparent_30%),linear-gradient(160deg,rgba(2,6,23,0.96)_0%,rgba(10,21,40,0.96)_38%,rgba(15,23,42,0.98)_100%)] shadow-[0_34px_100px_-28px_rgba(2,6,23,0.88)] backdrop-blur-xl"
              style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
            >
              <div className="relative overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,47,73,0.9)_0%,rgba(30,64,175,0.88)_52%,rgba(8,145,178,0.9)_100%)] px-5 pb-9 pt-6 sm:px-6">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_70%)]" />
                <div className="absolute -right-8 top-10 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl" />
                <div className="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-blue-200/10 blur-3xl" />
                <div className="mb-5 flex items-center justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawOpen(false);
                      resetWithdrawState();
                    }}
                    className="relative z-10 flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium text-blue-50 transition hover:bg-white/15 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    Voltar
                  </button>
                </div>
                <div className="relative z-10 flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-white/15 bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2M5 9h14l-1 10H6L5 9z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/75">Área financeira</p>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Solicitar saque</h2>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-blue-100/85">
                      Informe o valor desejado e confirme para receber no CPF cadastrado.
                    </p>
                  </div>
                </div>

              </div>

              <div className="-mt-5 rounded-t-[30px] border-t border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.96)_0%,rgba(15,23,42,0.98)_100%)] px-4 pb-6 pt-6 sm:px-7 sm:pb-8">
                <div className="mb-4 rounded-[26px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Resumo disponível</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-white">{formattedUserBalance}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75">Status</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-100">Disponível para saque</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-[22px] border border-white/8 bg-black/20 p-3 text-sm text-blue-100/75">
                    <div className="flex items-center justify-between gap-3">
                      <span>CPF para recebimento</span>
                      <span className="font-semibold text-white">{cpf || user?.user_metadata?.cpf || 'Não definido'}</span>
                    </div>
                    <p className="text-xs leading-5 text-slate-400">
                      O valor aprovado será enviado para o CPF cadastrado na conta.
                    </p>
                  </div>
                </div>

                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3">
                  <svg className="h-4 w-4 shrink-0 text-amber-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-sm text-amber-200">Valor mínimo para saque: <strong>R$ 50</strong></p>
                </div>

                <div className="mb-4 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_20px_45px_-30px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                  <div className="border-b border-white/8 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Valor do saque</p>
                  </div>
                  <div className="px-4 py-5">
                    <div className="flex items-end gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 focus-within:border-cyan-400/35 focus-within:bg-black/25">
                      <span className="pb-1 text-lg font-semibold text-cyan-300">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="w-full bg-transparent text-3xl font-bold tracking-tight text-white outline-none placeholder:text-slate-500 sm:text-5xl"
                        aria-label="Valor do saque"
                        placeholder="0,00"
                      />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      Digite o valor que deseja retirar. A solicitação ficará pendente até aprovação.
                    </p>
                  </div>
                </div>

                {withdrawStatusMessage && (
                  <div className="mb-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-50 shadow-[0_14px_30px_-26px_rgba(34,211,238,0.35)]">
                    {withdrawStatusMessage}
                  </div>
                )}

                <div className="mb-5 rounded-[26px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Resumo da solicitação</p>
                      <p className="mt-1 text-xs text-slate-400">Confira os dados antes de confirmar.</p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-blue-100/80">
                      Revisão final
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm text-blue-100/75">
                      <span>Saldo disponível</span>
                      <span className="font-semibold text-white">{formattedUserBalance}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm text-blue-100/75">
                      <span>Valor solicitado</span>
                      <span className="font-semibold text-white">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          Number.isFinite(parsedWithdrawAmount) ? parsedWithdrawAmount : 0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm text-blue-100/75">
                      <span>Valor mínimo</span>
                      <span className="font-semibold text-white">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(MIN_WITHDRAWAL)}
                      </span>
                    </div>
                    <div className="h-px bg-white/8" />
                    <div className="flex items-center justify-between gap-3 text-sm text-blue-100/75">
                      <span>Saldo após solicitação</span>
                      <span className="font-semibold text-cyan-200">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          Math.max(userBalance - (Number.isFinite(parsedWithdrawAmount) ? parsedWithdrawAmount : 0), 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestWithdraw}
                  disabled={requestingWithdraw}
                  className="w-full rounded-[22px] bg-[linear-gradient(135deg,#22d3ee_0%,#2563eb_58%,#1d4ed8_100%)] py-4 text-base font-bold text-white shadow-[0_24px_40px_-22px_rgba(37,99,235,0.75)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {requestingWithdraw ? 'Enviando solicitação...' : 'Confirmar solicitação de saque'}
                </button>

                <p className="mt-4 text-center text-xs leading-5 text-slate-400">
                  A aprovação é feita com base nos dados da conta e o pagamento segue para o CPF cadastrado.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full">
          <section className="mb-8 text-center text-white">
            <div>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">Mercado de previsão</h2>
              <p className="mt-4 text-sm leading-7 text-cyan-200 sm:text-base">
                Acompanhe as votações e aposte no candidato que você acredita.<br />
                Entre em entretenimento, esportes, política, financeiro, celebridades ou cripto e participe das interações ao vivo.
              </p>
            </div>
          </section>

          <section>
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div />
              </div>

              <CategoryCarousel
                categories={[...CATEGORY_OPTIONS]}
                selectedCategory={selectedCategory}
                onCategoryChange={(value) =>
                  setSelectedCategory(
                    value as 'todos' | 'politica' | 'entretenimento' | 'esportes' | 'financeiro' | 'celebridades' | 'criptomoedas'
                  )
                }
                variant="dark"
              />
            </div>

            {votacoesError && (
              <div className="mb-4 rounded-xl border border-red-500/40 bg-red-900/20 p-4 text-sm text-red-200">
                {votacoesError}
              </div>
            )}

            {filteredVotacoes.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredVotacoes.map((votacao) => {
                  const metadata = parsePollMetadata(votacao.descricao);
                  const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
                  const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();

                  return (
                    <div key={votacao.id} className="min-h-[180px] rounded-2xl border border-white/10 bg-[#171b22] p-4 shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-green-500/30 hover:shadow-[0_0_25px_rgba(34,197,94,0.08)]">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <span className="text-xs text-zinc-400">
                          {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                        </span>
                        <span className={`inline-flex items-center gap-2 text-xs font-semibold ${
                          isBetClosed ? 'text-zinc-500' : 'text-yellow-400'
                        }`}>
                          {!isBetClosed && (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400/80" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-300" />
                            </span>
                          )}
                          {isBetClosed ? 'ENCERRADA' : 'AO VIVO'}
                        </span>
                      </div>

                      <h3 className="mb-2 text-sm font-semibold text-white">{votacao.titulo}</h3>
                      <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">{metadata.descricaoLimpa}</p>
                      <p className="mb-4 text-xs text-zinc-400">
                        Encerra em:{' '}
                        {metadata.encerramentoAposta
                          ? new Date(metadata.encerramentoAposta).toLocaleString('pt-BR')
                          : 'Não definido'}
                      </p>

                      {metadata.tipo === 'enquete-candidatos' ? (
                        <div className="space-y-2.5">
                          {Array.isArray(votacao.opcoes) && (() => {
                            const parsedOptions = votacao.opcoes.map((candidato) => parsePollOption(candidato));
                            const votes = parsedOptions.map((option, idx) => {
                              const baseVotes = getSimulatedBaseBets(votacao.id, option, idx);
                              const realVotes = getRealBetCount(betCounts, votacao.id, option.label);
                              return baseVotes + realVotes;
                            });
                            const totalVotes = votes.reduce((acc, current) => acc + current, 0);

                            return parsedOptions.map((parsedOption, idx) => {
                              const percent = totalVotes > 0 ? Math.max(1, Math.round((votes[idx] / totalVotes) * 100)) : 0;

                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => openBetModal(votacao, parsedOption)}
                                  disabled={isBetClosed}
                                  className="w-full rounded-2xl border border-white/10 bg-[#11151b] px-3 py-3 text-left transition-all duration-200 hover:border-green-500/20 hover:bg-[#151a22] disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1a1f28]">
                                        {parsedOption.imageUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                        ) : (
                                          <span className="text-xs font-semibold text-white">{parsedOption.label.slice(0, 1).toUpperCase()}</span>
                                        )}
                                      </div>
                                      <span className="text-sm font-semibold text-white">{parsedOption.label}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">
                                        {getDisplayedOdd(parsedOption.odds)}
                                      </span>
                                      <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-400">
                                        {percent}%
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                  <p className="mt-2 text-[11px] text-zinc-400">{votes[idx]} apostas</p>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(votacao.opcoes) && votacao.opcoes.map((opcao, idx) => {
                            const parsedOption = parsePollOption(opcao);
                            return (
                              <span key={idx} className="inline-flex items-center gap-2 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">
                                {parsedOption.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-4 border-t border-white/10 pt-4">
                        <button
                          type="button"
                          onClick={() => void toggleComments(votacao.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-green-500/30 hover:bg-white/10"
                        >
                          <span>Comentários</span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-zinc-300">
                            {(commentsByVotingId[votacao.id] || []).length}
                          </span>
                        </button>

                        {expandedCommentsId === votacao.id && (
                          <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-[#11151b] p-3">
                            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                              {loadingCommentsByVotingId[votacao.id] ? (
                                <p className="text-xs text-zinc-400">Carregando comentários...</p>
                              ) : (commentsByVotingId[votacao.id] || []).length > 0 ? (
                                (commentsByVotingId[votacao.id] || []).map((comment) => (
                                  <div key={comment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-white">{comment.username}</span>
                                      <span className="text-[11px] text-zinc-500">
                                        {new Date(comment.created_at).toLocaleString('pt-BR')}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-zinc-300">{comment.message}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-zinc-400">Ainda não há comentários neste mercado.</p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <textarea
                                value={commentDraftByVotingId[votacao.id] || ''}
                                onChange={(event) =>
                                  setCommentDraftByVotingId((current) => ({
                                    ...current,
                                    [votacao.id]: event.target.value,
                                  }))
                                }
                                rows={3}
                                placeholder={user ? 'Compartilhe sua leitura desse mercado...' : 'Entre para comentar'}
                                disabled={!user}
                                className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-zinc-500">
                                  {commentStatusByVotingId[votacao.id] || 'Comentários aparecem assim que o card for aberto.'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void submitComment(votacao.id)}
                                  disabled={!user}
                                  className="rounded-full bg-green-500 px-3 py-1.5 text-xs font-semibold text-[#0f1115] transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {user ? 'Comentar' : 'Entrar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-700 bg-cyan-900/30 p-8 text-center">
                <p className="text-cyan-200">
                  {selectedCategory === 'todos'
                    ? 'Nenhuma votação ativa no momento. Volte em breve!'
                    : `Nenhuma votação ativa na categoria ${getCategoryLabel(selectedCategory)}.`}
                </p>
              </div>
            )}
          </section>

          {betModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/86 p-4 backdrop-blur-md">
              <div className="flex w-full max-w-[25rem] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#08111f] shadow-[0_32px_100px_rgba(2,6,23,0.72)] sm:max-w-[28rem] sm:rounded-[32px]">
                <div className="bg-[linear-gradient(145deg,#07111f_0%,#0f1f3d_42%,#0a84b7_100%)] px-5 pb-4 pt-4 text-white sm:px-6 sm:pb-5 sm:pt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setBetModal(null);
                      setBetAmount('');
                      setBetFeedback(null);
                    }}
                    className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-50 transition hover:bg-white/15"
                  >
                    Voltar
                  </button>
                  <p className="mt-2 text-lg font-semibold leading-tight text-white sm:mt-3 sm:text-[1.65rem]">{betModal.votacaoTitulo}</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-blue-50/90">Revise os dados antes de confirmar sua posição.</p>
                </div>

                <div className="max-h-[58vh] overflow-y-auto bg-[linear-gradient(180deg,#eff5fc_0%,#ffffff_18%,#f7fbff_100%)] p-3.5 sm:max-h-[56vh] sm:p-4">
                  <div className="-mt-8 rounded-[24px] border border-white/90 bg-white p-3.5 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.45)] sm:-mt-10 sm:rounded-[28px] sm:p-4">
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 shadow-sm sm:h-16 sm:w-16 sm:rounded-[20px]">
                        {betModal.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={betModal.imageUrl} alt={betModal.candidato} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-base font-bold text-cyan-700 sm:text-lg">{betModal.candidato.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Escolha confirmada</p>
                        <p className="mt-1 text-base font-semibold leading-tight text-slate-950 sm:text-lg">{betModal.candidato}</p>
                      </div>
                    </div>
                    <div className="mt-3 inline-flex rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold tabular-nums text-emerald-800 sm:rounded-[18px] sm:px-3.5 sm:py-1.5 sm:text-sm">
                      {betModal.odd.toFixed(2)}x
                    </div>
                  </div>

                  <label className="mt-4 block text-sm font-semibold text-slate-800 sm:mt-5">Valor da aposta</label>
                  <div className="mt-2.5 flex items-center rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus-within:border-cyan-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-cyan-100 sm:py-3.5">
                    <span className="text-sm font-bold text-cyan-700 sm:text-base">R$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={betAmount}
                      onChange={(event) => setBetAmount(event.target.value)}
                      placeholder="Ex: 25"
                      className="w-full border-0 bg-transparent px-3 text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400 sm:text-lg"
                    />
                  </div>

                  <div className="mt-4 grid gap-2.5 rounded-[22px] border border-slate-200 bg-[#f8fbff] p-3 text-sm shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] sm:rounded-[24px] sm:p-4">
                    <div className="rounded-[18px] border border-cyan-200 bg-cyan-50 px-3.5 py-3 shadow-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Retorno estimado</span>
                      <span className="mt-1.5 block text-base font-bold tabular-nums text-cyan-900 sm:text-lg">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialReturn)}
                      </span>
                    </div>
                  </div>

                  {betFeedback && (
                    <p className={`mt-4 rounded-[18px] px-4 py-2.5 text-sm font-medium ${
                      betFeedback.includes('sucesso') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {betFeedback}
                    </p>
                  )}

                  <div className="mt-4 flex gap-3 sm:mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setBetModal(null);
                        setBetAmount('');
                        setBetFeedback(null);
                      }}
                      className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePlaceBet()}
                      disabled={placingBet}
                      className="flex-1 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#0f5ae0_42%,#0ea5a4_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(14,116,144,0.8)] transition hover:brightness-105 disabled:opacity-60"
                    >
                      {placingBet ? 'Enviando...' : 'Confirmar aposta'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}





          </div>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}

export default function UsuariosPage() {
  return (
    <Suspense fallback={null}>
      <UsuariosPageContent />
    </Suspense>
  );
}


