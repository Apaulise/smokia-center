import type { Tables } from "@/lib/supabase/database.types";

export const projectStatuses = ["planned", "in_progress", "paused", "done"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const projectStatusLabels: Record<ProjectStatus, string> = {
  planned: "Planificado", in_progress: "En curso", paused: "En pausa", done: "Completado",
};

export type ProjectStage = Pick<Tables<"crm_project_stages">, "id" | "name" | "position">;
export type Project = Tables<"crm_projects"> & {
  clientName: string;
  stages: ProjectStage[];
  assigneeIds: string[];
};
export type ProjectSummary = Project & { total: number; completed: number };
