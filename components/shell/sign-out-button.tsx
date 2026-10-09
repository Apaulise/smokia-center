"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="flex h-8 cursor-pointer items-center gap-2 rounded-lm-sm px-2.5 text-sm text-lm-ink-2 transition-colors hover:bg-lm-raised hover:text-lm-ink"
    >
      <LogOut className="size-4" strokeWidth={1.5} />
      Salir
    </button>
  );
}
