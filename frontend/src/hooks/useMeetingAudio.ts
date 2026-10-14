import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAudioUtterances,
  transcribeMeetingAudio,
} from "../services/audioService";
import { useTranscriptStore } from "../store/transcriptStore";

type UseMeetingAudioParams = {
  workspaceId: number | null;
  meetingId: number | null;
};

type AudioState = {
  isRecording: boolean;
  isStarting: boolean;
  isProcessing: boolean;
  errorMessage: string | null;
};

const MICROPHONE_PERMISSION_TIMEOUT_MS = 15000;

const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Electron의 실제 마이크를 녹음하고, 회의 종료 시 로컬 STT/화자 분리 파이프라인으로 보낸다.
 *
 * 한 회의 전체를 하나의 파일로 처리하기 때문에 ECAPA가 회의 안의 모든 구간을 함께
 * 클러스터링할 수 있다. 짧은 청크를 따로 처리하는 방식보다 Speaker 1/2 일관성이 높다.
 */
export function useMeetingAudio({
  workspaceId,
  meetingId,
}: UseMeetingAudioParams) {
  const [state, setState] = useState<AudioState>({
    isRecording: false,
    isStarting: false,
    isProcessing: false,
    errorMessage: null,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef("audio/webm");
  const pendingRecordingRef = useRef<{ blob: Blob; extension: string } | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const stopResolveRef = useRef<(() => void) | null>(null);
  const stopRejectRef = useRef<((error: unknown) => void) | null>(null);

  const requestMicrophone = useCallback(async () => {
    const request = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    let timeoutId: number | null = null;
    let timedOut = false;
    try {
      const stream = await Promise.race([
        request,
        new Promise<MediaStream>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error("마이크 권한 요청 시간이 초과되었습니다. 시스템 설정에서 마이크 권한을 허용한 뒤 다시 시도해 주세요."));
          }, MICROPHONE_PERMISSION_TIMEOUT_MS);
        }),
      ]);

      // getUserMedia cannot be cancelled. If the permission prompt resolves
      // after our timeout, immediately release the late stream instead of
      // leaving the microphone open in the background.
      if (timedOut) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("마이크 권한 요청 시간이 초과되었습니다. 시스템 설정에서 마이크 권한을 허용한 뒤 다시 시도해 주세요.");
      }

      return stream;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      void request.then((stream) => {
        if (timedOut) stream.getTracks().forEach((track) => track.stop());
      }).catch(() => undefined);
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const processRecording = useCallback(async () => {
    const mimeType = recordingMimeTypeRef.current;
    const extension = mimeType.includes("mp4") ? "m4a" : "webm";
    const blob = pendingRecordingRef.current?.blob ?? new Blob(chunksRef.current, { type: mimeType });

    if (!workspaceId || !meetingId || blob.size === 0) {
      throw new Error("마이크 녹음 데이터가 없습니다.");
    }

    pendingRecordingRef.current = { blob, extension };

    setState((current) => ({
      ...current,
      isRecording: false,
      isStarting: false,
      isProcessing: true,
      errorMessage: null,
    }));

    const result = await transcribeMeetingAudio({
      workspaceId,
      meetingId,
      blob,
      filename: `meeting-${meetingId}-${Date.now()}.${extension}`,
      language: "ko",
    });
    const utterances = await getAudioUtterances(result.stt_result_id);
    const appendTranscript = useTranscriptStore.getState().appendTranscript;

    for (const utterance of utterances) {
      appendTranscript({
        workspaceId,
        meetingId,
        chunkId: `audio-${result.stt_result_id}-${utterance.sequence}`,
        utteranceId: utterance.id,
        sttResultId: result.stt_result_id,
        sequence: utterance.sequence,
        speaker: utterance.speaker_label || "Unknown",
        text: utterance.text,
        startMs: utterance.start_ms,
        endMs: utterance.end_ms,
        isFinal: true,
      });
    }

    setState({ isRecording: false, isStarting: false, isProcessing: false, errorMessage: null });
    chunksRef.current = [];
    pendingRecordingRef.current = null;
  }, [meetingId, workspaceId]);

  const startRecording = useCallback(async () => {
    if (recorderRef.current?.state === "recording") return;
    if (!workspaceId || !meetingId) {
      throw new Error("회의 정보가 없어 마이크를 시작할 수 없습니다.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("이 환경에서 마이크 입력을 사용할 수 없습니다.");
    }

    setState({ isRecording: false, isStarting: true, isProcessing: false, errorMessage: null });

    try {
      const stream = await requestMicrophone();
      streamRef.current = stream;

      const mimeType = RECORDING_MIME_TYPES.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordingMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        const error = new Error("마이크 녹음 중 오류가 발생했습니다.");
        releaseStream();
        setState({ isRecording: false, isStarting: false, isProcessing: false, errorMessage: error.message });
        stopRejectRef.current?.(error);
        stopResolveRef.current = null;
        stopRejectRef.current = null;
      };
      recorder.onstop = async () => {
        releaseStream();
        try {
          await processRecording();
          stopResolveRef.current?.();
        } catch (error) {
          const message = errorMessage(error, "녹음 처리에 실패했습니다.");
          setState({ isRecording: false, isStarting: false, isProcessing: false, errorMessage: message });
          stopRejectRef.current?.(error);
        } finally {
          stopResolveRef.current = null;
          stopRejectRef.current = null;
          stopPromiseRef.current = null;
        }
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setState({ isRecording: true, isStarting: false, isProcessing: false, errorMessage: null });
    } catch (error) {
      releaseStream();
      const message = errorMessage(error, "마이크 권한을 얻지 못했습니다.");
      setState({ isRecording: false, isStarting: false, isProcessing: false, errorMessage: message });
      throw new Error(message, { cause: error });
    }
  }, [meetingId, processRecording, releaseStream, requestMicrophone, workspaceId]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      if (pendingRecordingRef.current && !state.isProcessing) {
        return processRecording();
      }
      return Promise.resolve();
    }

    if (!stopPromiseRef.current) {
      stopPromiseRef.current = new Promise<void>((resolve, reject) => {
        stopResolveRef.current = resolve;
        stopRejectRef.current = reject;
      });
    }

    recorder.stop();
    return stopPromiseRef.current;
  }, [processRecording, state.isProcessing]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseStream();
    };
  }, [releaseStream]);

  return {
    ...state,
    startRecording,
    stopRecording,
  };
}
