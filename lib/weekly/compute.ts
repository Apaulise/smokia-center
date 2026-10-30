import { isoDateOf } from "@/lib/leads/calendar";
import { KIND_LABEL } from "@/lib/brand/planner/schema";
import type { ContentKind } from "@/lib/brand/planner/schema";
import { ANGLE_LABEL, isSalesAngle } from "@/lib/leads/ai/angles";
import { POSITIVE_INTEREST } from "@/lib/weekly/types";
import { instantInWeek, weekWindow } from "@/lib/weekly/weeks";

/**
 * Números de una semana a partir de filas que ya se leyeron. No inventa
 * un cero cuando el dato no vino: eso lo decide quien llama (si la consulta
 * falló, no llama). Un cero acá es una fila que no apareció.
 */

export interface CrmMessage {
  leadId: string;
  sender: "VENDEDOR" | "LEAD";
  channel: "WHATSAPP" | "EMAIL" | "INSTAGRAM";
  kind: "APERTURA" | "RESPUESTA" | "SEGUIMIENTO" | null;
  angle: string | null;
  variant: number | null;
  analysis: unknown;
  confirmed: boolean;
  occurredAt: string;
}

export type ReplyClass = "real" | "auto" | "unknown";

export function replyClass(analysis: unknown): ReplyClass {
  const type = nested(analysis)?.response_type;
  if (type === "HUMANA") return "real";
  if (type === "AUTORESPUESTA") return "auto";
  return "unknown";
}

/** Humana, no descalificada, y con reunión pedida o interés alto. Sin análisis no es positiva. */
export function isPositiveReply(analysis: unknown): boolean {
  const body = nested(analysis);
  if (!body || body.response_type !== "HUMANA" || body.disqualify === true) return false;
  if (body.wants_meeting === true) return true;
  return typeof body.interest_level === "number" && body.interest_level >= POSITIVE_INTEREST;
}

export interface MessageTotals {
  sent: number;
  realReplies: number;
  autoReplies: number;
  unclassifiedReplies: number;
  positive: number;
}

export interface MessageTypeRow {
  key: string;
  typeLabel: string;
  variantLabel: string | null;
  sent: number;
  realReplies: number;
  autoReplies: number;
  positive: number;
}

export interface DailyCount {
  day: string;
  sent: number;
  realReplies: number;
}

export interface ProspectingWeek {
  totals: MessageTotals;
  /** Respuestas de la semana que no se atan a una apertura enviada en esa semana. */
  unattributedReplies: number;
  byType: MessageTypeRow[];
  daily: DailyCount[];
}

export function emptyTotals(): MessageTotals {
  return { sent: 0, realReplies: 0, autoReplies: 0, unclassifiedReplies: 0, positive: 0 };
}

export function computeProspecting(
  messages: readonly CrmMessage[],
  weekStart: string,
  channel: "WHATSAPP" | "EMAIL",
): ProspectingWeek {
  const window = weekWindow(weekStart);
  const inWeek = messages.filter((message) => message.channel === channel && instantInWeek(message.occurredAt, window));
  const sends = inWeek.filter(isProspectingSend).sort(byTime);
  const replies = inWeek.filter((message) => message.sender === "LEAD");
  const totals = emptyTotals();
  totals.sent = sends.length;

  const buckets = new Map<string, MessageTypeRow>();
  for (const send of sends) {
    const row = bucketFor(buckets, send.angle, send.variant);
    row.sent += 1;
  }

  const daily = blankDays(window.days);
  for (const send of sends) {
    const day = daily.get(isoDateOf(send.occurredAt));
    if (day) day.sent += 1;
  }

  let unattributed = 0;
  for (const reply of replies) {
    const kind = replyClass(reply.analysis);
    if (kind === "real") totals.realReplies += 1;
    else if (kind === "auto") totals.autoReplies += 1;
    else totals.unclassifiedReplies += 1;
    if (isPositiveReply(reply.analysis)) totals.positive += 1;

    if (kind === "real") {
      const day = daily.get(isoDateOf(reply.occurredAt));
      if (day) day.realReplies += 1;
    }

    const send = openingBefore(sends, inWeek, reply);
    if (!send) {
      unattributed += 1;
      continue;
    }
    const row = bucketFor(buckets, send.angle, send.variant);
    if (kind === "real") row.realReplies += 1;
    else if (kind === "auto") row.autoReplies += 1;
    if (isPositiveReply(reply.analysis)) row.positive += 1;
  }

  return {
    totals,
    unattributedReplies: unattributed,
    byType: [...buckets.values()].sort((a, b) => b.sent - a.sent || a.typeLabel.localeCompare(b.typeLabel, "es")),
    daily: window.days.map((day) => daily.get(day) ?? { day, sent: 0, realReplies: 0 }),
  };
}

