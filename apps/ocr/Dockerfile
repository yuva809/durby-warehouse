# PaddleOCR fallback service — separate Python service (PaddleOCR/PaddlePaddle
# have no Node equivalent), internal-only (see docker-compose.yml: no public
# ports, reached by the backend purely via OCR_SERVICE_URL=http://ocr:8000).
#
# CPU-only throughout — paddlepaddle here is the CPU wheel, and
# ocr_engine.py never requests GPU inference. Both local dev and the
# planned Hetzner box are expected to run this without a GPU.
FROM python:3.11-slim

WORKDIR /app

# libgl1 + libglib2.0-0: opencv-python (a transitive dependency of
# paddleocr/paddlex) fails to import without them on a slim base image.
# libgomp1: paddlepaddle's compiled core needs the GNU OpenMP runtime.
# All three confirmed necessary by actually building this image, not assumed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non-root at runtime. Debian's `adduser --system` with no --home defaults
# HOME to the literal path "/nonexistent" (deliberately not created) — fine
# for a user that never writes anything, but PaddleX/PaddleOCR write their
# config/model cache under $HOME on first use, so that default broke OCR
# with a permission error before inference ever ran (confirmed by actually
# running it). Give the user a real, owned home directory instead.
RUN addgroup --system app \
    && adduser --system --ingroup app --home /home/app app \
    && mkdir -p /home/app \
    && chown -R app:app /home/app
ENV HOME=/home/app
USER app

# Pre-download the OCR models at build time (not on first request) so the
# container is immediately ready after startup and a cold start never adds
# latency to a manager's invoice upload. Runs as `app` (after the USER
# switch above) so the cache lands under the same $HOME the runtime
# process reads from — pre-downloading as root here would cache into
# root's home instead and silently defeat the point of this step. Uses
# the same lightweight "mobile" models the app requests at runtime — see
# app/ocr_engine.py. Best-effort: `|| true` so a build-environment quirk
# (no network egress during a restricted build, a transient model-host
# hiccup) never fails the whole image build — the app lazily
# re-downloads/initializes on first real request if this step didn't
# complete, per get_ocr_engine()'s lazy-init.
RUN python3 -c "from app.ocr_engine import get_ocr_engine; get_ocr_engine()" || true

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
