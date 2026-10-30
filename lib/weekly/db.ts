import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";

import type { WeeklyAreaId } from "./areas";
import type { WeeklyChangeStatus } from "./types";

/**
 * Tipos de `weekly_reports`, a mano, hasta aplicar la migración y correr
 * `npm run db:types`. `database.types.ts` no se edita: es generado.
 */
type WeeklyReportRow = {
  id: string;
  owner_id: string;
  area: WeeklyAreaId;
  week_start: string;
  conclusions: string;
  conclusion_status: WeeklyChangeStatus;
  conclusion_result: string | null;
  metrics: Json;
  message_stats: Json;
  series: Json;
  changes: Json;
  agent: string;
  published_at: string;
  created_at: string;
  updated_at: string;
};

type TableOf<Row extends { owner_id: string }> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, "owner_id">;
  Update: Partial<Row>;
  Relationships: [];
};

export type WeeklyDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      weekly_reports: TableOf<WeeklyReportRow>;
    };
  };
};

export type WeeklyReportInsert = WeeklyDatabase["public"]["Tables"]["weekly_reports"]["Insert"];

export function asWeekly(client: SupabaseClient<Database>): SupabaseClient<WeeklyDatabase> {
  return client as unknown as SupabaseClient<WeeklyDatabase>;
}
