"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

/**
 * Código numérico de N dígitos, una casilla por dígito: avanza solo al tipear,
 * retrocede con Backspace, acepta pegar el código entero y dispara
 * `onComplete` cuando están todas llenas.
 *
 * No controlado: para vaciarlo (p. ej. después de un código incorrecto) el
 * padre lo remonta cambiándole la `key`.
 */
export function OTPInput({
  length = 6,
  onComplete,
  onValueChange,
  disabled = false,
  error = false,
  autoFocus = false,
  className,
}: {
  length?: number;
  onComplete?: (code: string) => void;
  onValueChange?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length }, () => ""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function focusInput(index: number) {
    inputRefs.current[index]?.focus();
  }

  function commit(next: string[]) {
    setValues(next);
    const code = next.join("");
    onValueChange?.(code);
    if (next.every((digit) => digit !== "")) onComplete?.(code);
  }

  function handleChange(index: number, raw: string) {
    if (disabled) return;
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...values];
    next[index] = digit;
    commit(next);
    if (digit && index < length - 1) focusInput(index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...values];
      if (values[index]) {
        next[index] = "";
        commit(next);
      } else if (index > 0) {
        next[index - 1] = "";
        commit(next);
        focusInput(index - 1);
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1);
    } else if (event.key === "ArrowRight" && index < length - 1) {
      focusInput(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (disabled) return;
    event.preventDefault();

    const digits = event.clipboardData.getData("text/plain").replace(/\D/g, "").slice(0, length).split("");
    const next = Array.from({ length }, (_, index) => digits[index] ?? "");
    commit(next);

    const firstEmpty = next.findIndex((digit) => digit === "");
    focusInput(firstEmpty === -1 ? length - 1 : firstEmpty);
  }

  return (
    <div role="group" aria-label="Código de verificación" className={cn("flex gap-2", className)}>
      {values.map((value, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          aria-label={`Dígito ${index + 1} de ${length}`}
          aria-invalid={error || undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            "h-12 w-10 rounded-lm-sm border bg-lm-raised text-center font-mono text-lg text-lm-ink tabular-nums sm:w-11",
            "transition-colors duration-200",
            "focus:border-lm-signal focus:shadow-[0_0_0_3px_var(--color-lm-signal-soft)] focus:outline-none",
            "disabled:pointer-events-none disabled:opacity-45",
            error ? "border-lm-danger" : "border-lm-line-strong hover:border-lm-ink-3",
          )}
        />
      ))}
    </div>
  );
}
