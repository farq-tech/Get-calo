"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = {
  ok: boolean;
  error?: string;
};

export async function promoteModel(version: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY (or public URL/anon key). Copy admin/.env.example → .env.local.",
    };
  }

  const { error } = await supabase.rpc("promote_model_version", {
    p_version: version,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/models");
  return { ok: true };
}

export async function rollbackModel(previousVersion: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY (or public URL/anon key). Copy admin/.env.example → .env.local.",
    };
  }

  // Prefer RPC when promoting a prior version back to production.
  const { error: rpcError } = await supabase.rpc("promote_model_version", {
    p_version: previousVersion,
  });

  if (!rpcError) {
    revalidatePath("/");
    revalidatePath("/models");
    return { ok: true };
  }

  // Fallback: demote current production, then mark target as production.
  const { error: demoteError } = await supabase
    .from("model_versions")
    .update({ status: "rolled_back" })
    .eq("status", "production");

  if (demoteError) {
    return { ok: false, error: demoteError.message };
  }

  const { error: promoteError } = await supabase
    .from("model_versions")
    .update({ status: "production" })
    .eq("version", previousVersion);

  if (promoteError) {
    return { ok: false, error: promoteError.message };
  }

  revalidatePath("/");
  revalidatePath("/models");
  return { ok: true };
}
