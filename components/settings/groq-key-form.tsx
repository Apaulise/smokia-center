import { deleteGroqKey, saveGroqKey, testGroqConnection } from "@/lib/settings/actions";

import { ApiKeyForm } from "./api-key-form";

export function GroqKeyForm({ configured, masked }: { configured: boolean; masked: string | null }) {
  return (
    <ApiKeyForm
      configured={configured}
      masked={masked}
      label="API key de Groq"
      placeholder="gsk_••••••••••••••••"
      confirmDeleteMessage="¿Eliminar la API key de Groq guardada?"
      saveAction={saveGroqKey}
      testAction={testGroqConnection}
      deleteAction={deleteGroqKey}
    />
  );
}
