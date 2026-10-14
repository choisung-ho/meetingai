export type AuthRole = "admin" | "member";

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  userId: number | string;
  name: string;
  userName: string;
  email: string;
  organizationTeamName: string | null;
  organization_team_name?: string | null;
  organizationId?: string;
  role?: AuthRole;
};

export type AuthUserPayload = {
  id?: number | string;
  userId?: number | string;
  user_id?: number | string;
  name?: string | null;
  userName?: string | null;
  email?: string | null;
  organization_team_name?: string | null;
  organizationTeamName?: string | null;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
  defaultWorkspaceId: number;
  user: AuthUser | null;
};

export type ServerLoginResponse = {
  access_token?: string;
  refresh_token?: string;
  accessToken?: string;
  refreshToken?: string;
  token_type: "bearer";
  tokenType?: "bearer";
  defaultWorkspaceId: number;
} & AuthUserPayload;

export type RefreshResponse = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType: "bearer";
  user: AuthUser | null;
};

export type ServerRefreshResponse = {
  success?: boolean;
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  token_type?: "bearer";
  tokenType?: "bearer";
  message?: string;
} & AuthUserPayload;

export type AuthMeResponse = AuthUser;

export type ServerAuthMeResponse = {
  status?: string;
  data?: AuthUserPayload;
} & AuthUserPayload;

export type SignupRequest = {
  name: string;
  email: string;
  birthDate: string;
  password: string;
  passwordConfirm: string;
  organizationTeamName: string;
  termsAgreed: boolean;
  termsVersion: string;
};

export type ServerSignupRequest = {
  name: string;
  email: string;
  birth_date: string;
  password: string;
  password_confirm: string;
  organization_team_name: string;
  terms_agreed: boolean;
  terms_version: string;
};

export type SignupResponse = {
  id: number;
  name: string;
  email: string;
  birthDate: string;
  organizationTeamName: string;
  termsAgreed: boolean;
  termsAgreedAt: string;
  termsVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type ServerSignupResponse = {
  id: number;
  name: string;
  email: string;
  birth_date: string;
  organization_team_name: string;
  terms_agreed: boolean;
  terms_agreed_at: string;
  terms_version: string;
  created_at: string;
  updated_at: string;
};
