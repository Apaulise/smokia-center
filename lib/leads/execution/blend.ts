/**
 * Mezcla de tasas supuestas y observadas (Plan §1.22).
 *
 * `usada = (k · supuesta + éxitos) / (k + n)`: la tasa que el usuario cargó a
 * ojo vale como `k` observaciones imaginarias. Con n = 0 manda el supuesto;
 * con n ≫ k manda lo real. `k` es chico donde el volumen natural es chico
 * (asistencia y cierre: decenas por mes) y grande donde es grande (agenda:
 * cientos de contactos) — si no, diez contactos sin agenda tirarían la tasa
 * de agenda a la mitad en una tarde.
 */

export type RateKey = "booking" | "show" | "close";

export const RATE_PRIOR_WEIGHT: Record<RateKey, number> = {
  booking: 50,
  show: 10,
  close: 10,
};

/**
 * Por debajo de esto la observada se muestra atenuada, con "muestra chica" —
 * la misma regla que `ANGLE_MIN_SAMPLE` (§1.19): no se declaran conclusiones
 * con tres datos. La mezcla igual la usa, con el peso que le toca.
 */
export const RATE_MIN_SAMPLE: Record<RateKey, number> = {
  booking: 30,
  show: 10,
  close: 10,
};

/** Días que se le dan a un contacto para agendar antes de contarlo en la tasa de agenda. */
export const BOOKING_LAG_DAYS = 7;

export interface BlendedRate {
  assumed: number;
  /** `null` sin datos (n = 0), para no mostrar un falso 0 %. */
  observed: number | null;
  successes: number;
  n: number;
  used: number;
  /** Cuánto pesan los datos en la usada, de 0 a 1. */
  dataWeight: number;
  enoughSample: boolean;
}

export function blendRate(key: RateKey, assumed: number, successes: number, n: number): BlendedRate {
  const k = RATE_PRIOR_WEIGHT[key];
  // Nunca 0: una tasa usada en 0 haría infinita la cadena.
  const used = Math.max((k * assumed + successes) / (k + n), 0.001);
  return {
    assumed,
    observed: n > 0 ? successes / n : null,
    successes,
    n,
    used,
    dataWeight: n / (k + n),
    enoughSample: n >= RATE_MIN_SAMPLE[key],
  };
}
