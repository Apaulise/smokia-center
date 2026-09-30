"use client";

import { useState } from "react";

import { CreateListDialog } from "@/components/leads/create-list-dialog";
import { Button, ButtonLink } from "@/components/leads/ui/button";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

/** Acciones del estado vacío de `/leads/lista` (Plan §1.21): antes sólo ofrecía "Generar lista". */
export function EmptyListsActions({ industries }: { industries: Industry[] }) {
  const [creatingList, setCreatingList] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={() => setCreatingList(true)}>
        Nueva lista vacía
      </Button>
      <ButtonLink href="/leads/generar" variant="primary">
        Generar lista
      </ButtonLink>
      {creatingList ? <CreateListDialog industries={industries} onClose={() => setCreatingList(false)} /> : null}
    </div>
  );
}
