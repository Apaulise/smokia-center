import { asChats, type ChannelAccountRow, type ChatsClient, type ConversationRow, type MessageRow, type TagLabelRow } from "@/lib/chats/db";
import { replyWindow, type ReplyWindow } from "@/lib/chats/window";
import { getTeamDirectory, type TeamMember } from "@/lib/leads/team/queries";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Lecturas del inbox con el cliente con RLS del usuario logueado: devuelven lo
 * suyo y lo que el socio le compartió (migración 20261113130000). Ninguna toca
 * `channel_secrets`, así que la API key y el secreto del webhook no llegan a
 * ninguna pantalla.
 *
 * Mientras las migraciones no estén aplicadas las tablas no existen y PostgREST
 * devuelve un error: las lecturas lo toman como "inbox sin configurar" y
 * devuelven vacío en vez de romper la pantalla (`ready: false`). Lo mismo con
 * las columnas de §1.26 (etiquetas, seguimiento): si todavía no existen, la
 * bandeja funciona igual, sin esos datos (`extrasReady: false`).
 */

const MISSING_TABLE_CODES = new Set(["PGRST205", "PGRST204", "42P01"]);
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
  return /schema cache|does not exist|Could not find the table/i.test(error.message ?? "");
}

function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_COLUMN_CODES.has(error.code)) return true;
  return /column .* does not exist|Could not find the .* column/i.test(error.message ?? "");
}

const ACCOUNT_COLUMNS =
  "id, owner_id, team_id, channel, zernio_account_id, handle, display_name, login_method, status, status_detail, last_synced_at";

export type ChannelAccountView = Pick<
  ChannelAccountRow,
  "id" | "owner_id" | "team_id" | "channel" | "zernio_account_id" | "handle" | "display_name" | "login_method" | "status" | "status_detail" | "last_synced_at"
> & {
  /** La cuenta es del usuario logueado (puede sincronizar, compartir y desconectar). */
  isOwner: boolean;
  shared: boolean;
};

export async function listChannelAccounts(): Promise<{ ready: boolean; accounts: ChannelAccountView[]; hasTeam: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ready: true, accounts: [], hasTeam: false };

  const supabase = await createClient();
  const [{ data, error }, directory] = await Promise.all([
    asChats(supabase).from("channel_accounts").select(ACCOUNT_COLUMNS).order("created_at", { ascending: true }),
    getTeamDirectory().catch(() => [] as TeamMember[]),
  ]);
  if (error) return { ready: !isMissingTable(error), accounts: [], hasTeam: false };

  const accounts = (data ?? []).map((row) => ({
    ...(row as Omit<ChannelAccountView, "isOwner" | "shared">),
    isOwner: row.owner_id === user.id,
    shared: row.team_id !== null,
  }));
  return { ready: true, accounts, hasTeam: directory.length > 1 };
}

/** Qué conversaciones pide el servidor. Los demás filtros (sin leer, por responder…) son del cliente. */
export type ConversationScope = "activas" | "archivadas";

/** Los filtros de la bandeja. Todos menos `archivadas` se aplican en el cliente sobre las activas. */
export type ConversationFilter = "todas" | "sin_leer" | "por_responder" | "ventana" | "seguimiento" | "archivadas";

const BASE_CONVERSATION_COLUMNS =
  "id, owner_id, channel_account_id, channel, participant_handle, participant_name, participant_picture, participant_external_id, lead_id, status, last_message_at, last_message_preview, last_inbound_at, unread_count, thread_owner, participant_profile";
const EXTRA_CONVERSATION_COLUMNS = "zernio_contact_id, tags, follow_up_at, follow_up_note, source_automation_id";

export type ConversationListItem = Pick<
  ConversationRow,
  | "id"
  | "owner_id"
  | "channel_account_id"
  | "channel"
  | "participant_handle"
  | "participant_name"
  | "participant_picture"
  | "participant_external_id"
  | "lead_id"
  | "status"
  | "last_message_at"
  | "last_message_preview"
  | "last_inbound_at"
  | "unread_count"
  | "thread_owner"
  | "participant_profile"
  | "zernio_contact_id"
  | "tags"
  | "follow_up_at"
  | "follow_up_note"
  | "source_automation_id"
> & {
  /** Nombre y estado del lead enlazado, sólo si el usuario lo puede ver (RLS: el socio no). */
  lead_name: string | null;
  lead_status: string | null;
};

const EXTRA_DEFAULTS = {
  zernio_contact_id: null,
  tags: [] as string[],
  follow_up_at: null,
  follow_up_note: null,
  source_automation_id: null,
};

