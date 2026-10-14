"""Uploaded document text extraction and chunking for the RAG pipeline.

Supported formats: .txt/.md (plain read), .docx (stdlib zip + XML), .pdf
(pypdf). Unsupported or unreadable files raise DocumentParseError so the
caller can mark the document FAILED.
"""

import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

_DOCX_NAMESPACE = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class DocumentParseError(Exception):
    pass


def _extract_txt(path: Path) -> str:
    for encoding in ("utf-8", "cp949", "euc-kr", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    raise DocumentParseError("Unable to decode text file")


def _extract_docx(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise DocumentParseError(f"Invalid docx file: {exc}") from exc
    root = ET.fromstring(xml_bytes)
    paragraphs = []
    for paragraph in root.iter(f"{_DOCX_NAMESPACE}p"):
        runs = [node.text or "" for node in paragraph.iter(f"{_DOCX_NAMESPACE}t")]
        line = "".join(runs).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def _extract_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise DocumentParseError(
            "pypdf is not installed; run pip install -r requirements.txt"
        ) from exc
    try:
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise DocumentParseError(f"Invalid pdf file: {exc}") from exc
    return "\n".join(page.strip() for page in pages if page.strip())


_EXTRACTORS = {
    ".txt": _extract_txt,
    ".md": _extract_txt,
    ".csv": _extract_txt,
    ".docx": _extract_docx,
    ".pdf": _extract_pdf,
}


def supported_extensions() -> set[str]:
    return set(_EXTRACTORS.keys())


def extract_text(storage_path: str, original_filename: str) -> str:
    path = Path(storage_path)
    if not path.exists():
        raise DocumentParseError("Stored file not found")
    extension = Path(original_filename).suffix.lower() or path.suffix.lower()
    extractor = _EXTRACTORS.get(extension)
    if extractor is None:
        raise DocumentParseError(f"Unsupported document type: {extension or 'unknown'}")
    text = extractor(path)
    if not text.strip():
        raise DocumentParseError("Document has no extractable text")
    return text


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[str]:
    chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
    overlap = overlap if overlap is not None else settings.RAG_CHUNK_OVERLAP
    overlap = min(overlap, chunk_size - 1) if chunk_size > 1 else 0

    normalized = re.sub(r"\s+\n", "\n", text.strip())
    if not normalized:
        return []
    if len(normalized) <= chunk_size:
        return [normalized]

    chunks = []
    start = 0
    while start < len(normalized):
        end = min(start + chunk_size, len(normalized))
        window = normalized[start:end]
        if end < len(normalized):
            # prefer breaking at a sentence/paragraph boundary near the end
            cut = max(window.rfind("\n"), window.rfind(". "), window.rfind("? "), window.rfind("! "))
            if cut > chunk_size // 2:
                end = start + cut + 1
                window = normalized[start:end]
        chunk = window.strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks
