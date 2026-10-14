import { useCallback, useState } from "react";

import {
  acceptWorkspaceInvitation,
  getMyWorkspaceInvitations,
  inviteWorkspaceMember,
  rejectWorkspaceInvitation,
  WorkspaceApiError,
} from "../services/workspaceService";
import type { InviteWorkspaceRequest, WorkspaceInvitation } from "../types/workspace.types";

export function useWorkspace() {
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [isInvitationLoading, setIsInvitationLoading] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [isInvitationPollingBlocked, setIsInvitationPollingBlocked] =
    useState(false);

  const inviteMember = useCallback(
    async (
      workspaceId: number,
      email: string,
      role: InviteWorkspaceRequest["role"] = "MEMBER"
    ) => {
      const trimmedEmail = email.trim();

      if (!workspaceId) {
        throw new Error("워크스페이스를 선택해야 합니다.");
      }

      if (!trimmedEmail) {
        throw new Error("이메일을 입력하세요.");
      }

      const result = await inviteWorkspaceMember(workspaceId, {
        email: trimmedEmail,
        role,
      });

      return result;
    },
    []
  );

  const fetchMyInvitations = useCallback(async () => {
    try {
      setIsInvitationLoading(true);
      setInvitationError(null);

      const nextInvitations = await getMyWorkspaceInvitations();
      setInvitations(nextInvitations);
      setIsInvitationPollingBlocked(false);
    } catch (error) {
      if (
        error instanceof WorkspaceApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setIsInvitationPollingBlocked(true);
      }

      setInvitationError(
        error instanceof Error
          ? error.message
          : "받은 초대 목록 조회에 실패했습니다."
      );
    } finally {
      setIsInvitationLoading(false);
    }
  }, []);

  const acceptInvitation = useCallback(
    async (invitationId: number) => {
      if (!invitationId) {
        throw new Error("초대를 선택해야 합니다.");
      }

      const result = await acceptWorkspaceInvitation(invitationId);
      await fetchMyInvitations();

      return result;
    },
    [fetchMyInvitations]
  );

  const rejectInvitation = useCallback(
    async (invitationId: number) => {
      if (!invitationId) {
        throw new Error("초대를 선택해야 합니다.");
      }

      const result = await rejectWorkspaceInvitation(invitationId);
      await fetchMyInvitations();

      return result;
    },
    [fetchMyInvitations]
  );

  return {
    invitations,
    isInvitationLoading,
    invitationError,
    isInvitationPollingBlocked,
    inviteMember,
    fetchMyInvitations,
    acceptInvitation,
    rejectInvitation,
  };
}
