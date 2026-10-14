import { useSocket } from "./useSocket";
import type { CollaborationUser } from "../types/collaborationUser.types";

type UsePresenceParams = {
  user: CollaborationUser;
  accessToken: string | null;
  autoConnect?: boolean;
};

export function usePresence({
  user,
  accessToken,
  autoConnect = true,
}: UsePresenceParams) {
  const socket = useSocket({
    user,
    accessToken,
    autoConnect,
  });

  const isSocketConnected =
    socket.socketStatus === "socket_connected" ||
    socket.socketStatus === "user_registered";

  const isUserRegistered = socket.socketStatus === "user_registered";

  const isWorkspaceJoined = socket.workspace.status === "joined";
  const isMeetingRoomJoined = socket.meetingRoom.status === "joined";

  return {
    status: socket.socketStatus,
    currentUser: socket.currentUser,
    lastServerTime: socket.lastServerTime,
    error: socket.error,
    isSocketConnected,
    isUserRegistered,

    workspace: {
      workspaceId: socket.workspace.workspaceId,
      status: socket.workspace.status,
      users: socket.workspace.users,
      updatedAt: socket.workspace.updatedAt,
      errorMessage: socket.workspace.errorMessage,
      isWorkspaceJoined,
    },

    

    // Meeting 계층 상태
    // GET_MEETINGS_ACK, CREATE_MEETING_ACK, MEETING_CREATED 결과 확인용
    meeting: {
    meetings: socket.meeting.meetings,
    isLoading: socket.meeting.isLoading,
      errorMessage: socket.meeting.errorMessage,
      loadedWorkspaceId: socket.meeting.loadedWorkspaceId,
      lastCreatedMeeting: socket.meeting.lastCreatedMeeting,
      lastFetchedMeeting: socket.meeting.lastFetchedMeeting,
    },

    meetingRoom: {
      workspaceId: socket.meetingRoom.workspaceId,
      meetingRoomId: socket.meetingRoom.meetingRoomId,
      status: socket.meetingRoom.status,
      users: socket.meetingRoom.users,
      updatedAt: socket.meetingRoom.updatedAt,
      errorMessage: socket.meetingRoom.errorMessage,
      isMeetingRoomJoined,
    },
    issues: socket.issues,
    allIssues: socket.allIssues,
    issue: socket.issue,
    sttResult: socket.sttResult,
    alerts: socket.alerts,

    actions: {
      connect: socket.connectSocket,
      disconnect: socket.disconnectUser,
      ping: socket.sendPing,
      close: socket.closeSocket,
      clearWorkspaceData: socket.clearWorkspaceData,

      joinWorkspace: socket.joinWorkspace,
      leaveWorkspace: socket.leaveWorkspace,

      getMeetings: socket.getMeetings,
      getMeeting: socket.getMeeting,
      deleteMeeting: socket.deleteMeeting,
      createMeeting: socket.createMeeting,
      startMeeting: socket.startMeeting,
      endMeeting: socket.endMeeting,

      joinMeetingRoom: socket.joinMeetingRoom,
      leaveMeetingRoom: socket.leaveMeetingRoom,

      sendTranscriptChunk: socket.sendTranscriptChunk,

      createIssue: socket.createIssue,
      getIssues: socket.getIssues,
      getAllIssues: socket.getAllIssues,
      getIssue: socket.getIssue,
      getIssueEvents: socket.getIssueEvents,
      getDocuments: socket.getDocuments,
      getSttResults: socket.getSttResults,
      getSttResult: socket.getSttResult,
      deleteSttResult: socket.deleteSttResult,
      getWorkspaceDocuments: socket.getWorkspaceDocuments,
      getDocument: socket.getDocument,
      deleteDocument: socket.deleteDocument,
      getAlerts: socket.getAlerts,
      getAlert: socket.getAlert,
      acknowledgeAlert: socket.acknowledgeAlert,
      dismissAlert: socket.dismissAlert,
      resolveAlert: socket.resolveAlert,
      updateAlert: socket.updateAlert,
      deleteAlert: socket.deleteAlert,
      closeRediscussPopup: socket.closeRediscussPopup,
      updateIssue: socket.updateIssue,
      changeIssueState: socket.changeIssueState,
      deleteIssue: socket.deleteIssue,

      
    },
  };
}
