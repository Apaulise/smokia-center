"use client";

import { useLayoutEffect, useRef, useState } from "react";

const compactFormat = new Intl.NumberFormat("es-AR", { notation: "compact" });
const intFormat = new Intl.NumberFormat("es-AR");

const DURATION_MS = 700;

/**
 * Número que sube hasta su valor al montarse (KPIs del Resumen). Respeta
 * `prefers-reduced-motion` y es seguro para SSR: el primer render ya muestra
 * el valor final, así que sin JS —o con movimiento reducido— nunca se ve un
 * 0 falso. `useLayoutEffect` lo baja a 0 antes del primer pintado y lo anima
 * con ease-out (sin rebote, como el resto del sistema).
 */
export function CountUp({ value, format = "int" }: { value: number; format?: "int" | "compact" }) {
  const [shown, setShown] = useState(value);
  const animated = useRef(false);

  useLayoutEffect(() => {
    if (animated.current || value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animated.current = true;

    let frame = 0;
    const start = performance.now();
    setShown(0);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{(format === "compact" ? compactFormat : intFormat).format(shown)}</>;
}
