// Resuelve `@/lib/...` al archivo `.ts` del repo para `node --test`.
// Los subpaths de `next/*` (next/server, next/cache) no traen extensión en el
// import y Node ESM la exige: se reintenta con `.js`.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL(`../${specifier.slice(2)}.ts`, import.meta.url);
    return nextResolve(target.href, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" && /^next\/[\w-]+$/.test(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}