/** Para armar un filtro `or(...)` de PostgREST sin que el texto cierre el paréntesis ni agregue condiciones. */
function safeSearch(value: string): string {
  return value.replace(/[,()*%\\:]/g, " ").trim().slice(0, 60);
}

export const CONVERSATION_LIST_LIMIT = 150;

type RawConversation = Omit<ConversationListItem, "lead_name" | "lead_status">;

/**
 * Corre una lectura de conversaciones con las columnas de §1.26 y, si todavía
 * no existen (migración sin aplicar), la repite con las de siempre.
 */
async function selectConversations(
  chats: ChatsClient,
  build: (columns: string) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
): Promise<{ rows: RawConversation[]; extrasReady: boolean; error: boolean }> {
  const full = await build(`${BASE_CONVERSATION_COLUMNS}, ${EXTRA_CONVERSATION_COLUMNS}`);
  if (!full.error) {
    return {
      rows: (full.data ?? []).map((row) => ({ ...EXTRA_DEFAULTS, ...(row as RawConversation), tags: (row as RawConversation).tags ?? [] })),
      extrasReady: true,
      error: false,
    };
  }
  if (!isMissingColumn(full.error)) return { rows: [], extrasReady: true, error: true };
  const base = await build(BASE_CONVERSATION_COLUMNS);
  if (base.error) return { rows: [], extrasReady: false, error: true };
  return { rows: (base.data ?? []).map((row) => ({ ...EXTRA_DEFAULTS, ...(row as RawConversation) })), extrasReady: false, error: false };
}

/** Suma el nombre y el estado del lead enlazado con una sola consulta (RLS: sólo los leads propios). */
async function withLeads(supabase: Awaited<ReturnType<typeof createClient>>, rows: RawConversation[]): Promise<ConversationListItem[]> {
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((id): id is string => Boolean(id)))];
  const leads = new Map<string, { name: string; status: string }>();
  if (leadIds.length > 0) {
    const { data } = await supabase.from("leads").select("id, name, status").in("id", leadIds);
    for (const lead of data ?? []) leads.set(lead.id, { name: lead.name, status: lead.status });
  }
  return rows.map((row) => {
    const lead = row.lead_id ? leads.get(row.lead_id) : undefined;
    return { ...row, lead_name: lead?.name ?? null, lead_status: lead?.status ?? null };
  });
}

export type InboxList = { items: ConversationListItem[]; extrasReady: boolean; capped: boolean };

export async function listConversations(scope: ConversationScope = "activas", search?: string): Promise<InboxList> {
  const supabase = await createClient();
  const chats = asChats(supabase);
  const term = search ? safeSearch(search) : "";

  const { rows, extrasReady } = await selectConversations(chats, (columns) => {
    let query = chats
      .from("conversations")
      .select(columns)
      .eq("status", scope === "archivadas" ? "ARCHIVADA" : "ACTIVA")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(CONVERSATION_LIST_LIMIT);
    if (term) query = query.or(`participant_name.ilike.%${term}%,participant_handle.ilike.%${term}%`);
    return query as unknown as PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>;
  });

  return { items: await withLeads(supabase, rows), extrasReady, capped: rows.length >= CONVERSATION_LIST_LIMIT };
}

export type ChatMessageView = Pick<
  MessageRow,
  "id" | "direction" | "origin" | "sent_by" | "body" | "attachments" | "delivery_status" | "standby" | "edited" | "deleted" | "occurred_at"
>;

export type ConversationAccountView = Pick<ChannelAccountView, "id" | "handle" | "display_name" | "status" | "status_detail" | "isOwner" | "owner_id">;

export type ConversationDetail = {
  conversation: ConversationListItem;
  account: ConversationAccountView;
  messages: ChatMessageView[];
  /** Hay mensajes más viejos que los que se trajeron ("Ver anteriores"). */
  hasOlder: boolean;
  window: ReplyWindow;
  lead: { id: string; name: string; status: string } | null;
  /** Nombres de los miembros del equipo, para atribuir quién respondió. */
  members: Record<string, string>;
  currentUserId: string;
  extrasReady: boolean;
};

export const MESSAGE_COLUMNS = "id, direction, origin, sent_by, body, attachments, delivery_status, standby, edited, deleted, occurred_at";
/** Lo que se dibuja al abrir un hilo. Lo anterior se pide con "Ver anteriores". */
export const THREAD_PAGE = 60;

/**
 * El hilo completo para abrirlo. Dos tandas en paralelo en vez de una cascada:
 * conversación + mensajes + directorio a la vez (los mensajes se filtran por el
 * id que ya viene en la URL), y después cuenta + lead, que dependen de la fila.
 */
