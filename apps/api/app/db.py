"""Prisma client singleton.

The generated Prisma client (`prisma generate`) provides `prisma.Prisma`.
We keep a single connected instance for the FastAPI lifespan.
"""
from prisma import Prisma

prisma = Prisma()


async def connect() -> None:
    if not prisma.is_connected():
        await prisma.connect()


async def disconnect() -> None:
    if prisma.is_connected():
        await prisma.disconnect()
