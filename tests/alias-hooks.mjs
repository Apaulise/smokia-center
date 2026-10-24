// Resuelve `@/lib/...` al archivo `.ts` del repo para `node --test`.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL(`../${specifier.slice(2)}.ts`, import.meta.url);
    return nextResolve(target.href, context);
  }
  return nextResolve(specifier, context);
}
