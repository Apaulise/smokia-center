"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** A menos de esto del final se considera que la persona está "abajo" y se la sigue. */
const STICK_PX = 120;

/**
 * El contenedor con scroll del hilo.
 *  · Al abrir otra conversación, baja hasta el final.
 *  · Cuando entra un mensaje nuevo, baja sólo si ya estaba abajo (o si lo mandó
 *    uno): no le saca la lectura a quien subió a buscar algo.
 *  · Cuando se cargan mensajes anteriores arriba, conserva la posición.
 */
export function ThreadScroller({
  conversationId,
  firstMessageKey,
  lastMessageKey,
  lastIsOwn,
  children,
}: {
  conversationId: string;
  firstMessageKey: string;
  /** Cambia cuando llega o se manda un mensaje. */
  lastMessageKey: string;
  lastIsOwn: boolean;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef<{ conversationId: string; first: string; last: string; height: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const before = previous.current;

    if (!before || before.conversationId !== conversationId) {
      element.scrollTop = element.scrollHeight;
    } else if (before.first !== firstMessageKey && before.last === lastMessageKey) {
      // Se sumaron mensajes viejos arriba: se compensa lo que creció para no saltar.
      element.scrollTop = before.top + (element.scrollHeight - before.height);
    } else if (before.last !== lastMessageKey) {
      const nearBottom = before.height - before.top - element.clientHeight < STICK_PX;
      if (nearBottom || lastIsOwn) element.scrollTo({ top: element.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }

    previous.current = { conversationId, first: firstMessageKey, last: lastMessageKey, height: element.scrollHeight, top: element.scrollTop };
  }, [conversationId, firstMessageKey, lastMessageKey, lastIsOwn]);

  return (
    <div
      ref={container}
      onScroll={(event) => {
        if (previous.current) previous.current.top = event.currentTarget.scrollTop;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
    >
      {children}
    </div>
  );
}
