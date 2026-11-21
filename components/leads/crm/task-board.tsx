"use client";

import { Check, GripVertical, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented, SegmentedButton } from "@/components/ui/tabs";
import { CrmEditor } from "@/components/leads/crm/editor";
import { CrmPicker } from "@/components/leads/crm/picker";
import { actionSize, controlSize } from "@/components/leads/crm/styles";
import { moveCrmTask, saveBoardColor, saveCrmTask } from "@/lib/crm/actions";
import {
  columnColorLabels, columnColors, contextColumns, contextHref, defaultColumnColors, matchesAssignee,
  priorities, priorityLabels, taskDate, taskGroup, taskGroups, taskStatuses, taskStatusLabels,
  type ColumnColor, type ContextKind, type PersonOption, type Priority, type ProjectOption, type Task, type TaskContext, type TaskGroup, type TaskStatus,
} from "@/lib/crm/model";

const contextLabels: Record<ContextKind, string> = { lead: "Prospectos", client: "Clientes", chat: "Chats" };
const contextKey = (context: TaskContext) => `${context.kind}:${context.id}`;
const swatches: Record<ColumnColor, string> = {
  gray: "#868895", amber: "#d8a331", green: "#41976c", blue: "#528ad4", purple: "#a889d2", rose: "#cc718f",
};
const priorityTones: Record<Priority, { text: string; swatch: string }> = {
  high: { text: "text-lm-danger bg-lm-danger-soft", swatch: "var(--color-lm-danger)" },
  normal: { text: "text-lm-signal-text bg-lm-signal-soft", swatch: "var(--color-lm-signal)" },
  low: { text: "text-lm-success bg-lm-success-soft", swatch: "var(--color-lm-success)" },
};
const priorityOptions = priorities.map((value) => ({ value, label: priorityLabels[value], swatch: priorityTones[value].swatch }));
const moveOptions = [
  { value: "pending", label: "Pendiente" }, { value: "in_progress", label: "En curso" }, { value: "done", label: "Completada" },
];

function boardCards(board: HTMLDivElement) {
  return Array.from(board.querySelectorAll<HTMLElement>("[data-task-card]"));
}

function TaskLinks({ task, contexts, projects, fixed, defaultProject }: {
  task?: Task;
  contexts: TaskContext[];
  projects: ProjectOption[];
  fixed?: TaskContext;
  defaultProject?: ProjectOption;
}) {
  const id = useId();
  const activeProject = task ? projects.find((project) => project.id === task.project_id) : defaultProject;
  const [projectId, setProjectId] = useState(activeProject?.id ?? "");
  const [clientId, setClientId] = useState(task?.client_id ?? activeProject?.clientId ?? (fixed?.kind === "client" ? fixed.id : ""));
  const clients = contexts.filter((context) => context.kind === "client");
  const origins = contexts.filter((context) => context.kind !== "client");
  const origin = origins.find((context) => task?.[contextColumns[context.kind]] === context.id);
  const hiddenOrigin = Boolean(task && !origin && (task.lead_id || task.conversation_id));
  const hiddenClient = Boolean(task?.client_id && !clients.some((client) => client.id === task.client_id));
  const hiddenProject = Boolean(task?.project_id && !activeProject);
  const projectChoices = fixed?.kind === "client" ? projects.filter((project) => project.clientId === fixed.id) : projects;
  return (
    <>
      <Field label="Cliente" htmlFor={`${id}-client`}>
        {hiddenClient || hiddenProject ? (
          <p className="text-sm text-lm-ink-2">Se conserva el cliente vinculado fuera de esta vista.</p>
        ) : (
          <>
            {projectId || fixed?.kind === "client" ? <input type="hidden" name="client_id" value={clientId} /> : null}
            <CrmPicker label="Cliente" id={`${id}-client`} name={projectId || fixed?.kind === "client" ? undefined : "client_id"}
              value={clientId} disabled={Boolean(projectId) || fixed?.kind === "client"} onChange={setClientId}
              options={[{ value: "", label: "Sin cliente" }, ...clients.map((client) => ({ value: client.id, label: client.label }))]} />
          </>
        )}
      </Field>
      <Field label="Proyecto" htmlFor={`${id}-project`}>
        {hiddenClient || hiddenProject ? (
          <p className="text-sm text-lm-ink-2">{hiddenProject ? "Se conserva el proyecto vinculado." : "Sin proyecto disponible."}</p>
        ) : (
          <CrmPicker label="Proyecto" id={`${id}-project`} name="project_id" value={projectId}
            onChange={(value) => {
              setProjectId(value);
              const project = projects.find((option) => option.id === value);
              if (project) setClientId(project.clientId);
            }}
            options={[{ value: "", label: "Sin proyecto" }, ...projectChoices.map((project) => ({
              value: project.id, label: project.label, group: clients.find((client) => client.id === project.clientId)?.label,
            }))]} />
        )}
      </Field>
      {fixed && fixed.kind !== "client" ? <input type="hidden" name="origin" value={contextKey(fixed)} /> : (
        <Field label="Origen" htmlFor={`${id}-origin`}>
          <CrmPicker label="Origen" id={`${id}-origin`} name="origin" initial={origin ? contextKey(origin) : hiddenOrigin ? "preserve" : ""}
            options={[
              ...(hiddenOrigin ? [{ value: "preserve", label: "Conservar origen actual" }] : []),
              { value: "", label: "Sin prospecto ni chat" },
              ...origins.map((context) => ({ value: contextKey(context), label: context.label, group: contextLabels[context.kind] })),
            ]} />
        </Field>
      )}
    </>
  );
}

