from fastapi import APIRouter, Depends, HTTPException

from app.routers.deps import require_profile_id
from app.schemas.lift_history import LiftLatestSnapshotResponse, LiftLatestSnapshotRow
from app.services import supabase_db

router = APIRouter(prefix="/lift-history", tags=["lift-history"])


@router.get("/latest-snapshot", response_model=LiftLatestSnapshotResponse)
def get_latest_lift_snapshot(
    profile_id: str = Depends(require_profile_id),
) -> LiftLatestSnapshotResponse:
    try:
        rows = supabase_db.fetch_lift_set_logs_latest_snapshot(profile_id)
        snapshots = [LiftLatestSnapshotRow(**row) for row in rows]
        return LiftLatestSnapshotResponse(snapshots=snapshots)
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to load lift history snapshot: {exc}"
        ) from exc
