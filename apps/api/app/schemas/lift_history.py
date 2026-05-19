from typing import List, Optional

from pydantic import BaseModel


class LiftLatestSnapshotRow(BaseModel):
    exercise_key: str
    exercise_name: str
    set_position: int
    weight_lbs: Optional[float] = None
    reps: Optional[int] = None
    duration_sec: Optional[int] = None
    recorded_at: str
    last_session_recorded_at: Optional[str] = None
    personal_record_weight_lbs: Optional[float] = None
    personal_record_reps: Optional[int] = None
    personal_record_recorded_at: Optional[str] = None


class LiftLatestSnapshotResponse(BaseModel):
    snapshots: List[LiftLatestSnapshotRow]
