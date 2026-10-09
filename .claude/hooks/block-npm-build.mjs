// Hook PreToolUse (Bash / PowerShell): bloquea `npm run build` y `next build`.
// `next dev` y `next build` comparten `.next`; correr el build con el dev server
// vivo deja la carpeta en estado mixto (CLAUDE.md §11). La verificación va por
// `npm run build:verify`, que compila aparte en `.next-verify`.
// Exit 2 = bloquear; el stderr le llega a Claude como motivo.

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let command = "";
try {
  command = JSON.parse(raw)?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

// `build` solo, no `build:verify` ni otro script que empiece igual.
const forbidden = /\bnpm\s+run\s+build(?![:\w-])|\bnext\s+build\b/;

if (forbidden.test(command)) {
  process.stderr.write(
    "Bloqueado: `npm run build` y `next build` comparten `.next` con el dev server " +
      "y lo dejan en estado mixto (CLAUDE.md §11). Para verificar que compila usá " +
      "`npm run build:verify`, que compila aparte en `.next-verify`.\n",
  );
  process.exit(2);
}
