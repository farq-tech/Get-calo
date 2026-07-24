"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveFeedback, rejectFeedback } from "@/app/actions/feedback";

export function FeedbackActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveFeedback(id, notes)
          : await rejectFeedback(id, notes);
      if (!result.ok) {
        setError(result.error ?? "Action failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="feedback-actions">
      <input
        className="input input-compact"
        placeholder="Reviewer notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={pending}
      />
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-accent"
          disabled={pending}
          onClick={() => run("approve")}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={() => run("reject")}
        >
          Reject
        </button>
      </div>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
