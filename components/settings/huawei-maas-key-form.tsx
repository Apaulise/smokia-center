import {
  deleteHuaweiMaasKey,
  saveHuaweiMaasKey,
  testHuaweiMaasConnection,
} from "@/lib/settings/actions";

import { ApiKeyForm } from "./api-key-form";

export function HuaweiMaasKeyForm({ configured, masked }: { configured: boolean; masked: string | null }) {
  return (
    <ApiKeyForm
      configured={configured}
      masked={masked}
      label="API key regional de Huawei Cloud MaaS"
      placeholder="Pegá la API key de CN-Hong Kong"
      confirmDeleteMessage="¿Eliminar la API key de Huawei Cloud MaaS guardada?"
      saveAction={saveHuaweiMaasKey}
      testAction={testHuaweiMaasConnection}
      deleteAction={deleteHuaweiMaasKey}
    />
  );
}
