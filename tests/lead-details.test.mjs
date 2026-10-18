import assert from "node:assert/strict";
import { test } from "node:test";

import { externalWebUrl } from "../lib/leads/external-url.ts";
import { openingHoursFromRaw } from "../lib/leads/opening-hours.ts";

test("los enlaces del lead sólo abren sitios HTTP(S) y completan el esquema faltante", () => {
  assert.equal(externalWebUrl("libreriahernandez.ar/"), "https://libreriahernandez.ar/");
  assert.equal(externalWebUrl("https://libreriahernandez.ar/"), "https://libreriahernandez.ar/");
  assert.equal(externalWebUrl("javascript:alert(1)"), null);
  assert.equal(externalWebUrl("//example.com"), null);
  assert.equal(externalWebUrl("https://user:secret@example.com"), null);
});

test("los horarios de Maps se muestran de lunes a domingo, incluidos días cerrados", () => {
  assert.deepEqual(openingHoursFromRaw({ openingHours: [
    { day: "sábado", hours: "9:30 AM to 10:30 PM" },
    { day: "domingo", hours: "Cerrado" },
    { day: "martes", hours: "9:30 AM to 8:30 PM" },
    { day: "sábado", hours: "duplicado" },
    { day: "feriado", hours: "10 AM to 5 PM" },
  ] }), [
    { day: "martes", hours: "9:30 AM a 8:30 PM" },
    { day: "sábado", hours: "9:30 AM a 10:30 PM" },
    { day: "domingo", hours: "Cerrado" },
  ]);
  assert.deepEqual(openingHoursFromRaw(null), []);
});
