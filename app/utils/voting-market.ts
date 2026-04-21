export const META_PREFIX = '__meta__:';

export const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'celebridades', label: 'Celebridades' },
  { value: 'criptomoedas', label: 'Criptomoedas' },
] as const;

export type CategoryValue = (typeof CATEGORY_OPTIONS)[number]['value'];
export type PollType = 'opcoes-livres' | 'enquete-candidatos' | 'bitcoin-direcao';
export type PollCategory =
  | 'politica'
  | 'entretenimento'
  | 'esportes'
  | 'financeiro'
  | 'celebridades'
  | 'criptomoedas'
  | '';
export type OpenStatusLabel = 'ao-vivo' | 'em-aberto';

export type VotingRecord = {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: string[];
  ativa: boolean;
  created_at: string;
};

export type PollOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

export type PollOptionLike = Partial<
  PollOption & {
    image_url: string;
    image: string;
    avatarUrl: string;
    candidato: string;
    name: string;
  }
>;

export type BetCountsMap = Record<string, Record<string, number>>;

export type VotingStatus = {
  isClosed: boolean;
  label: string;
  tone: 'live' | 'closed' | 'timed';
  footerLabel: string;
  closeAt: string;
};

const normalizePollCategory = (value: unknown): PollCategory => {
  if (value === 'futebol' || value === 'esportes') return 'esportes';
  if (
    value === 'politica' ||
    value === 'entretenimento' ||
    value === 'financeiro' ||
    value === 'celebridades' ||
    value === 'criptomoedas'
  ) {
    return value;
  }

  return '';
};

export const parsePollMetadata = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as {
        tipo?: PollType;
        categoria?: PollCategory;
        statusAbertoLabel?: OpenStatusLabel;
        openStatusLabel?: OpenStatusLabel;
        encerramentoAposta?: string;
        bettingClosesAt?: string;
        bitcoinTitleImageUrl?: string;
      };

      return {
        tipo:
          parsed.tipo === 'enquete-candidatos'
            ? 'enquete-candidatos'
            : parsed.tipo === 'bitcoin-direcao'
              ? 'bitcoin-direcao'
              : 'opcoes-livres',
        categoria: normalizePollCategory(parsed.categoria),
        statusAbertoLabel:
          parsed.statusAbertoLabel === 'em-aberto' || parsed.openStatusLabel === 'em-aberto'
            ? 'em-aberto'
            : 'ao-vivo',
        encerramentoAposta: String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim(),
        bitcoinTitleImageUrl: String(parsed.bitcoinTitleImageUrl || '').trim(),
        descricaoLimpa: cleanDescription,
      };
    } catch {
      return {
        tipo: 'opcoes-livres' as const,
        categoria: '' as PollCategory,
        statusAbertoLabel: 'ao-vivo' as OpenStatusLabel,
        encerramentoAposta: '',
        bitcoinTitleImageUrl: '',
        descricaoLimpa: cleanDescription,
      };
    }
  }

  if (rawDescription.startsWith('__tipo__:enquete-candidatos\n')) {
    return {
      tipo: 'enquete-candidatos' as const,
      categoria: '' as PollCategory,
      statusAbertoLabel: 'ao-vivo' as OpenStatusLabel,
      encerramentoAposta: '',
      bitcoinTitleImageUrl: '',
      descricaoLimpa: rawDescription.replace('__tipo__:enquete-candidatos\n', ''),
    };
  }

  return {
    tipo: 'opcoes-livres' as const,
    categoria: '' as PollCategory,
    statusAbertoLabel: 'ao-vivo' as OpenStatusLabel,
    encerramentoAposta: '',
    bitcoinTitleImageUrl: '',
    descricaoLimpa: rawDescription,
  };
};

const readPollOptionRecord = (option: PollOptionLike): PollOption => ({
  label: String(option.label || option.candidato || option.name || '').trim(),
  imageUrl: String(option.imageUrl || option.image_url || option.image || option.avatarUrl || '').trim(),
  odds: option.odds != null && Number.isFinite(Number(option.odds)) ? String(option.odds) : '',
  oddsNao: option.oddsNao != null && Number.isFinite(Number(option.oddsNao)) ? String(option.oddsNao) : '',
});

