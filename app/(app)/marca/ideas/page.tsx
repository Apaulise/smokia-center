import { redirect } from "next/navigation";

/**
 * Las ideas guardadas viven ahora en la bandeja "Sin fecha" del planificador
 * (Plans/03 §3.7): la lista de sólo lectura de §3.6 era, a propósito, un paso
 * provisorio. La ruta queda para no romper enlaces ni marcadores viejos.
 */
export default function IdeasPage() {
  redirect("/marca/planificador");
}
