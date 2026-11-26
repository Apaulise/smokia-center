// Acceso a columnas y tablas de la migración 20261125120000, que todavía no
// están en database.types.ts (no se regenera hasta aplicarla, y no se aplica
// sola). El cliente tipado sigue usándose para leads, conversaciones y el resto.

import type { LeadsClient } from "@/lib/leads/contact";

export type DbError = { code?: string; message?: string } | null;

type QueryResult = { data: Record<string, unknown>[] | null; error: DbError };

export type LooseQuery = {
  select: (columns?: string) => LooseQuery;
  insert: (row: Record<string, unknown>) => LooseQuery;
  update: (row: Record<string, unknown>) => LooseQuery;
  delete: () => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, value: readonly unknown[]) => LooseQuery;
  is: (column: string, value: null) => LooseQuery;
  not: (column: string, operator: string, value: unknown) => LooseQuery;
  ilike: (column: string, pattern: string) => LooseQuery;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: DbError }>;
  then: PromiseLike<QueryResult>["then"];
};

type LooseClient = { from: (table: string) => LooseQuery };

export function looseFrom(db: LeadsClient, table: string): LooseQuery {
  return (db as unknown as LooseClient).from(table);
}

export function isUniqueViolation(error: DbError): boolean {
  return error?.code === "23505";
}

/** Tabla o columna de la migración todavía no existe (o automation_id sigue NOT NULL). */
export function schemaMissing(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703" || error.code === "23502") return true;
  if (error.code === "PGRST204" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /webhook_deliveries|external_uid|zernio_workflow_id|schema cache/i.test(message);
}

export async function rowsOf(query: LooseQuery): Promise<{ rows: Record<string, unknown>[]; error: DbError }> {
  const result = await (query as unknown as Promise<QueryResult>);
  return { rows: result.data ?? [], error: result.error };
}
