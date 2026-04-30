FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (ffmpeg for audio format conversion)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install scrapers package
COPY scrapers/ /opt/scrapers/
RUN pip install --no-cache-dir /opt/scrapers/

# Create non-root user BEFORE copying app code
RUN useradd --no-create-home --shell /bin/false appuser

# Copy with correct ownership so appuser can read
COPY --chown=appuser:appuser backend/app/ app/
COPY --chown=appuser:appuser backend/templates/ templates/

USER appuser

# Cloud Run sets PORT environment variable
ENV PORT=8080

EXPOSE ${PORT}

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 2"]
