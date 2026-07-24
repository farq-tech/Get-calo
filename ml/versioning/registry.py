"""Register / promote / rollback model versions in Calorie Scanner Supabase.

Writes only to the Calorie Scanner project (never Farq).
Expected table: ``model_versions``.
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from supabase import Client, create_client

from config.settings import settings

logger = logging.getLogger(__name__)

TABLE = "model_versions"


def create_calorie_client(
    url: str | None = None,
    key: str | None = None,
) -> Client:
    resolved_url = url or settings.calorie_supabase_url
    resolved_key = key or settings.calorie_supabase_service_key
    if not resolved_url or not resolved_key:
        raise ValueError(
            "Calorie Scanner Supabase credentials missing. Set "
            "CALORIE_SUPABASE_URL and CALORIE_SUPABASE_SERVICE_KEY in ml/.env"
        )
    return create_client(resolved_url, resolved_key)


def _load_json(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def register_model_version(
    *,
    version: str,
    weights_path: Path,
    export_dir: Path | None = None,
    metrics_path: Path | None = None,
    manifest_path: Path | None = None,
    notes: str = "",
    status: str = "registered",
    client: Client | None = None,
    promote: bool = False,
) -> dict[str, Any]:
    """Insert a row into ``model_versions`` for the Calorie Scanner app."""
    sb = client or create_calorie_client()
    metrics = _load_json(metrics_path)
    manifest = _load_json(manifest_path)
    if manifest is None and export_dir is not None:
        candidate = Path(export_dir) / "manifest.json"
        manifest = _load_json(candidate)

    if metrics and not metrics.get("accepted", True):
        raise ValueError(
            "Refusing to register a model that failed acceptance gates: "
            f"{metrics.get('gate_failures')}"
        )

    row: dict[str, Any] = {
        "version": version,
        "status": "production" if promote else status,
        "weights_path": str(Path(weights_path).resolve()),
        "export_dir": str(Path(export_dir).resolve()) if export_dir else None,
        "metrics": metrics,
        "manifest": manifest,
        "notes": notes,
        "class_key": "item_identity",
        "farq_readonly": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": bool(promote),
    }

    if promote:
        _deactivate_others(sb)

    response = sb.table(TABLE).insert(row).execute()
    data = (response.data or [row])[0]
    logger.info("Registered model version %s (status=%s)", version, row["status"])
    return data


def _deactivate_others(client: Client) -> None:
    """Mark all currently active versions inactive (best-effort)."""
    try:
        client.table(TABLE).update({"is_active": False, "status": "archived"}).eq(
            "is_active", True
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not deactivate prior versions: %s", exc)


def promote_version(
    version: str,
    *,
    client: Client | None = None,
) -> dict[str, Any]:
    """Promote an existing registered version to production (active)."""
    sb = client or create_calorie_client()
    _deactivate_others(sb)
    response = (
        sb.table(TABLE)
        .update(
            {
                "is_active": True,
                "status": "production",
                "promoted_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("version", version)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise LookupError(f"No model_versions row for version={version}")
    logger.info("Promoted version %s to production", version)
    return rows[0]


def rollback_version(
    *,
    to_version: str | None = None,
    client: Client | None = None,
) -> dict[str, Any]:
    """Rollback to a prior version.

    If ``to_version`` is omitted, activates the most recent non-active
    ``registered``/``production``/``archived`` row by ``created_at``.
    """
    sb = client or create_calorie_client()

    if to_version:
        return promote_version(to_version, client=sb)

    response = (
        sb.table(TABLE)
        .select("*")
        .eq("is_active", False)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise LookupError("No prior model version available to rollback to")
    target = rows[0]["version"]
    logger.info("Rolling back to version %s", target)
    return promote_version(target, client=sb)


def list_versions(
    *,
    client: Client | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    sb = client or create_calorie_client()
    response = (
        sb.table(TABLE)
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return list(response.data or [])


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Model version registry (Calorie Scanner)")
    sub = p.add_subparsers(dest="command", required=True)

    reg = sub.add_parser("register", help="Register a new model version")
    reg.add_argument("--version", required=True)
    reg.add_argument("--weights", type=Path, required=True)
    reg.add_argument("--export-dir", type=Path, default=None)
    reg.add_argument("--metrics", type=Path, default=None)
    reg.add_argument("--manifest", type=Path, default=None)
    reg.add_argument("--notes", default="")
    reg.add_argument("--promote", action="store_true")

    promo = sub.add_parser("promote", help="Promote a version to production")
    promo.add_argument("--version", required=True)

    rb = sub.add_parser("rollback", help="Rollback to a prior version")
    rb.add_argument("--to-version", default=None)

    sub.add_parser("list", help="List recent versions")

    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.command == "register":
        row = register_model_version(
            version=args.version,
            weights_path=args.weights,
            export_dir=args.export_dir,
            metrics_path=args.metrics,
            manifest_path=args.manifest,
            notes=args.notes,
            promote=args.promote,
        )
        print(json.dumps(row, indent=2, default=str))
    elif args.command == "promote":
        print(json.dumps(promote_version(args.version), indent=2, default=str))
    elif args.command == "rollback":
        print(
            json.dumps(
                rollback_version(to_version=args.to_version),
                indent=2,
                default=str,
            )
        )
    elif args.command == "list":
        print(json.dumps(list_versions(), indent=2, default=str))


if __name__ == "__main__":
    main()
