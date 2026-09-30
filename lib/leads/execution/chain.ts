/**
 * La cadena de ejecución (Plan §1.22): del objetivo de facturación a los
 * contactos por día, con la misma aritmética que la planilla "Mi cadena de
 * ejecución". Pura, sin base: la usan la pantalla y el tile del dashboard.
 */

export interface ChainInputs {
  monthlyRevenueTarget: number;
  avgTicket: number;
  /** Fracciones (0.1 = 10 %). */
  bookingRate: number;
  showRate: number;
  closeRate: number;
  workingDaysPerMonth: number;
  workingDaysPerWeek: number;
}

export interface Chain {
  clients: number;
  salesCalls: number;
  bookings: number;
  contactsPerMonth: number;
  contactsPerDay: number;
  contactsPerWeek: number;
}

/**
 * `ceil` tolerante al error de coma flotante: 36 / 0.1 da 359.99999999999994
 * en JS, y un `Math.ceil` pelado podría pedir un contacto de más o de menos.
 */
function ceil(value: number): number {
  return Math.ceil(value - 1e-9);
}

export function buildChain(inputs: ChainInputs): Chain {
  const clients = ceil(inputs.monthlyRevenueTarget / inputs.avgTicket);
  const salesCalls = ceil(clients / inputs.closeRate);
  const bookings = ceil(salesCalls / inputs.showRate);
  const contactsPerMonth = ceil(bookings / inputs.bookingRate);
  const contactsPerDay = ceil(contactsPerMonth / inputs.workingDaysPerMonth);
  return {
    clients,
    salesCalls,
    bookings,
    contactsPerMonth,
    contactsPerDay,
    contactsPerWeek: contactsPerDay * inputs.workingDaysPerWeek,
  };
}

/** Valores de la planilla original, para prellenar el formulario la primera vez. */
export const SPREADSHEET_DEFAULTS: ChainInputs = {
  monthlyRevenueTarget: 2000,
  avgTicket: 500,
  bookingRate: 0.1,
  showRate: 0.75,
  closeRate: 0.15,
  workingDaysPerMonth: 20,
  workingDaysPerWeek: 6,
};

/**
 * Días hábiles del mes transcurridos hasta `todayIso` inclusive, contando
 * como hábiles los primeros `workingDaysPerWeek` días de la semana desde el
 * lunes (5 = lunes a viernes, 6 = hasta el sábado). Es el "a esta altura
 * tendrías que llevar" del ritmo mensual.
 */
export function workingDaysElapsed(monthStartIso: string, todayIso: string, workingDaysPerWeek: number): number {
  const [y, m, d] = monthStartIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  let count = 0;
  while (cursor.toISOString().slice(0, 10) <= todayIso) {
    const daysSinceMonday = (cursor.getUTCDay() + 6) % 7;
    if (daysSinceMonday < workingDaysPerWeek) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
