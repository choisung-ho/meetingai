/**
 * 파일 역할: 회의 진행 화면의 Container입니다.
 * - SocketProvider context에서 WebSocket/Presence 상태를 받아 사용합니다.
 * - Hook/Store에서 받은 데이터를 MeetingLivePage가 쓸 props 형태로 정리합니다.
 * - 워크스페이스 입장 후 MeetingRoom 계층 명세에 맞춰 회의실 입장을 추가 처리합니다.
 * - UI 직접 구현이 아니라, 데이터와 actions를 Page에 전달하는 연결 계층입니다.
 */

import { useEffect, useRef, useState } from "react";

import { MeetingLivePage } from "../pages/MeetingLivePage";
import { useMeetingLiveSocketContext, useSocketContext } from "../app/providers/SocketProvider";
import { useAuthStore } from "../store/authStore";
import { useDocumentStore } from "../store/documentStore";
import { useUpload } from "../hooks/useUpload";
import { useMeetingAudio } from "../hooks/useMeetingAudio";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { createWorkspace, getWorkspace } from "../services/workspaceService";


export function MeetingLiveContainer() {
  const navigate = useNavigate();

  /**
   * 기존:
   * - URL query userId/name 기반 테스트 사용자
   *
   * 변경:
   * - 로그인 성공 후 authStore.user 기준 사용자
   *
   * 주의:
   * - 아직 새로고침 시 authStore 복원 로직이 없으면 user가 null일 수 있음
   * - 그래서 임시 fallback으로 guest-user를 둠
   * 
   * 
   */

  const { meetingId } = useParams();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);

  const workspaceIdFromUrl = queryParams.get("workspaceId");
  const meetingRoomIdFromUrl = queryParams.get("meetingRoomId");

  const routeWorkspaceId =
    workspaceIdFromUrl && workspaceIdFromUrl !== "undefined"
      ? Number(workspaceIdFromUrl)
      : null;

  const routeMeetingId =
    meetingId && meetingId !== "undefined"
      ? Number(meetingId)
      : null;

  const routeMeetingRoomId =
    meetingRoomIdFromUrl && meetingRoomIdFromUrl !== "undefined"
      ? Number(meetingRoomIdFromUrl)
      : null;


  const accessToken = useAuthStore((state) => state.accessToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  const storedLastWorkspaceId = Number(localStorage.getItem("lastWorkspaceId"));
  const selectedWorkspaceId =
    routeWorkspaceId ??
    (Number.isFinite(storedLastWorkspaceId) && storedLastWorkspaceId > 0
      ? storedLastWorkspaceId
      : null);
  const selectedMeetingId = routeMeetingId;
  const selectedMeetingRoomId = routeMeetingId ? routeMeetingRoomId ?? 1 : null;

  const presence = useMeetingLiveSocketContext();
  const socket = useSocketContext();
  const meetingAudio = useMeetingAudio({
    workspaceId: selectedWorkspaceId,
    meetingId: selectedMeetingId,
  });
  const documents = useDocumentStore((state) => state.documents);
  const { attachFile } = useUpload({ meetingId: selectedMeetingId });
  const meetingDocuments =
    selectedMeetingId && Number.isFinite(selectedMeetingId)
      ? documents.filter((document) => document.meetingId === selectedMeetingId)
      : [];
  const hasEndMeetingRequestedRef = useRef(false);
  const isNavigatingSummaryRef = useRef(false);
  const requestedDocumentsKeyRef = useRef<string | null>(null);
  const requestedMeetingKeyRef = useRef<string | null>(null);
  const joinMeetingRoomAction = presence.actions.joinMeetingRoom;
  const getDocumentsAction = presence.actions.getDocuments;
  const getMeetingAction = socket.actions.getMeeting;
  const deleteDocumentAction = presence.actions.deleteDocument;
  const selectedMeeting = presence.meeting.meetings.find(
    (meeting) => Number(meeting.id) === selectedMeetingId
  ) ?? (
    Number(presence.meeting.lastCreatedMeeting?.id) === selectedMeetingId
      ? presence.meeting.lastCreatedMeeting
      : null
  ) ?? (
    Number(presence.meeting.lastFetchedMeeting?.id) === selectedMeetingId
      ? presence.meeting.lastFetchedMeeting
      : null
  );
  const isSelectedMeetingActive = selectedMeeting?.status === "ACTIVE";
  const isSelectedMeetingEnded = selectedMeeting?.status === "ENDED";

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    localStorage.setItem("lastWorkspaceId", String(selectedWorkspaceId));
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let ignore = false;

    const loadWorkspaceName = async () => {
      if (!selectedWorkspaceId) {
        setWorkspaceName(null);
        return;
      }

      try {
        const workspace = await getWorkspace(selectedWorkspaceId);
        if (ignore) return;
        setWorkspaceName(workspace.name ?? null);
      } catch (error) {
        if (ignore) return;
        console.warn("[LIVE_WORKSPACE_NAME:FETCH_FAILED]", {
          workspaceId: selectedWorkspaceId,
          error,
        });
        setWorkspaceName(null);
      }
    };

    loadWorkspaceName();

    return () => {
      ignore = true;
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    if (!selectedMeetingId) return;
    if (!selectedMeetingRoomId) return;
    if (isSelectedMeetingEnded) return;
    if (hasEndMeetingRequestedRef.current) return;
    if (isNavigatingSummaryRef.current) return;
    if (!presence.workspace.isWorkspaceJoined) return;
    if (
      presence.meetingRoom.workspaceId === selectedWorkspaceId &&
      presence.meetingRoom.meetingRoomId === selectedMeetingRoomId &&
      (presence.meetingRoom.status === "joining" ||
        presence.meetingRoom.status === "joined")
    ) {
      return;
    }

    joinMeetingRoomAction(
      selectedWorkspaceId,
      selectedMeetingId,
      selectedMeetingRoomId
    );
  }, [
    selectedWorkspaceId,
    selectedMeetingId,
    selectedMeetingRoomId,
    isSelectedMeetingEnded,
    presence.workspace.isWorkspaceJoined,
    presence.meetingRoom.workspaceId,
    presence.meetingRoom.meetingRoomId,
    presence.meetingRoom.status,
    joinMeetingRoomAction,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId || !selectedMeetingId) return;
    if (!presence.isSocketConnected || !presence.workspace.isWorkspaceJoined) return;
    if (selectedMeeting) return;

    const requestKey = `${selectedWorkspaceId}-${selectedMeetingId}`;
    if (requestedMeetingKeyRef.current === requestKey) return;
    requestedMeetingKeyRef.current = requestKey;
    getMeetingAction(selectedWorkspaceId, selectedMeetingId);
  }, [
    getMeetingAction,
    presence.isSocketConnected,
    presence.workspace.isWorkspaceJoined,
    selectedMeeting,
    selectedMeetingId,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!isSelectedMeetingEnded) return;
    if (!selectedWorkspaceId) return;
    if (!selectedMeetingId) return;
    if (isNavigatingSummaryRef.current) return;

    isNavigatingSummaryRef.current = true;

    console.log("[MEETING_STATUS_CHANGED:ENDED]");
    console.log("[SUMMARY:NAVIGATE]", {
      workspaceId: selectedWorkspaceId,
      meetingId: selectedMeetingId,
      meetingRoomId: selectedMeetingRoomId,
    });
    const targetUrl = `/meeting/summary?workspaceId=${selectedWorkspaceId}&meetingId=${selectedMeetingId}&meetingRoomId=${selectedMeetingRoomId}`;
    console.log("[NAVIGATE:SUMMARY]", targetUrl);
    navigate(targetUrl);
  }, [
    isSelectedMeetingEnded,
    navigate,
    selectedMeetingId,
    selectedMeetingRoomId,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    if (!selectedMeetingId) return;
    if (!selectedMeetingRoomId) return;
    if (!presence.isSocketConnected) {
      requestedDocumentsKeyRef.current = null;
      return;
    }
    if (!presence.meetingRoom.isMeetingRoomJoined) return;

    const requestKey = `${selectedWorkspaceId}-${selectedMeetingId}-${selectedMeetingRoomId}`;
    if (requestedDocumentsKeyRef.current === requestKey) return;

    requestedDocumentsKeyRef.current = requestKey;
    getDocumentsAction(
      selectedWorkspaceId,
      selectedMeetingId,
      selectedMeetingRoomId
    );
  }, [
    getDocumentsAction,
    presence.isSocketConnected,
    presence.meetingRoom.isMeetingRoomJoined,
    selectedMeetingId,
    selectedMeetingRoomId,
    selectedWorkspaceId,
  ]);

  if (!accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm font-bold text-slate-600">
        로그인이 필요합니다.
      </div>
    );
  }
  if (!selectedWorkspaceId || !presence.workspace.isWorkspaceJoined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm font-bold text-slate-600">
        워크스페이스에 연결하는 중입니다. 잠시만 기다려 주세요.
      </div>
    );
  }

  return (
    <MeetingLivePage
      workspaceName={workspaceName}
      meeting={{
        id: selectedMeetingId ?? 1,
        title: selectedMeeting?.title ?? "실시간 회의",
        status: selectedMeeting?.status ?? "READY",
        scheduledAt: selectedMeeting?.scheduledAt ?? null,
        startedAt: selectedMeeting?.startedAt ?? null,
        endedAt: selectedMeeting?.endedAt ?? null,
        createdAt: selectedMeeting?.createdAt ?? selectedMeeting?.created_at ?? null,
      }}
      state={{
        isIssueInputVisible: isSelectedMeetingActive,
      }}
      audio={{
        isRecording: meetingAudio.isRecording,
        isStarting: meetingAudio.isStarting,
        isProcessing: meetingAudio.isProcessing,
        errorMessage: meetingAudio.errorMessage,
      }}
      workspace={{
        workspaceId: presence.workspace.workspaceId,
        status: presence.workspace.status,
        users: presence.workspace.users,
        updatedAt: presence.workspace.updatedAt,
        errorMessage: presence.workspace.errorMessage,
        isWorkspaceJoined: presence.workspace.isWorkspaceJoined,
      }}
      meetingRoom={{
        workspaceId: presence.meetingRoom.workspaceId,
        meetingRoomId: presence.meetingRoom.meetingRoomId,
        status: presence.meetingRoom.status,
        users: presence.meetingRoom.users,
        updatedAt: presence.meetingRoom.updatedAt,
        errorMessage: presence.meetingRoom.errorMessage,
        isMeetingRoomJoined: presence.meetingRoom.isMeetingRoomJoined,
      }}
      issues={{
        items: presence.issues,
        isLoading: false,
        errorMessage: null,
      }}
      rediscussPopupAlert={presence.alerts.popupAlert}
      documents={meetingDocuments}
      actions={{
        openDashboardMenu: (menuId: string) => {
          const target = `/dashboard?workspaceId=${selectedWorkspaceId ?? ""}${menuId ? `&menu=${encodeURIComponent(menuId)}` : ""}`;
          navigate(target);
        },
        openSettings: () => navigate("/settings"),
        switchWorkspace: (workspaceIdValue: string) => {
          const nextWorkspaceId = Number(workspaceIdValue);
          if (!Number.isFinite(nextWorkspaceId) || nextWorkspaceId <= 0) return;
          navigate(`/dashboard?workspaceId=${nextWorkspaceId}`);
        },
        createWorkspace: async (name: string) => {
          const created = await createWorkspace({ name: name.trim() });
          if (!created?.id) throw new Error("워크스페이스 생성 응답이 올바르지 않습니다.");
          navigate(`/dashboard?workspaceId=${created.id}`);
        },
        logout: () => {
          if (selectedWorkspaceId) socket.actions.leaveWorkspace(selectedWorkspaceId);
          socket.actions.disconnect();
          socket.actions.clearWorkspaceData();
          clearAuth();
          navigate("/login");
        },
        openMeetingRecord: () => {
          if (!selectedMeetingId) return;
          if (presence.meetingRoom.isMeetingRoomJoined && selectedWorkspaceId && selectedMeetingRoomId) {
            presence.actions.leaveMeetingRoom(selectedWorkspaceId, selectedMeetingId, selectedMeetingRoomId);
          }
          navigate(`/meeting-records/${selectedMeetingId}?workspaceId=${selectedWorkspaceId ?? ""}&meetingRoomId=${selectedMeetingRoomId ?? 1}`);
        },
        startMeeting: () => {
          if (!selectedWorkspaceId) return;
          if (!selectedMeetingId) return;
          if (!presence.meetingRoom.isMeetingRoomJoined) return;
          if (isSelectedMeetingActive || isSelectedMeetingEnded) return;

          void (async () => {
            try {
              // 회의 시작과 동시에 실제 마이크 권한을 요청하고 녹음을 시작한다.
              await meetingAudio.startRecording();
              console.log("[USER] 실제 회의 시작 + 마이크 녹음 시작");
              presence.actions.startMeeting(
                selectedWorkspaceId,
                selectedMeetingId,
              );
            } catch (error) {
              console.error("[MICROPHONE:START_FAILED]", error);
              // WebSocket 요청이 실패하거나 권한 흐름이 중단되면 녹음 장치를
              // 열어 둔 채 화면만 READY로 남기지 않도록 정리한다.
              try {
                await meetingAudio.stopRecording();
              } catch {
                // startRecording 단계에서 실패한 경우에는 정리할 데이터가 없다.
              }
            }
          })();
        },

        createIssue: (text: string) => {
          if (isSelectedMeetingEnded) {
            console.warn("[CREATE_ISSUE:BLOCKED] meeting already ended");
            return;
          }

          const workspaceId = Number(selectedWorkspaceId);
          const meetingId = Number(selectedMeetingId);
          const joinedMeetingRoomId = Number(presence.meetingRoom.meetingRoomId);
          const meetingRoomId =
            Number.isFinite(joinedMeetingRoomId) && joinedMeetingRoomId > 0
              ? joinedMeetingRoomId
              : Number(selectedMeetingRoomId);
          const title = text.trim();

          if (
            !Number.isFinite(workspaceId) ||
            workspaceId <= 0 ||
            !Number.isFinite(meetingId) ||
            meetingId <= 0 ||
            !Number.isFinite(meetingRoomId) ||
            meetingRoomId <= 0 ||
            !title
          ) {
            console.error("[CREATE_ISSUE:BLOCKED] invalid payload", {
              workspaceId,
              meetingId,
              meetingRoomId,
              hasTitle: Boolean(title),
            });
            return;
          }

          console.log("[USER] 안건 생성");
          console.log("[CREATE_ISSUE:CALL]", {
            workspaceId,
            meetingId,
            meetingRoomId,
            title,
            status: "OPEN",
          });

          presence.actions.createIssue({
            workspaceId,
            meetingId,
            meetingRoomId,
            title,
            description: null,
            status: "OPEN",
            priority: "HIGH",
            dueDate: null,
            assigneeId: null,
          });
        },

        submitTranscriptText: (text: string) => {
          const rawText = text.trim();
          const workspaceId = Number(selectedWorkspaceId);
          const meetingId = Number(selectedMeetingId);

          if (!rawText) return;

          if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
            console.warn("[TRANSCRIPT:BLOCKED] missing workspaceId");
            return;
          }

          if (!Number.isFinite(meetingId) || meetingId <= 0) {
            console.warn("[TRANSCRIPT:BLOCKED] missing meetingId");
            return;
          }

          if (!presence.meetingRoom.isMeetingRoomJoined) {
            console.warn("[TRANSCRIPT:BLOCKED] 회의방 미입장");
            return;
          }

          // 실시간 경로로 전송한다.
          // Node.js가 FastAPI로 넘겨 utterance 저장 + 화자 클러스터링 + 재논의 판단을 수행하고,
          // 결과가 TRANSCRIPT / TOPIC_* 이벤트로 되돌아온다.
          presence.actions.sendTranscriptChunk({
            workspaceId,
            meetingId,
            meetingRoomId: presence.meetingRoom.meetingRoomId ?? meetingId,
            chunkId: `chunk-${meetingId}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            text: rawText,
            language: "ko",
            isFinal: true,
          });
        },

        endMeeting: () => {
          if (
            selectedWorkspaceId &&
            selectedMeetingId &&
            presence.meetingRoom.isMeetingRoomJoined &&
            isSelectedMeetingActive &&
            !hasEndMeetingRequestedRef.current
          ) {
            hasEndMeetingRequestedRef.current = true;
            void (async () => {
              console.log("[USER] 회의 종료 — 녹음 처리 중");
              try {
                // 녹음 파일을 먼저 STT/화자 분리한 뒤 회의 상태를 종료한다.
                // 그래야 요약 화면으로 이동해도 화자별 대화록이 유실되지 않는다.
                await meetingAudio.stopRecording();
              } catch (error) {
                console.error("[MICROPHONE:PROCESS_FAILED]", error);
                // 분석에 실패한 상태에서 회의를 종료하면 실제 녹음 결과를 잃을 수 있다.
                // 사용자가 오류를 확인하고 다시 녹음/종료할 수 있도록 ACTIVE 상태를 유지한다.
                hasEndMeetingRequestedRef.current = false;
                return;
              }

              console.log("[END_MEETING:REQUEST]");
              presence.actions.endMeeting(
                selectedWorkspaceId,
                selectedMeetingId,
              );
            })();
          }

        },

        leaveMeetingRoom: () => {
          if (!selectedWorkspaceId) return;
          if (!selectedMeetingId) return;
          if (!selectedMeetingRoomId) return;

          console.log("[USER] 회의방 나가기");

          if (presence.meetingRoom.isMeetingRoomJoined) {
            presence.actions.leaveMeetingRoom(
              selectedWorkspaceId,
              selectedMeetingId,
              selectedMeetingRoomId
            );
          }

          const targetUrl = `/dashboard?workspaceId=${selectedWorkspaceId}`;
          console.log("[NAVIGATE:DASHBOARD]", targetUrl);
          navigate(targetUrl);
        },

        backDashboard: () => {
          console.log("[USER] 대시보드로 돌아가기");

          if (
            selectedWorkspaceId &&
            selectedMeetingId &&
            selectedMeetingRoomId &&
            presence.meetingRoom.isMeetingRoomJoined
          ) {
            presence.actions.leaveMeetingRoom(
              selectedWorkspaceId,
              selectedMeetingId,
              selectedMeetingRoomId
            );
          }

          // LEAVE_MEETING_ROOM ACK를 기다리지 않고 즉시 이동한다.
          const fallbackWorkspaceId =
            selectedWorkspaceId ??
            presence.workspace.workspaceId ??
            (Number.isFinite(storedLastWorkspaceId) && storedLastWorkspaceId > 0
              ? storedLastWorkspaceId
              : null);
          const target = `/dashboard?workspaceId=${fallbackWorkspaceId ?? ""}`;

          console.log("[NAVIGATE:DASHBOARD]", target);
          navigate(target);
        },

        closeRediscussPopup: () => {
          presence.actions.closeRediscussPopup();
        },

        attachFile: (file: File) => {
          attachFile(file);
        },

        deleteDocument: (documentId: number) => {
          if (!selectedWorkspaceId) return;
          if (!selectedMeetingId) return;
          if (!selectedMeetingRoomId) return;
          if (!Number.isFinite(documentId) || documentId <= 0) return;

          deleteDocumentAction({
            workspaceId: selectedWorkspaceId,
            meetingId: selectedMeetingId,
            meetingRoomId: selectedMeetingRoomId,
            documentId,
          });
        },
      }}
    />
  );
}
