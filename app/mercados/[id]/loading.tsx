import UiverseLoader from '../../components/uiverse-loader';

export default function LoadingVotingDetail() {
  return (
    <main className="mx-auto flex w-full max-w-[1520px] flex-1 flex-col px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-36">
      <div className="flex flex-1 items-center justify-center py-10">
        <UiverseLoader label="Carregando votação..." />
      </div>
      <div className="sr-only">
        <div className="h-12 w-48 rounded-full bg-white/10" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
          <div className="space-y-6">
            <div className="h-80 rounded-[32px] bg-white/10" />
            <div className="h-72 rounded-[32px] bg-white/10" />
            <div className="h-96 rounded-[32px] bg-white/10" />
          </div>
          <div className="space-y-6">
            <div className="h-72 rounded-[32px] bg-white/10" />
            <div className="h-80 rounded-[32px] bg-white/10" />
          </div>
        </div>
      </div>
    </main>
  );
}