export interface FollowUpRow {
  id: string;
  leadId: string;
  channel: CrmMessage["channel"];
  occurredAt: string;
}

export interface StatusEvent {
  leadId: string;
  occurredAt: string;
  toStatus: string | null;
}

export interface AppointmentEvent {
  leadId: string;
  createdAt: string;
}

const MEETING_STATUSES = new Set(["REUNION_AGENDADA", "REUNION_REALIZADA", "PROPUESTA_ENVIADA", "CERRADO_GANADO"]);

export interface FollowUpWeek {
  totals: MessageTotals;
  /** Seguimientos de la semana que después tuvieron reunión, y los que cerraron ganado. */
  booked: number;
  won: number;
  /** Mediana de días hasta la primera respuesta humana. Null si nadie respondió así. */
  medianDaysToReply: number | null;
  byChannel: { channel: CrmMessage["channel"]; sent: number }[];
  byType: MessageTypeRow[];
  daily: DailyCount[];
}

export function computeFollowUps(input: {
  followUps: readonly FollowUpRow[];
  replies: readonly CrmMessage[];
  activities: readonly StatusEvent[];
  appointments: readonly AppointmentEvent[];
  weekStart: string;
}): FollowUpWeek {
  const window = weekWindow(input.weekStart);
  const history = [...input.followUps].sort(byTime);
  const sentThisWeek = history.filter((row) => instantInWeek(row.occurredAt, window));
  const totals = emptyTotals();
  totals.sent = sentThisWeek.length;

  const buckets = new Map<string, MessageTypeRow>();
  const daily = blankDays(window.days);
  const delays: number[] = [];
  let booked = 0;
  let won = 0;
  const channels = new Map<CrmMessage["channel"], number>();

  for (const follow of sentThisWeek) {
    const step = stepOf(history, follow);
    const row = stepBucket(buckets, step);
    row.sent += 1;
    channels.set(follow.channel, (channels.get(follow.channel) ?? 0) + 1);
    const day = daily.get(isoDateOf(follow.occurredAt));
    if (day) day.sent += 1;

    const from = Date.parse(follow.occurredAt);
    const next = history.find((row) => row.leadId === follow.leadId && Date.parse(row.occurredAt) > from);
    const to = Math.min(next ? Date.parse(next.occurredAt) : window.endMs, window.endMs);
    const inWindow = (iso: string) => {
      const time = Date.parse(iso);
      return time > from && time < to;
    };

    const replies = input.replies.filter(
      (reply) => reply.leadId === follow.leadId && reply.sender === "LEAD" && reply.channel === follow.channel && inWindow(reply.occurredAt),
    );
    let firstHuman: number | null = null;
    for (const reply of replies) {
      const kind = replyClass(reply.analysis);
      if (kind === "real") {
        totals.realReplies += 1;
        row.realReplies += 1;
        const time = Date.parse(reply.occurredAt);
        if (firstHuman == null || time < firstHuman) firstHuman = time;
        const replyDay = daily.get(isoDateOf(reply.occurredAt));
        if (replyDay) replyDay.realReplies += 1;
      } else if (kind === "auto") {
        totals.autoReplies += 1;
        row.autoReplies += 1;
      } else {
        totals.unclassifiedReplies += 1;
      }
      if (isPositiveReply(reply.analysis)) {
        totals.positive += 1;
        row.positive += 1;
      }
    }
    if (firstHuman != null) delays.push((firstHuman - from) / 86_400_000);

    const acts = input.activities.filter((activity) => activity.leadId === follow.leadId && inWindow(activity.occurredAt));
    const didBook =
      acts.some((activity) => activity.toStatus != null && MEETING_STATUSES.has(activity.toStatus)) ||
      input.appointments.some((appointment) => appointment.leadId === follow.leadId && inWindow(appointment.createdAt));
    const didWin = acts.some((activity) => activity.toStatus === "CERRADO_GANADO");
    if (didBook) booked += 1;
    if (didWin) won += 1;
  }

  return {
    totals,
    booked,
    won,
    medianDaysToReply: median(delays),
    byChannel: [...channels.entries()]
      .map(([channel, sent]) => ({ channel, sent }))
      .sort((a, b) => b.sent - a.sent),
    byType: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)),
    daily: window.days.map((day) => daily.get(day) ?? { day, sent: 0, realReplies: 0 }),
  };
}

