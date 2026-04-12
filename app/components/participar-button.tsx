'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type ParticiparButtonProps = {
  votacaoId: string;
};

export default function ParticiparButton({ votacaoId }: ParticiparButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleParticipar = async () => {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const hasRequiredProfileData = Boolean(
        user?.user_metadata?.cpf && user?.user_metadata?.birth_date
      );

      if (!user) {
        const nextPath = `/usuarios?participar=${encodeURIComponent(votacaoId)}`;
        router.push(`/auth?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      if (!hasRequiredProfileData) {
        router.push(`/usuarios?completeProfile=1&participar=${encodeURIComponent(votacaoId)}`);
        return;
      }

      router.push(`/usuarios?participar=${encodeURIComponent(votacaoId)}`);
    } catch (error) {
      console.error('Erro ao validar usuário:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleParticipar}
      disabled={loading}
      className="text-blue-600 hover:text-blue-700 font-medium text-sm disabled:opacity-60"
    >
      {loading ? 'Verificando...' : 'Participar'}
    </button>
  );
}
