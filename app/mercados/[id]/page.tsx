import { notFound } from 'next/navigation';
import PublicVotingDetail from '../../components/public-voting-detail';
import { getPublicVotacaoById } from '../../utils/voting-market-server';

export const revalidate = 10;

export default async function VotingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const votacao = await getPublicVotacaoById(id);

  if (!votacao) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-[1520px] flex-1 flex-col px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-36">
      <PublicVotingDetail votacao={votacao} />
    </main>
  );
}
