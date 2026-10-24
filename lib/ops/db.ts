import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";

import type { OpsArea, OpsChannel, OpsDecision, OpsEstado, OpsImpact, OpsImprovementStatus, OpsWorkArea } from "./types";

/**
 * Tipos de las tablas de Operaciones, a mano, hasta que se aplique la
 * migración y se corra `npm run db:types`. `database.types.ts` no se edita:
 * es generado. Cuando el generador ya traiga estas tablas, este cruce sigue
 * siendo compatible si las columnas coinciden.
 */
type OpsStatusRow = {
  id: string;
  owner_id: string;
  external_id: string;
  area: OpsWorkArea;
  agent: string;
  title: string;
  detail: string;
  estado: OpsEstado;
  needs_ok: boolean;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

type OpsApprovalRow = {
  id: string;
  owner_id: string;
  external_id: string;
  lead_id: string | null;
  lead_name: string;
  channel: OpsChannel;
  draft_body: string;
  reason: string;
  agent: string;
  decision: OpsDecision;
  final_body: string | null;
  decided_at: string | null;
  decided_by: string | null;
  history: Json;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

type OpsImprovementRow = {
  id: string;
  owner_id: string;
  external_id: string;
  area: OpsArea;
  title: string;
  body: string;
  impact: OpsImpact;
  impact_score: number | null;
  status: OpsImprovementStatus;
  week_label: string | null;
  created_at: string;
  updated_at: string;
};

type TableOf<Row extends { owner_id: string }> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, "owner_id">;
  Update: Partial<Row>;
  Relationships: [];
};

export type OpsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      ops_status: TableOf<OpsStatusRow>;
      ops_approvals: TableOf<OpsApprovalRow>;
      ops_improvements: TableOf<OpsImprovementRow>;
    };
  };
};

export type OpsStatusInsert = OpsDatabase["public"]["Tables"]["ops_status"]["Insert"];
export type OpsApprovalInsert = OpsDatabase["public"]["Tables"]["ops_approvals"]["Insert"];
export type OpsImprovementInsert = OpsDatabase["public"]["Tables"]["ops_improvements"]["Insert"];

export function asOps(client: SupabaseClient<Database>): SupabaseClient<OpsDatabase> {
  return client as unknown as SupabaseClient<OpsDatabase>;
}
