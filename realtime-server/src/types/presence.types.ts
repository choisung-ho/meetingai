/**
 * Presence(현재 상태) 데이터 타입 정의
 *
 * Input  : scopeType + scopeId + userId 조합으로 특정 공간의 사용자 상태를 식별
 * Output : Redis에 저장/조회되는 PresenceData 객체 또는 브로드캐스트용 PresenceListItem 배열
 */

/** Presence가 적용되는 공간(scope) 종류 */
export type PresenceScopeType = 'workspace' | 'meetingRoom' | 'meetingSession';

/** 사용자 현재 상태값 */
export type PresenceStatus = 'online' | 'offline' | 'away' | 'speaking' | 'muted';

/** Redis에 저장되는 Presence 전체 데이터 */
export interface PresenceData {
  /** Presence가 적용된 공간 종류 */
  scopeType: PresenceScopeType;
  /** 공간 식별자 (예: workspace-001, workspace-001:room-001) */
  scopeId: string;
  /** 사용자 고유 식별자 */
  userId: string;
  /** 현재 상태 */
  status: PresenceStatus;
  /** 해당 scope에 참여한 시각 (ISO 8601) */
  joinedAt: string;
  /** 마지막 활동 시각 (ISO 8601) */
  lastSeenAt: string;
}

/** 클라이언트 브로드캐스트용 참여자 목록 항목 */
export interface PresenceListItem {
  userId: string;
  name: string | null;
  status: PresenceStatus;
  joinedAt: string;
  lastSeenAt: string;
}

/** setUserPresence 입력 파라미터 */
export interface SetPresenceInput {
  status?: PresenceStatus;
  joinedAt?: string;
  lastSeenAt?: string;
}