export async function getConversationDetail(id: string): Promise<ConversationDetail | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const chats = asChats(supabase);

  const [conversationResult, messagesResult, directory] = await Promise.all([
    selectConversations(chats, (columns) =>
      chats.from("conversations").select(columns).eq("id", id).limit(1) as unknown as PromiseLike<{
        data: unknown[] | null;
        error: { code?: string; message?: string } | null;
      }>,
    ),
    chats
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", id)
      .order("occurred_at", { ascending: false })
      .limit(THREAD_PAGE + 1),
    getTeamDirectory().catch(() => [] as TeamMember[]),
  ]);
  const conversation = conversationResult.rows[0];
  if (!conversation) return null;

  const [accountResult, leadResult] = await Promise.all([
    chats.from("channel_accounts").select(ACCOUNT_COLUMNS).eq("id", conversation.channel_account_id).maybeSingle(),
    // El lead sólo lo lee su dueño: si la conversación es de un compañero, RLS devuelve null y no se muestra.
    conversation.lead_id
      ? supabase.from("leads").select("id, name, status").eq("id", conversation.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const account = accountResult.data;
  if (!account) return null;
  const leadRow = leadResult.data as { id: string; name: string; status: string } | null;

  const fetched = (messagesResult.data ?? []) as ChatMessageView[];
  const hasOlder = fetched.length > THREAD_PAGE;
  const lead = leadRow ? { id: leadRow.id, name: leadRow.name, status: leadRow.status } : null;

  return {
    conversation: { ...conversation, lead_name: lead?.name ?? null, lead_status: lead?.status ?? null },
    account: {
      id: account.id,
      owner_id: account.owner_id,
      handle: account.handle,
      display_name: account.display_name,
      status: account.status,
      status_detail: account.status_detail,
      isOwner: account.owner_id === user.id,
    },
    messages: fetched.slice(0, THREAD_PAGE).reverse(),
    hasOlder,
    window: replyWindow(conversation.last_inbound_at),
    lead,
    members: Object.fromEntries(directory.map((member) => [member.ownerId, member.name])),
    currentUserId: user.id,
    extrasReady: conversationResult.extrasReady,
  };
}

/** Los mensajes anteriores a `before` (para "Ver anteriores"), del más viejo al más nuevo. */
export async function listOlderMessages(conversationId: string, before: string): Promise<{ messages: ChatMessageView[]; hasOlder: boolean }> {
  const chats = asChats(await createClient());
  const { data } = await chats
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .lt("occurred_at", before)
    .order("occurred_at", { ascending: false })
    .limit(THREAD_PAGE + 1);
  const fetched = (data ?? []) as ChatMessageView[];
  return { messages: fetched.slice(0, THREAD_PAGE).reverse(), hasOlder: fetched.length > THREAD_PAGE };
}

/** El catálogo de etiquetas (nombre lindo y etapa). Vacío si la migración no está aplicada. */
export async function listTagLabels(): Promise<TagLabelRow[]> {
  const chats = asChats(await createClient());
  const { data, error } = await chats.from("chat_tag_labels").select("*").order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as TagLabelRow[];
}

/** Conversaciones enlazadas a un lead, para la pestaña de la ficha. */
export async function listConversationsForLead(leadId: string): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const chats = asChats(supabase);
  const { rows } = await selectConversations(chats, (columns) =>
    chats
      .from("conversations")
      .select(columns)
      .eq("lead_id", leadId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5) as unknown as PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  );
  return rows.map((row) => ({ ...row, lead_name: null, lead_status: null }));
}

/** La conversación enlazada a un lead con sus últimos mensajes, para la ficha. `null` si no hay. */
export async function getLeadChatPreview(
  leadId: string,
  limit = 4,
): Promise<{ conversation: ConversationListItem; messages: ChatMessageView[]; labels: TagLabelRow[] } | null> {
  const [conversation] = await listConversationsForLead(leadId);
  if (!conversation) return null;
  const supabase = await createClient();
  const [{ data }, labels] = await Promise.all([
    asChats(supabase)
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversation.id)
      .order("occurred_at", { ascending: false })
      .limit(limit),
    conversation.tags.length > 0 ? listTagLabels() : Promise.resolve([] as TagLabelRow[]),
  ]);
  return { conversation, messages: ((data ?? []) as ChatMessageView[]).slice().reverse(), labels };
}

/** Cuántas conversaciones sin leer hay (para el contador del menú). */
export async function countUnreadConversations(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await asChats(supabase)
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("status", "ACTIVA")
    .gt("unread_count", 0);
  if (error) return 0;
  return count ?? 0;
}