function TaskEditor({ task, people, contexts, projects, fixed, defaultProject, primary = false, onChanged }: {
  task?: Task;
  people: PersonOption[];
  contexts: TaskContext[];
  projects: ProjectOption[];
  fixed?: TaskContext;
  defaultProject?: ProjectOption;
  primary?: boolean;
  onChanged?: () => void;
}) {
  const id = useId();
  const assignees = task ? task.assigneeIds.filter((personId) => people.some((person) => person.id === personId)) : people.slice(0, 1).map((person) => person.id);
  return (
    <CrmEditor title={task ? "Editar tarea" : "Nueva tarea"} description={fixed ? fixed.label : undefined} revision={task?.edit_version}
      trigger={task ? "Editar" : <><Plus size={16} aria-hidden />Nueva tarea</>}
      action={async (previous, form) => {
        const result = await saveCrmTask(previous, form);
        if (result.ok) onChanged?.();
        return result;
      }} submit={task ? "Guardar cambios" : "Crear tarea"} primary={primary}>
      <input type="hidden" name="id" value={task?.id ?? ""} />
      <Field label="Título (obligatorio)" htmlFor={`${id}-title`}>
        <Input className={controlSize} id={`${id}-title`} name="title" required maxLength={160} defaultValue={task?.title} />
      </Field>
      <Field label="Descripción" htmlFor={`${id}-description`}>
        <Textarea className="text-base sm:text-sm" id={`${id}-description`} name="description" maxLength={3000}
          defaultValue={task?.description ?? ""} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vencimiento" htmlFor={`${id}-due`}>
          <Input className={controlSize} id={`${id}-due`} type="date" name="due" defaultValue={task?.due_date ?? ""} />
        </Field>
        <Field label="Prioridad" htmlFor={`${id}-priority`}>
          <CrmPicker label="Prioridad" id={`${id}-priority`} name="priority" initial={task?.priority ?? "normal"} options={priorityOptions} />
        </Field>
      </div>
      <Field label="Responsables" htmlFor={`${id}-assignee`}>
        <CrmPicker multiple label="Responsables" id={`${id}-assignee`} name="assignees" initial={assignees}
          options={people.map((person) => ({ value: person.id, label: person.label }))} placeholder="Sin responsable" />
      </Field>
      <TaskLinks task={task} contexts={contexts} projects={projects} fixed={fixed} defaultProject={defaultProject} />
    </CrmEditor>
  );
}

