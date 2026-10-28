export default function AppLoading() {
  return (
    <div className="animate-pulse px-6 py-8 lg:px-8" role="status" aria-label="Cargando sección">
      <div className="h-4 w-48 rounded bg-lm-raised" />
      <div className="mt-8 h-8 w-72 max-w-full rounded bg-lm-raised" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-lm-raised" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="h-32 rounded-lm-lg border border-lm-line bg-lm-surface" />
        <div className="h-32 rounded-lm-lg border border-lm-line bg-lm-surface" />
        <div className="h-32 rounded-lm-lg border border-lm-line bg-lm-surface" />
      </div>
    </div>
  );
}
