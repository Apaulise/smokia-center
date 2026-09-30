/**
 * De dónde sale la facturación del mes (Plan §1.6, reabierto en §1.22).
 *
 * Hoy no hay facturación real: el Gestor de Facturación es la Fase 2 y no se
 * adelanta (CLAUDE.md §2). Mientras tanto la cadena estima con el ticket
 * promedio que el usuario carga a ojo × los clientes ganados del mes. Cuando
 * exista Facturación, se implementa otra `RevenueSource` que lea los cobros
 * reales y la pantalla sólo cambia de fuente — y de rótulo, porque deja de ser
 * "estimada".
 */
export interface RevenueSource {
  /** `true` mientras la cifra sea ticket × ganados, no cobros reales. */
  estimated: boolean;
  monthRevenue(input: { wonThisMonth: number; avgTicket: number }): number;
}

export const manualTicketRevenue: RevenueSource = {
  estimated: true,
  monthRevenue: ({ wonThisMonth, avgTicket }) => wonThisMonth * avgTicket,
};
