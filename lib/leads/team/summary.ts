import { addDaysIso, isoDateToUtcInstant, startOfMonthIso, startOfWeekIso, todayIso } from "@/lib/leads/calendar";
import { BOOKING_LAG_DAYS } from "@/lib/leads/execution/blend";
import { deriveExecution, sliceContacts, type ExecutionSummary } from "@/lib/leads/execution/derive";
import type { DailyContacts, ExecutionMetrics } from "@/lib/leads/execution/queries";
import { getExecutionSummary } from "@/lib/leads/execution/summary";
import type { ProspectingFunnel } from "@/lib/leads/queries";
import { getCurrentUser } from "@/lib/supabase/server";
import { mergeSeries, sumFunnels, sumMetrics } from "@/lib/leads/team/aggregate";
import {
  getTeamDailyContacts,
  getTeamDirectory,
  getTeamExecutionMetrics,
  getTeamFunnel,
  getTeamGoal,
  type TeamGoal,
  type TeamMember,
} from "@/lib/leads/team/queries";

/** Lo que le toca a cada miembro de la meta del equipo: partes iguales, redondeadas para arriba. */
export interface MemberShare {
  today: number;
  week: number;
  month: number;
}

export interface MemberSummary {
  member: TeamMember;
  isMe: boolean;
  funnel: ProspectingFunnel;
  metrics: ExecutionMetrics;
  series: DailyContacts[];
  contacts: ReturnType<typeof sliceContacts>;
  /** `null` mientras el equipo no tenga meta definida. */
  share: MemberShare | null;
  /** Ganados del mes en curso. */
  wonThisMonth: number;
}

export interface TeamSummary {
  members: MemberSummary[];
  goal: TeamGoal | null;
  funnel: ProspectingFunnel;
  metrics: ExecutionMetrics;
  contacts: ReturnType<typeof sliceContacts>;
  /** La cadena del equipo con las tasas mezcladas sobre los datos de todos. `null` sin meta. */
  execution: ExecutionSummary | null;
}

/**
 * Todo lo del dashboard y el objetivo de equipo (Plan §1.23). `null` si el
 * usuario no pertenece a ningún equipo (todavía no se sembró): las pantallas
 * caen a la versión personal.
 *
 * Los conteos de cada miembro se suman y recién después se calculan las tasas
 * del equipo, así que una tasa agrupada pesa a cada uno por su volumen.
 */
export async function getTeamSummary(windowDays: number): Promise<TeamSummary | null> {
  const [directory, user, goal] = await Promise.all([getTeamDirectory(), getCurrentUser(), getTeamGoal()]);
  if (directory.length === 0 || !user) return null;

  const today = todayIso();
  const monthStart = startOfMonthIso(today);
  const weekStart = startOfWeekIso(today);
  const seriesStart = weekStart < monthStart ? weekStart : monthStart;
  const now = new Date();
  const windowFrom = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const monthFrom = isoDateToUtcInstant(monthStart);
  const monthTo = isoDateToUtcInstant(addDaysIso(today, 1));

  const raw = await Promise.all(
    directory.map(async (member) => {
      const [funnel, metrics, monthMetrics, series] = await Promise.all([
        getTeamFunnel(member.ownerId),
        getTeamExecutionMetrics(member.ownerId, windowFrom, now.toISOString(), BOOKING_LAG_DAYS),
        getTeamExecutionMetrics(member.ownerId, monthFrom, monthTo, BOOKING_LAG_DAYS),
        getTeamDailyContacts(member.ownerId, seriesStart, today),
      ]);
      return { member, funnel, metrics, monthMetrics, series };
    }),
  );

  const pooledMetrics = sumMetrics(raw.map((r) => r.metrics));
  const pooledMonthMetrics = sumMetrics(raw.map((r) => r.monthMetrics));
  const pooledSeries = mergeSeries(raw.map((r) => r.series));

  const execution = goal
    ? deriveExecution({ goal, windowDays, metrics: pooledMetrics, monthMetrics: pooledMonthMetrics, series: pooledSeries, today })
    : null;

  const memberCount = raw.length;
  const share: MemberShare | null = execution
    ? {
        today: Math.ceil(execution.adjustedChain.contactsPerDay / memberCount),
        week: Math.ceil(execution.adjustedChain.contactsPerDay / memberCount) * execution.goal.workingDaysPerWeek,
        month: Math.ceil(execution.adjustedChain.contactsPerMonth / memberCount),
      }
    : null;

  return {
    members: raw.map((r) => ({
      member: r.member,
      isMe: r.member.ownerId === user.id,
      funnel: r.funnel,
      metrics: r.metrics,
      series: r.series,
      contacts: sliceContacts(r.series, today),
      share,
      wonThisMonth: r.monthMetrics.won_in_window,
    })),
    goal,
    funnel: sumFunnels(raw.map((r) => r.funnel)),
    metrics: pooledMetrics,
    contacts: sliceContacts(pooledSeries, today),
    execution,
  };
}

/** El tile "Hoy" del dashboard personal: lo mío contra mi parte de la meta del equipo, o contra mi meta personal si no hay equipo. */
export interface TodayTile {
  contacts: number;
  target: number;
  /** Sólo con equipo: lo que lleva el equipo hoy contra el objetivo diario del equipo. */
  team?: { contacts: number; target: number };
}

export async function getTodayTile(): Promise<TodayTile | null> {
  const team = await getTeamSummary(30);
  if (team) {
    const mine = team.members.find((m) => m.isMe);
    if (!team.execution || !team.members.length || !mine?.share) return null;
    return {
      contacts: mine.contacts.today,
      target: mine.share.today,
      team: { contacts: team.contacts.today, target: team.execution.adjustedChain.contactsPerDay },
    };
  }

  const personal = await getExecutionSummary(30);
  return personal ? { contacts: personal.today.contacts, target: personal.adjustedChain.contactsPerDay } : null;
}
