import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Campo de formulario del sistema "Señal y humo" (Design System Field):
 * label arriba, control y una línea de ayuda o error debajo. El consumidor
 * provee label/hint/error — nunca dos labels iguales en un mismo formulario.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="font-lm-sans text-[13px] font-medium text-lm-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-xs text-lm-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-lm-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

const CONTROL = cn(
  "w-full rounded-lm-sm border border-lm-line-strong bg-lm-raised px-3 text-lm-ink font-lm-sans text-sm",
  "placeholder:text-lm-ink-3",
  "focus:border-lm-signal focus:shadow-[0_0_0_3px_var(--color-lm-signal-soft)] focus:outline-none",
  "disabled:pointer-events-none disabled:opacity-45",
);

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  mono?: boolean;
}

export function Input({ className, error, mono, ...props }: InputProps) {
  return (
    <input
      className={cn(CONTROL, "h-9", error && "border-lm-danger", mono && "font-mono tabular-nums", className)}
      {...props}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ className, error, ...props }: SelectProps) {
  return <select className={cn(CONTROL, "h-9", error && "border-lm-danger", className)} {...props} />;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({ className, error, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-18 resize-y py-2", error && "border-lm-danger", className)}
      {...props}
    />
  );
}
