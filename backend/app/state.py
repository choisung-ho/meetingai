STATE_TRANSITIONS = {
    "meeting": {
        "READY": {"ACTIVE"},
        "ACTIVE": {"ENDED"},
        "ENDED": set(),
    },

    "issue": {
        "OPEN": {"IN_PROGRESS"},
        "IN_PROGRESS": {"CLOSED"},
        "CLOSED": set(),
    },

    "issue_candidate": {
        "DETECTED": {"REVIEWING", "ACCEPTED", "REJECTED"},
        "REVIEWING": {"ACCEPTED", "REJECTED"},
        "ACCEPTED": {"PROMOTED"},
        "REJECTED": set(),
        "PROMOTED": set(),
    },

    "alert": {
        "PENDING": {"ACKNOWLEDGED", "DISMISSED"},
        "ACKNOWLEDGED": {"RESOLVED", "DISMISSED"},
        "RESOLVED": set(),
        "DISMISSED": set(),
    },

    "document": {
        "UPLOADED": {"PROCESSING", "PROCESSED", "FAILED"},
        "PROCESSING": {"PROCESSED", "FAILED"},
        "PROCESSED": set(),
        "FAILED": {"PROCESSING"},
    },

    "stt_result": {
        "PENDING": {"PROCESSING", "COMPLETED", "FAILED"},
        "PROCESSING": {"COMPLETED", "FAILED"},
        "COMPLETED": set(),
        "FAILED": {"PROCESSING"},
    },

    "topic": {
        "PROPOSED": {"DECIDED", "DROPPED"},
        "DECIDED": {"REVISITED"},
        "REVISITED": {"DECIDED", "DROPPED"},
        "DROPPED": set(),
    },
}


PIPELINE_FLOW = [
    {
        "event_type": "STT_PROCESSING_STARTED",
        "resource": "stt_result",
        "from_state": "PENDING",
        "to_state": "PROCESSING",
        "description": "STT raw_text 저장 및 발화 분리 시작",
    },
    {
        "event_type": "STT_COMPLETED",
        "resource": "stt_result",
        "from_state": "PROCESSING",
        "to_state": "COMPLETED",
        "description": "utterances 저장 완료",
    },
    {
        "event_type": "ISSUE_CANDIDATE_DETECTED",
        "resource": "issue_candidate",
        "from_state": None,
        "to_state": "DETECTED",
        "description": "utterance rule engine이 issue 후보를 감지",
    },
    {
        "event_type": "ISSUE_CANDIDATE_ACCEPTED",
        "resource": "issue_candidate",
        "from_state": "DETECTED",
        "to_state": "ACCEPTED",
        "description": "사용자 또는 자동 정책이 issue 후보를 승인",
    },
    {
        "event_type": "ISSUE_CREATED_FROM_CANDIDATE",
        "resource": "issue_candidate",
        "from_state": "ACCEPTED",
        "to_state": "PROMOTED",
        "description": "승인된 후보가 실제 issue로 생성",
    },
    {
        "event_type": "ISSUE_CREATED",
        "resource": "issue",
        "from_state": None,
        "to_state": "OPEN",
        "description": "사용자가 직접 issue 생성",
    },
    {
        "event_type": "TOPIC_PROPOSED",
        "resource": "topic",
        "from_state": None,
        "to_state": "PROPOSED",
        "description": "발화에서 안건 후보를 추출",
    },
    {
        "event_type": "TOPIC_DECIDED",
        "resource": "topic",
        "from_state": "PROPOSED",
        "to_state": "DECIDED",
        "description": "안건이 결정 발언으로 확정",
    },
    {
        "event_type": "TOPIC_REVISITED",
        "resource": "topic",
        "from_state": "DECIDED",
        "to_state": "REVISITED",
        "description": "확정된 안건과 유사한 발화가 다시 감지되어 재논의 상태로 전환",
    },
    {
        "event_type": "TOPIC_REDECIDED",
        "resource": "topic",
        "from_state": "REVISITED",
        "to_state": "DECIDED",
        "description": "재논의된 안건이 다시 확정",
    },
]


EVENT_BY_TRANSITION = {
    (
        flow["resource"],
        flow["from_state"],
        flow["to_state"],
    ): flow["event_type"]
    for flow in PIPELINE_FLOW
}


def allowed_states(resource: str) -> set[str]:
    if resource not in STATE_TRANSITIONS:
        raise ValueError(f"Unknown resource: {resource}")
    return set(STATE_TRANSITIONS[resource].keys())

def can_transition(resource: str, current_status: str, next_status: str) -> bool:
    if resource not in STATE_TRANSITIONS:
        raise ValueError(f"Unknown resource: {resource}")
    if current_status == next_status:
        return True
    return next_status in STATE_TRANSITIONS[resource].get(current_status, set())


def assert_transition(resource: str, current_status: str, next_status: str):
    if not can_transition(resource, current_status, next_status):
        raise ValueError(f"Invalid state transition: {current_status} -> {next_status}")


def event_type_for_transition(
    resource: str,
    from_state: str | None,
    to_state: str,
    default: str = "STATE_CHANGED",
) -> str:
    return EVENT_BY_TRANSITION.get((resource, from_state, to_state), default)
