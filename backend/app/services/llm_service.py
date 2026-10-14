"""로컬 LLM(Ollama) 기반 회의 분석.

회의 transcript를 받아 요약 / 액션 아이템 / 재논의 리포트를 생성한다.

설계 원칙:
- 외부 API로 회의 내용을 보내지 않는다. 전부 로컬 Ollama에서 처리한다.
- LLM이 없거나 실패해도 앱이 죽지 않는다. 규칙 기반 요약으로 폴백한다.
- 출력은 반드시 JSON 스키마로 강제하고, 어긋나면 폴백한다.
"""

import json

import httpx

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

# transcript가 길면 앞뒤를 남기고 중간을 줄여 컨텍스트 초과를 막는다.
MAX_TRANSCRIPT_CHARS = 12000

_ANALYSIS_PROMPT = """당신은 회의록 분석 도우미입니다. 아래 회의록을 분석해 JSON으로만 답하세요.

규칙:
- summary는 회의 전체를 3문장 이내 한국어로 요약합니다.
- action_items는 실제로 해야 할 일만 담고, owner에는 회의록에 등장한 화자 이름을 그대로 씁니다.
- decisions에는 확정된 결정사항만 담습니다.
- 회의록에 없는 내용을 지어내지 마세요. 해당 항목이 없으면 빈 배열로 두세요.

회의록:
{transcript}

형식:
{{"summary":"요약","action_items":[{{"task":"할 일","owner":"화자"}}],"decisions":["결정사항"]}}"""


class LlmUnavailableError(Exception):
    """LLM 서버에 접근할 수 없을 때"""


def _truncate(transcript: str) -> str:
    if len(transcript) <= MAX_TRANSCRIPT_CHARS:
        return transcript

    head = transcript[: MAX_TRANSCRIPT_CHARS // 2]
    tail = transcript[-MAX_TRANSCRIPT_CHARS // 2 :]
    return f"{head}\n\n...(중략)...\n\n{tail}"


def is_available() -> bool:
    """Ollama 서버가 떠 있고 지정 모델을 쓸 수 있는지 확인한다."""
    if not settings.LLM_ENABLED:
        return False

    try:
        response = httpx.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=3.0)
        response.raise_for_status()
        models = [model.get("name", "") for model in response.json().get("models", [])]
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[LLM] Ollama 확인 실패: %s", exc)
        return False

    if settings.LLM_MODEL not in models:
        logger.warning(
            "[LLM] 모델 %s 없음. 사용 가능: %s", settings.LLM_MODEL, models
        )
        return False

    return True


def _call_ollama(prompt: str, *, json_format: bool = True) -> str:
    payload = {
        "model": settings.LLM_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": settings.LLM_TEMPERATURE,
            "num_predict": settings.LLM_MAX_TOKENS,
        },
    }

    if json_format:
        payload["format"] = "json"

    try:
        response = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=settings.LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json().get("response", "")
    except httpx.HTTPError as exc:
        raise LlmUnavailableError(f"Ollama 호출 실패: {exc}") from exc


def _fallback_analysis(transcript_lines: list[str], rediscussions: list[dict]) -> dict:
    """LLM을 못 쓸 때의 규칙 기반 요약.

    앱이 '분석 불가'로 멈추지 않도록 최소한의 결과를 만든다.
    """
    speakers = []
    for line in transcript_lines:
        if line.startswith("[") and "]" in line:
            speaker = line[1 : line.index("]")]
            if speaker not in speakers:
                speakers.append(speaker)

    summary = (
        f"발화 {len(transcript_lines)}건, 참여 화자 {len(speakers)}명의 회의입니다."
        if transcript_lines
        else "분석할 발화가 없습니다."
    )

    if rediscussions:
        summary += f" 재논의가 {len(rediscussions)}건 감지되었습니다."

    return {
        "summary": summary,
        "action_items": [],
        "decisions": [],
        "generated_by": "fallback",
    }


def analyze_meeting(
    transcript_lines: list[str],
    rediscussions: list[dict] | None = None,
) -> dict:
    """회의 transcript를 분석해 요약/액션아이템/결정사항을 만든다.

    Args:
        transcript_lines: "[Speaker 1]: 발화" 형태의 줄 목록
        rediscussions: 재논의 탐지 결과 (topic_label, speaker, similarity)

    Returns:
        {summary, action_items, decisions, generated_by}
    """
    rediscussions = rediscussions or []

    if not transcript_lines:
        return _fallback_analysis([], rediscussions)

    if not is_available():
        logger.info("[LLM] 사용 불가 → 규칙 기반 요약으로 대체")
        return _fallback_analysis(transcript_lines, rediscussions)

    transcript = _truncate("\n".join(transcript_lines))

    try:
        raw = _call_ollama(_ANALYSIS_PROMPT.format(transcript=transcript))
    except LlmUnavailableError as exc:
        logger.warning("[LLM] 분석 실패 → 폴백: %s", exc)
        return _fallback_analysis(transcript_lines, rediscussions)

    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("[LLM] JSON 파싱 실패 → 폴백: %s", exc)
        return _fallback_analysis(transcript_lines, rediscussions)

    # LLM 출력이 스키마를 벗어나도 앱이 깨지지 않도록 정규화한다.
    summary = parsed.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        return _fallback_analysis(transcript_lines, rediscussions)

    action_items = parsed.get("action_items")
    if not isinstance(action_items, list):
        action_items = []

    normalized_items = []
    for item in action_items:
        if isinstance(item, dict) and item.get("task"):
            normalized_items.append(
                {
                    "task": str(item["task"])[:500],
                    "owner": str(item.get("owner") or "Unknown")[:100],
                }
            )
        elif isinstance(item, str) and item.strip():
            normalized_items.append({"task": item[:500], "owner": "Unknown"})

    decisions = parsed.get("decisions")
    if not isinstance(decisions, list):
        decisions = []

    normalized_decisions = [
        str(decision)[:500] for decision in decisions if str(decision).strip()
    ]

    logger.info(
        "[LLM] 분석 완료 model=%s 발화=%s 액션=%s 결정=%s",
        settings.LLM_MODEL,
        len(transcript_lines),
        len(normalized_items),
        len(normalized_decisions),
    )

    return {
        "summary": summary.strip(),
        "action_items": normalized_items,
        "decisions": normalized_decisions,
        "generated_by": settings.LLM_MODEL,
    }


def build_rediscussion_report(topics: list, topic_events: list) -> list[dict]:
    """재논의 리포트를 만든다.

    누가(speaker) 어떤 안건을(topic_label) 언제 다시 꺼냈는지 정리한다.
    LLM 없이 DB 기록만으로 구성되므로 항상 정확하다.
    """
    events_by_topic: dict[int, list] = {}
    for event in topic_events:
        events_by_topic.setdefault(event.topic_id, []).append(event)

    report = []
    for topic in topics:
        revisit_events = [
            event
            for event in events_by_topic.get(topic.id, [])
            if event.event_type == "TOPIC_REVISITED"
        ]

        if not revisit_events:
            continue

        report.append(
            {
                "topic_id": topic.id,
                "topic_label": topic.label,
                "status": topic.status,
                "proposed_by": topic.proposed_by,
                "decided_by": topic.decided_by,
                "revisit_count": len(revisit_events),
                "revisited_by": [
                    event.speaker_label for event in revisit_events if event.speaker_label
                ],
                "first_revisited_at": revisit_events[0].created_at.isoformat()
                if revisit_events[0].created_at
                else None,
            }
        )

    return report
