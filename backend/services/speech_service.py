"""Speech-to-text (Groq) and text-to-speech (edge-tts)."""

import asyncio
import logging
import ssl

import edge_tts
import httpx

from config import Settings

logger = logging.getLogger(__name__)

GROQ_TRANSCRIPTION_PATH = "/audio/transcriptions"

GROQ_TRANSCRIBE_TIMEOUT_SECONDS = 120.0

GROQ_TRANSCRIPTION_MAX_ATTEMPTS = 4

GROQ_TRANSCRIPTION_RETRY_BASE_DELAY_SECONDS = 0.4

SYNTHESIZED_AUDIO_MIME_TYPE = "audio/mpeg"

GROQ_INVALID_API_KEY_USER_MESSAGE = (
    "Groq rejected the API key. Confirm GROQ_API_KEY in backend/.env matches "
    "https://console.groq.com (no quotes or spaces). "
    "If you ran export GROQ_API_KEY in this shell, unset it — it overrides .env. "
    "Restart uvicorn after changing env."
)

GROQ_TLS_OR_NETWORK_USER_MESSAGE = (
    "Speech transcription failed: TLS or network error while contacting Groq. "
    "Retry once; if it persists, turn off VPN/proxy for api.groq.com, clear broken "
    "HTTP_PROXY/HTTPS_PROXY env vars, or run the backend on Python 3.11–3.13 (3.14 TLS can be unstable)."
)


class GroqTranscriptionRequestError(RuntimeError):
    """Groq speech API rejected the transcription request (non-auth failure)."""


class GroqInvalidApiKeyError(RuntimeError):
    """Groq returned 401 — API key missing, revoked, or typo."""


def _groq_http_client() -> httpx.AsyncClient:
    """HTTP client for Groq: no env-proxy auto-config (often breaks TLS); HTTP/1.1 only."""
    return httpx.AsyncClient(
        timeout=GROQ_TRANSCRIBE_TIMEOUT_SECONDS,
        trust_env=False,
        http2=False,
    )


async def transcribe_audio(
    settings: Settings,
    audio_bytes: bytes,
    filename: str,
) -> str:
    """Transcribe audio bytes using Groq OpenAI-compatible speech API."""
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY is not configured")

    url = f"{settings.groq_base_url.rstrip('/')}{GROQ_TRANSCRIPTION_PATH}"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

    response: httpx.Response | None = None
    for attempt in range(GROQ_TRANSCRIPTION_MAX_ATTEMPTS):
        try:
            async with _groq_http_client() as client:
                response = await client.post(
                    url,
                    headers=headers,
                    files={"file": (filename, audio_bytes)},
                    data={"model": settings.groq_whisper_model},
                )
            break
        except (ssl.SSLError, httpx.RequestError, BrokenPipeError) as exc:
            logger.warning(
                "Groq transcription transport error (attempt %s/%s): %s",
                attempt + 1,
                GROQ_TRANSCRIPTION_MAX_ATTEMPTS,
                exc,
            )
            if attempt >= GROQ_TRANSCRIPTION_MAX_ATTEMPTS - 1:
                logger.exception("Groq transcription failed after retries")
                raise GroqTranscriptionRequestError(GROQ_TLS_OR_NETWORK_USER_MESSAGE) from exc
            delay = GROQ_TRANSCRIPTION_RETRY_BASE_DELAY_SECONDS * (2**attempt)
            await asyncio.sleep(delay)

    if response is None:
        raise GroqTranscriptionRequestError(GROQ_TLS_OR_NETWORK_USER_MESSAGE)

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Groq transcription failed: %s %s",
            response.status_code,
            response.text[:500],
        )
        if response.status_code == 401:
            key_len = len(settings.groq_api_key or "")
            logger.error(
                "Groq 401 invalid_api_key (Bearer length=%s). "
                "If length is 0 the app did not load backend/.env; "
                "if length is plausible, the key is wrong or overridden by the shell.",
                key_len,
            )
            raise GroqInvalidApiKeyError(GROQ_INVALID_API_KEY_USER_MESSAGE) from exc
        raise GroqTranscriptionRequestError(
            "Speech transcription failed. The upstream audio service returned an error; see server logs.",
        ) from exc

    payload = response.json()
    text = payload.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    logger.error("Groq transcription returned unexpected payload: %s", payload)
    raise GroqTranscriptionRequestError(
        "Speech transcription returned no text. Try again or use a clearer recording.",
    )


async def synthesize_speech(settings: Settings, text: str) -> bytes:
    """Synthesize speech as MPEG audio using edge-tts."""
    stripped = text.strip()
    if not stripped:
        raise ValueError("Cannot synthesize empty text")

    communicate = edge_tts.Communicate(stripped, settings.edge_tts_voice)
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])

    return b"".join(chunks)


def speech_audio_mime_type() -> str:
    """MIME type returned by edge-tts streaming synthesis."""
    return SYNTHESIZED_AUDIO_MIME_TYPE
