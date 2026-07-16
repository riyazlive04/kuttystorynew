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

# Use the system Node instead of downloading a nodeenv at generate time.
ENV PRISMA_USE_GLOBAL_NODE=true

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Fetch the Prisma query engine + generate the Python client at build time.
RUN prisma generate

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
