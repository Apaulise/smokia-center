import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCommentAutomationBody,
  cloneWorkflowGraph,
  findKeywordConflicts,
  hasUnresolvedMarkers,
  keywordVariants,
  replaceMarkersDeep,
  tagsInWorkflow,
} from "../lib/chats/automations.ts";

const VALUES = { resourceUrl: "https://ejemplo.com/guia.pdf", resourceTitle: "la guía de automatización", keyword: "robots" };

test("reemplaza los 3 marcadores en cualquier profundidad", () => {
  const input = { text: "Te paso [[RECURSO]]: [[TITULO]]", nested: { buttons: [{ title: "[[PALABRA]]", url: "[[RECURSO]]" }] } };
  const output = replaceMarkersDeep(input, VALUES);
  assert.equal(output.text, "Te paso https://ejemplo.com/guia.pdf: la guía de automatización");
  assert.equal(output.nested.buttons[0].title, "robots");
  assert.equal(output.nested.buttons[0].url, "https://ejemplo.com/guia.pdf");
});

test("detecta marcadores sin reemplazar", () => {
  assert.equal(hasUnresolvedMarkers({ a: ["x", "[[RECURSO]]"] }), true);
  assert.equal(hasUnresolvedMarkers({ a: ["x", "y"] }), false);
});

test("variantes de palabra clave, sin duplicar cuando ya es una sola letra o ya está en mayúsculas", () => {
  assert.deepEqual(keywordVariants("manos"), ["manos", "Manos", "MANOS"]);
  assert.deepEqual(keywordVariants("APP"), ["APP", "App"]);
  assert.deepEqual(keywordVariants("  Fable  "), ["Fable", "FABLE"]);
  assert.deepEqual(keywordVariants(""), []);
});

test("lee las etiquetas que pone un workflow en sus nodos add_tag", () => {
  const nodes = [{ id: "n1", type: "trigger" }, { id: "n2", type: "add_tag", config: { tag: "negocio" } }, { id: "n3", type: "add_tag", config: { tag: "agenda" } }];
  assert.deepEqual(tagsInWorkflow(nodes), ["negocio", "agenda"]);
});

test("clona el grafo: disparador con palabra oculta única y add_tag de etapa + palabra insertados antes de lo que seguía", () => {
  const model = {
    nodes: [
      { id: "n_trigger", type: "trigger", config: { keywords: ["__smokia_tofu_model__"], matchType: "exact", triggerType: "inbound_message" } },
      { id: "n_intro", type: "send_message", config: { text: "Te paso [[RECURSO]]" } },
    ],
    edges: [{ id: "e1", source: "n_trigger", target: "n_intro" }],
  };
  const cloned = cloneWorkflowGraph(model, { ...VALUES, stage: "TOFU", uniqueSuffix: "abc123" });

  assert.equal(cloned.entryNodeId, "n_trigger");
  assert.ok(cloned.triggerKeyword.startsWith("__smokia_tofu_"));
  assert.notEqual(cloned.triggerKeyword, "__smokia_tofu_model__");

  const trigger = cloned.nodes.find((n) => n.id === "n_trigger");
  assert.deepEqual(trigger.config.keywords, [cloned.triggerKeyword]);

  const intro = cloned.nodes.find((n) => n.id === "n_intro");
  assert.equal(intro.config.text, "Te paso https://ejemplo.com/guia.pdf");

  // trigger -> tag etapa -> tag palabra -> intro (lo que antes salía directo del trigger)
  const fromTrigger = cloned.edges.filter((e) => e.source === "n_trigger");
  assert.equal(fromTrigger.length, 1);
  const tagStage = cloned.nodes.find((n) => n.id === fromTrigger[0].target);
  assert.equal(tagStage.type, "add_tag");
  assert.equal(tagStage.config.tag, "tofu");
  const fromStage = cloned.edges.find((e) => e.source === tagStage.id);
  const tagKeyword = cloned.nodes.find((n) => n.id === fromStage.target);
  assert.equal(tagKeyword.config.tag, "kw-robots");
  const fromKeyword = cloned.edges.find((e) => e.source === tagKeyword.id);
  assert.equal(fromKeyword.target, "n_intro");
});

test("arma el cuerpo de la automatización de comentario con el postback al workflow clonado", () => {
  const body = buildCommentAutomationBody({
    profileId: "p1",
    accountId: "a1",
    name: "SmokIA · TOFU · robots",
    platformPostId: "123",
    postTitle: "Un reel",
    keywords: ["robots", "Robots", "ROBOTS"],
    workflowId: "wf_nuevo",
    confirmMessage: null,
    values: VALUES,
  });
  assert.equal(body.trigger, "comment");
  assert.equal(body.platformPostId, "123");
  assert.deepEqual(body.keywords, ["robots", "Robots", "ROBOTS"]);
  assert.equal(body.dmMessage, "¡Genial que comentaste! Te paso la guía de automatización por acá 👇");
  assert.deepEqual(body.buttons, [{ type: "postback", title: "Dale, pasámelo", payload: "zernio:workflow:wf_nuevo" }]);
  assert.equal(body.isActive, true);
});

test("choque de palabras: bloquea en el mismo post, avisa si es de toda la cuenta, ignora inactivas", () => {
  const existing = [
    { id: "x1", name: "Vieja en el mismo post", platformPostId: "123", keywords: ["ROBOTS"], isActive: true },
    { id: "x2", name: "De toda la cuenta", platformPostId: null, keywords: ["robots"], isActive: true },
    { id: "x3", name: "Pausada", platformPostId: "123", keywords: ["robots"], isActive: false },
  ];
  const conflicts = findKeywordConflicts(existing, "123", "robots");
  assert.deepEqual(
    conflicts.map((c) => [c.automationId, c.scope]),
    [["x1", "mismo_post"], ["x2", "cualquier_post"]],
  );
});
