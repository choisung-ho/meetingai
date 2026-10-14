from datetime import date, datetime
import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.validation import NormalizedEmailStr, OptionalShortTextStr, PasswordStr, SafeNameStr


class AuthRegister(BaseModel):
    name: SafeNameStr
    email: NormalizedEmailStr
    birth_date: date
    password: PasswordStr
    password_confirm: PasswordStr
    organization_team_name: OptionalShortTextStr | None = None
    terms_agreed: bool
    terms_version: OptionalShortTextStr = "v1"

    @model_validator(mode="after")
    def validate_register(self):
        if self.password != self.password_confirm:
            raise ValueError("비밀번호와 비밀번호확인이 일치하지 않습니다.")
        if len(self.password) < 8:
            raise ValueError("비밀번호는 8자 이상이어야 합니다.")
        if (
            not re.search(r"[A-Za-z]", self.password)
            or not re.search(r"\d", self.password)
            or not re.search(r"[!@#$%^&*]", self.password)
        ):
            raise ValueError("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.")
        if not self.terms_agreed:
            raise ValueError("약관동의가 필요합니다.")
        return self


class AuthLogin(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: NormalizedEmailStr | None = None
    user_id: OptionalShortTextStr | None = None
    password: PasswordStr
    remember_me: bool = Field(default=False, alias="rememberMe")

    @model_validator(mode="after")
    def validate_login(self):
        if not self.email and not self.user_id:
            raise ValueError("이메일 또는 사용자 ID가 필요합니다.")
        return self


class UserLogin(AuthLogin):
    pass


class AuthResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    birth_date: date
    organization_team_name: str | None
    terms_agreed: bool
    terms_agreed_at: datetime | None
    terms_version: str
    created_at: datetime
    updated_at: datetime


class AuthMeResponse(BaseModel):
    id: int
    userId: int
    name: str
    userName: str
    email: str
    organization_team_name: str | None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    accessToken: str
    refreshToken: str
    token_type: str
    defaultWorkspaceId: int
    userId: int
    name: str
    userName: str
    email: str


class TokenRefreshRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    refresh_token: str | None = Field(default=None, alias="refreshToken")
    access_token: str | None = Field(default=None, alias="accessToken")


class TokenRefreshResponse(BaseModel):
    success: bool
    access_token: str
    refresh_token: str | None = None
    accessToken: str
    refreshToken: str | None = None
    token_type: str
    message: str
    userId: int | None = None
    name: str | None = None
    userName: str | None = None
    email: str | None = None
