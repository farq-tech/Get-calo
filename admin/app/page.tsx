import type { DatasetVersion, ModelVersion } from "@calorie-scanner/shared";
import { MetricCard } from "@/components/MetricCard";
import { SetupBanner } from "@/components/SetupBanner";
import { StatusPill } from "@/components/StatusPill";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function formatMetric(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

export default async function DashboardPage() {
  const configured = isSupabaseConfigured();
  let production: ModelVersion | null = null;
  let pendingFeedback = 0;
  let datasetCount = 0;
  let latestDataset: DatasetVersion | null = null;
  let modelCount = 0;
  let fetchError: string | null = null;

  if (configured) {
    const supabase = createAdminClient();
    if (supabase) {
      const [prodRes, pendingRes, datasetsRes, modelsRes] = await Promise.all([
        supabase
          .from("model_versions")
          .select("*")
          .eq("status", "production")
          .maybeSingle(),
        supabase
          .from("prediction_feedback")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("dataset_versions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("model_versions").select("id", { count: "exact", head: true }),
      ]);

      if (prodRes.error || pendingRes.error || datasetsRes.error || modelsRes.error) {
        fetchError =
          prodRes.error?.message ||
          pendingRes.error?.message ||
          datasetsRes.error?.message ||
          modelsRes.error?.message ||
          "Failed to load dashboard data";
      } else {
        production = prodRes.data as ModelVersion | null;
        pendingFeedback = pendingRes.count ?? 0;
        latestDataset = (datasetsRes.data?.[0] as DatasetVersion | undefined) ?? null;
        datasetCount = latestDataset ? 1 : 0;
        modelCount = modelsRes.count ?? 0;

        const { count: allDatasets } = await supabase
          .from("dataset_versions")
          .select("id", { count: "exact", head: true });
        datasetCount = allDatasets ?? datasetCount;
      }
    }
  }

  return (
    <>
      <SetupBanner requiredAdmin />
      <section className="page-hero">
        <p className="page-eyebrow">SnapCal · Ops</p>
        <h1 className="page-title">Production control</h1>
        <p className="page-lead">
          Monitor the live YOLO build, pending correction queue, and dataset registry for
          the on-device calorie scanner.
        </p>
      </section>

      {fetchError ? (
        <aside className="setup-banner" role="alert">
          <h2 className="setup-title">Could not load data</h2>
          <p>{fetchError}</p>
        </aside>
      ) : null}

      <div className="metric-grid">
        <MetricCard
          label="Production model"
          value={configured ? production?.version ?? "None" : "—"}
          hint={
            production
              ? `mAP50 ${formatMetric(production.map50)} · precision ${formatMetric(production.precision)}`
              : "Promote an accepted candidate from Models"
          }
          tone="accent"
        />
        <MetricCard
          label="Pending feedback"
          value={configured ? String(pendingFeedback) : "—"}
          hint="Corrections awaiting review"
          tone={pendingFeedback > 0 ? "warn" : "default"}
        />
        <MetricCard
          label="Dataset versions"
          value={configured ? String(datasetCount) : "—"}
          hint={
            latestDataset
              ? `${latestDataset.image_count} images · ${latestDataset.class_count} classes`
              : "Placeholder until first dataset register"
          }
        />
        <MetricCard
          label="Model registry"
          value={configured ? String(modelCount) : "—"}
          hint="Candidates + production history"
        />
      </div>

      <section className="panel">
        <h2 className="panel-title">Live build</h2>
        {production ? (
          <div className="metric-grid" style={{ marginBottom: 0 }}>
            <div>
              <p className="metric-label">Status</p>
              <p style={{ marginTop: "0.4rem" }}>
                <StatusPill status={production.status} />
              </p>
            </div>
            <div>
              <p className="metric-label">Recall</p>
              <p className="metric-value" style={{ fontSize: "1.25rem" }}>
                {formatMetric(production.recall)}
              </p>
            </div>
            <div>
              <p className="metric-label">mAP50-95</p>
              <p className="metric-value" style={{ fontSize: "1.25rem" }}>
                {formatMetric(production.map50_95)}
              </p>
            </div>
            <div>
              <p className="metric-label">Trained</p>
              <p className="metric-value" style={{ fontSize: "1.05rem" }}>
                {new Date(production.trained_at).toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <p className="empty-state">
            {configured
              ? "No production model yet. Accept and promote a candidate on the Models page."
              : "Configure Supabase env vars to load live production metrics."}
          </p>
        )}
      </section>
    </>
  );
}
