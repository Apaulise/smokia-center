import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Tablas del inbox (migración 20261113120000_chats.sql), a mano hasta que se
 * aplique la migración y se corra `npm run db:types`. `database.types.ts` no se
 * edita: es generado. Es el mismo cruce que `lib/ops/db.ts`; cuando el
 * generador traiga estas tablas sigue siendo compatible si las columnas
 * coinciden, y alcanza con borrar este archivo y `asChats`.
 */

export const CHAT_CHANNELS = ["INSTAGRAM", "WHATSAPP", "TIKTOK", "EMAIL"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export const CHAT_CHANNEL_LABEL: Record<ChatChannel, string> = {
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  TIKTOK: "TikTok",
  EMAIL: "Email",
};

export type ChannelAccountStatus = "ACTIVA" | "ERROR" | "DESCONECTADA";
export type ConversationStatus = "ACTIVA" | "ARCHIVADA";
export type MessageDirection = "IN" | "OUT";
export type MessageOrigin = "CLIENTE" | "CRM" | "APP" | "ZERNIO" | "AUTOMATIZACION" | "HISTORIAL";
export type DeliveryStatus = "sent" | "delivered" | "read" | "played" | "failed";

export type ChannelAccountRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  channel: ChatChannel;
  zernio_account_id: string;
  handle: string | null;
  display_name: string | null;
  login_method: string | null;
  status: ChannelAccountStatus;
  status_detail: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelSecretRow = {
  id: string;
  owner_id: string;
  channel_account_id: string;
  api_key_encrypted: string;
  webhook_secret_encrypted: string;
  webhook_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  channel_account_id: string;
  channel: ChatChannel;
  zernio_conversation_id: string;
  participant_external_id: string | null;
  participant_handle: string | null;
  participant_name: string | null;
  participant_picture: string | null;
  lead_id: string | null;
  status: ConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  thread_owner: string | null;
  participant_profile: Json | null;
  history_synced_at: string | null;
  // §1.26 (migración 20261114130000_chat_tags.sql): espejo de las etiquetas del contacto en Zernio y seguimiento.
  zernio_contact_id: string | null;
  tags: string[];
  tags_synced_at: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  // §1.26 (migración 20261114140000_content_automations.sql): la pieza que trajo a la persona.
  source_automation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  conversation_id: string;
  platform_message_id: string;
  direction: MessageDirection;
  origin: MessageOrigin;
  sent_by: string | null;
  body: string | null;
  attachments: Json;
  delivery_status: DeliveryStatus | null;
  standby: boolean;
  edited: boolean;
  deleted: boolean;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

// ── §1.26 ───────────────────────────────────────────────────────────────────

export type QuickReplyKind = "TEXTO" | "AUDIO";

export type QuickReplyRow = {
  id: string;
  owner_id: string;
  kind: QuickReplyKind;
  title: string;
  body: string | null;
  audio_path: string | null;
  audio_mime: string | null;
  audio_duration_ms: number | null;
  sort_order: number;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type FunnelStage = "TOFU" | "MOFU" | "BOFU";

export type TagLabelRow = {
  id: string;
  owner_id: string;
  tag: string;
  label: string | null;
  stage: FunnelStage | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AutomationStage = "TOFU" | "MOFU";
export type ContentAutomationStatus = "ACTIVA" | "PAUSADA" | "ERROR";

export type AutomationTemplateRow = {
  id: string;
  owner_id: string;
  channel_account_id: string;
  stage: AutomationStage;
  // Nullable (migración 20261114150000): el molde es un workflow standalone, sin automatización de comentario propia.
  zernio_comment_automation_id: string | null;
  zernio_workflow_id: string | null;
  name: string;
  tags: string[];
  /** El DM corto que manda la automatización de comentario de cada pieza antes de entregarle el turno al workflow. */
  confirm_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentAutomationRow = {
  id: string;
  owner_id: string;
  channel_account_id: string;
  template_id: string | null;
  stage: AutomationStage;
  platform_post_id: string;
  post_caption: string | null;
  permalink: string | null;
  keywords: string[];
  resource_url: string;
  resource_title: string;
  zernio_comment_automation_id: string | null;
  zernio_workflow_id: string | null;
  status: ContentAutomationStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRunRow = {
  id: string;
  owner_id: string;
  automation_id: string;
  zernio_execution_id: string;
  conversation_id: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type TableOf<Row extends { owner_id: string }> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, "owner_id">;
  Update: Partial<Row>;
  Relationships: [];
};

export type ChatsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      channel_accounts: TableOf<ChannelAccountRow>;
      channel_secrets: TableOf<ChannelSecretRow>;
      conversations: TableOf<ConversationRow>;
      messages: TableOf<MessageRow>;
      chat_quick_replies: TableOf<QuickReplyRow>;
      chat_tag_labels: TableOf<TagLabelRow>;
      chat_automation_templates: TableOf<AutomationTemplateRow>;
      content_automations: TableOf<ContentAutomationRow>;
      automation_runs: TableOf<AutomationRunRow>;
    };
    Functions: Database["public"]["Functions"] & {
      chats_set_sharing: { Args: { p_account: string; p_share: boolean }; Returns: void };
    };
  };
};

export type ChannelAccountInsert = ChatsDatabase["public"]["Tables"]["channel_accounts"]["Insert"];
export type ConversationInsert = ChatsDatabase["public"]["Tables"]["conversations"]["Insert"];
export type MessageInsert = ChatsDatabase["public"]["Tables"]["messages"]["Insert"];

export type ChatsClient = SupabaseClient<ChatsDatabase>;

export function asChats(client: SupabaseClient<Database>): ChatsClient {
  return client as unknown as ChatsClient;
}
