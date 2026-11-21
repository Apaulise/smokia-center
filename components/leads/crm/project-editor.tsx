"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { CrmEditor } from "@/components/leads/crm/editor";
import { CrmPicker, type PickerOption } from "@/components/leads/crm/picker";
import { actionSize, controlSize } from "@/components/leads/crm/styles";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { PersonOption } from "@/lib/crm/model";
import { saveCrmProject } from "@/lib/crm/projects/actions";
import { projectStatuses, projectStatusLabels, type Project } from "@/lib/crm/projects/model";

function ProjectStages({ project }: { project?: Project }) {
  const id = useId();
  const [stages, setStages] = useState(project?.stages ?? []);
  const [current, setCurrent] = useState(project?.current_stage_id ?? "");

  function move(index: number, offset: number) {
    setStages((rows) => {
      const next = [...rows];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  return (
    <fieldset className="grid gap-3 rounded-lm-md border border-lm-line p-3">
      <legend className="px-1 text-sm font-medium text-lm-ink">Etapas</legend>
      <ol className="grid gap-2">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex min-w-0 flex-wrap items-center gap-1.5">
            <input type="hidden" name="stage_id" value={stage.id} />
            <Input className={`${controlSize} min-w-28 flex-1`} aria-label={`Nombre de etapa ${index + 1}`} name="stage_name" value={stage.name}
              required maxLength={120} onChange={(event) => {
                const name = event.target.value;
                setStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, name } : row));
              }} />
            <Button type="button" variant="ghost" aria-label={`Subir etapa ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
            <Button type="button" variant="ghost" aria-label={`Bajar etapa ${index + 1}`} disabled={index === stages.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
            <Button type="button" variant="ghost" aria-label={`Quitar etapa ${index + 1}`} onClick={() => {
              if (current === stage.id) setCurrent("");
              setStages((rows) => rows.filter((row) => row.id !== stage.id));
            }}><X size={14} /></Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="secondary" className={`${actionSize} justify-self-start`} disabled={stages.length >= 30}
        onClick={() => {
          const stage = { id: crypto.randomUUID(), name: "", position: stages.length };
          setStages((rows) => [...rows, stage]);
        }}><Plus size={15} />Agregar etapa</Button>
      <Field label="Etapa actual" htmlFor={id}>
        <CrmPicker id={id} label="Etapa actual" name="current_stage_id" value={current} onChange={setCurrent} options={[
          { value: "", label: "Sin etapa actual" },
          ...stages.map((stage, index) => ({ value: stage.id, label: stage.name || `Etapa ${index + 1}` })),
        ]} />
      </Field>
    </fieldset>
  );
}

export function ProjectEditor({ project, people, clients, clientId, hasTasks = false }: {
  project?: Project;
  people: PersonOption[];
  clients: PickerOption[];
  clientId?: string;
  hasTasks?: boolean;
}) {
  const id = useId();
  const title = project ? "Editar proyecto" : "Nuevo proyecto";
  const assignees = project ? project.assigneeIds.filter((id) => people.some((person) => person.id === id))
    : people.slice(0, 1).map((person) => person.id);
  return (
    <CrmEditor title={title} trigger={project ? title : <><Plus size={16} />{title}</>} primary={!project} revision={project?.edit_version}
      submit={project ? "Guardar proyecto" : "Crear proyecto"} action={saveCrmProject.bind(null, project?.id ?? null)}>
      <Field label="Nombre del proyecto" htmlFor={`${id}-name`}>
        <Input className={controlSize} id={`${id}-name`} name="name" required maxLength={160} defaultValue={project?.name} />
      </Field>
      <Field label="Cliente" htmlFor={`${id}-client`} hint={hasTasks ? "El cliente queda fijo mientras haya tareas asociadas." : undefined}>
        <CrmPicker label="Cliente" id={`${id}-client`} name="client_id" initial={project?.client_id ?? clientId ?? ""}
          placeholder="Elegí el cliente" disabled={hasTasks} options={clients} />
      </Field>
      <Field label="Estado" htmlFor={`${id}-status`}>
        <CrmPicker label="Estado" id={`${id}-status`} name="status" initial={project?.status ?? "planned"}
          options={projectStatuses.map((value) => ({ value, label: projectStatusLabels[value] }))} />
      </Field>
      <Field label="Responsables" htmlFor={`${id}-people`}>
        <CrmPicker multiple label="Responsables" id={`${id}-people`} name="assignees" initial={assignees} placeholder="Sin responsable"
          options={people.map((person) => ({ value: person.id, label: person.label }))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de inicio" htmlFor={`${id}-start`}>
          <Input className={controlSize} id={`${id}-start`} name="starts_on" type="date" defaultValue={project?.starts_on ?? ""} />
        </Field>
        <Field label="Fecha de entrega" htmlFor={`${id}-due`}>
          <Input className={controlSize} id={`${id}-due`} name="due_on" type="date" defaultValue={project?.due_on ?? ""} />
        </Field>
      </div>
      <ProjectStages project={project} />
    </CrmEditor>
  );
}
