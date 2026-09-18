import { deleteAnthropicKey, saveAnthropicKey, testAnthropicConnection } from "@/lib/settings/actions";

import { ApiKeyForm } from "./api-key-form";

export function AnthropicKeyForm({ configured, masked }: { configured: boolean; masked: string | null }) {
  return (
    <ApiKeyForm
      configured={configured}
      masked={masked}
      label="API key de Anthropic"
      placeholder="sk-ant-••••••••••••••••"
      confirmDeleteMessage="¿Eliminar la API key de Anthropic guardada?"
      saveAction={saveAnthropicKey}
      testAction={testAnthropicConnection}
      deleteAction={deleteAnthropicKey}
    />
  );
}
