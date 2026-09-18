import { deleteApifyKey, saveApifyKey, testApifyConnection } from "@/lib/settings/actions";

import { ApiKeyForm } from "./api-key-form";

export function ApifyKeyForm({ configured, masked }: { configured: boolean; masked: string | null }) {
  return (
    <ApiKeyForm
      configured={configured}
      masked={masked}
      label="API key de Apify"
      placeholder="apify_api_••••••••••••••••"
      confirmDeleteMessage="¿Eliminar la API key de Apify guardada?"
      saveAction={saveApifyKey}
      testAction={testApifyConnection}
      deleteAction={deleteApifyKey}
    />
  );
}
