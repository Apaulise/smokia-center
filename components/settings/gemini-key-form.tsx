import { deleteGeminiKey, saveGeminiKey, testGeminiConnection } from "@/lib/settings/actions";

import { ApiKeyForm } from "./api-key-form";

export function GeminiKeyForm({ configured, masked }: { configured: boolean; masked: string | null }) {
  return (
    <ApiKeyForm
      configured={configured}
      masked={masked}
      label="API key de Google AI Studio"
      placeholder="AIza••••••••••••••••"
      confirmDeleteMessage="¿Eliminar la API key de Gemini guardada?"
      saveAction={saveGeminiKey}
      testAction={testGeminiConnection}
      deleteAction={deleteGeminiKey}
    />
  );
}
