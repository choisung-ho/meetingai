import unittest
from unittest.mock import patch

from app.main import app
from app.core.config import settings
from app.services.document_parser import chunk_text
from app.services.embedding_service import (
    _hash_embed,
    active_provider,
    cosine_similarity,
    embed_text,
    embedding_dimension,
)
from app.services.judgment_service import classify_utterance
from app.state import allowed_states, can_transition


class EmbeddingTests(unittest.TestCase):
    def test_embedding_is_deterministic_and_normalized(self):
        first = embed_text("다음 배포는 금요일로 하겠습니다")
        second = embed_text("다음 배포는 금요일로 하겠습니다")
        self.assertEqual(first, second)
        self.assertAlmostEqual(sum(v * v for v in first), 1.0, places=6)

    def test_similar_sentences_score_higher_than_unrelated(self):
        base = embed_text("로그인 기능은 이번 주까지 끝내기로 결정했습니다")
        similar = embed_text("로그인 기능 이번 주까지 끝내기로 했잖아요")
        unrelated = embed_text("점심 메뉴는 김치찌개로 하죠")
        self.assertGreater(
            cosine_similarity(base, similar), cosine_similarity(base, unrelated)
        )

    def test_embedding_has_consistent_dimension(self):
        # provider가 무엇이든 저장되는 벡터 차원은 일정해야 pgvector 검색이 동작한다.
        dimension = embedding_dimension()
        self.assertEqual(len(embed_text("회의 내용")), dimension)
        self.assertEqual(len(embed_text("")), dimension)

    def test_sentence_model_failure_keeps_pgvector_dimension(self):
        # sentence-transformers 모델이 내려받아지지 않는 설치 환경에서도
        # hash 폴백이 pgvector 컬럼 선언 차원을 그대로 따라야 한다.
        previous_provider = settings.EMBEDDING_PROVIDER
        previous_model = settings.EMBEDDING_MODEL
        try:
            settings.EMBEDDING_PROVIDER = "sentence-transformers"
            settings.EMBEDDING_MODEL = "intfloat/multilingual-e5-small"
            with patch("app.services.embedding_service._load_sentence_transformer", return_value=None):
                self.assertEqual(len(embed_text("폴백 차원 확인")), settings.vector_dimension)
                self.assertEqual(embedding_dimension(), settings.vector_dimension)
        finally:
            settings.EMBEDDING_PROVIDER = previous_provider
            settings.EMBEDDING_MODEL = previous_model

    def test_hash_provider_gives_zero_vector_for_empty_text(self):
        # hash provider는 토큰이 없으면 영벡터가 된다(폴백 경로 동작 확인).
        self.assertEqual(sum(abs(v) for v in _hash_embed("", 256)), 0.0)

    def test_active_provider_is_reported(self):
        self.assertIn(active_provider(), {"sentence-transformers", "hash"})


class ChunkingTests(unittest.TestCase):
    def test_short_text_is_single_chunk(self):
        self.assertEqual(chunk_text("hello world", chunk_size=100), ["hello world"])

    def test_long_text_is_split_with_overlap(self):
        text = ". ".join(f"sentence number {i}" for i in range(100))
        chunks = chunk_text(text, chunk_size=200, overlap=50)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 200 for chunk in chunks))

    def test_empty_text_gives_no_chunks(self):
        self.assertEqual(chunk_text("   \n  "), [])


class JudgmentTests(unittest.TestCase):
    def test_decision_phrasing_detected(self):
        self.assertEqual(classify_utterance("이 기능은 다음 분기에 적용하기로 결정했습니다"), "decision")
        self.assertEqual(classify_utterance("배포는 금요일에 진행하죠"), "decision")

    def test_proposal_phrasing_detected(self):
        self.assertEqual(classify_utterance("다크 모드 추가는 어떨까요"), "proposal")

    def test_plain_utterance_is_ignored(self):
        self.assertIsNone(classify_utterance("네 알겠습니다"))

    def test_topic_state_machine(self):
        self.assertEqual(
            allowed_states("topic"), {"PROPOSED", "DECIDED", "REVISITED", "DROPPED"}
        )
        self.assertTrue(can_transition("topic", "DECIDED", "REVISITED"))
        self.assertTrue(can_transition("topic", "REVISITED", "DECIDED"))
        self.assertFalse(can_transition("topic", "DROPPED", "DECIDED"))
        self.assertFalse(can_transition("topic", "DECIDED", "PROPOSED"))


class Phase4ContractTests(unittest.TestCase):
    def test_phase4_routes_exist(self):
        paths = app.openapi()["paths"]
        self.assertIn("post", paths["/rag/search"])
        self.assertIn("post", paths["/documents/{document_id}/process"])
        self.assertIn("get", paths["/documents/{document_id}/chunks"])
        self.assertIn("get", paths["/meetings/{meeting_id}/topics"])
        self.assertIn("patch", paths["/topics/{topic_id}/state"])
        self.assertIn("get", paths["/stt-results/{stt_result_id}/transcript"])

    def test_chunk_schema_accepts_speaker_embedding(self):
        from app.schemas.realtime import SttChunkCreate

        chunk = SttChunkCreate(
            chunk_id="c-1",
            text="테스트 발화",
            speaker_embedding=[0.1, 0.2, 0.3],
        )
        self.assertEqual(chunk.speaker_embedding, [0.1, 0.2, 0.3])


if __name__ == "__main__":
    unittest.main()
