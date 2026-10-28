/** Respuesta inmediata mientras Next carga el próximo panel del gestor. */
export default function LeadsLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Cargando panel">
      <div className="h-14 border-b border-lm-line bg-lm-surface" />
      <div className="flex flex-col gap-7 px-6 py-8 lg:px-8">
        <div className="space-y-3">
          <div className="h-8 w-52 rounded-lm-sm bg-lm-raised" />
          <div className="h-4 w-full max-w-lg rounded-lm-xs bg-lm-raised" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 rounded-lm-lg border border-lm-line bg-lm-surface" />
          ))}
        </div>
        <div className="h-64 rounded-lm-lg border border-lm-line bg-lm-surface" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
