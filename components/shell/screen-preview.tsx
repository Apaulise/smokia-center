"use client";

import { useEffect, useRef, useState } from "react";

/** Ancho de escritorio con el que se renderiza la pantalla real antes de achicarla. */
const FRAME_WIDTH = 1440;
const FRAME_HEIGHT = 900;
/** Si una pantalla tarda más que esto, se libera el turno igual: una trabada no frena a las demás. */
const SLOT_TIMEOUT_MS = 8000;

/*
 * Cola de carga compartida por todas las vistas previas: cada una es una
 * pantalla completa (servidor + JS), y dos cargando a la vez traban la vista.
 * Una entra recién cuando la anterior terminó (o venció su turno), y sólo si
 * su tarjeta está a la vista.
 */
let busy = false;
const waiting: Array<() => void> = [];

function requestSlot(start: () => void) {
  if (!busy) {
    busy = true;
    start();
  } else {
    waiting.push(start);
  }
  return () => {
    const index = waiting.indexOf(start);
    if (index !== -1) waiting.splice(index, 1);
  };
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else busy = false;
}

/** Ahorro de datos activado en el navegador: no se cargan pantallas enteras sólo para decorar. */
function prefersSavingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true || window.matchMedia("(prefers-reduced-data: reduce)").matches;
}

/**
 * Preview literal de una pantalla: la ruta real en un iframe a tamaño de
 * escritorio, escalada para entrar en la tarjeta. No es interactivo — la
 * tarjeta entera es el link al gestor. El `?preview=1` hace que el layout omita
 * el sidebar y las animaciones (ver proxy.ts y app/(app)/layout.tsx).
 *
 * Para no cargar las tres pantallas juntas: espera a que la tarjeta se vea,
 * pide turno en la cola y lo suelta al terminar de cargar. Con ahorro de datos
 * no carga nada y queda la tarjeta con su nombre.
 */
export function ScreenPreview({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const holding = useRef(false);

  function release() {
    if (!holding.current) return;
    holding.current = false;
    releaseSlot();
  }

  useEffect(() => {
    const box = boxRef.current;
    if (!box || prefersSavingData()) return;
    let cancelQueue: (() => void) | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || cancelQueue) return;
        observer.disconnect();
        cancelQueue = requestSlot(() => {
          holding.current = true;
          setMounted(true);
          timeout = setTimeout(release, SLOT_TIMEOUT_MS);
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(box);

    return () => {
      observer.disconnect();
      cancelQueue?.();
      if (timeout) clearTimeout(timeout);
      release();
    };
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / FRAME_WIDTH));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className={`relative w-full overflow-hidden rounded-lm-md border border-lm-line bg-lm-ink/5 ${loaded ? "" : "lm-stripes"}`}
      style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}` }}
    >
      {mounted ? (
        <iframe
          src={`${src}?preview=1`}
          title={title}
          tabIndex={-1}
          aria-hidden="true"
          onLoad={() => {
            setLoaded(true);
            release();
          }}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-500 motion-reduce:transition-none"
          style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})`, opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </div>
  );
}
