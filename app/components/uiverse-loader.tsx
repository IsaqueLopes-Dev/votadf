type UiverseLoaderProps = {
  label?: string;
  className?: string;
};

export default function UiverseLoader({
  label = 'Carregando...',
  className = '',
}: UiverseLoaderProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${className}`.trim()}>
      <div className="uiverse-loader" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
      </div>
      <p className="text-sm font-medium text-zinc-300">{label}</p>
    </div>
  );
}
