import { z } from "zod";
import { FollowUpTabs, CrmUnavailable } from "@/components/leads/crm/sections";
import { TaskBoard } from "@/components/leads/crm/task-board";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { argentinaDay } from "@/lib/crm/model";
import { getAvailableTaskContexts, getBoardSettings, getTaskPeople, listTasks } from "@/lib/crm/queries";
import { listProjectOptions } from "@/lib/crm/projects/queries";

export const metadata = { title: "Tareas · SmokIA" };

export default async function TasksPage({ searchParams }: PageProps<"/leads/seguimiento/tareas">) {
  const { conversacion } = await searchParams;
  const chatId = z.uuid().safeParse(conversacion);
  const result = await listTasks(chatId.success ? "chat" : undefined, chatId.data);
  const [assignment, contexts, board, projects] = result.ready
    ? await Promise.all([getTaskPeople(), getAvailableTaskContexts(), getBoardSettings(), listProjectOptions()])
    : [null, [], undefined, []] as const;
  const fixed = chatId.success ? contexts.find((context) => context.kind === "chat" && context.id === chatId.data) : undefined;
  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Seguimiento / Tareas" />
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-7 sm:px-6 lg:px-8">
        <PageHeading title={fixed ? `Tareas de ${fixed.label}` : "Tareas"} description="Organizá los pendientes del equipo por vencimiento o estado." />
        <FollowUpTabs active="tareas" />
        {assignment ? (
          <TaskBoard tasks={result.tasks} {...assignment} contexts={contexts} projects={projects} board={board} today={argentinaDay()} fixed={fixed} viewToggle />
        ) : <CrmUnavailable />}
      </div>
    </>
  );
}
