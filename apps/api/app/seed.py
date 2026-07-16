"""Seed the story catalogue into Postgres.

Usage:
    python -m app.seed
"""
import asyncio

from .db import prisma, connect, disconnect
from .seed_data import STORIES


async def run() -> None:
    await connect()
    for s in STORIES:
        await prisma.story.upsert(
            where={"slug": s["slug"]},
            data={"create": s, "update": s},
        )
        print(f"  upserted: {s['slug']}")
    print(f"Seeded {len(STORIES)} stories.")
    await disconnect()


if __name__ == "__main__":
    asyncio.run(run())
