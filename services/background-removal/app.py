import asyncio
import io
import os
import threading

from fastapi import FastAPI, HTTPException, Request
from PIL import Image, ImageOps
from rembg import new_session, remove

MAX_IMAGE_BYTES = int(os.getenv("BACKGROUND_REMOVAL_MAX_IMAGE_MB", "10")) * 1024 * 1024
MAX_PIXELS = int(os.getenv("BACKGROUND_REMOVAL_MAX_PIXELS", "20000000"))
TIMEOUT_SECONDS = int(os.getenv("BACKGROUND_REMOVAL_TIMEOUT_SECONDS", "120"))
semaphore = asyncio.Semaphore(max(1, int(os.getenv("BACKGROUND_REMOVAL_CONCURRENCY", "1"))))
model_lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
session = None


@app.on_event("startup")
def load_model():
    global session
    session = new_session("u2net")


@app.get("/health/ready")
def health():
    if session is None:
        raise HTTPException(503, "Model unavailable")
    return {"status": "ready"}


async def read_limited(request: Request) -> bytes:
    parts = []
    size = 0
    async for part in request.stream():
        size += len(part)
        if size > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Image exceeds configured size")
        parts.append(part)
    if not size:
        raise HTTPException(400, "Image is empty")
    return b"".join(parts)


def remove_background(source: bytes) -> bytes:
    model_lock.acquire()
    try:
        with Image.open(io.BytesIO(source)) as image:
            image.verify()
        with Image.open(io.BytesIO(source)) as image:
            image = ImageOps.exif_transpose(image)
            if image.width * image.height > MAX_PIXELS:
                raise HTTPException(413, "Image exceeds configured pixel count")
        result = remove(source, session=session, force_return_bytes=True)
        with Image.open(io.BytesIO(result)) as output:
            output.load()
            if output.format != "PNG" or output.size != image.size or "A" not in output.getbands():
                raise ValueError("Transparent PNG output is invalid")
            if output.getchannel("A").getextrema() == (255, 255):
                raise ValueError("Output alpha channel is opaque")
        return result
    except HTTPException:
        raise
    except Exception as error:
        raise ValueError("Background removal failed") from error
    finally:
        model_lock.release()


@app.post("/v1/remove-background")
async def remove_background_endpoint(request: Request):
    async with semaphore:
        try:
            source = await asyncio.wait_for(read_limited(request), timeout=TIMEOUT_SECONDS)
            output = await asyncio.wait_for(asyncio.to_thread(remove_background, source), timeout=TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            raise HTTPException(504, "Background removal timed out")
        except ValueError:
            raise HTTPException(422, "Background removal failed")
        return RequestResponse(output, media_type="image/png")


from fastapi.responses import Response as RequestResponse
