import type { PredictionFeedback } from "@calorie-scanner/shared";
import { DataTable, type Column } from "@/components/DataTable";
import { FeedbackActions } from "@/components/FeedbackActions";
import { SetupBanner } from "@/components/SetupBanner";
import { StatusPill } from "@/components/StatusPill";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const configured = isAdminConfigured();
  let rows: PredictionFeedback[] = [];
  let error: string | null = null;

  if (configured) {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error: qError } = await supabase
        .from("prediction_feedback")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);
      if (qError) error = qError.message;
      else rows = (data ?? []) as PredictionFeedback[];
    }
  }

  const columns: Column<PredictionFeedback>[] = [
    {
      key: "created",
      header: "Submitted",
      render: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      key: "predicted",
      header: "Predicted",
      render: (row) => (
        <div>
          <div className="mono">{row.predicted_item_identity ?? "—"}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            class {row.predicted_class_id ?? "—"} · conf{" "}
            {row.predicted_confidence?.toFixed(3) ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "corrected",
      header: "Correction",
      render: (row) => (
        <div>
          <div>{row.corrected_name ?? "—"}</div>
          <div className="mono" style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            {row.corrected_item_identity ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "locale",
      header: "Locale",
      render: (row) => row.locale ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "actions",
      header: "Review",
      render: (row) => <FeedbackActions id={row.id} />,
    },
  ];

  return (
    <>
      <SetupBanner requiredAdmin />
      <section className="page-hero">
        <p className="page-eyebrow">Feedback queue</p>
        <h1 className="page-title">Pending reviews</h1>
        <p className="page-lead">
          Approve corrections for future training re-ingestion, or reject noisy / invalid
          reports.
        </p>
      </section>

      {error ? (
        <aside className="setup-banner" role="alert">
          <h2 className="setup-title">Query failed</h2>
          <p>{error}</p>
        </aside>
      ) : null}

      <section className="panel">
        <h2 className="panel-title">prediction_feedback · pending</h2>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage={
            configured
              ? "Queue is clear — no pending feedback."
              : "Configure service role env to review feedback."
          }
        />
      </section>
    </>
  );
}
