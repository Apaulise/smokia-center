/**
 * Esqueleto del Resumen de Marca: respeta la forma real de la pantalla (header
 * bar, meta + próximos pasos, franja de KPIs, reels, dos gráficos), así al
 * llegar los datos nada se mueve de lugar. El único movimiento es el humo de
 * `lm-smoke`, el gesto de carga del sistema.
 */
export default function MarcaLoading() {
  return (
    <div role="status" aria-label="Cargando Marca personal">
      <div className="flex h-14 items-center border-b border-lm-line px-6 lg:px-8">
        <div className="lm-smoke w-44" />
      </div>

      <div className="flex flex-col gap-7 px-6 py-7 lg:px-8 lg:pb-10">
        <div className="flex flex-col gap-3">
          <div className="lm-smoke w-40" />
          <div className="lm-smoke !h-7 w-72 max-w-full" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((n) => (
            <div key={n} className="flex h-[236px] flex-col gap-4 rounded-lm-lg border border-lm-line bg-lm-surface/50 p-5">
              <div className="lm-smoke w-1/3" />
              <div className="lm-smoke !h-8 w-1/4" />
              <div className="lm-smoke !h-1 w-full" />
              <div className="mt-auto grid grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((m) => (
                  <div key={m} className="lm-smoke" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 divide-lm-line border-y border-lm-line sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:divide-x">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="flex flex-col gap-3 px-5 py-[18px] first:pl-0">
              <div className="lm-smoke w-20" />
              <div className="lm-smoke !h-6 w-16" />
              <div className="lm-smoke w-24" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="aspect-[3/4] rounded-lm-lg border border-lm-line bg-lm-surface/50" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((n) => (
            <div key={n} className="h-[250px] rounded-lm-lg border border-lm-line bg-lm-surface/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
