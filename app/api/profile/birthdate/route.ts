import { NextResponse } from 'next/server';
import {
  getAuthenticatedProfileContext,
  isValidBirthDate,
  readBirthDateProfile,
  readPublicUserProfile,
  syncUnifiedProfile,
} from '../utils';

type BirthDatePayload = {
  birth_date?: unknown;
};

export async function POST(request: Request) {
  const context = await getAuthenticatedProfileContext(request);

  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await request.json().catch(() => ({}))) as BirthDatePayload;
  const birthDate = String(body.birth_date || '').trim();

  if (!birthDate || !isValidBirthDate(birthDate)) {
    return NextResponse.json({ error: 'Data de nascimento invalida.' }, { status: 400 });
  }

  try {
    const currentPublicUser = await readPublicUserProfile(context.adminSupabase, context.user.id);
    const currentBirthDateProfile = await readBirthDateProfile(context.adminSupabase, context.user.id);
    const currentBirthDate =
      String(currentPublicUser?.birth_date || '').trim() ||
      String(currentBirthDateProfile?.birth_date || '').trim() ||
      String(context.user.user_metadata?.birth_date || '').trim();

    if (currentBirthDate && currentBirthDate !== birthDate) {
      return NextResponse.json(
        { error: 'Data de nascimento ja cadastrada. So admin pode alterar.' },
        { status: 403 }
      );
    }

    const { profile } = await syncUnifiedProfile(context.adminSupabase, context.user, {
      birth_date: birthDate,
    });

    return NextResponse.json({ success: true, profile });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar data de nascimento.' },
      { status: 500 }
    );
  }
}
