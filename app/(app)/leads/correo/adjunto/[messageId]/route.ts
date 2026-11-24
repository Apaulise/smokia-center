import { getAttachment } from "@/lib/mail/gmail";
import { getCurrentUser } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  if (!await getCurrentUser()) return new Response(null, { status: 401 });
  const query = new URL(request.url).searchParams;
  const part = query.get("parte");
  const connection = query.get("cuenta");
  if (part === null || !connection) return new Response(null, { status: 400 });
  try {
    const { messageId } = await params;
    const { content, filename } = await getAttachment(connection, messageId, part);
    const name = filename.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255).toWellFormed() || "adjunto";
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= content.length) { controller.close(); return; }
        controller.enqueue(content.subarray(offset, offset + 64 * 1024));
        offset += 64 * 1024;
      },
    });
    return new Response(body, { headers: {
      "Cache-Control": "private, no-store", "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="adjunto"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Adjunto no disponible.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
