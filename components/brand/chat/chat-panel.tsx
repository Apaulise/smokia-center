"use client";

import { Loader2, Plus, Send } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { ChatMessage } from "./chat-message";
import { SaveIdeaDialog } from "./save-idea-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendBrandChatMessage } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";

type ChatThreadRow = Database["public"]["Tables"]["brand_chat_threads"]["Row"];
type ChatMessageRow = Database["public"]["Tables"]["brand_chat_messages"]["Row"];

function userTurnContent(text: string): Json {
  return [{ role: "user", content: text }] as unknown as Json;
}

/**
 * El chat de generación de contenido (Plans/03 §3.6). Sólo mantiene "la
 * conversación actual" para la plataforma — sin selector de hilos: reabrir
 * la pantalla retoma la última, y "Nueva conversación" empieza otra. Un hilo
 * recién se crea en la base al mandar el primer mensaje (sendBrandChatMessage
 * lo hace lazy), así que no quedan hilos vacíos por sólo abrir la pantalla.
 *
 * El texto de la respuesta no llega por streaming HTTP: lib/brand/ai/chat.ts
 * corre en un after() de la Server Action y va escribiendo brand_chat_messages
 * a medida que Claude responde — acá sólo se escucha por Realtime, mismo
 * patrón que components/brand/sync-panel.tsx.
 */
export function BrandChatPanel({
  platform,
  ownerId,
  initialThread,
  initialMessages,
}: {
  platform: BrandPlatform;
  ownerId: string;
  initialThread: ChatThreadRow | null;
  initialMessages: ChatMessageRow[];
}) {
  const [threadId, setThreadId] = useState(initialThread?.id ?? null);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ideaDraft, setIdeaDraft] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef(threadId);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`brand_chat_messages_${ownerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "brand_chat_messages", filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (row.thread_id !== threadIdRef.current) return;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ownerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const busy = pending || messages.some((m) => m.role === "ASISTENTE" && m.status === "EN_CURSO");

  function handleNewThread() {
    setThreadId(null);
    setMessages([]);
    setInput("");
    setError(null);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");

    const now = new Date().toISOString();
    const optimisticUser: ChatMessageRow = {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      thread_id: threadId ?? "",
      role: "USUARIO",
      status: "COMPLETADO",
      content: userTurnContent(text),
      error: null,
      created_at: now,
      updated_at: now,
    };
    setMessages((prev) => [...prev, optimisticUser]);

    startTransition(async () => {
      const result = await sendBrandChatMessage({ threadId, platform, text });
      if (!result.ok) {
        setError(result.message);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
        setInput(text);
        return;
      }

      setThreadId(result.threadId);
      const placeholderAssistant: ChatMessageRow = {
        id: result.assistantMessageId,
        owner_id: ownerId,
        thread_id: result.threadId,
        role: "ASISTENTE",
        status: "EN_CURSO",
        content: [] as unknown as Json,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, placeholderAssistant]);
    });
  }

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col rounded-[20px] border border-line bg-elevated/80">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
        <p className="text-sm text-muted">{threadId ? "Conversación en curso" : "Conversación nueva"}</p>
        <Button type="button" variant="ghost" size="sm" onClick={handleNewThread} disabled={messages.length === 0}>
          <Plus className="size-3.5" />
          Nueva conversación
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
            Pedile una idea, un guion o un caption. Puede buscar en tus posts y en la web antes de responder.
          </p>
        ) : (
          messages.map((row) => (
            <ChatMessage key={row.id} row={row} onSaveIdea={row.role === "ASISTENTE" ? setIdeaDraft : undefined} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="border-t border-line/60 px-4 py-2 text-xs text-danger">{error}</p> : null}

      <div className="flex items-end gap-2 border-t border-line/60 p-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escribí lo que necesitás para el próximo contenido…"
          className="min-h-12 flex-1"
          disabled={busy}
        />
        <Button type="button" variant="primary" onClick={handleSend} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>

      <SaveIdeaDialog
        key={ideaDraft ?? "closed"}
        open={ideaDraft !== null}
        initialText={ideaDraft ?? ""}
        platform={platform}
        threadId={threadId}
        onClose={() => setIdeaDraft(null)}
      />
    </div>
  );
}
