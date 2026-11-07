import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateMaasJson,
  HUAWEI_MAAS_BASE,
  HUAWEI_MAAS_MODEL,
  normalizeMaasApiKey,
} from "../lib/huawei-maas/client.ts";

const params = {
  apiKey: "test-maas-key",
  system: "Sistema de ventas",
  prompt: "Analizá el lead",
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
  schemaName: "connection_test",
};

test("MaaS llama DeepSeek-V4.1-Flash-1017 con razonamiento high y function calling", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, HUAWEI_MAAS_BASE);
    assert.equal(init.headers.authorization, "Bearer test-maas-key");
    assert.doesNotMatch(String(url), /test-maas-key/);

    const request = JSON.parse(init.body);
    assert.equal(request.model, HUAWEI_MAAS_MODEL);
    assert.equal(request.reasoning_effort, "high");
    assert.equal(request.stream, false);
    assert.deepEqual(request.messages, [
      { role: "system", content: params.system },
      { role: "user", content: params.prompt },
    ]);
    assert.deepEqual(request.tools, [{
      type: "function",
      function: {
        name: params.schemaName,
        description: "Entregá exclusivamente los datos solicitados por la aplicación.",
        parameters: params.schema,
      },
    }]);
    assert.deepEqual(request.tool_choice, {
      type: "function",
      function: { name: params.schemaName },
    });
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: { name: params.schemaName, arguments: '{"ok":true}' },
          }],
        },
      }],
    }), { status: 200 });
  };

  try {
    assert.equal(await generateMaasJson(params), '{"ok":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normaliza valores copiados desde ejemplos de Huawei sin duplicar Bearer", () => {
  assert.equal(normalizeMaasApiKey("  raw-key  "), "raw-key");
  assert.equal(normalizeMaasApiKey("Bearer raw-key"), "raw-key");
  assert.equal(normalizeMaasApiKey("Authorization: Bearer raw-key"), "raw-key");
  assert.equal(normalizeMaasApiKey("'Bearer raw-key'"), "raw-key");
});

test("una key guardada con Bearer se envía con un solo Bearer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers.authorization, "Bearer test-maas-key");
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 });
  };

  try {
    assert.equal(
      await generateMaasJson({ ...params, apiKey: "Bearer test-maas-key" }),
      '{"ok":true}',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usa content como respaldo si MaaS no devuelve tool_calls", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"ok":true}' } }],
  }), { status: 200 });

  try {
    assert.equal(await generateMaasJson(params), '{"ok":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MaaS informa el error del proveedor sin incluir la API key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "model is unavailable" },
  }), { status: 503 });

  try {
    await assert.rejects(
      generateMaasJson(params),
      (error) => {
        assert.match(error.message, /model is unavailable/);
        assert.doesNotMatch(error.message, /test-maas-key/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
