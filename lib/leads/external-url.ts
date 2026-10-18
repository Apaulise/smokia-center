/** Sólo los enlaces web pueden abrirse desde los datos importados de un lead. */
export function externalWebUrl(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input || input.startsWith("//") || input.startsWith("\\")) return null;

  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
    const url = new URL(candidate);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
