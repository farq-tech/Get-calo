"use server";

import { revalidatePath } from "next/cache";

export type TrainingNoteResult = {
  ok: boolean;
  message: string;
};

/**
 * Optional ops note for a planned training run.
 * Persistence can later write to dataset_versions.metadata or an ops log;
 * for now we acknowledge and revalidate the training page.
 */
export async function noteTrainingRun(formData: FormData): Promise<TrainingNoteResult> {
  const version = String(formData.get("version") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const datasetHint = String(formData.get("dataset_hint") ?? "").trim();

  if (!version) {
    return { ok: false, message: "Version tag is required (e.g. v20260723.1)." };
  }

  // Soft log for local ops visibility during development.
  console.info("[training-note]", {
    version,
    datasetHint: datasetHint || null,
    notes: notes || null,
    at: new Date().toISOString(),
  });

  revalidatePath("/training");
  return {
    ok: true,
    message: `Noted training run ${version}. Trigger the pipeline locally via npm run ml:pipeline (see ml/README).`,
  };
}
