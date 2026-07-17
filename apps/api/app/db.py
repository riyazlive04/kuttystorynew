"""Prisma client singleton.

The generated Prisma client (`prisma generate`) provides `prisma.Prisma`.
We keep a single connected instance for the FastAPI lifespan.
"""
from datetime import timedelta

from prisma import Prisma

prisma = Prisma()


async def connect() -> None:
    if not prisma.is_connected():
        await prisma.connect()


async def disconnect() -> None:
    if prisma.is_connected():
        # Bounded on purpose: disconnect() without a timeout sends SIGINT to the
        # query engine and then waits forever, since its SIGKILL fallback only
        # runs on TimeoutExpired. That hangs shutdown if the engine ignores SIGINT.
        await prisma.disconnect(timeout=timedelta(seconds=5))
