import type { FeedbackStatus, ModelStatus } from "@calorie-scanner/shared";

type PillStatus = ModelStatus | FeedbackStatus | string;

const TONE: Record<string, string> = {
  production: "pill-live",
  accepted: "pill-ok",
  candidate: "pill-muted",
  rejected: "pill-bad",
  rolled_back: "pill-warn",
  pending: "pill-warn",
  approved: "pill-ok",
  used_in_training: "pill-accent",
};

export function StatusPill({ status }: { status: PillStatus }) {
  const tone = TONE[status] ?? "pill-muted";
  return <span className={`status-pill ${tone}`}>{status.replaceAll("_", " ")}</span>;
}
