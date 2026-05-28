from __future__ import annotations

"""
Chat endpoint over the creator corpus.

Retrieval-augmented generation:
  user msg → embed → pgvector search → top-K approved chunks → LLM → answer

Answers are grounded on chunks. The assistant may cite context with inline **[N]**
markers; the HTTP `citations` array mirrors retrieved chunks (`index` ↔ `[N]`).
Clients link `source_url` / `snippet` from that array.

Same env-var gate as /admin/corpus/* (CORPUS_ADMIN_ENABLED=1) so chat is
opt-in for now. Flip to a profile-allowlist `Depends` when you want to ship
chat to real users.
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.routers.deps import require_profile_id
from app.services import corpus_chat, supabase_db
from app.services.fitfo_pro_access import profile_has_fitfo_pro_access


_log = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def _chat_enabled() -> None:
    if (os.environ.get("CORPUS_ADMIN_ENABLED") or "").strip() != "1":
        raise HTTPException(
            status_code=503,
            detail="Chat is disabled. Set CORPUS_ADMIN_ENABLED=1 to enable.",
        )


class ChatTurnSchema(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class WorkoutExerciseContextSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    sets: Optional[int] = Field(default=None, ge=0, le=99)
    reps: Optional[int] = Field(default=None, ge=0, le=999)
    duration_sec: Optional[int] = Field(default=None, ge=0, le=10_000)
    rest_sec: Optional[int] = Field(default=None, ge=0, le=3_600)
    notes: Optional[str] = Field(default=None, max_length=600)
    sets_completed: Optional[int] = Field(default=None, ge=0, le=99)


class WorkoutContextSchema(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=600)
    workout_type: Optional[str] = Field(default=None, max_length=40)
    muscle_groups: Optional[list[str]] = None
    equipment: Optional[list[str]] = None
    exercises: Optional[list[WorkoutExerciseContextSchema]] = Field(
        default=None,
        max_length=40,
    )
    elapsed_sec: Optional[int] = Field(default=None, ge=0, le=864_000)
    timer_paused: Optional[bool] = None
    session_started_at_ms: Optional[int] = Field(default=None, ge=0)
    completed_set_count: Optional[int] = Field(default=None, ge=0, le=9999)
    total_set_count: Optional[int] = Field(default=None, ge=0, le=9999)
    current_exercise_index: Optional[int] = Field(default=None, ge=1, le=999)
    current_exercise_name: Optional[str] = Field(default=None, max_length=200)
    current_set_number: Optional[int] = Field(default=None, ge=1, le=999)
    current_set_target_summary: Optional[str] = Field(default=None, max_length=200)
    current_set_logged_summary: Optional[str] = Field(default=None, max_length=240)
    source_workout_id: Optional[str] = Field(default=None, max_length=80)
    source_job_id: Optional[str] = Field(default=None, max_length=80)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatTurnSchema] = Field(default_factory=list)
    creator_id: Optional[str] = None
    muscle_groups: Optional[list[str]] = None
    goals: Optional[list[str]] = None
    workout: Optional[WorkoutContextSchema] = None
    top_k: int = Field(5, ge=1, le=20)


class ChatCitationSchema(BaseModel):
    index: int
    chunk_id: str
    source_url: str
    snippet: str


class RetrievedChunkSchema(BaseModel):
    chunk_id: str
    source_id: str
    source_url: str
    chunk_text: str
    chunk_type: Optional[str]
    exercise: list[str]
    muscle_group: list[str]
    equipment: list[str]
    goal: list[str]
    similarity: float


class ChatResponse(BaseModel):
    answer: str
    citations: list[ChatCitationSchema]
    retrieval: list[RetrievedChunkSchema]
    model: str


def _coerce_workout(schema: Optional[WorkoutContextSchema]) -> Optional[corpus_chat.WorkoutContext]:
    if schema is None:
        return None
    exercises: Optional[list[corpus_chat.WorkoutExerciseContext]] = None
    if schema.exercises is not None:
        exercises = [
            corpus_chat.WorkoutExerciseContext(
                name=ex.name,
                sets=ex.sets,
                reps=ex.reps,
                duration_sec=ex.duration_sec,
                rest_sec=ex.rest_sec,
                notes=ex.notes,
                sets_completed=ex.sets_completed,
            )
            for ex in schema.exercises
        ]
    return corpus_chat.WorkoutContext(
        title=schema.title,
        description=schema.description,
        workout_type=schema.workout_type,
        muscle_groups=schema.muscle_groups,
        equipment=schema.equipment,
        exercises=exercises,
        elapsed_sec=schema.elapsed_sec,
        timer_paused=schema.timer_paused,
        session_started_at_ms=schema.session_started_at_ms,
        completed_set_count=schema.completed_set_count,
        total_set_count=schema.total_set_count,
        current_exercise_index=schema.current_exercise_index,
        current_exercise_name=schema.current_exercise_name,
        current_set_number=schema.current_set_number,
        current_set_target_summary=schema.current_set_target_summary,
        current_set_logged_summary=schema.current_set_logged_summary,
        source_workout_id=schema.source_workout_id,
        source_job_id=schema.source_job_id,
    )


def _coach_session_key(body: ChatRequest) -> str:
    started_at = body.workout.session_started_at_ms if body.workout else None
    if started_at is not None:
        return str(started_at)
    return "no-session"


@router.post("", response_model=ChatResponse, dependencies=[Depends(_chat_enabled)])
async def chat(
    body: ChatRequest,
    profile_id: str = Depends(require_profile_id),
) -> ChatResponse:
    profile = supabase_db.get_profile_by_id(profile_id)
    if profile is None:
        raise HTTPException(status_code=401, detail="Account not found.")
    session_key = _coach_session_key(body)
    if not profile_has_fitfo_pro_access(profile):
        count = supabase_db.get_ai_coach_usage_count(profile_id, session_key)
        if count >= 2:
            raise HTTPException(
                status_code=402,
                detail="You've used your 2 AI Coach queries for this workout.",
            )

    history = [
        corpus_chat.ChatTurn(role=turn.role, content=turn.content)
        for turn in body.history
    ]
    try:
        result = await corpus_chat.answer(
            body.message,
            history=history,
            creator_id=body.creator_id,
            muscle_groups=body.muscle_groups,
            goals=body.goals,
            workout=_coerce_workout(body.workout),
            top_k=body.top_k,
        )
    except corpus_chat.ChatError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        _log.exception("[chat] failure")
        raise HTTPException(status_code=500, detail=f"chat failed: {exc}") from exc

    if not profile_has_fitfo_pro_access(profile):
        supabase_db.increment_ai_coach_usage(profile_id, session_key)

    return ChatResponse(
        answer=result.answer,
        citations=[
            ChatCitationSchema(
                index=cite.index,
                chunk_id=cite.chunk_id,
                source_url=cite.source_url,
                snippet=cite.snippet,
            )
            for cite in result.citations
        ],
        retrieval=[
            RetrievedChunkSchema(
                chunk_id=chunk.chunk_id,
                source_id=chunk.source_id,
                source_url=chunk.source_url,
                chunk_text=chunk.chunk_text,
                chunk_type=chunk.chunk_type,
                exercise=chunk.exercise,
                muscle_group=chunk.muscle_group,
                equipment=chunk.equipment,
                goal=chunk.goal,
                similarity=chunk.similarity,
            )
            for chunk in result.retrieval
        ],
        model=result.model,
    )
