// Sube un documento o una imagen como respuesta rápida. Corre en el navegador:
// el archivo va directo al bucket privado `chat-files`, a la carpeta del usuario
// (las Server Actions no aceptan 25 MB), y después se registra la fila.

import { createFileQuickReply, prepareFileUpload } from "@/lib/chats/inbox-actions";
import { FILE_NAME_MAX, type QuickReplyView } from "@/lib/chats/quick-replies";
import { createClient } from "@/lib/supabase/client";

export async function uploadFileQuickReply(file: File, title: string): Promise<{ ok: boolean; message: string; item?: QuickReplyView }> {
  const prepared = await prepareFileUpload({ mime: file.type, name: file.name, size: file.size });
  if (!prepared.ok) return prepared;

  const { error } = await createClient().storage.from("chat-files").upload(prepared.path, file, { contentType: prepared.mime, upsert: false });
  if (error) {
    return {
      ok: false,
      message: /bucket/i.test(error.message) ? "Falta aplicar la migración de documentos e imágenes (`npm run db:push`)." : "No se pudo subir el archivo. Probá de nuevo.",
    };
  }
  return createFileQuickReply({ title, path: prepared.path, mime: prepared.mime, name: file.name.slice(0, FILE_NAME_MAX), size: file.size });
}
