export type AlertStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "DISMISSED"
  | "RESOLVED";

export type AlertLevel = "info" | "warning" | "error" | "success";

export type AlertItem = {
  id: number;
  workspaceId: number;
  meetingId: number;
  issueId: number;
  message: string;
  level: AlertLevel;
  status: AlertStatus;
  createdAt: string;
};

export type GetAlertsPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  status?: AlertStatus;
};

export type GetAlertsAckPayload = {
  alerts: AlertItem[];
};

export type GetAlertPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  alertId: number;
};

export type GetAlertAckPayload = AlertItem;

export type AcknowledgeAlertPayload = {
  alertId: number;
};

export type AcknowledgeAlertAckPayload = AlertItem;

export type DismissAlertPayload = {
  alertId: number;
};

export type DismissAlertAckPayload = AlertItem;

export type ResolveAlertPayload = {
  alertId: number;
};

export type ResolveAlertAckPayload = AlertItem;

export type UpdateAlertPayload = {
  workspaceId: number;
  alertId: number;
  meetingId?: number;
  issueId?: number;
  message?: string;
  level?: AlertLevel;
  status?: AlertStatus;
};

export type UpdateAlertAckPayload = AlertItem;

export type DeleteAlertPayload = {
  alertId: number;
};

export type DeleteAlertAckPayload = {
  alertId: number;
  deleted: boolean;
};
