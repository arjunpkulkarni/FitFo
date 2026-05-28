from typing import List, Literal, Optional

from pydantic import BaseModel, Field


AuthIntent = Literal["login", "signup"]
OnboardingGoal = Literal[
    "build_muscle",
    "lose_fat",
    "get_stronger",
    "improve_cardio",
    "stay_active",
    "athletic_performance",
]
TrainingSplit = Literal[
    "ppl",
    "upper_lower",
    "bro_split",
    "full_body",
    "five_three_one",
    "arnold_split",
    "custom",
]
ExperienceLevel = Literal["beginner", "intermediate", "advanced"]
OnboardingSex = Literal["male", "female", "prefer_not_to_say"]


class UserOnboardingResponse(BaseModel):
    goals: List[OnboardingGoal] = Field(default_factory=list)
    sex: Optional[OnboardingSex] = None
    training_split: TrainingSplit
    custom_split_notes: Optional[str] = Field(default=None, max_length=500)
    days_per_week: int = Field(..., ge=1, le=7)
    weight_lbs: float = Field(..., gt=0, le=1000)
    height_inches: int = Field(..., ge=36, le=96)
    experience_level: ExperienceLevel
    age: int = Field(..., ge=13, le=120)
    completed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: str
    full_name: str
    username: Optional[str] = None
    instagram_handle: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    apple_user_id: Optional[str] = None
    avatar_url: Optional[str] = None
    onboarding: Optional[UserOnboardingResponse] = None
    free_access_started_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    #: When true, the API grants Fitfo Pro without RevenueCat (allowlisted account).
    fitfo_pro_bypass: bool = False


class AccountStatusRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=32)


class AccountStatusResponse(BaseModel):
    ok: bool
    exists: bool
    normalized_phone: str
    message: str


class SendOtpRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=32)
    intent: AuthIntent
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)


class SendOtpResponse(BaseModel):
    ok: bool
    status: str
    normalized_phone: str
    message: str


class VerifyOtpRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=32)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    intent: AuthIntent
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)


class VerifyOtpResponse(BaseModel):
    ok: bool
    verified: bool
    access_token: str
    token_type: str
    profile: UserProfileResponse
    message: str


class MeResponse(BaseModel):
    ok: bool
    profile: UserProfileResponse


class PatchProfileRequest(BaseModel):
    """Update mutable profile fields (display name today; extend as needed)."""

    full_name: str = Field(..., min_length=1, max_length=120)


class UsernameCheckResponse(BaseModel):
    ok: bool
    username: str
    available: bool
    message: str


class SaveUsernameRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)


class SaveUsernameResponse(BaseModel):
    ok: bool
    profile: UserProfileResponse
    message: str


class SaveInstagramHandleRequest(BaseModel):
    instagram_handle: str = Field(..., min_length=1, max_length=30)


class SaveInstagramHandleResponse(BaseModel):
    ok: bool
    profile: UserProfileResponse
    message: str


class RegisterExpoPushTokenRequest(BaseModel):
    """Expo device push token from Notifications.getExpoPushTokenAsync."""

    expo_push_token: str = Field(..., min_length=16, max_length=512)


class RegisterExpoPushTokenResponse(BaseModel):
    ok: bool


class AppleSignInRequest(BaseModel):
    identity_token: str = Field(..., min_length=1)
    raw_nonce: Optional[str] = None
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[str] = Field(default=None, max_length=320)


class AppleSignInResponse(BaseModel):
    ok: bool
    verified: bool
    access_token: str
    token_type: str
    profile: UserProfileResponse
    message: str


class SaveOnboardingRequest(BaseModel):
    goals: List[OnboardingGoal] = Field(..., min_length=1, max_length=6)
    sex: OnboardingSex
    training_split: TrainingSplit
    custom_split_notes: Optional[str] = Field(default=None, max_length=500)
    days_per_week: int = Field(..., ge=1, le=7)
    weight_lbs: float = Field(..., gt=0, le=1000)
    height_inches: int = Field(..., ge=36, le=96)
    experience_level: ExperienceLevel
    age: int = Field(..., ge=13, le=120)
    birth_date: Optional[str] = Field(
        default=None,
        description="ISO calendar date YYYY-MM-DD from onboarding birthday step.",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )


class SaveOnboardingResponse(BaseModel):
    ok: bool
    profile: UserProfileResponse
    message: str


class StartFreeAccessResponse(BaseModel):
    ok: bool
    profile: UserProfileResponse
    message: str


class DeleteAccountResponse(BaseModel):
    ok: bool
    message: str
    apple_revoked: bool
