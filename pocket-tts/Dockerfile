# Kyutai Pocket TTS (CPU) als HTTP-Dienst: POST /tts (multipart, Feld "text") -> audio/wav
FROM python:3.12-slim
ARG POCKET_TTS_VERSION=4.0.1
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir pocket-tts==${POCKET_TTS_VERSION}
ENV HF_HOME=/hf
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8000/health\")" || exit 1
ENTRYPOINT ["sh", "-c", "exec pocket-tts serve --host 0.0.0.0 --port 8000 --language \"${POCKET_TTS_LANGUAGE:-german_24l}\" --default-voice \"${POCKET_TTS_VOICE:-vera}\" $( [ \"$POCKET_TTS_QUANTIZE\" = true ] && echo --quantize )"]
