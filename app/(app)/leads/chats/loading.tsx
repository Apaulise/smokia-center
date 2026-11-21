/** Esqueleto con la forma de la bandeja: lista a la izquierda, hilo a la derecha. */
export default function ChatsLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Cargando chats">
      <div className="h-14 border-b border-lm-line" />
      <div className="grid h-[calc(100dvh-3.5rem-var(--lm-shell-y))] lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border-r border-lm-line">
          <div className="space-y-3 border-b border-lm-line p-3">
            <div className="h-8 rounded-lm-sm bg-lm-raised" />
            <div className="h-7 w-56 rounded-lm-sm bg-lm-raised" />
          </div>
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex gap-3 border-b border-lm-line px-3 py-3">
              <div className="size-9 shrink-0 rounded-full bg-lm-raised" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded-lm-xs bg-lm-raised" />
                <div className="h-3 w-full rounded-lm-xs bg-lm-raised" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
