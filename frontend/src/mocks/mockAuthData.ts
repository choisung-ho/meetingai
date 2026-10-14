import type { LoginResponse } from "../types/auth.types";

export const mockLoginResponse: LoginResponse = {
  accessToken: "mock_jwt_token",
  refreshToken: "mock_refresh_token",
  tokenType: "bearer",
  defaultWorkspaceId: 1,
  user: {
    id: "mock-user",
    userId: "mock-user",
    name: "Mock User",
    userName: "Mock User",
    email: "",
    organizationTeamName: null,
    organization_team_name: null,
  },
};
