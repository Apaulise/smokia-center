"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/leads/ui/field";

export function WeekSelect({
  area,
  value,
  weeks,
}: {
  area: string;
  value: string;
  weeks: { value: string; label: string }[];
}) {
  const router = useRouter();

  return (
    <Select
      aria-label="Semana"
      value={value}
      className="w-full sm:w-auto sm:min-w-56"
      onChange={(event) => {
        const week = event.target.value;
        router.push(`/operaciones/analisis?area=${area}&week=${week}`);
      }}
    >
      {weeks.map((week) => (
        <option key={week.value} value={week.value}>
          {week.label}
        </option>
      ))}
    </Select>
  );
}
