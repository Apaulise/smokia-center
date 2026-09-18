import { deleteWindsorKey, saveWindsorKey, testWindsorConnection } from "@/lib/settings/actions";

import { ApiKeyForm } from "./api-key-form";

export function WindsorKeyForm({ configured, masked }: { configured: boolean; masked: string | null }) {
  return (
    <ApiKeyForm
      configured={configured}
      masked={masked}
      label="API key de Windsor.ai"
      placeholder="wapi_••••••••••••••••"
      confirmDeleteMessage="¿Eliminar la API key de Windsor.ai guardada?"
      saveAction={saveWindsorKey}
      testAction={testWindsorConnection}
      deleteAction={deleteWindsorKey}
    />
  );
}
