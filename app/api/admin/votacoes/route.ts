import { NextResponse } from 'next/server';
import { ensureAdminRequest } from '../utils';

const META_PREFIX = '__meta__:';
const SPORTS_OPTION_LABELS = ['CASA', 'X', 'FORA'] as const;
const BITCOIN_OPTION_LABELS = ['Sobe', 'Desce'] as const;

type PollCategory =
  | 'politica'
  | 'entretenimento'
  | 'esportes'
  | 'financeiro'
  | 'celebridades'
  | 'criptomoedas'
  | '';

type PollType = 'opcoes-livres' | 'enquete-candidatos' | 'bitcoin-direcao';
type OpenStatusLabel = 'ao-vivo' | 'em-aberto';

type VotingOptionInput = {
  label?: unknown;
  imageUrl?: unknown;
  odds?: unknown;
  oddsNao?: unknown;
};

type VotingPayload = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  pollType?: unknown;
  openStatusLabel?: unknown;
  closesAt?: unknown;
  isActive?: unknown;
  result?: unknown;
  bitcoinTitleImageUrl?: unknown;
  options?: unknown;
};

const normalizeCategory = (value: unknown): PollCategory => {
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

const normalizePollType = (value: unknown): PollType => {
  if (value === 'enquete-candidatos') return 'enquete-candidatos';
  if (value === 'bitcoin-direcao') return 'bitcoin-direcao';
  return 'opcoes-livres';
};

const normalizeOpenStatusLabel = (value: unknown): OpenStatusLabel =>
  value === 'em-aberto' ? 'em-aberto' : 'ao-vivo';

const toOptionRecord = (option: VotingOptionInput) => {
  const label = String(option.label || '').trim();
  const imageUrl = String(option.imageUrl || '').trim();
  const odds = String(option.odds || '').trim();
  const oddsNao = String(option.oddsNao || '').trim();

  return { label, imageUrl, odds, oddsNao };
};

const buildDescricao = ({
  description,
  category,
  pollType,
  openStatusLabel,
  closesAt,
  result,
  bitcoinTitleImageUrl,
}: {
  description: string;
  category: PollCategory;
  pollType: PollType;
  openStatusLabel: OpenStatusLabel;
  closesAt: string;
  result: string;
  bitcoinTitleImageUrl: string;
}) => {
  const metadata: Record<string, string> = {
    tipo: pollType,
    categoria: category,
    statusAbertoLabel: openStatusLabel,
  };

  if (closesAt) {
    metadata.encerramentoAposta = closesAt;
  }

  if (result) {
    metadata.resultadoVencedor = result;
  }

  if (bitcoinTitleImageUrl) {
    metadata.bitcoinTitleImageUrl = bitcoinTitleImageUrl;
  }

  return `${META_PREFIX}${JSON.stringify(metadata)}\n${description}`;
};

const parseVotingRow = (row: Record<string, unknown>) => {
  const rawDescription = String(row.descricao || '');
  let category: PollCategory = '';
  let pollType: PollType = 'opcoes-livres';
  let openStatusLabel: OpenStatusLabel = 'ao-vivo';
  let closesAt = '';
  let result = '';
  let bitcoinTitleImageUrl = '';
  let cleanDescription = rawDescription;

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as Record<string, unknown>;
      category = normalizeCategory(parsed.categoria);
      pollType = normalizePollType(parsed.tipo);
      openStatusLabel = normalizeOpenStatusLabel(parsed.statusAbertoLabel || parsed.openStatusLabel);
      closesAt = String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim();
      result = String(parsed.resultadoVencedor || parsed.resultado || parsed.winner || '').trim();
      bitcoinTitleImageUrl = String(parsed.bitcoinTitleImageUrl || '').trim();
    } catch {
      category = '';
    }
  }

  const options = Array.isArray(row.opcoes)
    ? row.opcoes.map((option) => {
        if (typeof option !== 'string') {
          return { label: '', imageUrl: '', odds: '', oddsNao: '' };
        }

        try {
          const parsed = JSON.parse(option) as Record<string, unknown>;
          return {
            label: String(parsed.label || option),
            imageUrl: String(parsed.imageUrl || parsed.image_url || parsed.image || parsed.avatarUrl || ''),
            odds: String(parsed.odds || ''),
            oddsNao: String(parsed.oddsNao || ''),
          };
        } catch {
          return { label: option, imageUrl: '', odds: '', oddsNao: '' };
        }
      })
    : [];

  return {
    id: String(row.id || ''),
    title: String(row.titulo || ''),
    description: cleanDescription,
    category,
    pollType,
    openStatusLabel,
    closesAt,
    result,
    bitcoinTitleImageUrl,
    isActive: Boolean(row.ativa),
    createdAt: String(row.created_at || ''),
    options,
  };
};

