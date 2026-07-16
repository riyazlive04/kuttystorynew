from fastapi import APIRouter, HTTPException

from ..db import prisma
from ..serializers import story_dict

router = APIRouter(prefix="/stories", tags=["stories"])


@router.get("")
async def list_stories():
    stories = await prisma.story.find_many(
        where={"active": True}, order={"createdAt": "asc"}
    )
    return [story_dict(s) for s in stories]


@router.get("/{slug}")
async def get_story(slug: str):
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return story_dict(story)