export interface BrandPostRow {
  id: string;
  kind: string;
  publishedAt: string | null;
}

export interface AccountMetricRow {
  capturedOn: string;
  followersCount: number | null;
  newFollowers: number | null;
  reach: number | null;
  totalInteractions: number | null;
}

export interface PostMetricRow {
  postId: string;
  capturedOn: string;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  views: number | null;
}

export interface BrandKindRow {
  key: string;
  typeLabel: string;
  sent: number;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  views: number | null;
  /** Piezas del grupo que tienen snapshot dentro de la semana. */
  measured: number;
}

export interface BrandWeek {
  /** Null si no hay snapshot de seguidores dentro de la semana. */
  followers: number | null;
  newFollowers: number | null;
  reach: number | null;
  interactions: number | null;
  /** Días de la semana con alguna fila de la cuenta. */
  accountDays: number;
  published: number;
  byKind: BrandKindRow[];
  dailyPublished: DailyCount[];
  /** Null en los días sin snapshot: no es un alcance de cero. */
  dailyReach: { day: string; reach: number | null }[];
}

export function computeBrand(input: {
  posts: readonly BrandPostRow[];
  accountMetrics: readonly AccountMetricRow[];
  postMetrics: readonly PostMetricRow[];
  weekStart: string;
}): BrandWeek {
  const window = weekWindow(input.weekStart);
  const sunday = window.days[6];
  const published = input.posts.filter((post) => post.publishedAt != null && instantInWeek(post.publishedAt, window));

  const accountRows = input.accountMetrics.filter((row) => row.capturedOn >= window.start && row.capturedOn <= sunday);
  const followerSamples = accountRows.filter((row) => row.followersCount != null).sort((a, b) => a.capturedOn.localeCompare(b.capturedOn));

  const metricsByPost = new Map<string, PostMetricRow[]>();
  for (const metric of input.postMetrics) {
    const list = metricsByPost.get(metric.postId);
    if (list) list.push(metric);
    else metricsByPost.set(metric.postId, [metric]);
  }

  const kinds = new Map<string, BrandKindRow & { reachKnown: number; likesKnown: number; commentsKnown: number; savedKnown: number; viewsKnown: number }>();
  const daily = blankDays(window.days);

  for (const post of published) {
    const dayKey = isoDateOf(post.publishedAt as string);
    const day = daily.get(dayKey);
    if (day) day.sent += 1;

    const kind = kinds.get(post.kind) ?? {
      key: post.kind,
      typeLabel: kindLabel(post.kind),
      sent: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      saved: 0,
      views: 0,
      measured: 0,
      reachKnown: 0,
      likesKnown: 0,
      commentsKnown: 0,
      savedKnown: 0,
      viewsKnown: 0,
    };
    kind.sent += 1;
    const snapshot = latestSnapshot(metricsByPost.get(post.id) ?? [], post.publishedAt as string, sunday);
    if (snapshot) {
      kind.measured += 1;
      addKnown(kind, "reach", "reachKnown", snapshot.reach);
      addKnown(kind, "likes", "likesKnown", snapshot.likes);
      addKnown(kind, "comments", "commentsKnown", snapshot.comments);
      addKnown(kind, "saved", "savedKnown", snapshot.saved);
      addKnown(kind, "views", "viewsKnown", snapshot.views);
    }
    kinds.set(post.kind, kind);
  }

  return {
    followers: followerSamples.length > 0 ? followerSamples[followerSamples.length - 1].followersCount : null,
    newFollowers: sumKnown(accountRows.map((row) => row.newFollowers)),
    reach: sumKnown(accountRows.map((row) => row.reach)),
    interactions: sumKnown(accountRows.map((row) => row.totalInteractions)),
    accountDays: new Set(accountRows.map((row) => row.capturedOn)).size,
    published: published.length,
    byKind: [...kinds.values()]
      .map((kind) => ({
        key: kind.key,
        typeLabel: kind.typeLabel,
        sent: kind.sent,
        reach: kind.reachKnown > 0 ? kind.reach : null,
        likes: kind.likesKnown > 0 ? kind.likes : null,
        comments: kind.commentsKnown > 0 ? kind.comments : null,
        saved: kind.savedKnown > 0 ? kind.saved : null,
        views: kind.viewsKnown > 0 ? kind.views : null,
        measured: kind.measured,
      }))
      .sort((a, b) => b.sent - a.sent || a.typeLabel.localeCompare(b.typeLabel, "es")),
    dailyPublished: window.days.map((day) => daily.get(day) ?? { day, sent: 0, realReplies: 0 }),
    dailyReach: window.days.map((day) => {
      const row = accountRows.find((metric) => metric.capturedOn === day);
      return { day, reach: row?.reach ?? null };
    }),
  };
}

