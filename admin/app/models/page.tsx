import type { ModelVersion } from "@calorie-scanner/shared";
import { DataTable, type Column } from "@/components/DataTable";
import { ModelActions } from "@/components/ModelActions";
import { SetupBanner } from "@/components/SetupBanner";
import { StatusPill } from "@/components/StatusPill";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function pct(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(4);
}

export default async function ModelsPage() {
  const configured = isAdminConfigured();
  let rows: ModelVersion[] = [];
  let error: string | null = null;

  if (configured) {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error: qError } = await supabase
        .from("model_versions")
        .select("*")
        .order("trained_at", { ascending: false });
      if (qError) error = qError.message;
      else rows = (data ?? []) as ModelVersion[];
    }
  }

  const hasProduction = rows.some((r) => r.status === "production");

  const columns: Column<ModelVersion>[] = [
    {
      key: "version",
      header: "Version",
      render: (row) => <span className="mono">{row.version}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "precision",
      header: "Precision",
      align: "right",
      render: (row) => pct(row.precision),
    },
    {
      key: "recall",
      header: "Recall",
      align: "right",
      render: (row) => pct(row.recall),
    },
    {
      key: "map50",
      header: "mAP50",
      align: "right",
      render: (row) => pct(row.map50),
    },
    {
      key: "map50_95",
      header: "mAP50-95",
      align: "right",
      render: (row) => pct(row.map50_95),
    },
    {
      key: "trained_at",
      header: "Trained",
      render: (row) => new Date(row.trained_at).toLocaleString(),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <ModelActions
          version={row.version}
          status={row.status}
          canPromote={
            row.status === "accepted" ||
            row.status === "candidate" ||
            row.status === "rolled_back"
          }
          canRollback={
            hasProduction &&
            row.status !== "production" &&
            (row.status === "rolled_back" ||
              row.status === "accepted" ||
              row.status === "candidate")
          }
        />
      ),
    },
  ];

  return (
    <>
      <SetupBanner requiredAdmin />
      <section className="page-hero">
        <p className="page-eyebrow">Model registry</p>
        <h1 className="page-title">Versions & gates</h1>
        <p className="page-lead">
          Promote accepted builds to production via <code>promote_model_version</code>, or
          roll back to a prior artifact set.
        </p>
      </section>

      {error ? (
        <aside className="setup-banner" role="alert">
          <h2 className="setup-title">Query failed</h2>
          <p>{error}</p>
        </aside>
      ) : null}

      <section className="panel">
        <h2 className="panel-title">model_versions</h2>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage={
            configured
              ? "No model versions registered yet."
              : "Configure service role env to list models."
          }
        />
      </section>
    </>
  );
}
