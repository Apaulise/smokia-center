import { ArrowUpRight, Building2 } from "lucide-react";
import Link from "next/link";
import { ClientEditor } from "@/components/leads/crm/client-editor";
import { CrmPicker } from "@/components/leads/crm/picker";
import { actionSize, controlSize } from "@/components/leads/crm/styles";
import { CrmUnavailable } from "@/components/leads/crm/sections";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { clientStatuses, clientStatusLabels, matchesAssignee, type Contact } from "@/lib/crm/model";
import { getTaskPeople, listClients } from "@/lib/crm/queries";

export const metadata = { title: "Clientes" };

const normalize = (value: string) => value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ClientsPage({ searchParams }: PageProps<"/leads/clientes">) {
  const [{ ready, clients, contacts }, { people }, params] = await Promise.all([listClients(), getTaskPeople(), searchParams]);
  const query = (first(params.q) ?? "").slice(0, 160);
  const status = clientStatuses.find((value) => value === first(params.estado));
  const filter = first(params.responsable);
  const assignee = filter === "sin-responsable" || people.some((person) => person.id === filter) ? filter : undefined;
  const names = new Map(people.map((person) => [person.id, person.label]));
  const byClient = new Map<string, Contact[]>();
  for (const contact of contacts) {
    const items = byClient.get(contact.client_id) ?? [];
    items.push(contact);
    byClient.set(contact.client_id, items);
  }
  const term = normalize(query);
  const filtered = clients.filter((client) =>
    (!status || client.status === status) &&
    matchesAssignee(client.assigneeIds, assignee ?? "") && (
      !term || normalize(client.name).includes(term) || byClient.get(client.id)?.some((contact) => normalize(contact.name).includes(term))
    ),
  );

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Clientes" />
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-7 sm:px-6 lg:px-8">
        <PageHeading title="Clientes" description="Encontrá los contactos y pendientes de las empresas del equipo." action={ready ? <ClientEditor people={people} /> : null} />
        {ready ? (
          <>
            <search aria-label="Buscar clientes">
              <form key={JSON.stringify([query, status, assignee])} action="/leads/clientes" method="get" className="flex flex-wrap items-end gap-3">
                <Field htmlFor="clients-query" label="Empresa o contacto" className="min-w-0 flex-1 basis-48">
                  <Input className={controlSize} id="clients-query" name="q" type="search" defaultValue={query} maxLength={160} />
                </Field>
                <Field htmlFor="clients-status" label="Estado">
                  <CrmPicker id="clients-status" label="Estado" name="estado" initial={status ?? ""}
                    options={[{ value: "", label: "Todos" }, ...clientStatuses.map((value) => ({ value, label: clientStatusLabels[value] }))]} />
                </Field>
                <Field htmlFor="clients-assignee" label="Responsable" className="min-w-0">
                  <CrmPicker id="clients-assignee" label="Responsable" name="responsable" initial={assignee ?? ""}
                    options={[{ value: "", label: "Todos" }, ...people.map(({ id, label }) => ({ value: id, label })),
                      { value: "sin-responsable", label: "Sin responsable" }]} />
                </Field>
                <Button type="submit" className={actionSize}>Buscar</Button>
                {query || status || assignee ? <ButtonLink href="/leads/clientes" variant="ghost" className={actionSize}>Limpiar</ButtonLink> : null}
              </form>
            </search>
            {filtered.length ? (
              <ul className="overflow-hidden rounded-lm-lg border border-lm-line">
                {filtered.map((client) => {
                  const people = byClient.get(client.id) ?? [];
                  return (
                    <li key={client.id} className="border-b border-lm-line last:border-b-0">
                      <Link href={`/leads/clientes/${client.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 hover:bg-lm-ink/5 focus-visible:lm-focus sm:px-4">
                        <span className="grid size-9 place-items-center rounded-lm-md bg-lm-signal-soft text-lm-signal-text"><Building2 size={17} aria-hidden /></span>
                        <span className="min-w-0">
                          <span className="block font-semibold wrap-anywhere text-lm-ink">{client.name}</span>
                          <span className="mt-1 block text-xs wrap-anywhere text-lm-ink-2">{clientStatusLabels[client.status]} · {client.assigneeIds.map((id) => names.get(id) ?? "Fuera del equipo").join(", ") || "Sin responsables"} · {people[0]?.name ?? "Sin contacto"}{people.length > 1 ? ` y ${people.length - 1} más` : ""}</span>
                        </span>
                        <ArrowUpRight size={16} className="text-lm-ink-2" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lm-lg border border-dashed border-lm-line p-5 text-sm text-lm-ink-2">
                {clients.length ? "Ningún cliente coincide con esta búsqueda." : "Todavía no hay clientes. Creá uno acá o desde la ficha de un lead ganado."}
              </p>
            )}
          </>
        ) : <CrmUnavailable />}
      </div>
    </>
  );
}
