import { WeeklyAnalysis } from "@/components/weekly/analysis-view";
import { loadWeeklyPage } from "@/lib/weekly/queries";

export const metadata = { title: "Análisis semanal · Operaciones · SmokIA" };

export default async function AnalisisSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; week?: string }>;
}) {
  const params = await searchParams;
  const model = await loadWeeklyPage({ area: params.area, week: params.week });
  return <WeeklyAnalysis model={model} />;
}
