import { create } from "zustand";
import type { AlertItem } from "../types/alert.types";

type AlertStore = {
  alerts: AlertItem[];
  selectedAlertId: number | null;
  alertDetail: AlertItem | null;
  popupAlert: AlertItem | null;
  isLoading: boolean;
  isDetailLoading: boolean;
  isAcknowledgeLoading: boolean;
  isDismissLoading: boolean;
  isResolveLoading: boolean;
  isUpdateLoading: boolean;
  isDeleteLoading: boolean;
  errorMessage: string | null;
  detailErrorMessage: string | null;
  acknowledgeErrorMessage: string | null;
  dismissErrorMessage: string | null;
  resolveErrorMessage: string | null;
  updateErrorMessage: string | null;
  deleteErrorMessage: string | null;
  setAlerts: (alerts: AlertItem[]) => void;
  addAlert: (alert: AlertItem) => void;
  updateAlert: (alert: AlertItem) => void;
  removeAlert: (alertId: number) => void;
  setSelectedAlertId: (selectedAlertId: number | null) => void;
  setAlertDetail: (alertDetail: AlertItem | null) => void;
  setPopupAlert: (popupAlert: AlertItem | null) => void;
  setLoading: (isLoading: boolean) => void;
  setDetailLoading: (isDetailLoading: boolean) => void;
  setAcknowledgeLoading: (isAcknowledgeLoading: boolean) => void;
  setDismissLoading: (isDismissLoading: boolean) => void;
  setResolveLoading: (isResolveLoading: boolean) => void;
  setUpdateLoading: (isUpdateLoading: boolean) => void;
  setDeleteLoading: (isDeleteLoading: boolean) => void;
  setErrorMessage: (errorMessage: string | null) => void;
  setDetailErrorMessage: (detailErrorMessage: string | null) => void;
  setAcknowledgeErrorMessage: (acknowledgeErrorMessage: string | null) => void;
  setDismissErrorMessage: (dismissErrorMessage: string | null) => void;
  setResolveErrorMessage: (resolveErrorMessage: string | null) => void;
  setUpdateErrorMessage: (updateErrorMessage: string | null) => void;
  setDeleteErrorMessage: (deleteErrorMessage: string | null) => void;
  resetAlerts: () => void;
};

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  selectedAlertId: null,
  alertDetail: null,
  popupAlert: null,
  isLoading: false,
  isDetailLoading: false,
  isAcknowledgeLoading: false,
  isDismissLoading: false,
  isResolveLoading: false,
  isUpdateLoading: false,
  isDeleteLoading: false,
  errorMessage: null,
  detailErrorMessage: null,
  acknowledgeErrorMessage: null,
  dismissErrorMessage: null,
  resolveErrorMessage: null,
  updateErrorMessage: null,
  deleteErrorMessage: null,

  setAlerts: (alerts) => set({ alerts: [...alerts], errorMessage: null }),
  addAlert: (alert) =>
    set((state) => {
      const exists = state.alerts.some((item) => Number(item.id) === Number(alert.id));

      if (exists) {
        return {
          alerts: state.alerts.map((item) =>
            Number(item.id) === Number(alert.id) ? alert : item
          ),
        };
      }

      return { alerts: [alert, ...state.alerts] };
    }),
  updateAlert: (alert) =>
    set((state) => {
      const exists = state.alerts.some((item) => Number(item.id) === Number(alert.id));

      return {
        alerts: exists
          ? state.alerts.map((item) =>
              Number(item.id) === Number(alert.id) ? alert : item
            )
          : [alert, ...state.alerts],
        alertDetail:
          state.alertDetail && Number(state.alertDetail.id) === Number(alert.id)
            ? alert
            : state.alertDetail,
        popupAlert:
          state.popupAlert && Number(state.popupAlert.id) === Number(alert.id)
            ? alert
            : state.popupAlert,
      };
    }),
  removeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.filter((item) => Number(item.id) !== Number(alertId)),
      selectedAlertId:
        state.selectedAlertId !== null && Number(state.selectedAlertId) === Number(alertId)
          ? null
          : state.selectedAlertId,
      alertDetail:
        state.alertDetail && Number(state.alertDetail.id) === Number(alertId)
          ? null
          : state.alertDetail,
      popupAlert:
        state.popupAlert && Number(state.popupAlert.id) === Number(alertId)
          ? null
          : state.popupAlert,
    })),
  setSelectedAlertId: (selectedAlertId) => set({ selectedAlertId }),
  setAlertDetail: (alertDetail) => set({ alertDetail }),
  setPopupAlert: (popupAlert) => set({ popupAlert }),
  setLoading: (isLoading) => set({ isLoading }),
  setDetailLoading: (isDetailLoading) => set({ isDetailLoading }),
  setAcknowledgeLoading: (isAcknowledgeLoading) => set({ isAcknowledgeLoading }),
  setDismissLoading: (isDismissLoading) => set({ isDismissLoading }),
  setResolveLoading: (isResolveLoading) => set({ isResolveLoading }),
  setUpdateLoading: (isUpdateLoading) => set({ isUpdateLoading }),
  setDeleteLoading: (isDeleteLoading) => set({ isDeleteLoading }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setDetailErrorMessage: (detailErrorMessage) => set({ detailErrorMessage }),
  setAcknowledgeErrorMessage: (acknowledgeErrorMessage) => set({ acknowledgeErrorMessage }),
  setDismissErrorMessage: (dismissErrorMessage) => set({ dismissErrorMessage }),
  setResolveErrorMessage: (resolveErrorMessage) => set({ resolveErrorMessage }),
  setUpdateErrorMessage: (updateErrorMessage) => set({ updateErrorMessage }),
  setDeleteErrorMessage: (deleteErrorMessage) => set({ deleteErrorMessage }),
  resetAlerts: () =>
    set({
      alerts: [],
      selectedAlertId: null,
      alertDetail: null,
      popupAlert: null,
      isLoading: false,
      isDetailLoading: false,
      isAcknowledgeLoading: false,
      isDismissLoading: false,
      isResolveLoading: false,
      isUpdateLoading: false,
      isDeleteLoading: false,
      errorMessage: null,
      detailErrorMessage: null,
      acknowledgeErrorMessage: null,
      dismissErrorMessage: null,
      resolveErrorMessage: null,
      updateErrorMessage: null,
      deleteErrorMessage: null,
    }),
}));
