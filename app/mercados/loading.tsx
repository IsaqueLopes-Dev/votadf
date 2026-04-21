import UiverseLoader from '../components/uiverse-loader';

export default function LoadingMarketsPage() {
  return (
    <main className="flex w-full flex-1 flex-col items-center px-3 py-8 pb-28 sm:px-2 sm:py-10 lg:pb-56">
      <div className="mb-8 w-full max-w-5xl text-center">
        <div className="mx-auto h-10 w-80 rounded-full bg-white/10" />
        <div className="mx-auto mt-4 h-5 w-[34rem] max-w-full rounded-full bg-white/10" />
      </div>

      <div className="flex flex-1 items-center justify-center py-10">
        <UiverseLoader label="Carregando mercados..." />
      </div>
    </main>
  );
}
