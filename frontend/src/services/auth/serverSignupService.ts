import { API_BASE_URL } from "../../constants/authConfig";

import type {
  ServerSignupRequest,
  ServerSignupResponse,
  SignupRequest,
  SignupResponse,
} from "../../types/auth.types";
import { parseApiError } from "../apiError";

export async function serverSignup(
  request: SignupRequest
): Promise<SignupResponse> {
  const requestBody: ServerSignupRequest = {
    name: request.name,
    email: request.email,
    birth_date: request.birthDate,
    password: request.password,
    password_confirm: request.passwordConfirm,
    organization_team_name: request.organizationTeamName,
    terms_agreed: request.termsAgreed,
    terms_version: request.termsVersion,
  };

  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw await parseApiError(response, "회원가입 요청에 실패했습니다.");
  }

  const data: ServerSignupResponse = await response.json();

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    birthDate: data.birth_date,
    organizationTeamName: data.organization_team_name,
    termsAgreed: data.terms_agreed,
    termsAgreedAt: data.terms_agreed_at,
    termsVersion: data.terms_version,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
