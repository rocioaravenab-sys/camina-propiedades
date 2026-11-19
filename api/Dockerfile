FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY DOSSIER_COMMIT ./
COPY scripts ./scripts
# GITHUB_TOKEN llega como build arg (en Railway: variable del servicio).
ARG GITHUB_TOKEN
RUN GITHUB_TOKEN="$GITHUB_TOKEN" ./scripts/traer_dossier.sh

COPY app ./app

ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