function nested(analysis: unknown): Record<string, unknown> | null {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return null;
  const inner = (analysis as { analysis?: unknown }).analysis;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;
  return inner as Record<string, unknown>;
}

function isProspectingSend(message: CrmMessage): boolean {
  if (message.sender !== "VENDEDOR" || !message.confirmed) return false;
  if (message.kind === "APERTURA") return true;
  return message.kind == null && message.angle != null;
}

function byTime<T extends { occurredAt: string }>(a: T, b: T): number {
  return Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
}

function bucketFor(buckets: Map<string, MessageTypeRow>, angle: string | null, variant: number | null): MessageTypeRow {
  const typeLabel = angle && isSalesAngle(angle) ? ANGLE_LABEL[angle] : angle ? angle : "Sin tipo";
  const variantLabel = variant != null ? `Variante ${variant}` : null;
  const key = `${angle ?? "none"}:${variant ?? "none"}`;
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: MessageTypeRow = { key, typeLabel, variantLabel, sent: 0, realReplies: 0, autoReplies: 0, positive: 0 };
  buckets.set(key, created);
  return created;
}

function openingBefore(sends: readonly CrmMessage[], weekMessages: readonly CrmMessage[], reply: CrmMessage): CrmMessage | null {
  const replyAt = Date.parse(reply.occurredAt);
  const prior = sends.filter((send) => send.leadId === reply.leadId && Date.parse(send.occurredAt) < replyAt);
  const send = prior.at(-1);
  if (!send) return null;
  const sendAt = Date.parse(send.occurredAt);
  const interrupted = weekMessages.some(
    (message) =>
      message.sender === "VENDEDOR" &&
      message.confirmed &&
      message.leadId === reply.leadId &&
      message !== send &&
      Date.parse(message.occurredAt) > sendAt &&
      Date.parse(message.occurredAt) < replyAt,
  );
  return interrupted ? null : send;
}

function blankDays(days: readonly string[]): Map<string, DailyCount> {
  return new Map(days.map((day) => [day, { day, sent: 0, realReplies: 0 }]));
}

const STEP_LABEL = ["1.º seguimiento", "2.º seguimiento", "3.º o más"] as const;

function stepOf(history: readonly FollowUpRow[], follow: FollowUpRow): 1 | 2 | 3 {
  const at = Date.parse(follow.occurredAt);
  const prior = history.filter((row) => row.leadId === follow.leadId && Date.parse(row.occurredAt) < at).length;
  return (Math.min(prior, 2) + 1) as 1 | 2 | 3;
}

function stepBucket(buckets: Map<string, MessageTypeRow>, step: 1 | 2 | 3): MessageTypeRow {
  const key = `step-${step}`;
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: MessageTypeRow = {
    key,
    typeLabel: STEP_LABEL[step - 1],
    variantLabel: null,
    sent: 0,
    realReplies: 0,
    autoReplies: 0,
    positive: 0,
  };
  buckets.set(key, created);
  return created;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

function kindLabel(kind: string): string {
  if (kind in KIND_LABEL) return KIND_LABEL[kind as ContentKind];
  return kind;
}

function latestSnapshot(rows: readonly PostMetricRow[], publishedAt: string, sunday: string): PostMetricRow | null {
  const publishDay = isoDateOf(publishedAt);
  const candidates = rows.filter((row) => row.capturedOn >= publishDay && row.capturedOn <= sunday);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn)).at(-1) ?? null;
}

function addKnown(
  kind: { reach: number | null; likes: number | null; comments: number | null; saved: number | null; views: number | null },
  field: "reach" | "likes" | "comments" | "saved" | "views",
  knownField: "reachKnown" | "likesKnown" | "commentsKnown" | "savedKnown" | "viewsKnown",
  value: number | null,
): void {
  const target = kind as unknown as Record<string, number>;
  if (value == null) return;
  target[knownField] += 1;
  target[field] = (target[field] ?? 0) + value;
}

function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value != null);
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0);
}
