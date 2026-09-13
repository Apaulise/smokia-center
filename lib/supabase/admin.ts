// ⚠️ SERVICE ROLE — ESTE CLIENTE SALTEA ROW LEVEL SECURITY ⚠️
//
// Ve y modifica los datos de TODOS los usuarios. Sólo se usa desde el webhook
// de Apify, rutas de cron, y lib/apify/reconcile.ts (la reconciliación
// idempotente que ambos disparan, y que también se llama desde una Server
// Action luego de verificar con el cliente normal que el job es del usuario
// logueado). Nunca desde un Server Component ni cerca del cliente.
//
// Reglas al usarlo:
//   1. Resolver el owner_id desde la fila que disparó la operación.
//   2. Filtrar por ese owner_id EXPLÍCITAMENTE en cada query.
//   3. Escribirlo explícitamente en cada fila que se inserte.
//
// Es el único lugar del código donde el aislamiento entre usuarios depende del
// código y no de la base. Cualquier cambio acá se revisa a mano.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
