import time
import unittest

from app.api.audio import _signature
from app.core.config import settings
from app.core.logger import SensitiveDataFilter, sanitize_log_payload
from app.main import app


class SecurityContractTests(unittest.TestCase):
    def test_ai_and_audio_routes_exist(self):
        paths = app.openapi()["paths"]
        base = "/workspaces/{workspace_id}/meetings/{meeting_id}"
        self.assertIn("get", paths[f"{base}/ai"])
        self.assertIn("post", paths[f"{base}/ai/re-analyze"])
        self.assertIn("post", paths[f"{base}/ai/result"])
        self.assertIn("get", paths[f"{base}/audio/download-link"])
        self.assertIn("get", paths[f"{base}/audio/download"])

    def test_sensitive_log_payload_is_redacted_recursively(self):
        payload = {
            "meeting_id": 7,
            "raw_text": "confidential transcript",
            "nested": {"summary_text": "secret summary"},
            "items": [{"speaker_embedding": [0.1, 0.2]}],
            "validation": {"input": "untrusted request body"},
        }
        sanitized = sanitize_log_payload(payload)
        self.assertEqual(sanitized["meeting_id"], 7)
        self.assertNotIn("confidential transcript", sanitized["raw_text"])
        self.assertNotIn("secret summary", sanitized["nested"]["summary_text"])
        self.assertIn("REDACTED", sanitized["items"][0]["speaker_embedding"])
        self.assertNotIn("untrusted request body", sanitized["validation"]["input"])

    def test_audio_signature_varies_with_expiry_and_scope(self):
        original = settings.AUDIO_SIGNING_SECRET
        settings.AUDIO_SIGNING_SECRET = "security-test-key"
        try:
            now = int(time.time())
            self.assertNotEqual(_signature(1, 2, now), _signature(1, 2, now + 1))
            self.assertNotEqual(_signature(1, 2, now), _signature(2, 2, now))
        finally:
            settings.AUDIO_SIGNING_SECRET = original

    def test_log_filter_redacts_structured_arguments(self):
        import logging

        record = logging.LogRecord(
            "security-test", logging.INFO, "", 0, "payload=%s",
            ({"text": "private transcript", "meeting_id": 1},), None,
        )
        SensitiveDataFilter().filter(record)
        self.assertNotIn("private transcript", str(record.args))


if __name__ == "__main__":
    unittest.main()