export const parsePollOption = (option: unknown): PollOption => {
  if (option && typeof option === 'object') {
    return readPollOptionRecord(option as PollOptionLike);
  }

  if (typeof option === 'string') {
    try {
      const parsed = JSON.parse(option) as PollOptionLike;
      return readPollOptionRecord(parsed);
    } catch {
      return {
        label: option,
        imageUrl: '',
        odds: '',
        oddsNao: '',
      };
    }
  }

  return { label: '', imageUrl: '', odds: '', oddsNao: '' };
};

export const normalizeCandidate = (value: string) => value.trim().toLowerCase();

const getDeterministicHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

export const getSimulatedBaseBets = (votacaoId: string, option: PollOption, index: number) => {
  const hash = getDeterministicHash(`${votacaoId}:${option.label}:${index}:base`);
  return 18 + (hash % 73);
};

export const getRealBetCount = (counts: BetCountsMap, votacaoId: string, candidateLabel: string) => {
  return counts[votacaoId]?.[normalizeCandidate(candidateLabel)] || 0;
};

export const getDisplayedOdd = (value: string) => {
  if (value === '') return '-';
  return `${value}x`;
};

export const getCategoryLabel = (categoria: string) => {
  return CATEGORY_OPTIONS.find((option) => option.value === categoria)?.label || 'Sem categoria';
};

export const getCardDescription = (value: string) =>
  value.replace(/^faça sua votação!\s*/i, '').replace(/^faca sua votacao!\s*/i, '').trim();

export const getCloseAtTimestamp = (votacao: VotingRecord) => {
  const metadata = parsePollMetadata(votacao.descricao);
  return metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : Number.NaN;
};

export const formatRelativeTime = (targetTimestamp: number, nowTimestamp = Date.now()) => {
  if (!Number.isFinite(targetTimestamp)) return 'Tempo indefinido';

  const diff = targetTimestamp - nowTimestamp;
  if (diff <= 0) return 'Encerrado';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min restantes`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h restantes`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d restantes`;

  return `Fecha em ${new Date(targetTimestamp).toLocaleDateString('pt-BR')}`;
};

export const getVotingStatus = (votacao: VotingRecord, nowTimestamp = Date.now()): VotingStatus => {
  const metadata = parsePollMetadata(votacao.descricao);
  const openLabel = metadata.statusAbertoLabel === 'em-aberto' ? 'Em aberto' : 'Ao vivo';
  const closeAtMs = getCloseAtTimestamp(votacao);
  const isClosed = votacao.ativa === false || (Number.isFinite(closeAtMs) && closeAtMs <= nowTimestamp);

  if (isClosed) {
    return {
      isClosed: true,
      label: 'Encerrado',
      tone: 'closed',
      footerLabel: 'Mercado encerrado',
      closeAt: Number.isFinite(closeAtMs) ? new Date(closeAtMs).toLocaleString('pt-BR') : 'Não informado',
    };
  }

  if (Number.isFinite(closeAtMs)) {
    return {
      isClosed: false,
      label: openLabel,
      tone: 'live',
      footerLabel: formatRelativeTime(closeAtMs, nowTimestamp),
      closeAt: new Date(closeAtMs).toLocaleString('pt-BR'),
    };
  }

  return {
    isClosed: false,
    label: openLabel,
    tone: 'live',
    footerLabel: openLabel === 'Em aberto' ? 'Mercado em aberto' : 'Mercado ao vivo',
    closeAt: 'Não informado',
  };
};

export const getParsedOptions = (votacao: VotingRecord) => {
  return Array.isArray(votacao.opcoes)
    ? votacao.opcoes.map((option) => parsePollOption(option)).filter((option) => option.label || option.odds)
    : [];
};

export const buildVotingOptionStats = (votacao: VotingRecord, counts: BetCountsMap) => {
  const parsedOptions = getParsedOptions(votacao);
  const votes = parsedOptions.map((option, index) => {
    const baseVotes = getSimulatedBaseBets(votacao.id, option, index);
    const realVotes = getRealBetCount(counts, votacao.id, option.label);
    return baseVotes + realVotes;
  });
  const totalVotes = votes.reduce((accumulator, current) => accumulator + current, 0);

  return parsedOptions.map((option, index) => ({
    ...option,
    votes: votes[index],
    percent: totalVotes > 0 ? Math.max(1, Math.round((votes[index] / totalVotes) * 100)) : 0,
  }));
};

export const getVotingPrimaryImage = (votacao: VotingRecord) => {
  const firstWithImage = getParsedOptions(votacao).find((option) => option.imageUrl);
  return firstWithImage?.imageUrl || '';
};
