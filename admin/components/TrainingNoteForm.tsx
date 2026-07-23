"use client";

import { useState, useTransition } from "react";
import { noteTrainingRun } from "@/app/actions/training";

export function TrainingNoteForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="training-form"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setMessage(null);
        startTransition(async () => {
          const result = await noteTrainingRun(formData);
          setOk(result.ok);
          setMessage(result.message);
          if (result.ok) e.currentTarget.reset();
        });
      }}
    >
      <div className="form-grid">
        <label className="field">
          <span>Version tag</span>
          <input
            className="input"
            name="version"
            placeholder="v20260723.1"
            required
            disabled={pending}
          />
        </label>
        <label className="field">
          <span>Dataset hint</span>
          <input
            className="input"
            name="dataset_hint"
            placeholder="dataset content hash or version"
            disabled={pending}
          />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="input textarea"
          name="notes"
          rows={3}
          placeholder="Why this run, gate targets, owner…"
          disabled={pending}
        />
      </label>
      <button type="submit" className="btn btn-accent" disabled={pending}>
        {pending ? "Saving…" : "Note training run"}
      </button>
      {message ? (
        <p className={ok ? "form-ok" : "inline-error"} role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
