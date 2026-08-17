FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps + Node 20 (Prisma Python client uses Node to fetch its engine).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg fonts-dejavu-core \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Extra families offered by the page editor's font picker, plus free ICC
# profiles so the print PDF's RGB->CMYK conversion is colour-managed. Optional
# on purpose: without them the text layer falls back to DejaVu and the colour
# conversion falls back to its own black generation (see app/color.py).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       fonts-liberation fonts-comic-neue icc-profiles-free \
    ; rm -rf /var/lib/apt/lists/*

# Use the system Node instead of downloading a nodeenv at generate time.
ENV PRISMA_USE_GLOBAL_NODE=true

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Fetch the Prisma query engine + generate the Python client at build time.
RUN prisma generate

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
