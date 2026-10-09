"use client";

import { useEffect, useRef, useState } from "react";

/** Ancho de escritorio con el que se renderiza la pantalla real antes de achicarla. */
const FRAME_WIDTH = 1440;
const FRAME_HEIGHT = 900;

/**
 * Preview literal de una pantalla: la ruta real en un iframe a tamaño de
 * escritorio, escalada para entrar en la tarjeta. No es interactivo — la
 * tarjeta entera es el link al gestor. El `?preview=1` hace que el layout omita
 * el sidebar (ver proxy.ts y app/(app)/layout.tsx).
 */
export function ScreenPreview({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

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
      className="relative w-full overflow-hidden rounded-lm-md border border-lm-line bg-lm-surface"
      style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}` }}
    >
      <iframe
        src={`${src}?preview=1`}
        title={title}
        loading="lazy"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}
      />
    </div>
  );
}
