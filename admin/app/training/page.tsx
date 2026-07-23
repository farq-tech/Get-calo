import { SetupBanner } from "@/components/SetupBanner";
import { TrainingNoteForm } from "@/components/TrainingNoteForm";

export default function TrainingPage() {
  return (
    <>
      <SetupBanner />
      <section className="page-hero">
        <p className="page-eyebrow">ML pipeline</p>
        <h1 className="page-title">Trigger training</h1>
        <p className="page-lead">
          Training runs on your machine or CI — this dashboard documents the flow and lets
          ops leave a version note before kicking off a job.
        </p>
      </section>

      <section className="panel">
        <h2 className="panel-title">How to run</h2>
        <p style={{ margin: "0 0 0.75rem", color: "var(--text-muted)" }}>
          See the ML pipeline guide at{" "}
          <strong className="mono">ml/README.md</strong> (repo root →{" "}
          <code>../ml/README.md</code> from this app).
        </p>
        <ol className="prose-list">
          <li>
            From the monorepo root: <code>npm run ml:setup</code> then{" "}
            <code>npm run ml:pipeline</code>.
          </li>
          <li>
            Individual steps: <code>npm run ml:dataset</code> → <code>npm run ml:train</code>{" "}
            → <code>npm run ml:export</code>.
          </li>
          <li>
            Artifacts land in <code>models/&lt;version&gt;/</code> (CoreML, TFLite, ONNX,
            nutrition DB, labels, manifest). Register the version in{" "}
            <code>model_versions</code>, then promote from the Models page when gates pass.
          </li>
          <li>
            Evaluation gates auto-reject builds below configured mAP / precision thresholds.
            Classes must be canonical <code>item_identity</code> values.
          </li>
        </ol>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2 className="panel-title">Note a new training run</h2>
        <p className="page-lead" style={{ marginBottom: "1rem" }}>
          Optional ops log before you start training. Does not start the job remotely.
        </p>
        <TrainingNoteForm />
      </section>
    </>
  );
}
