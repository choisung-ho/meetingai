import type { WorkspaceRole } from "../types/workspace.types";

export const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: "소유자",
  ADMIN: "관리자",
  MEMBER: "일반 멤버",
};

export const INVITABLE_WORKSPACE_ROLES = [
  { label: WORKSPACE_ROLE_LABEL.MEMBER, value: "MEMBER" },
  { label: WORKSPACE_ROLE_LABEL.ADMIN, value: "ADMIN" },
] as const satisfies readonly {
  label: string;
  value: Exclude<WorkspaceRole, "OWNER">;
}[];
