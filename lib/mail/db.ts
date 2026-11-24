import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Puente hasta regenerar database.types.ts con el esquema migrado.
type Mailbox = {
  team_id: string;
  owner_id: string;
  membership_id: string;
  connection_id: string;
  email: string;
  refresh_token_encrypted: string;
  shared: boolean;
};

type Attempt = {
  owner_id: string;
  membership_id: string;
  state_hash: string;
  session_id: string;
  verifier_encrypted: string;
  expires_at: string;
};

type Table<Row> = { Row: Row; Insert: Row; Update: Partial<Row>; Relationships: [] };
type MailDatabase = Database & {
  public: {
    Tables: {
      gmail_mailboxes: Table<Mailbox>;
      gmail_oauth_attempts: Table<Attempt>;
    };
  };
};

export function asMail(db: SupabaseClient<Database>) {
  return db as unknown as SupabaseClient<MailDatabase>;
}
