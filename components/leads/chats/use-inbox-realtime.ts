"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

/** Red de seguridad por si Realtime no está habilitado o se cortó: el webhook igual escribe en la base. */
const SAFETY_POLL_MS = 45_000;

type Handlers = {
  /** Una fila de `conversations` nueva o cambiada. */
  onConversation: (row: Record<string, unknown>) => void;
  /** Una fila de `messages` nueva o cambiada. */
  onMessage: (row: Record<string, unknown>) => void;
  /** Volvió la pestaña, se reconectó o pasó el sondeo: conviene pedir la lista. */
  onResync: () => void;
};

/**
 * Escucha `conversations` y `messages` por Realtime y le pasa cada fila a la
 * bandeja para que la parche en su estado, sin pedirle la pantalla entera al
 * servidor. Realtime respeta RLS: cada usuario sólo recibe lo suyo y lo que le
 * compartieron. Los handlers van en una ref, así la suscripción no se rehace
 * en cada render.
 */
export function useInboxRealtime(handlers: Handlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const supabase = createClient();
    let joined = false;

    const channel = supabase
      .channel("inbox_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (payload.new && typeof payload.new === "object" && "id" in payload.new) latest.current.onMessage(payload.new as Record<string, unknown>);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        if (payload.new && typeof payload.new === "object" && "id" in payload.new) latest.current.onConversation(payload.new as Record<string, unknown>);
      })
      .subscribe((status) => {
        // Al reconectarse, lo que pasó mientras estuvo caído no llega por Realtime: se pide la lista.
        if (status === "SUBSCRIBED") {
          if (joined) latest.current.onResync();
          joined = true;
        }
      });

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") latest.current.onResync();
    }, SAFETY_POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") latest.current.onResync();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);
}
