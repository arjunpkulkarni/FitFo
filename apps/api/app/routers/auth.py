import logging
import os
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from twilio.base.exceptions import TwilioRestException

from app.routers.deps import require_access_payload, require_profile_id
from app.services.fitfo_pro_access import embed_fitfo_pro_bypass
from app.schemas.auth import (
    AccountStatusRequest,
    AccountStatusResponse,
    AppleSignInRequest,
    AppleSignInResponse,
    DeleteAccountResponse,
    MeResponse,
    PatchProfileRequest,
    RegisterExpoPushTokenRequest,
    RegisterExpoPushTokenResponse,
    SaveOnboardingRequest,
    SaveOnboardingResponse,
    SendOtpRequest,
    SendOtpResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services import apple_auth, jwt_auth, supabase_db, twilio_verify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _reviewer_credentials() -> Optional[Tuple[str, str]]:
    """
    Return (normalized_phone, code) for the Apple App Review demo account,
    or None when the bypass is not configured.

    Setting REVIEWER_PHONE + REVIEWER_OTP_CODE on the API lets the App Review
    team sign in without Twilio-delivered SMS. These credentials go in App
    Store Connect → App Review Information → Demo Account.
    """
    phone = (os.environ.get("REVIEWER_PHONE") or "").strip()
    code = (os.environ.get("REVIEWER_OTP_CODE") or "").strip()
    if not phone or not code:
        return None
    try:
        normalized = supabase_db.normalize_phone_number(phone)
    except ValueError:
        return None
    return normalized, code


def _is_reviewer_request(normalized_phone: str, code: Optional[str] = None) -> bool:
    creds = _reviewer_credentials()
    if creds is None:
        return False
    expected_phone, expected_code = creds
    if normalized_phone != expected_phone:
        return False
    if code is None:
        return True
    return code == expected_code


def _normalize_and_lookup(phone: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    canonical = supabase_db.normalize_phone_number(phone)
    # Pass raw input so lookups can fall back to legacy profile.phone keys when needed.
    profile = supabase_db.get_profile_by_phone(phone)
    return canonical, profile


def _clean_signup_name(full_name: Optional[str]) -> str:
    clean_name = (full_name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Full name is required to sign up.")
    return clean_name


def _clean_onboarding_payload(body: SaveOnboardingRequest) -> Dict[str, Any]:
    goals: List[str] = []
    seen_goals: Set[str] = set()
    for goal in body.goals:
        value = str(goal).strip()
        if value and value not in seen_goals:
            goals.append(value)
            seen_goals.add(value)

    if not goals:
        raise HTTPException(status_code=400, detail="Pick at least one goal.")

    sex = str(body.sex).strip()
    training_split = str(body.training_split)
    raw_notes = (body.custom_split_notes or "").strip()
    custom_split_notes: Optional[str] = raw_notes or None

    if training_split == "custom":
        if not custom_split_notes:
            raise HTTPException(
                status_code=400,
                detail="Describe your custom split so we can tailor your plan.",
            )
    else:
        custom_split_notes = None

    return {
        "goals": goals,
        "sex": sex,
        "training_split": training_split,
        "custom_split_notes": custom_split_notes,
        "days_per_week": body.days_per_week,
        "weight_lbs": body.weight_lbs,
        "height_inches": body.height_inches,
        "experience_level": str(body.experience_level),
        "age": body.age,
    }


@router.post("/account-status", response_model=AccountStatusResponse)
def account_status(body: AccountStatusRequest) -> AccountStatusResponse:
    try:
        normalized_phone, existing = _normalize_and_lookup(body.phone)

        # Apple App Review demo bypass — report the reviewer phone as an
        # existing account even if the profile row hasn't been auto-provisioned
        # yet. Without this, the mobile client's pre-flight account-status
        # check short-circuits the login flow with "No account found" and the
        # reviewer never reaches send-otp / verify-otp where the real bypass
        # lives.
        if _is_reviewer_request(normalized_phone):
            return AccountStatusResponse(
                ok=True,
                exists=True,
                normalized_phone=normalized_phone,
                message="Reviewer demo account ready.",
            )

        return AccountStatusResponse(
            ok=True,
            exists=existing is not None,
            normalized_phone=normalized_phone,
            message=(
                "You already have an account. Please log in."
                if existing is not None
                else "No account found for that phone number. Please sign up first."
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check account status: {exc}",
        ) from exc


@router.post("/send-otp", response_model=SendOtpResponse)
def send_otp(body: SendOtpRequest) -> SendOtpResponse:
    try:
        normalized_phone, existing = _normalize_and_lookup(body.phone)

        # Apple App Review demo bypass — short-circuit BEFORE the login/signup
        # existence checks so the reviewer can use either flow with the demo
        # phone and never needs SMS delivery to work.
        if _is_reviewer_request(normalized_phone):
            return SendOtpResponse(
                ok=True,
                status="approved",
                normalized_phone=normalized_phone,
                message="Reviewer demo account: enter the demo code to continue.",
            )

        if body.intent == "login":
            if existing is None:
                raise HTTPException(
                    status_code=400,
                    detail="No account found for that phone number. Please sign up first.",
                )
        else:
            _clean_signup_name(body.full_name)
            if existing is not None:
                raise HTTPException(
                    status_code=400,
                    detail="You already have an account. Please log in.",
                )

        verification = twilio_verify.send_sms_otp(normalized_phone)
        return SendOtpResponse(
            ok=True,
            status=str(getattr(verification, "status", "pending")),
            normalized_phone=normalized_phone,
            message=f"We sent a 6-digit code to {normalized_phone}.",
        )
    except HTTPException as exc:
        logger.warning(
            "send_otp rejected intent=%s status=%s detail=%s",
            body.intent,
            exc.status_code,
            getattr(exc, "detail", ""),
        )
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (
        supabase_db.SupabaseNotConfiguredError,
        twilio_verify.TwilioNotConfiguredError,
        jwt_auth.JwtNotConfiguredError,
    ) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TwilioRestException as exc:
        detail = str(exc.msg or exc)
        logger.warning(
            "send_otp Twilio failure intent=%s detail=%s", body.intent, detail,
        )
        raise HTTPException(status_code=400, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP: {exc}") from exc


@router.post("/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(body: VerifyOtpRequest) -> VerifyOtpResponse:
    try:
        normalized_phone, existing = _normalize_and_lookup(body.phone)

        # Apple App Review demo bypass — compare against the env-configured
        # reviewer code first so we never round-trip to Twilio for the demo
        # account. Any other phone number goes through the normal flow.
        if _is_reviewer_request(normalized_phone, body.code):
            pass
        else:
            verification_check = twilio_verify.check_sms_otp(
                normalized_phone, body.code
            )

            is_valid = bool(getattr(verification_check, "valid", False))
            status_value = str(getattr(verification_check, "status", "") or "")
            if not is_valid and status_value.lower() != "approved":
                raise HTTPException(
                    status_code=400, detail="Invalid or expired verification code."
                )

        is_reviewer = _is_reviewer_request(normalized_phone, body.code)

        if body.intent == "login":
            if existing is None:
                if is_reviewer:
                    # Auto-provision the demo profile so the App Review team
                    # can log in even before anyone signs the account up.
                    profile = supabase_db.create_profile(
                        full_name="App Review",
                        phone=normalized_phone,
                    )
                    message = "Reviewer demo account created."
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="No account found for that phone number. Please sign up first.",
                    )
            else:
                profile = existing
                message = "Welcome back."
        else:
            if existing is not None:
                if is_reviewer:
                    # Reviewer tried to sign up again — just log them in.
                    profile = existing
                    message = "Welcome back."
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="You already have an account. Please log in.",
                    )
            else:
                profile = supabase_db.create_profile(
                    full_name=_clean_signup_name(body.full_name),
                    phone=normalized_phone,
                )
                message = "Account created."

        access_token = jwt_auth.create_access_token(
            subject=str(profile["id"]),
            phone=str(profile["phone"]),
        )
        return VerifyOtpResponse(
            ok=True,
            verified=True,
            access_token=access_token,
            token_type="bearer",
            profile=embed_fitfo_pro_bypass(profile),
            message=message,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (
        supabase_db.SupabaseNotConfiguredError,
        twilio_verify.TwilioNotConfiguredError,
        jwt_auth.JwtNotConfiguredError,
    ) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TwilioRestException as exc:
        detail = str(exc.msg or exc)
        raise HTTPException(status_code=400, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to verify OTP: {exc}") from exc


@router.post("/apple", response_model=AppleSignInResponse)
def apple_sign_in(body: AppleSignInRequest) -> AppleSignInResponse:
    """
    Verify an Apple identity token, upsert the profile keyed by Apple's stable
    `sub` claim, and return our own access token just like phone verify-otp does.
    """
    try:
        payload = apple_auth.verify_identity_token(
            body.identity_token,
            raw_nonce=body.raw_nonce,
        )
    except apple_auth.AppleAuthConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except apple_auth.AppleAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    apple_user_id = str(payload.get("sub") or "").strip()
    if not apple_user_id:
        raise HTTPException(
            status_code=400, detail="Apple identity token is missing a subject."
        )

    # Apple only returns email on the very first sign-in. Prefer the value from
    # the token (verified) over what the client echoes back, but fall back to
    # the client-supplied value on subsequent logins where the token omits it.
    token_email = payload.get("email")
    email = None
    if isinstance(token_email, str) and token_email.strip():
        email = token_email.strip()
    elif body.email:
        email = body.email.strip()

    try:
        existing = supabase_db.get_profile_by_apple_user_id(apple_user_id)
        if existing is not None:
            # Patch any fields Apple might have sent on this sign-in that we
            # didn't have before (e.g. user re-authorized after revoking).
            updated = supabase_db.update_profile_apple_fields(
                str(existing["id"]),
                full_name=body.full_name,
                email=email,
            )
            profile = updated or existing
            message = "Welcome back."
        else:
            profile = supabase_db.create_profile_with_apple(
                apple_user_id=apple_user_id,
                full_name=body.full_name,
                email=email,
            )
            message = "Account created."

        access_token = jwt_auth.create_access_token(
            subject=str(profile["id"]),
            phone=str(profile.get("phone") or ""),
        )
        return AppleSignInResponse(
            ok=True,
            verified=True,
            access_token=access_token,
            token_type="bearer",
            profile=embed_fitfo_pro_bypass(profile),
            message=message,
        )
    except HTTPException:
        raise
    except (
        supabase_db.SupabaseNotConfiguredError,
        jwt_auth.JwtNotConfiguredError,
    ) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to sign in with Apple: {exc}"
        ) from exc


@router.patch("/me", response_model=MeResponse)
def patch_me(
    body: PatchProfileRequest,
    profile_id: str = Depends(require_profile_id),
) -> MeResponse:
    """
    Update profile fields for the authenticated user.
    """
    try:
        profile = supabase_db.update_profile_full_name(
            profile_id, full_name=body.full_name
        )
        return MeResponse(ok=True, profile=embed_fitfo_pro_bypass(profile))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except supabase_db.ProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HTTPException:
        raise
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to update profile: {exc}"
        ) from exc


@router.post("/expo-push-token", response_model=RegisterExpoPushTokenResponse)
def register_expo_push_token(
    body: RegisterExpoPushTokenRequest,
    profile_id: str = Depends(require_profile_id),
) -> RegisterExpoPushTokenResponse:
    """Persist Expo push token so the API can notify when imports finish."""
    try:
        supabase_db.upsert_expo_push_token(profile_id, body.expo_push_token)
        return RegisterExpoPushTokenResponse(ok=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to register push token: {exc}"
        ) from exc


@router.get("/me", response_model=MeResponse)
def me(payload: Dict[str, Any] = Depends(require_access_payload)) -> MeResponse:
    try:
        profile_id = str(payload["sub"])
        profile = supabase_db.get_profile_by_id(profile_id)
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not found for this access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return MeResponse(ok=True, profile=embed_fitfo_pro_bypass(profile))
    except HTTPException:
        raise
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load profile: {exc}") from exc


@router.delete("/me", response_model=DeleteAccountResponse)
def delete_account(
    profile_id: str = Depends(require_profile_id),
) -> DeleteAccountResponse:
    """
    Permanently delete the authenticated user's account and every row owned
    by it. Required by App Store Guideline 5.1.1(v).

    For Apple Sign In users we also ask Apple to revoke the refresh token so
    the app disappears from Settings → Apple ID → Apps Using Apple ID. This
    revocation is best-effort:
      - If APPLE_SIGNIN_* env vars are not configured we skip it (and log a
        warning) and still delete the local account.
      - If Apple returns an error we still delete locally. The user can
        manually revoke from iOS Settings.

    This matches the behavior of most production apps and keeps account
    deletion reliable even during upstream outages.
    """
    try:
        snapshot = supabase_db.get_profile_by_id(profile_id)
        if snapshot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Account not found for this access token.",
            )

        # Revoke Apple first — if the profile row is already gone we lose the
        # refresh token and can never revoke. If revocation fails we still
        # continue and delete locally so the user's request is honored.
        apple_revoked = False
        apple_refresh_token = str(snapshot.get("apple_refresh_token") or "").strip()
        if apple_refresh_token:
            try:
                apple_revoked = apple_auth.revoke_refresh_token(apple_refresh_token)
            except Exception:
                apple_revoked = False

        supabase_db.delete_profile(profile_id)

        return DeleteAccountResponse(
            ok=True,
            message="Your account and all associated data have been deleted.",
            apple_revoked=apple_revoked,
        )
    except HTTPException:
        raise
    except supabase_db.ProfileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete account: {exc}"
        ) from exc


@router.put("/onboarding", response_model=SaveOnboardingResponse)
def save_onboarding(
    body: SaveOnboardingRequest,
    profile_id: str = Depends(require_profile_id),
) -> SaveOnboardingResponse:
    try:
        supabase_db.upsert_profile_onboarding(
            profile_id,
            **_clean_onboarding_payload(body),
        )
        profile = supabase_db.get_profile_by_id(profile_id)
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found for this access token.",
            )
        return SaveOnboardingResponse(
            ok=True,
            profile=embed_fitfo_pro_bypass(profile),
            message="Onboarding saved.",
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except supabase_db.SupabaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save onboarding: {exc}") from exc
