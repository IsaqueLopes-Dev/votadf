'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import CategoryCarousel from '../components/category-carousel';
import BottomNavigation from '../../components/bottom-navigation';

const META_PREFIX = '__meta__:';
const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'futebol', label: 'Futebol' },
] as const;

type PollType = 'opcoes-livres' | 'enquete-candidatos';
type PollCategory = 'politica' | 'entretenimento' | 'futebol' | '';

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

type BetCountsMap = Record<string, Record<string, number>>;

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
        categoria:
          parsed.categoria === 'politica' || parsed.categoria === 'entretenimento' || parsed.categoria === 'futebol'
            ? parsed.categoria
            : '',
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

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [cpf, setCpf] = useState('');
  const [cpfConfirmation, setCpfConfirmation] = useState('');
  const [birthDate, setBirthDate] = useState('');
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
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
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
  const [selectedCategory, setSelectedCategory] = useState<'todos' | 'politica' | 'entretenimento' | 'futebol'>('todos');
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
  const MAX_PIX_DEPOSIT = 200;

  useEffect(() => {
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

  // Só bloqueia se birth_date já estiver preenchido
  const identityLocked = Boolean(user?.user_metadata?.birth_date);

  const hasRequiredBetProfile = (currentUser: any) => {
    return Boolean(currentUser?.user_metadata?.cpf && currentUser?.user_metadata?.birth_date);
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
        setUsername(user.user_metadata?.username || (user.email ? `@${user.email.split('@')[0]}` : '') || '');
        setCpf(user.user_metadata?.cpf || '');
        setCpfConfirmation(user.user_metadata?.cpf || '');
        setBirthDate(user.user_metadata?.birth_date || '');
        setAvatarUrl(user.user_metadata?.avatar_url || '');
        await Promise.all([loadVotacoesAtivas(), loadBetHistory(), loadBetCounts(), loadChatMessages(true)]);

        if (searchParams.get('deposit') === '1') {
          setDepositOpen(true);
          setProfileOpen(false);
          resetPixState();
        }

        // Não obriga mais preencher perfil após login
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        router.push('/login');
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

    const odd = Number(option.odds || 0);
    if (!Number.isFinite(odd) || odd <= 0) {
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
    if (!betModal) return;

    const amount = Number(betAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBetFeedback('Digite um valor válido para apostar.');
      return;
    }

    const currentBalance = Number(user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0);
    if (!Number.isFinite(currentBalance) || amount > currentBalance) {
      setBetFeedback('Saldo insuficiente para essa aposta.');
      return;
    }

    setPlacingBet(true);
    setBetFeedback(null);

    try {
      const existingBets = Array.isArray(user?.user_metadata?.bets) ? user.user_metadata.bets : [];
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
    if (depositAmount < MIN_PIX_DEPOSIT || depositAmount > MAX_PIX_DEPOSIT) {
      setPixStatusMessage(`Digite um valor entre R$ ${MIN_PIX_DEPOSIT} e R$ ${MAX_PIX_DEPOSIT}.`);
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
    } catch (createPixError: any) {
      setPixStatusMessage(createPixError?.message || 'Erro ao gerar PIX.');
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

    if (amountToWithdraw > userBalance) {
      setWithdrawStatusMessage('Saldo insuficiente para este saque.');
      return;
    }

    const cpfValue = String(user?.user_metadata?.cpf || '').trim();
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
    } catch (uploadUnexpectedError: any) {
      alert('Erro no upload: ' + uploadUnexpectedError.message);
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
        // Se a data de nascimento já foi preenchida, não permite alteração
        alert('A data de nascimento já foi definida. Somente o admin pode alterar esse dado.');
        return;
      }

      // Salva a data de nascimento via endpoint seguro
      const res = await fetch('/api/profile/birthdate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birth_date: birthDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao salvar data de nascimento.');
        return;
      }

      const isAvailable = await checkUsernameAvailability(normalizedUsername);
      if (!isAvailable) {
        alert('Esse nome de usuário já está em uso.');
        return;
      }

      const { data, error } = await supabase.auth.updateUser({
        data: {
          username: normalizedUsername,
          cpf: cpf,
          birth_date: birthDate,
          avatar_url: avatarUrl.trim(),
        },
      });

      if (error) {
        alert('Erro ao salvar perfil: ' + error.message);
        return;
      }

      if (data.user) {
        setUser(data.user);
        setCpf(data.user.user_metadata?.cpf || cpf);
        setBirthDate(data.user.user_metadata?.birth_date || birthDate);
      }

      alert('Perfil atualizado com sucesso!');
      setProfileNotice(null);
      setProfileOpen(false);
    } catch (profileError: any) {
      alert('Erro ao salvar perfil: ' + profileError.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const displayName = username || user?.user_metadata?.username || `@${user?.email?.split('@')[0]}` || '@usuario';
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
  const potentialProfit = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0
    ? Math.max(potentialReturn - parsedBetAmount, 0)
    : 0;
  const parsedWithdrawAmount = Number(withdrawAmount.replace(',', '.'));
  const withdrawAmountIsValid = Number.isFinite(parsedWithdrawAmount) && parsedWithdrawAmount > 0;
  const filteredVotacoes = votacoesAtivas.filter((votacao) => {
    if (selectedCategory === 'todos') return true;

    const metadata = parsePollMetadata(votacao.descricao);
    return metadata.categoria === selectedCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-100 via-blue-50 to-white animate-pulse">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-blue-200 mb-4 animate-pulse" />
          <div className="h-4 w-40 bg-blue-100 rounded mb-2 animate-pulse" />
          <div className="h-4 w-24 bg-blue-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_42%,_#f8fafc_100%)]"
      style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
    >
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl" />
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        <div className="flex w-full items-center justify-between gap-2 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/20 ring-1 ring-white/30" />
            <h1 className="text-xl sm:text-2xl font-bold text-white shrink-0 tracking-tight">VotaDF</h1>
          </div>
          <div className="relative flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Saldo */}
            <button
              type="button"
              onClick={() => {
                setBalanceMenuOpen((prev) => !prev);
                setProfileOpen(false);
                setBetHistoryOpen(false);
                setDepositOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 sm:px-4 py-1.5 sm:py-2 shrink-0 transition hover:bg-white/20"
            >
              <svg className="h-3.5 w-3.5 text-blue-100 hidden sm:block" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
              </svg>
              <span className="text-xs sm:text-sm font-semibold text-white">
                <span className="hidden sm:inline">Saldo: </span>{formattedUserBalance}
              </span>
            </button>
            {balanceMenuOpen && (
              <div className="absolute right-0 top-12 z-40 w-72 rounded-2xl border border-blue-100 bg-white p-4 shadow-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Saldo disponível</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formattedUserBalance}</p>
                <p className="mt-2 text-xs text-slate-500">Saque será pago para o CPF cadastrado: <span className="font-semibold text-slate-700">{user?.user_metadata?.cpf || 'não definido'}</span></p>

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
                  className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
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
                  className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  Ver histórico financeiro
                </button>
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
              className="rounded-full bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-blue-600 shadow-sm transition hover:bg-blue-50 active:scale-95 shrink-0"
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
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-9.5rem)] w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl sm:absolute sm:right-0 sm:top-14 sm:left-auto sm:w-[min(560px,calc(100vw-1rem))] sm:translate-x-0 sm:translate-y-0 sm:max-h-[70vh] sm:rounded-3xl"
                style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 pb-3 pt-3 text-white sm:px-6 sm:pb-5 sm:pt-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Área do usuário</p>
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

                <div className="flex-1 overflow-y-auto p-2.5 sm:p-5">
                  {betHistoryError && (
                    <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:mb-4 sm:p-4 sm:text-sm">
                      {betHistoryError}
                    </div>
                  )}

                  {betHistory.length > 0 ? (
                    <div className="space-y-2 sm:space-y-3">
                      {betHistory.map((bet) => (
                        <div key={bet.id} className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold text-slate-900 sm:text-sm">{bet.votacaoTitulo}</p>
                              <p className="mt-1 text-xs text-slate-600 sm:text-sm">Candidato: <span className="font-medium">{bet.candidato}</span></p>
                              <p className="mt-1 text-xs text-slate-500">{new Date(bet.createdAt).toLocaleString('pt-BR')}</p>
                            </div>

                            <div className="grid gap-1 text-right">
                              <p className="text-xs text-slate-500">Aposta</p>
                              <p className="text-xs font-semibold text-slate-800 sm:text-sm">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.amount)}
                              </p>
                              <p className="text-xs text-slate-500">Retorno potencial</p>
                              <p className="text-xs font-bold text-cyan-700 sm:text-sm">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.potentialReturn)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <span className="text-xs text-slate-500">Cotação {bet.odd.toFixed(2)}</span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                bet.status === 'ganhou'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : bet.status === 'perdeu'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {bet.status === 'ganhou'
                                ? 'Você ganhou'
                                : bet.status === 'perdeu'
                                  ? 'Você perdeu'
                                  : 'Aguardando resultado'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600 sm:p-6 sm:text-sm">
                      Você ainda não fez apostas.
                    </div>
                  )}
                </div>
              </div>
            )}
            {financialHistoryOpen && (
              <div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl sm:absolute sm:right-0 sm:top-14 sm:left-auto sm:w-[min(560px,calc(100vw-1rem))] sm:translate-x-0 sm:translate-y-0 sm:max-h-[70vh]"
                style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
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
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {item.tipo === 'deposito' ? 'Depósito PIX' : 'Solicitação de saque'}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
                            </div>
                            <p className={`text-base font-bold ${item.tipo === 'deposito' ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {item.tipo === 'deposito' ? '+' : '-'}
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                            </p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              item.status === 'aprovado'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.status === 'recusado'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}>
                              {item.status === 'aprovado'
                                ? 'Aprovado'
                                : item.status === 'recusado'
                                  ? 'Recusado'
                                  : 'Pendente'}
                            </span>
                            {item.tipo === 'saque' && item.cpf && (
                              <span className="text-xs text-slate-500">CPF: {item.cpf}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                      Você ainda não possui histórico de depósitos ou saques.
                    </div>
                  )}
                </div>
              </div>
            )}
            {profileOpen && (
              <div
                className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[calc(100vh-9.5rem)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl sm:top-14 sm:w-[min(360px,calc(100vw-1rem))] sm:max-h-[70vh] sm:rounded-3xl"
                style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
              >
                <div className="bg-blue-600 px-3 py-3 sm:px-5 sm:py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white sm:text-base">Perfil da conta</h3>
                      <p className="mt-0.5 text-[11px] text-blue-100 sm:mt-1 sm:text-xs">Atualize seus dados de exibicao.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      className="rounded-full p-1.5 text-blue-100 transition hover:bg-blue-500 hover:text-white"
                      aria-label="Fechar perfil"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 sm:p-5">

                {profileNotice && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:mb-4 sm:p-3 sm:text-sm">
                    {profileNotice}
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-2.5 sm:space-y-4">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 p-2.5 sm:gap-3 sm:p-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-full border border-blue-100 bg-blue-100 sm:h-16 sm:w-16">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-500">
                          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="12" cy="8" r="4" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                          </svg>
                        </div>
                      )}


                      <label
                        className="absolute bottom-0 right-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-white bg-blue-600 text-white shadow transition hover:bg-blue-700 sm:h-7 sm:w-7"
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
                    <p className="text-xs text-slate-600 sm:text-sm">Atualize sua foto de perfil.</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2.5 sm:p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Email</p>
                    <p className="text-xs font-medium text-slate-800 break-all sm:text-sm">{user?.email}</p>
                  </div>

                  {pendingAvatarPreview && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-2.5 sm:p-3">
                      <p className="mb-2 text-xs font-medium text-slate-800 sm:text-sm">Ajuste sua foto</p>
                      <div className="mb-3 flex items-center justify-center">
                        <div
                          ref={avatarPreviewRef}
                          className={`h-24 w-24 overflow-hidden rounded-full border border-blue-100 bg-white touch-none sm:h-28 sm:w-28 ${
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

                      <p className="text-xs text-slate-600">Arraste para mover.</p>

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
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-100"
                        >
                          Cancelar foto
                        </button>
                        <button
                          type="button"
                          onClick={handleUploadAvatar}
                          disabled={uploadingAvatar}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          {uploadingAvatar ? 'Enviando...' : 'Aplicar foto'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="profile-username" className="mb-1 block text-xs font-medium text-slate-800 sm:text-sm">
                      Nome de usuario
                    </label>
                    <input
                      id="profile-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                      minLength={3}
                      required
                      placeholder="Nome de usuario (@seunome)"
                      className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 sm:py-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-cpf" className="mb-1 block text-xs font-medium text-slate-800 sm:text-sm">
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
                      className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 sm:py-2"
                    />
                  </div>

                  {!identityLocked && (
                    <div>
                      <label htmlFor="profile-cpf-confirm" className="mb-1 block text-xs font-medium text-slate-800 sm:text-sm">
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
                        className="w-full rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:py-2"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="profile-birthDate" className="mb-1 block text-xs font-medium text-slate-800 sm:text-sm">
                      Data de nascimento
                    </label>
                    <input
                      id="profile-birthDate"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                      disabled
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-500 shadow-sm cursor-not-allowed sm:py-2"
                    />
                  </div>

                  <div className="flex items-center gap-2 border-t border-blue-100 pt-1.5 sm:pt-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex-1 rounded-xl border border-red-300 px-2.5 py-1.5 text-xs text-red-700 transition hover:bg-red-50 sm:px-3 sm:py-2 sm:text-sm"
                    >
                      Sair
                    </button>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="flex-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm"
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
      <main className={depositOpen || withdrawOpen ? 'min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 py-6 pb-24 sm:py-10 sm:pb-28' : 'w-full px-0 py-6 pb-24 sm:py-10 sm:pb-28'}>
        {depositOpen ? (
          <>
          <div
            className="mx-auto max-w-md overflow-hidden rounded-3xl bg-white shadow-xl"
            style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
          >
            {/* Cabeçalho azul */}
            <div className="bg-blue-600 px-6 pt-6 pb-10 text-center">
              <div className="mb-1 flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => setDepositOpen(false)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-blue-100 transition hover:bg-blue-500 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Voltar
                </button>
              </div>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white">Depositar</h2>
              <p className="mt-1 text-sm text-blue-100">Adicione saldo via PIX de forma instantânea</p>
            </div>

            {/* Conteúdo */}
            <div className="-mt-6 rounded-t-3xl bg-blue-50 px-5 pt-6 pb-6 sm:px-7 sm:pb-8">

              {/* Card valor */}
              <div className="mb-5 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
                <div className="border-b border-blue-100 px-4 py-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Valor do depósito</p>
                  <button
                    type="button"
                    onClick={() => setDepositAmount(MAX_PIX_DEPOSIT)}
                    className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-blue-100"
                  >
                    USAR MÁXIMO
                  </button>
                </div>

                <div className="flex items-center gap-2 px-4 py-4">
                  <span className="text-xl font-semibold text-slate-400">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formattedDepositAmount}
                    onChange={(e) => setDepositAmount(parseCurrencyToNumber(e.target.value))}
                    className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-slate-900 outline-none"
                    aria-label="Valor do deposito"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 border-t border-slate-100 px-4 py-3">
                  {[10, 50, 100, 200].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setDepositAmount(amount)}
                      className={`rounded-xl py-2 text-sm font-semibold transition active:scale-95 ${
                        depositAmount === amount
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {`R$\u00a0${amount}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avisos */}
              {depositAmount < MIN_PIX_DEPOSIT && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-sm text-amber-700">Valor mínimo para depósito: <strong>R$ 10</strong></p>
                </div>
              )}
              {depositAmount > MAX_PIX_DEPOSIT && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-sm text-amber-700">Valor máximo por depósito: <strong>R$ 200</strong></p>
                </div>
              )}

              {/* Botão principal */}
              <button
                type="button"
                onClick={handleCreatePixDeposit}
                disabled={depositAmount < MIN_PIX_DEPOSIT || depositAmount > MAX_PIX_DEPOSIT || creatingPix}
                className="w-full rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
                <p className="mt-3 text-center text-sm text-slate-500">{pixStatusMessage}</p>
              )}

              <p className="mt-5 text-center text-xs text-slate-400">
                O depósito é instantâneo e estará disponível assim que confirmado pelo banco.
              </p>
            </div>
          </div>

          {/* Modal overlay do QR Code */}
          {(pixQrBase64 || pixQrCode) && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
              <div className="relative w-full sm:max-w-sm overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>

                {/* Header colorido */}
                <div className="bg-blue-600 px-6 pt-5 pb-7 sm:pt-6 sm:pb-8 text-center">
                  <button
                    type="button"
                    onClick={() => { setPixQrCode(null); setPixQrBase64(null); setPixPaymentId(null); setPixStatusMessage(null); }}
                    className="absolute right-4 top-4 rounded-full p-1.5 text-blue-200 transition hover:bg-blue-500 hover:text-white"
                    aria-label="Fechar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {/* Ícone PIX */}
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                    <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                      <path d="M12 22V12M2 7L12 12M22 7L12 12" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <p className="text-xl font-bold text-white">Pague com PIX</p>
                  <p className="mt-1 text-sm text-blue-100">Escaneie o QR Code ou copie o código</p>
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
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 break-all leading-relaxed font-mono">
                        {pixQrCode}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(pixQrCode);
                          setPixStatusMessage('Código PIX copiado!');
                        }}
                        className="mt-3 w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95"
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
            <div className="mx-auto max-w-md overflow-hidden rounded-3xl bg-white shadow-xl" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
              <div className="bg-blue-600 px-6 pt-6 pb-10 text-center">
                <div className="mb-1 flex items-center justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawOpen(false);
                      resetWithdrawState();
                    }}
                    className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-blue-100 transition hover:bg-blue-500 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    Voltar
                  </button>
                </div>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2M5 9h14l-1 10H6L5 9z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white">Solicitar saque</h2>
                <p className="mt-1 text-sm text-blue-100">O pagamento será realizado para o CPF cadastrado</p>
              </div>

              <div className="-mt-6 rounded-t-3xl bg-blue-50 px-5 pt-6 pb-6 sm:px-7 sm:pb-8">
                <div className="mb-4 rounded-2xl border border-blue-100 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo disponível</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{formattedUserBalance}</p>
                  <p className="mt-2 text-sm text-slate-600">CPF para pagamento: <span className="font-semibold text-slate-800">{user?.user_metadata?.cpf || 'não definido'}</span></p>
                </div>

                <div className="mb-4 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
                  <div className="border-b border-blue-100 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Valor do saque</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-4">
                    <span className="text-xl font-semibold text-slate-400">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-transparent text-3xl sm:text-4xl font-bold text-slate-900 outline-none"
                      aria-label="Valor do saque"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {withdrawStatusMessage && (
                  <div className="mb-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                    {withdrawStatusMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleRequestWithdraw}
                  disabled={requestingWithdraw || !withdrawAmountIsValid || parsedWithdrawAmount > userBalance}
                  className="w-full rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {requestingWithdraw ? 'Enviando solicitação...' : 'Confirmar solicitação de saque'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-none border-y border-blue-100 bg-white/95 p-4 shadow-none backdrop-blur sm:rounded-3xl sm:border sm:p-10 sm:shadow-[0_20px_50px_-24px_rgba(30,64,175,0.35)]">
          <section className="mb-10 grid gap-6 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-600 to-blue-500 p-6 text-white shadow-lg sm:p-8">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-100">
                Área do usuário
              </p>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">Bem-vindo, {displayName}!</h2>
              <p className="mt-4 text-sm leading-7 text-blue-100 sm:text-base">
                Explore as votações ativas e clique no candidato para apostar.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-blue-100/80 bg-gradient-to-b from-white to-blue-50/40 p-5 shadow-sm sm:p-6">
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-slate-900">Votações Ativas</h2>
                <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-slate-400 sm:block">Categorias</p>
              </div>

              <CategoryCarousel
                categories={[...CATEGORY_OPTIONS]}
                selectedCategory={selectedCategory}
                onCategoryChange={(value) => setSelectedCategory(value as 'todos' | 'politica' | 'entretenimento' | 'futebol')}
              />
            </div>

            {votacoesError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {votacoesError}
              </div>
            )}

            {filteredVotacoes.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                {filteredVotacoes.map((votacao) => {
                  const metadata = parsePollMetadata(votacao.descricao);
                  const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
                  const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();

                  return (
                    <div key={votacao.id} className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{votacao.titulo}</h3>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          metadata.tipo === 'enquete-candidatos' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {metadata.tipo === 'enquete-candidatos' ? 'Enquete por candidato' : 'Opções livres'}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          isBetClosed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isBetClosed ? 'Aposta encerrada' : 'Aposta aberta'}
                        </span>
                      </div>

                      <p className="mb-4 line-clamp-3 text-sm leading-6 text-slate-600">{metadata.descricaoLimpa}</p>
                      <p className="mb-4 text-xs text-slate-500">
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
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/30 disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                                        {parsedOption.imageUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                        ) : (
                                          <span className="text-xs font-semibold text-slate-400">{parsedOption.label.slice(0, 1).toUpperCase()}</span>
                                        )}
                                      </div>
                                      <span className="text-sm font-semibold text-slate-800">{parsedOption.label}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                        {parsedOption.odds || '-'}
                                      </span>
                                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
                                        {percent}%
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] font-medium text-slate-500">{votes[idx]} apostas</p>
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
                              <span key={idx} className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">
                                {parsedOption.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Selecione um candidato para abrir sua aposta</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-8 text-center">
                <p className="text-slate-600">
                  {selectedCategory === 'todos'
                    ? 'Nenhuma votação ativa no momento. Volte em breve!'
                    : `Nenhuma votação ativa na categoria ${getCategoryLabel(selectedCategory)}.`}
                </p>
              </div>
            )}
          </section>

          {betModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3">
              <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-2xl">
                <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-4 pb-4 pt-4 text-white">
                  <div className="inline-flex rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                    Confirmar aposta
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white/95">{betModal.votacaoTitulo}</p>
                </div>

                <div className="overflow-y-auto p-4">
                  <div className="-mt-7 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Candidato</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white">
                        {betModal.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={betModal.imageUrl} alt={betModal.candidato} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-cyan-700">{betModal.candidato.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <p className="text-base font-bold text-slate-900">{betModal.candidato}</p>
                    </div>
                    <div className="mt-2 inline-flex rounded-full bg-gradient-to-r from-cyan-100 to-blue-100 px-2.5 py-1 text-xs font-extrabold tabular-nums text-cyan-900 ring-1 ring-cyan-200">
                      {betModal.odd.toFixed(2)}
                    </div>
                  </div>

                  <label className="mt-4 block text-sm font-medium text-slate-700">Valor da aposta</label>
                  <div className="mt-2 flex items-center rounded-xl border border-cyan-200 bg-cyan-50/50 px-3 py-2 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                    <span className="text-sm font-bold text-blue-700">R$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={betAmount}
                      onChange={(event) => setBetAmount(event.target.value)}
                      placeholder="Ex: 25"
                      className="w-full border-0 bg-transparent px-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[10, 25, 50, 100].map((value) => {
                      const disabled = value > Math.max(userBalance, 0);
                      const currentValue = Number(betAmount.replace(',', '.'));
                      const isActive = Number.isFinite(currentValue) && currentValue === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBetAmount(String(value))}
                          disabled={disabled}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold tabular-nums transition ${
                            disabled
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : isActive
                                ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                                : 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 hover:shadow-sm'
                          }`}
                        >
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)}
                        </button>
                      );
                    })}

                    {userBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => setBetAmount(String(Math.floor(userBalance * 100) / 100))}
                        className="col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:shadow-sm sm:col-span-4"
                      >
                        Usar saldo máximo
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid gap-1.5 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5 text-xs sm:text-sm">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Saldo disponível</span>
                      <span className="font-semibold text-slate-900">{formattedUserBalance}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Retorno total se vencer</span>
                      <span className="font-bold tabular-nums text-cyan-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialReturn)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Lucro líquido</span>
                      <span className="font-bold tabular-nums text-blue-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialProfit)}
                      </span>
                    </div>
                    <p className="pt-1 text-[11px] text-slate-500">
                      Cálculo: valor apostado x cotação. Lucro = retorno total - valor apostado.
                    </p>
                  </div>

                  {betFeedback && (
                    <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${
                      betFeedback.includes('sucesso') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {betFeedback}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBetModal(null);
                        setBetAmount('');
                        setBetFeedback(null);
                      }}
                      className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePlaceBet()}
                      disabled={placingBet}
                      className="flex-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-cyan-600 disabled:opacity-60"
                    >
                      {placingBet ? 'Enviando...' : 'Apostar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="fixed bottom-24 right-4 z-40 md:hidden" style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
            <button
              type="button"
              onClick={() => {
                router.push('/chat');
              }}
              className="rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-blue-700 active:scale-95"
              aria-label="Abrir chat ao vivo"
            >
              Chat ao vivo
            </button>
          </div>


          {chatPanelOpen && (
            <div
              className="fixed inset-x-2 z-40 flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl md:inset-x-auto md:bottom-3 md:right-3 md:h-[65vh] md:w-[min(92vw,360px)]"
              style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex items-center justify-between border-b border-blue-100 bg-blue-600 px-3 py-2 text-white">
                <div>
                  <p className="text-sm font-semibold">Chat ao vivo</p>
                  <p className="text-[11px] text-blue-100">Mensagens expiram em 24h</p>
                </div>
                <button
                  type="button"
                  onClick={() => setChatPanelOpen(false)}
                  className="rounded-full p-1.5 text-white transition hover:bg-blue-500"
                  aria-label="Fechar chat"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
                {chatMessages.length > 0 ? (
                  chatMessages.map((message) => {
                    const isOwnMessage = message.user_id === user?.id;
                    const avatarFromMessage = String(message.avatar_url || '').trim();
                    const fallbackOwnAvatar = isOwnMessage ? String(user?.user_metadata?.avatar_url || avatarUrl || '').trim() : '';
                    const avatarUrlToRender = avatarFromMessage || fallbackOwnAvatar;
                    const initial = String(message.username || '@usuario').replace('@', '').trim().slice(0, 1).toUpperCase() || 'U';

                    return (
                      <div
                        key={message.id}
                        className={`rounded-xl px-3 py-2 ${isOwnMessage ? 'border border-blue-100 bg-blue-50' : 'border border-slate-200 bg-white'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                              {avatarUrlToRender ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatarUrlToRender} alt={message.username || '@usuario'} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-bold text-slate-500">{initial}</span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-800">{message.username || '@usuario'}</p>
                          </div>
                          <p className="text-[11px] text-slate-500">{new Date(message.created_at).toLocaleTimeString('pt-BR')}</p>
                        </div>
                        <p className="mt-1 break-words text-sm text-slate-700">{message.message}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
                    {loadingChat ? 'Carregando mensagens...' : 'Nenhuma mensagem ainda. Seja o primeiro a conversar.'}
                  </div>
                )}
              </div>

              {chatError && (
                <div className="mx-3 mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {chatError}
                </div>
              )}

              <div className="border-t border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendChatMessage();
                      }
                    }}
                    maxLength={280}
                    placeholder="Digite sua mensagem"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendChatMessage()}
                    disabled={sendingChatMessage || !chatInput.trim()}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingChatMessage ? '...' : 'Enviar'}
                  </button>
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
