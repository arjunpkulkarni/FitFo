from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


ScheduledWorkoutStatus = Literal["scheduled", "completed", "skipped", "cancelled"]


class ScheduledWorkoutCreateRequest(BaseModel):
    source_workout_id: Optional[str] = None
    workout_id: Optional[str] = None
    job_id: Optional[str] = None
    source_url: Optional[str] = Field(default=None, max_length=4096)
    thumbnail_url: Optional[str] = Field(default=None, max_length=4096)
    scheduled_for: str = Field(..., min_length=10, max_length=10)
    scheduled_time_minutes: Optional[int] = Field(default=None, ge=0, le=1439)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    meta_left: Optional[str] = Field(default=None, max_length=120)
    meta_right: Optional[str] = Field(default=None, max_length=120)
    badge_label: Optional[str] = Field(default=None, max_length=60)
    workout_plan: Optional[Dict[str, Any]] = None


class ScheduledWorkoutUpdateRequest(BaseModel):
    # Partial update: re-schedule, mark completed/skipped, and inline-edit
    # the user-facing content fields (title/description/plan/etc.) so the
    # detail screen can save edits without going through a separate endpoint.
    scheduled_for: Optional[str] = Field(default=None, min_length=10, max_length=10)
    scheduled_time_minutes: Optional[int] = Field(default=None, ge=0, le=1439)
    status: Optional[ScheduledWorkoutStatus] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    meta_left: Optional[str] = Field(default=None, max_length=120)
    meta_right: Optional[str] = Field(default=None, max_length=120)
    badge_label: Optional[str] = Field(default=None, max_length=60)
    workout_plan: Optional[Dict[str, Any]] = None
    source_url: Optional[str] = Field(default=None, max_length=4096)


class ScheduledWorkoutResponse(BaseModel):
    id: str
    user_id: str
    source_workout_id: Optional[str] = None
    workout_id: Optional[str] = None
    job_id: Optional[str] = None
    source_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    scheduled_for: str
    scheduled_time_minutes: Optional[int] = None
    status: ScheduledWorkoutStatus
    title: str
    description: Optional[str] = None
    meta_left: Optional[str] = None
    meta_right: Optional[str] = None
    badge_label: Optional[str] = None
    workout_plan: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
