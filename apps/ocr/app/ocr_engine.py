"""
Thin wrapper around PaddleOCR — this module owns everything PaddleOCR-
specific (model selection, the exact shape of its result objects) so the
rest of the service (main.py) only ever sees the small, stable
PageResult/OcrResult shapes below. If a future PaddleOCR upgrade changes its
internal result format, this is the only file that should need to change.
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF — PDF -> page images, no external system deps needed
from PIL import Image

_engine = None  # lazily created singleton — see get_ocr_engine()


@dataclass
class PageResult:
    page_number: int
    text: str
    confidence: float  # 0-1, mean of per-line recognition scores on this page


@dataclass
class OcrResult:
    text: str  # all pages joined, reading order preserved
    pages: list[PageResult] = field(default_factory=list)
    confidence: float = 0.0  # mean across pages
    processing_time_ms: int = 0


def get_ocr_engine():
    """
    Lazily constructs (and caches) the PaddleOCR pipeline. Deliberately the
    smallest configuration that still gives good invoice/receipt text
    recognition — no GPU, no document-unwarping/orientation-classification
    stages a flat-scanned invoice doesn't need, English text (this app's
    invoices are English-language grocery/FMCG products). Called once at
    Docker build time (see Dockerfile) to bake the model download into the
    image layer, and again lazily at runtime as a fallback if that ever
    didn't happen (e.g. a local `python -m uvicorn` run outside Docker).
    """
    global _engine
    if _engine is None:
        from paddleocr import PaddleOCR

        _engine = PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _engine


def _render_pdf_pages(pdf_bytes: bytes, dpi: int = 200) -> list[Image.Image]:
    """PDF -> one PIL image per page. 200dpi is a deliberate balance: high
    enough for small invoice-table text to stay legible to the recognition
    model, low enough that a multi-page scan doesn't balloon memory/CPU time
    on a machine with no GPU."""
    images = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        zoom = dpi / 72
        matrix = fitz.Matrix(zoom, zoom)
        for page in doc:
            pix = page.get_pixmap(matrix=matrix)
            images.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    finally:
        doc.close()
    return images


def _run_page(engine, image: Image.Image) -> tuple[str, float]:
    """Runs PaddleOCR on one page image, returns (reading-order text, mean confidence)."""
    import numpy as np

    result = engine.predict(np.array(image))
    if not result:
        return "", 0.0

    page = result[0]
    # PaddleOCR 3.x's pipeline result is dict-like; rec_texts/rec_scores are
    # already ordered top-to-bottom by the pipeline itself, so joining them
    # in order IS reading order for a normal single-column invoice.
    texts = list(page.get("rec_texts") or [])
    scores = list(page.get("rec_scores") or [])
    text = "\n".join(t for t in texts if t and t.strip())
    confidence = (sum(scores) / len(scores)) if scores else 0.0
    return text, confidence


def run_ocr(file_bytes: bytes, content_type: str) -> OcrResult:
    """
    The one entry point main.py calls. Accepts either a PDF or a plain
    image (the pipeline can be asked to OCR a single scanned page image
    directly too, not only a full PDF). Never raises for "nothing found" —
    an empty/unusable page just produces an empty-text PageResult; only a
    genuinely broken input (e.g. corrupt PDF) raises, which main.py turns
    into a clean error response rather than a crash.
    """
    start = time.monotonic()
    engine = get_ocr_engine()

    if content_type == "application/pdf" or file_bytes[:4] == b"%PDF":
        images = _render_pdf_pages(file_bytes)
    else:
        images = [Image.open(io.BytesIO(file_bytes)).convert("RGB")]

    pages: list[PageResult] = []
    for i, image in enumerate(images, start=1):
        text, confidence = _run_page(engine, image)
        pages.append(PageResult(page_number=i, text=text, confidence=confidence))

    full_text = "\n\n".join(p.text for p in pages if p.text)
    mean_confidence = (sum(p.confidence for p in pages) / len(pages)) if pages else 0.0
    elapsed_ms = int((time.monotonic() - start) * 1000)

    return OcrResult(text=full_text, pages=pages, confidence=mean_confidence, processing_time_ms=elapsed_ms)
