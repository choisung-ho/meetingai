import { useCallback, useEffect, useState } from "react";

import {
  getWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  WorkspaceApiError,
} from "../services/workspaceService";
import { showToast } from "../store/toastStore";
import type { WorkspaceMember, WorkspaceRole } from "../types/workspace.types";

type ManageableRole = Exclude<WorkspaceRole, "OWNER">;

/**
 * 워크스페이스 멤버 목록 / 권한 변경 / 제거 상태 관리
 *
 * 서버 권한 정책을 그대로 따르므로, 실패 시 낙관적 업데이트를 되돌리고
 * 서버 메시지를 토스트로 노출한다.
 */
export function useWorkspaceMembers(workspaceId: number | null) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) {
      setMembers([]);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const nextMembers = await getWorkspaceMembers(workspaceId);
      setMembers(nextMembers);
    } catch (error) {
      const message =
        error instanceof WorkspaceApiError
          ? error.message
          : "멤버 목록을 불러오지 못했습니다.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // Start after the current commit so loading state changes are driven by
    // the async request rather than synchronously during effect execution.
    let cancelled = false;
    const requestTimer = window.setTimeout(() => {
      if (!cancelled) {
        void fetchMembers();
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(requestTimer);
    };
  }, [fetchMembers]);

  const changeMemberRole = useCallback(
    async (targetUserId: number, role: ManageableRole) => {
      if (!workspaceId) return;

      const previousMembers = members;

      // 낙관적 업데이트: 실패하면 이전 상태로 되돌린다.
      setMembers((current) =>
        current.map((member) =>
          member.userId === targetUserId ? { ...member, role } : member
        )
      );

      try {
        const updated = await updateWorkspaceMemberRole(
          workspaceId,
          targetUserId,
          role
        );

        setMembers((current) =>
          current.map((member) =>
            member.userId === targetUserId ? updated : member
          )
        );
        showToast("권한을 변경했습니다.", "success");
      } catch (error) {
        setMembers(previousMembers);
        const message =
          error instanceof WorkspaceApiError
            ? error.message
            : "권한 변경에 실패했습니다.";
        showToast(message, "error");
      }
    },
    [workspaceId, members]
  );

  const removeMember = useCallback(
    async (targetUserId: number) => {
      if (!workspaceId) return;

      const previousMembers = members;

      setMembers((current) =>
        current.filter((member) => member.userId !== targetUserId)
      );

      try {
        await removeWorkspaceMember(workspaceId, targetUserId);
        showToast("멤버를 제거했습니다.", "success");
      } catch (error) {
        setMembers(previousMembers);
        const message =
          error instanceof WorkspaceApiError
            ? error.message
            : "멤버 제거에 실패했습니다.";
        showToast(message, "error");
      }
    },
    [workspaceId, members]
  );

  return {
    members,
    isLoading,
    errorMessage,
    fetchMembers,
    changeMemberRole,
    removeMember,
  };
}
