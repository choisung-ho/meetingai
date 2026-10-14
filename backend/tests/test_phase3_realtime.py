import asyncio
import unittest

from app.main import app
from app.services.context_buffer import BufferedUtterance, MeetingContextBuffer
from app.services.realtime_service import normalize_speaker


class ContextBufferTests(unittest.TestCase):
    def test_buffer_keeps_latest_n_utterances(self):
        async def scenario():
            buffer = MeetingContextBuffer(max_items=2, max_chars=100)
            for sequence in range(1, 4):
                await buffer.append(
                    7,
                    BufferedUtterance(sequence, sequence, "SPEAKER_1", str(sequence), None, None),
                )
            return await buffer.snapshot(7)

        result = asyncio.run(scenario())
        self.assertEqual([item["sequence"] for item in result], [2, 3])

    def test_buffer_respects_character_window(self):
        async def scenario():
            buffer = MeetingContextBuffer(max_items=10, max_chars=5)
            await buffer.append(1, BufferedUtterance(1, 1, "A", "1234", None, None))
            return await buffer.append(1, BufferedUtterance(2, 2, "B", "abc", None, None))

        result = asyncio.run(scenario())
        self.assertEqual([item["text"] for item in result], ["abc"])


class RealtimeContractTests(unittest.TestCase):
    def test_realtime_routes_exist(self):
        paths = app.openapi()["paths"]
        self.assertIn("post", paths["/realtime/meetings/{meeting_id}/chunks"])
        self.assertIn("post", paths["/realtime/analysis-results"])
        self.assertIn("post", paths["/realtime/analysis/realtime"])
        self.assertIn("get", paths["/realtime/meetings/{meeting_id}/access"])

    def test_speaker_preprocessing_has_unknown_fallback(self):
        self.assertEqual(normalize_speaker(None), "Unknown")
        self.assertEqual(normalize_speaker("  SPEAKER_01  "), "SPEAKER_01")

    def test_stt_list_requires_meeting_id(self):
        operation = app.openapi()["paths"]["/stt-results/"]["get"]
        meeting_parameter = next(
            parameter for parameter in operation["parameters"]
            if parameter["name"] == "meeting_id"
        )
        self.assertTrue(meeting_parameter["required"])

    def test_stt_response_contains_workspace_id(self):
        stt_schema = app.openapi()["components"]["schemas"]["SttResult"]
        self.assertIn("workspace_id", stt_schema["properties"])
        self.assertIn("workspace_id", stt_schema["required"])


if __name__ == "__main__":
    unittest.main()
