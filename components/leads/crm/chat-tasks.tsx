"use client";

import { useState, useTransition } from "react";
import { TaskBoard } from "@/components/leads/crm/task-board";
import { Button } from "@/components/ui/button";
import { loadChatTasks } from "@/lib/crm/actions";

export function ChatTasks({ conversationId }: { conversationId: string }) {
  const [panel, setPanel] = useState<Awaited<ReturnType<typeof loadChatTasks>>>(null);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      setError(false);
      try {
        const result = await loadChatTasks(conversationId);
        if (result) setPanel(result);
        else setError(true);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <>
      {panel ? (
        <TaskBoard tasks={panel.tasks} people={panel.people} userId={panel.userId} today={panel.today}
          fixed={panel.context} contexts={panel.contexts} projects={panel.projects} onChanged={load} />
      ) : (
        <Button variant="ghost" type="button" onClick={load} disabled={pending} className="self-start">
          {pending ? "Cargando…" : "Ver o crear tareas"}
        </Button>
      )}
      {error ? <p role="alert" className="text-xs text-lm-danger">No se pudieron cargar las tareas de este chat.</p> : null}
    </>
  );
}
