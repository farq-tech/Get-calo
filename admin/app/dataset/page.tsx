import type { DatasetVersion } from "@calorie-scanner/shared";
import { DataTable, type Column } from "@/components/DataTable";
import { SetupBanner } from "@/components/SetupBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function DatasetPage() {
  const configured = isAdminConfigured();
  let rows: DatasetVersion[] = [];
  let error: string | null = null;

  if (configured) {
    const supabase = createAdminClient();
    if (supabase) {
      const { data, error: qError } = await supabase
        .from("dataset_versions")
        .select("*")
        .order("created_at", { ascending: false });
      if (qError) error = qError.message;
      else rows = (data ?? []) as DatasetVersion[];
    }
  }

  const columns: Column<DatasetVersion>[] = [
    {
      key: "version",
      header: "Version",
      render: (row) => <span className="mono">{row.version}</span>,
    },
    {
      key: "source",
      header: "Source",
      render: (row) => row.source,
    },
    {
      key: "classes",
      header: "Classes",
      align: "right",
      render: (row) => String(row.class_count),
    },
    {
      key: "images",
      header: "Images",
      align: "right",
      render: (row) => String(row.image_count),
    },
    {
      key: "splits",
      header: "Train / Val / Test",
      render: (row) => (
        <span className="mono">
          {row.split_train} / {row.split_val} / {row.split_test}
        </span>
      ),
    },
    {
      key: "hash",
      header: "Content hash",
      render: (row) => (
        <span className="mono" title={row.content_hash}>
          {row.content_hash.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (row) => new Date(row.created_at).toLocaleString(),
    },
  ];

  return (
    <>
      <SetupBanner requiredAdmin />
      <section className="page-hero">
        <p className="page-eyebrow">Datasets</p>
        <h1 className="page-title">Build registry</h1>
        <p className="page-lead">
          Farq-sourced YOLO dataset builds keyed by content hash. Classes map to canonical{" "}
          <code>item_identity</code>, never raw provider SKUs.
        </p>
      </section>

      {error ? (
        <aside className="setup-banner" role="alert">
          <h2 className="setup-title">Query failed</h2>
          <p>{error}</p>
        </aside>
      ) : null}

      <section className="panel">
        <h2 className="panel-title">dataset_versions</h2>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyMessage={
            configured
              ? "No dataset versions yet. Run the ML dataset generator to register one."
              : "Configure service role env to list datasets."
          }
        />
      </section>
    </>
  );
}
