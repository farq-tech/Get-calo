"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { promoteModel, rollbackModel } from "@/app/actions/models";

type Props = {
  version: string;
  status: string;
  canPromote: boolean;
  canRollback: boolean;
};

export function ModelActions({ version, status, canPromote, canRollback }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: "promote" | "rollback") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "promote"
          ? await promoteModel(version)
          : await rollbackModel(version);
      if (!result.ok) {
        setError(result.error ?? "Action failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="row-actions">
      {canPromote ? (
        <button
          type="button"
          className="btn btn-accent"
          disabled={pending}
          onClick={() => run("promote")}
        >
          Promote
        </button>
      ) : null}
      {canRollback ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => run("rollback")}
          title={`Restore ${version} as production (current: ${status})`}
        >
          Rollback to this
        </button>
      ) : null}
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
