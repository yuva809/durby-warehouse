"""
PaddleOCR fallback service. Internal-only — see docker-compose.yml (no
public port mapping; the backend reaches this at OCR_SERVICE_URL). This
service does exactly one thing: turn image/PDF bytes into text. It knows
nothing about invoices, products, or Durby's business logic — that all
stays in the NestJS backend (apps/api/src/supplier-invoices), per the spec's
"the OCR service should be responsible for OCR" / "the NestJS application
should remain responsible for business logic."
"""

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .ocr_engine import run_ocr

app = FastAPI(title="Durby Warehouse OCR Service")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB — a scanned multi-page invoice, not a document dump
ALLOWED_CONTENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {content_type}")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)}MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        result = run_ocr(data, content_type)
    except Exception as exc:  # noqa: BLE001 — deliberately broad: any OCR failure must come back
        # as a clean, structured error the backend can show the manager as a
        # recoverable review state, never as a raw 500 that looks like the
        # invoice itself is corrupted (see the spec's OCR-failure scenario).
        raise HTTPException(status_code=502, detail=f"OCR processing failed: {exc}") from exc

    return JSONResponse(
        {
            "text": result.text,
            "pages": [
                {"pageNumber": p.page_number, "text": p.text, "confidence": p.confidence}
                for p in result.pages
            ],
            "confidence": result.confidence,
            "processingTimeMs": result.processing_time_ms,
        }
    )
