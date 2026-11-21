export function missingCrm(error: { code: string } | null) {
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205" || error?.code === "PGRST202";
}

const PAGE_SIZE = 500;

/** La Data API limita las filas por respuesta. Los lectores pasan un orden estable. */
export async function readCrmPages<Row>(
  read: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { code: string } | null }>,
) {
  const rows: Row[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await read(start, start + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    if (data) rows.push(...data);
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
