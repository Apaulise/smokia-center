import assert from "node:assert/strict";
import test from "node:test";

const load = () => import("../lib/mail/model.ts");

test("mover una conversación quita la carpeta de origen y conserva otras etiquetas", async () => {
  const { moveThreadLabels } = await load();
  assert.deepEqual(moveThreadLabels("Label_ventas", "label:Label_propuestas"), {
    addLabelIds: ["Label_ventas"], removeLabelIds: ["INBOX", "Label_propuestas"],
  });
  assert.deepEqual(moveThreadLabels("INBOX", "label:Label_ventas"), {
    addLabelIds: ["INBOX"], removeLabelIds: ["Label_ventas"],
  });
  assert.deepEqual(moveThreadLabels("Label_ventas", "label:Label_ventas"), {
    addLabelIds: ["Label_ventas"], removeLabelIds: ["INBOX"],
  });
});

test("una acción sobre un borrador desactualizado conserva la versión nueva", async () => {
  const { applyToDraftRevision } = await load();
  const draft = { id: "borrador", message: { id: "nueva", threadId: "hilo" } };
  let deleted = false;
  const read = async () => draft;
  const discard = async () => { deleted = true; };
  assert.deepEqual(await applyToDraftRevision(read, "anterior", discard), { applied: false });
  assert.equal(deleted, false);
  assert.deepEqual(await applyToDraftRevision(read, "nueva", discard), { applied: true, value: undefined });
  assert.equal(deleted, true);
});

test("un secreto de Gmail sólo se puede descifrar para la conexión que lo emitió", async () => {
  const { encrypt, decrypt } = await import("../lib/crypto.ts");
  const previous = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString("base64");
  try {
    const ciphertext = encrypt("token de prueba", "gmail:equipo-A:conexion-A");
    assert.equal(decrypt(ciphertext, "gmail:equipo-A:conexion-A"), "token de prueba");
    assert.throws(() => decrypt(ciphertext, "gmail:equipo-B:conexion-B"));
    assert.throws(() => decrypt(ciphertext));
    assert.equal(decrypt(encrypt("secreto previo")), "secreto previo");
  } finally {
    if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previous;
  }
});

test("el archivo de Gmail excluye Recibidos, Spam, Papelera y Borradores", async () => {
  const { mailboxQuery } = await load();
  assert.equal(mailboxQuery("archive", "from:ventas@example.test").get("q"),
    "-in:inbox -in:drafts (from:ventas@example.test)");
  assert.equal(mailboxQuery("trash", "").get("includeSpamTrash"), "true");
  assert.equal(mailboxQuery("label:Label_12", "").get("labelIds"), "Label_12");
});

test("el cuerpo MIME y los adjuntos se conservan sin incorporar imágenes de rastreo", async () => {
  const { readMessage } = await load();
  const data = Buffer.from('<p>Hola <strong>equipo</strong></p><img src="https://remote.example/pixel"><script>alert(1)</script>').toString("base64url");
  const result = readMessage({
    id: "m01", threadId: "t01", internalDate: "1700000000000",
    payload: { headers: [{ name: "Subject", value: "Hola" }], parts: [
      { partId: "0", mimeType: "text/html", body: { data } },
      { partId: "1", mimeType: "application/pdf", filename: "presupuesto.pdf", body: { attachmentId: "a1", size: 100 } },
    ] },
  });
  assert.equal(result.html, "<p>Hola <strong>equipo</strong></p>");
  assert.deepEqual(result.attachments, [{ partId: "1", name: "presupuesto.pdf", size: 100 }]);
});

test("una respuesta conserva el hilo y Reply All excluye la propia casilla", async () => {
  const { readMessage, replyFields } = await load();
  const message = readMessage({ id: "m1", threadId: "t1", labelIds: ["INBOX"], payload: { headers: [
    { name: "Subject", value: "Propuesta" }, { name: "From", value: "Ana <ana@example.test>" },
    { name: "Reply-To", value: "ventas@example.test" }, { name: "To", value: "empresa@gmail.com, leo@example.test" },
    { name: "Cc", value: "ana@example.test, EMPRESA@gmail.com" },
    { name: "Message-ID", value: "<m1@example.test>" },
    { name: "References", value: "<root@example.test>" },
  ] } });
  assert.deepEqual(replyFields(message, "empresa@gmail.com", "reply-all"), {
    to: "ventas@example.test", cc: "leo@example.test, ana@example.test",
    subject: "Re: Propuesta", inReplyTo: "<m1@example.test>",
    references: "<root@example.test> <m1@example.test>", threadId: "t1",
  });
});
