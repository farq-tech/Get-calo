"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type FeedbackActionResult = {
  ok: boolean;
  error?: string;
};

async function setFeedbackStatus(
  id: string,
  status: "approved" | "rejected",
  reviewerNotes?: string,
): Promise<FeedbackActionResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY (or public URL/anon key). Copy admin/.env.example → .env.local.",
    };
  }

  const { error } = await supabase
    .from("prediction_feedback")
    .update({
      status,
      reviewer_notes: reviewerNotes?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/feedback");
  return { ok: true };
}

export async function approveFeedback(
  id: string,
  reviewerNotes?: string,
): Promise<FeedbackActionResult> {
  return setFeedbackStatus(id, "approved", reviewerNotes);
}

export async function rejectFeedback(
  id: string,
  reviewerNotes?: string,
): Promise<FeedbackActionResult> {
  return setFeedbackStatus(id, "rejected", reviewerNotes);
}