function TaskRow({ task, people, contexts, projects, fixed, fixedProject, kanban, pending, dragging, onChanged, onMove, onDrag }: {
  task: Task;
  people: PersonOption[];
  contexts: TaskContext[];
  projects: ProjectOption[];
  fixed?: TaskContext;
  fixedProject?: ProjectOption;
  kanban: boolean;
  pending: boolean;
  dragging: boolean;
  onChanged?: () => void;
  onMove: (task: Task, status: TaskStatus, restoreFocus?: boolean) => void;
  onDrag: (id: string | null) => void;
}) {
  const links = contexts.filter((item) => task[contextColumns[item.kind]] === item.id &&
    (item.kind !== fixed?.kind || item.id !== fixed?.id));
  const project = projects.find((item) => item.id === task.project_id);
  const completed = Boolean(task.completed_at);
  const assignee = task.assigneeIds.map((memberId) => people.find((person) => person.id === memberId)?.label ?? "Fuera del equipo").join(", ");
  const card = useRef<HTMLLIElement>(null);

  return (
    <li ref={card} data-task-card={kanban ? task.id : undefined}
      className={kanban
        ? `flex min-w-0 flex-col gap-3 rounded-lm-md border border-lm-line bg-lm-raised px-3 py-3 motion-safe:transition-opacity motion-safe:duration-150 ${dragging ? "opacity-45" : ""}`
        : "flex min-w-0 flex-col gap-2 border-b border-lm-line px-3 py-3 last:border-b-0 @lg:flex-row @lg:items-start @lg:justify-between"}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {kanban ? (
            <span draggable={!pending} data-drag-handle title="Arrastrar tarjeta" aria-hidden
              className="hidden shrink-0 cursor-grab rounded-lm-sm p-1 text-lm-ink-2 hover:bg-lm-ink/10 active:cursor-grabbing pointer-fine:inline-flex"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-smokia-task", task.id);
                if (card.current) event.dataTransfer.setDragImage(card.current, 18, 18);
                onDrag(task.id);
              }} onDragEnd={() => onDrag(null)}><GripVertical size={15} /></span>
          ) : null}
          <p className={`font-medium wrap-anywhere ${completed ? "text-lm-ink-2" : "text-lm-ink"}`}>{task.title}</p>
        </div>
        {task.description ? <p className="mt-1 text-sm whitespace-pre-wrap wrap-anywhere text-lm-ink-2">{task.description}</p> : null}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-lm-ink-2">
          <span className="wrap-anywhere">{assignee || "Sin responsable"}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${priorityTones[task.priority].text}`}>
            <span aria-hidden className="size-1.5 rounded-full bg-current" />Prioridad {priorityLabels[task.priority].toLowerCase()}
          </span>
          {task.due_date ? <time dateTime={task.due_date}>{taskDate(task.due_date)}</time> : null}
          {!kanban && task.status === "in_progress" ? <span>En curso</span> : null}
          {links.map((context) => <Link key={contextKey(context)} className="font-medium wrap-anywhere text-lm-signal-text underline-offset-2 hover:underline focus-visible:lm-focus" href={contextHref(context.kind, context.id)}>{context.label}</Link>)}
          {project && project.id !== fixedProject?.id ? <Link className="font-medium wrap-anywhere text-lm-signal-text underline-offset-2 hover:underline focus-visible:lm-focus" href={`/leads/proyectos/${project.id}`}>{project.label}</Link> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <TaskEditor task={task} people={people} contexts={contexts} projects={projects} fixed={fixed} onChanged={onChanged} />
        {kanban ? (
          <div className="min-w-0 flex-1">
            <CrmPicker label={`Mover tarea ${task.title}`} value={task.status}
              options={moveOptions} disabled={pending} onChange={(status) => onMove(task, status as TaskStatus, true)} />
          </div>
        ) : (
          <Button type="button" variant="ghost" className={actionSize} disabled={pending}
            aria-label={`${completed ? "Reabrir" : "Completar"}: ${task.title}`}
            onClick={() => onMove(task, completed ? "pending" : "done")}>
            {completed ? <RotateCcw size={15} aria-hidden /> : <Check size={15} aria-hidden />}
            {completed ? "Reabrir" : "Completar"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function TaskBoard({ tasks, people, contexts, projects, userId, today, fixed, fixedProject, viewToggle = false, board, onChanged }: {
  tasks: Task[];
  people: PersonOption[];
  contexts: TaskContext[];
  projects: ProjectOption[];
  userId: string;
  today: string;
  fixed?: TaskContext;
  fixedProject?: ProjectOption;
  viewToggle?: boolean;
  board?: { teamId: string | null; colors: Partial<Record<TaskStatus, ColumnColor>> };
  onChanged?: () => void;
}) {
  const id = useId();
  const params = useSearchParams();
  const responsible = viewToggle ? params.get("responsable") : null;
  const assignee = responsible === "yo" ? userId : responsible === "sin-responsable" ? responsible
    : people.find((person) => person.id === responsible)?.id ?? "";
  const priority = viewToggle ? priorities.find((value) => value === params.get("prioridad")) : undefined;
  const clients = contexts.filter((context) => context.kind === "client");
  const client = viewToggle ? clients.find((item) => item.id === params.get("cliente")) : undefined;
  const filteredProjects = client ? projects.filter((item) => item.clientId === client.id) : projects;
  const project = viewToggle ? filteredProjects.find((item) => item.id === params.get("proyecto")) : undefined;
  const kanban = viewToggle && params.get("vista") === "tablero";
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [destination, setDestination] = useState<TaskStatus | null>(null);
  const [changingColor, setChangingColor] = useState<TaskStatus | null>(null);
  const moves = useRef(new Set<string>());
  const boardElement = useRef<HTMLDivElement>(null);
  const beforeMove = useRef<Map<string, DOMRect> | null>(null);
  const focusMoved = useRef<string | null>(null);
  const [moving, setMoving] = useState<string[]>([]);
  const [, start] = useTransition();
  const [optimisticTasks, applyStatus] = useOptimistic(tasks, (rows, change: { id: string; status: TaskStatus; completedAt: string | null }) =>
    rows.map((row) => row.id === change.id ? { ...row, status: change.status, completed_at: change.completedAt } : row));

  useLayoutEffect(() => {
    const before = beforeMove.current;
    const element = boardElement.current;
    beforeMove.current = null;
    if (!before || !element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const changed = boardCards(element).flatMap((card) => {
      const previous = before.get(card.dataset.taskCard ?? "");
      if (!previous) return [];
      for (const animation of card.getAnimations()) {
        if (animation.id === "crm-card-move") animation.cancel();
      }
      const next = card.getBoundingClientRect();
      const x = previous.left - next.left;
      const y = previous.top - next.top;
      return Math.abs(x) + Math.abs(y) > 1 ? [{ card, x, y }] : [];
    });

    for (const { card, x, y } of changed) {
      if (Math.abs(y) > window.innerHeight * 0.65) continue;
      card.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], {
        id: "crm-card-move", duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    }
  }, [optimisticTasks]);

  useLayoutEffect(() => {
    const id = focusMoved.current;
    const board = boardElement.current;
    if (!id || moving.includes(id) || !board) return;
    focusMoved.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    boardCards(board).find((card) => card.dataset.taskCard === id)
      ?.querySelector<HTMLElement>("[aria-expanded]")?.focus({ preventScroll: true });
  }, [moving]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const GroupHeading = fixed ? "h3" : "h2";
  const visible = optimisticTasks.filter((task) => matchesAssignee(task.assigneeIds, assignee) && (!priority || task.priority === priority)
    && (!client || task.client_id === client.id) && (!project || task.project_id === project.id))
    .sort((left, right) => {
      const priorityOrder = priorities.indexOf(left.priority) - priorities.indexOf(right.priority);
      const dateOrder = (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31");
      return (kanban ? priorityOrder || dateOrder : dateOrder || priorityOrder) ||
        (right.completed_at ?? right.created_at).localeCompare(left.completed_at ?? left.created_at);
    });
  const groups = (Object.keys(taskGroups) as TaskGroup[]).map((group) => ({
    group,
    rows: visible.filter((task) => taskGroup(task, today) === group),
  }));

  function setFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    if (key === "cliente" && value && project?.clientId !== value) url.searchParams.delete("proyecto");
    window.history.replaceState(null, "", url);
  }

  function rememberCardPositions() {
    if (boardElement.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      beforeMove.current = new Map(boardCards(boardElement.current).map((card) => [card.dataset.taskCard ?? "", card.getBoundingClientRect()]));
    }
  }

  function move(task: Task, status: TaskStatus, restoreFocus = false) {
    if (task.status === status || moves.current.has(task.id)) return;
    moves.current.add(task.id);
    setMoving((ids) => [...ids, task.id]);
    setMessage(null);
    start(async () => {
      rememberCardPositions();
      if (restoreFocus) focusMoved.current = task.id;
      applyStatus({ id: task.id, status, completedAt: status === "done" ? new Date().toISOString() : null });
      try {
        const result = await moveCrmTask(task.id, status);
        if (!result.ok) rememberCardPositions();
        setMessage({ error: !result.ok, text: result.message });
        if (result.ok) onChanged?.();
      } catch {
        rememberCardPositions();
        setMessage({ error: true, text: "No se pudo mover la tarea. Volvió a su columna." });
      } finally {
        moves.current.delete(task.id);
        setMoving((ids) => ids.filter((id) => id !== task.id));
      }
    });
  }

  function drag(id: string | null) {
    setDraggedId(id);
    setDestination(null);
  }

  function changeColor(status: TaskStatus, color: ColumnColor) {
    setChangingColor(status);
    start(async () => {
      try {
        const result = await saveBoardColor(status, color);
        setMessage({ error: !result.ok, text: result.message });
      } catch {
        setMessage({ error: true, text: "No se pudo guardar el color." });
      } finally {
        setChangingColor(null);
      }
    });
  }

  const renderTask = (task: Task) => (
    <TaskRow key={task.id} task={task} people={people} contexts={contexts} projects={projects} fixed={fixed} fixedProject={fixedProject}
      kanban={kanban} pending={moving.includes(task.id)} dragging={draggedId === task.id} onChanged={onChanged} onMove={move} onDrag={drag} />
  );

  return (
    <div className="@container grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {viewToggle ? (
          <search aria-label="Filtros de tareas" className="flex flex-wrap gap-3">
            <Field label="Responsable" htmlFor={`${id}-person`}>
              <CrmPicker label="Responsable" id={`${id}-person`} value={assignee} onChange={(value) => setFilter("responsable", value === userId ? "yo" : value)}
                options={[{ value: "", label: "Todos" }, { value: "sin-responsable", label: "Sin responsable" },
                  ...people.map((person) => ({ value: person.id, label: person.id === userId ? "Mis tareas" : person.label }))]} />
            </Field>
            <Field label="Prioridad" htmlFor={`${id}-priority`}>
              <CrmPicker label="Prioridad" id={`${id}-priority`} value={priority ?? ""} onChange={(value) => setFilter("prioridad", value)}
                options={[{ value: "", label: "Todas" }, ...priorityOptions]} />
            </Field>
            <Field label="Cliente" htmlFor={`${id}-client`}>
              <CrmPicker label="Cliente" id={`${id}-client`} value={client?.id ?? ""} onChange={(value) => setFilter("cliente", value)}
                options={[{ value: "", label: "Todos" }, ...clients.map((item) => ({ value: item.id, label: item.label }))]} />
            </Field>
            <Field label="Proyecto" htmlFor={`${id}-project`}>
              <CrmPicker label="Proyecto" id={`${id}-project`} value={project?.id ?? ""} onChange={(value) => setFilter("proyecto", value)}
                options={[{ value: "", label: "Todos" }, ...filteredProjects.map((item) => ({ value: item.id, label: item.label }))]} />
            </Field>
          </search>
        ) : null}
        {viewToggle ? (
          <div role="group" aria-label="Vista de tareas">
            <Segmented>
              <SegmentedButton className={actionSize} active={!kanban} onClick={() => setFilter("vista", "")}>Lista</SegmentedButton>
              <SegmentedButton className={actionSize} active={kanban} onClick={() => setFilter("vista", "tablero")}>Tablero</SegmentedButton>
            </Segmented>
          </div>
        ) : null}
        <TaskEditor people={people} contexts={contexts} projects={projects} fixed={fixed}
          defaultProject={fixedProject ?? project} primary={!fixed} onChanged={onChanged} />
      </div>
      {message ? <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-lm-danger" : "sr-only"}>{message.text}</p> : null}
      {kanban ? (
        <div ref={boardElement} className="grid min-w-0 gap-3 @min-[42rem]:grid-cols-3" aria-label="Tablero de tareas">
          {taskStatuses.map((status) => {
            const rows = visible.filter((task) => task.status === status);
            const color = board?.colors[status] ?? defaultColumnColors[status];
            return (
              <section key={status} aria-labelledby={`${id}-${status}`}
                className={`min-w-0 rounded-lm-lg border border-t-4 p-3 motion-safe:transition-colors motion-safe:duration-150 ${destination === status ? "border-lm-signal bg-lm-signal-soft" : "border-lm-line bg-lm-ink/3"}`}
                style={{ borderTopColor: swatches[color] }}
                onDragOver={(event) => {
                  if (!draggedId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (destination !== status) setDestination(status);
                }}
                onDragLeave={(event) => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDestination(null);
                }}
                onDrop={(event) => {
                  if (!draggedId || event.dataTransfer.getData("application/x-smokia-task") !== draggedId) return;
                  event.preventDefault();
                  const task = visible.find((item) => item.id === draggedId);
                  drag(null);
                  if (task) move(task, status);
                }}>
                <h2 id={`${id}-${status}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-lm-ink">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: swatches[color] }} />
                  {taskStatusLabels[status]} <span className="font-mono text-xs font-normal text-lm-ink-2">({rows.length})</span>
                </h2>
                {board?.teamId ? (
                  <div className="mb-3">
                    <CrmPicker label={`Color de ${taskStatusLabels[status]}`} value={color} disabled={changingColor !== null}
                      onChange={(value) => { if (value !== color) changeColor(status, value as ColumnColor); }}
                      options={columnColors.map((value) => ({ value, label: columnColorLabels[value], swatch: swatches[value] }))} />
                  </div>
                ) : null}
                {rows.length ? <ul className="grid min-w-0 gap-2">{rows.map(renderTask)}</ul> : (
                  <p className="rounded-lm-md border border-dashed border-lm-line p-3 text-sm text-lm-ink-2">Sin tareas.</p>
                )}
              </section>
            );
          })}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lm-md border border-dashed border-lm-line p-4 text-sm text-lm-ink-2">
          {tasks.length ? "No hay tareas con estos filtros." : "Todavía no hay tareas. Creá una para registrar un pendiente."}
        </p>
      ) : groups.filter(({ rows }) => rows.length).map(({ group, rows }) => (
        <section key={group} className="min-w-0">
          <GroupHeading className={`mb-2 flex items-center gap-2 text-sm font-semibold ${group === "overdue" ? "text-lm-danger" : "text-lm-ink"}`}>
            {taskGroups[group]} <span className="font-mono text-xs font-normal text-lm-ink-2">({rows.length})</span>
          </GroupHeading>
          <ul className="rounded-lm-md border border-lm-line bg-lm-ink/3">
            {rows.map(renderTask)}
          </ul>
        </section>
      ))}
    </div>
  );
}
