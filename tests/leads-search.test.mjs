import assert from "node:assert/strict";
import { test } from "node:test";

import { matchCommands, normalizeSearch, SHORTCUT_ROUTES } from "../components/shell/commands.ts";
import { orSafeTerm } from "../lib/leads/search.ts";

test("buscador de leads: lo escrito no rompe el or() de PostgREST", () => {
  // Los paréntesis cerraban la expresión y la pantalla fallaba entera.
  assert.equal(orSafeTerm("Estética (Córdoba)"), "Estética Córdoba");
  assert.equal(orSafeTerm("Pérez, Juan"), "Pérez Juan");
  assert.equal(orSafeTerm(' "hola":* '), "hola");
  // Los comodines de LIKE se buscan como texto.
  assert.equal(orSafeTerm("juan_perez"), "juan\\_perez");
  assert.equal(orSafeTerm("100%"), "100\\%");
  assert.equal(orSafeTerm("   "), "");
  assert.equal(orSafeTerm("x".repeat(200)).length, 80);
});

test("⌘K: busca pantallas de todos los gestores sin importar tildes", () => {
  assert.equal(normalizeSearch("  ANÁLISIS "), "analisis");
  const labels = (query) => matchCommands(query).map((command) => `${command.section}/${command.label}`);
  assert.ok(labels("analisis").includes("Operaciones/Análisis semanal"));
  assert.ok(labels("analisis").includes("Marca personal/Análisis"));
  // Por gestor y por palabras clave, no sólo por nombre.
  assert.ok(labels("marca").includes("Marca personal/Planificador"));
  assert.equal(labels("instagram")[0], "Leads/Chats");
  // Lo que empieza con lo escrito va primero.
  assert.equal(labels("ag")[0], "Leads/Agenda");
  assert.deepEqual(labels("zzz"), []);
});

test("atajos: cada uno lleva a una pantalla y no se repiten", () => {
  assert.equal(SHORTCUT_ROUTES.get("g d"), "/leads");
  assert.equal(SHORTCUT_ROUTES.get("g c"), "/leads/chats");
  assert.equal(SHORTCUT_ROUTES.get("n t"), "/leads/agenda?nuevo=1");
  const withShortcut = matchCommands("").filter((command) => command.shortcut);
  assert.equal(new Set(withShortcut.map((command) => command.shortcut)).size, withShortcut.length);
});
