import assert from "node:assert/strict";
import { test } from "node:test";

import { generateGeminiUrlJson } from "../lib/gemini/client.ts";

const params = {
  apiKey: "test-key",
  system: "Reglas",
  prompt: "Leé https://example.com",
  schema: {
    type: "object",
    properties: {
      business_summary: { type: "string" },
      possible_decision_maker: { type: "string", nullable: true },
    },
  },
};

test("URL Context usa una sola llamada sin Google Search y verifica la lectura por metadatos", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(init.headers["x-goog-api-key"], "test-key");
    assert.doesNotMatch(url, /test-key/);
    const request = JSON.parse(init.body);
    assert.deepEqual(request.tools, [{ url_context: {} }]);
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(request.generationConfig.responseSchema, params.schema);
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: '{"business_summary":"Librería"}' }] },
        urlContextMetadata: { urlMetadata: [{ urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] },
      }],
    }), { status: 200 });
  };
  try {
    assert.deepEqual(await generateGeminiUrlJson(params), {
      text: '{"business_summary":"Librería"}',
      grounded: true,
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sin URL recuperada no marca hechos como verificados", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"business_summary":"Sin datos"}' }] } }],
  }), { status: 200 });
  try {
    assert.equal((await generateGeminiUrlJson(params)).grounded, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
