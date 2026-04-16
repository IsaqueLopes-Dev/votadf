'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase'; // Adjust path as needed

type ParticiparButtonProps = {
  votacaoId: string;
};

export default function ParticiparButton({ votacaoId }: ParticiparButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleParticipar = async () => {
    if (loading) return; // Prevent double clicks
    
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        const nextPath = `/home?participar=${encodeURIComponent(votacaoId)}`;
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      const hasRequiredProfileData = Boolean(
        user?.user_metadata?.cpf && user?.user_metadata?.birth_date
      );

      if (!hasRequiredProfileData) {
        router.push(`/home?completeProfile=1&participar=${encodeURIComponent(votacaoId)}`);
        return;
      }

      router.push(`/home?participar=${encodeURIComponent(votacaoId)}`);
    } catch (error) {
      console.error('Erro ao validar usuário:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleParticipar}
      disabled={loading}
      className="text-blue-600 hover:text-blue-700 font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
      aria-busy={loading}
    >
      {loading ? 'Verificando...' : 'Participar'}
    </button>
  );
}