const validatePayload = (payload: VotingPayload) => {
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const category = normalizeCategory(payload.category);
  const requestedPollType = normalizePollType(payload.pollType);
  const pollType =
    category === 'esportes'
      ? 'opcoes-livres'
      : requestedPollType === 'bitcoin-direcao'
        ? 'bitcoin-direcao'
        : requestedPollType;
  const openStatusLabel = normalizeOpenStatusLabel(payload.openStatusLabel);
  const closesAt = String(payload.closesAt || '').trim();
  const isActive = payload.isActive === false ? false : true;
  const result = String(payload.result || '').trim();
  const bitcoinTitleImageUrl = String(payload.bitcoinTitleImageUrl || '').trim();
  const rawOptions = Array.isArray(payload.options) ? payload.options : [];
  const options = rawOptions.map((option) => toOptionRecord((option || {}) as VotingOptionInput)).filter((option) => option.label);

  if (!title) {
    return { error: 'Informe o título da votação.' };
  }

  if (!description) {
    return { error: 'Informe a descrição da votação.' };
  }

  if (!category) {
    return { error: 'Selecione uma categoria válida.' };
  }

  if (options.length < 2) {
    return { error: 'Adicione pelo menos duas opções.' };
  }

  if (category === 'esportes') {
    if (options.length !== 3) {
      return { error: 'Votações de esportes devem ter exatamente três opções: CASA, X e FORA.' };
    }

    const labels = options.map((option) => option.label.toUpperCase());
    const isValidSportsStructure = SPORTS_OPTION_LABELS.every((label, index) => labels[index] === label);

    if (!isValidSportsStructure) {
      return { error: 'A categoria esportes exige as opções na ordem CASA, X e FORA.' };
    }

    if (result && !SPORTS_OPTION_LABELS.includes(result.toUpperCase() as (typeof SPORTS_OPTION_LABELS)[number])) {
      return { error: 'Para esportes, o resultado vencedor deve ser CASA, X ou FORA.' };
    }
  }

  if (pollType === 'bitcoin-direcao') {
    if (category !== 'criptomoedas') {
      return { error: 'O mercado Bitcoin deve ser criado na categoria Criptomoedas.' };
    }

    if (options.length !== 2) {
      return { error: 'O mercado Bitcoin exige exatamente duas opções: Sobe e Desce.' };
    }

    const labels = options.map((option) => option.label.trim().toLowerCase());
    const hasValidStructure =
      labels[0] === BITCOIN_OPTION_LABELS[0].toLowerCase() && labels[1] === BITCOIN_OPTION_LABELS[1].toLowerCase();

    if (!hasValidStructure) {
      return { error: 'O mercado Bitcoin exige as opções na ordem Sobe e Desce.' };
    }

    if (result) {
      return { error: 'O resultado do mercado Bitcoin é calculado automaticamente ao fim da rodada.' };
    }
  }

  const serializedOptions = options.map((option) =>
    JSON.stringify({
      label:
        category === 'esportes'
          ? option.label.toUpperCase()
          : pollType === 'bitcoin-direcao'
            ? option.label.trim() === BITCOIN_OPTION_LABELS[0]
              ? BITCOIN_OPTION_LABELS[0]
              : BITCOIN_OPTION_LABELS[1]
            : option.label,
      imageUrl: option.imageUrl,
      odds: option.odds,
      oddsNao: option.oddsNao,
    })
  );
  const normalizedResult =
    category === 'esportes' ? result.toUpperCase() : pollType === 'bitcoin-direcao' ? '' : result;

  return {
    data: {
      title,
      description,
      category,
      pollType,
      openStatusLabel,
      closesAt,
      isActive,
      result: normalizedResult,
      bitcoinTitleImageUrl,
      serializedOptions,
      descricao: buildDescricao({
        description,
        category,
        pollType,
        openStatusLabel,
        closesAt,
        result: normalizedResult,
        bitcoinTitleImageUrl,
      }),
    },
  };
};

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  const { data, error } = await supabaseAdmin
    .from('votacoes')
    .select('id, titulo, descricao, opcoes, ativa, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ votacoes: (data || []).map((row) => parseVotingRow(row as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  let payload: VotingPayload;
  try {
    payload = (await request.json()) as VotingPayload;
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const validation = validatePayload(payload);

  if ('error' in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('votacoes')
    .insert({
      titulo: validation.data.title,
      descricao: validation.data.descricao,
      opcoes: validation.data.serializedOptions,
      ativa: validation.data.isActive,
    })
    .select('id, titulo, descricao, opcoes, ativa, created_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Não foi possível criar a votação.' }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Votação criada com sucesso.',
    votacao: parseVotingRow(data as Record<string, unknown>),
  });
}
