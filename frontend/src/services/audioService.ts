import { authorizedFetch } from "./apiClient";

export type AudioUtterance = {
  id: number;
  stt_result_id: number;
  sequence: number;
  start_ms: number | null;
  end_ms: number | null;
  speaker_label: string | null;
  text: string;
  created_at: string;
};

export type AudioTranscriptionResult = {
  stt_result_id: number;
  utterance_count: number;
  speakers: string[];
  language: string;
  topic_event_count: number;
};

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return body?.message ?? body?.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 실제 마이크 녹음 파일을 FastAPI의 로컬 STT/화자 분리 파이프라인으로 보낸다.
 * 오디오 파일은 서버에서 faster-whisper와 ECAPA로 처리되며 외부 AI API로 전송되지 않는다.
 */
export async function transcribeMeetingAudio({
  workspaceId,
  meetingId,
  blob,
  filename,
  language = "ko",
}: {
  workspaceId: number;
  meetingId: number;
  blob: Blob;
  filename: string;
  language?: string;
}): Promise<AudioTranscriptionResult> {
  const form = new FormData();
  form.append("file", blob, filename);

  const response = await authorizedFetch(
    `/workspaces/${workspaceId}/meetings/${meetingId}/audio/transcribe?language=${encodeURIComponent(language)}`,
    {
      method: "POST",
      body: form,
    },
  );

  if (!response.ok) {
    throw new Error(await responseError(response, "오디오 전사에 실패했습니다."));
  }

  const body = await response.json();
  return body.data as AudioTranscriptionResult;
}

/** STT 결과 생성 후 화자 라벨과 시각이 포함된 발화 목록을 다시 읽는다. */
export async function getAudioUtterances(
  sttResultId: number,
): Promise<AudioUtterance[]> {
  const response = await authorizedFetch(
    `/utterances/?stt_result_id=${sttResultId}`,
  );

  if (!response.ok) {
    throw new Error(await responseError(response, "화자별 발화 조회에 실패했습니다."));
  }

  const body = await response.json();
  return (body.data ?? []) as AudioUtterance[];
}
