import type { WorkspaceRole } from "../types/workspace.types";

export const isAdminOrOwner = (role?: WorkspaceRole | null) =>
  role === "OWNER" || role === "ADMIN";

export const canDeleteMeeting = (role?: WorkspaceRole | null) =>
  isAdminOrOwner(role);

export const canInviteWorkspaceMember = (
  role?: WorkspaceRole | null,
  canInviteMember?: boolean
) => canInviteMember === true && isAdminOrOwner(role);
