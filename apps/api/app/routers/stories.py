from fastapi import APIRouter, HTTPException

from ..db import prisma
from ..serializers import story_dict

router = APIRouter(prefix="/stories", tags=["stories"])


# The page templates come along so story_dict can publish `samplePages` — the
# storefront shows real pages from the live books, so unpublishing a book takes
# its artwork off the homepage too.
_WITH_PAGES = {"pageTemplates": True}


@router.get("")
async def list_stories():
    stories = await prisma.story.find_many(
        where={"active": True}, order={"createdAt": "asc"}, include=_WITH_PAGES
    )
    return [story_dict(s) for s in stories]


@router.get("/{slug}")
async def get_story(slug: str):
    story = await prisma.story.find_unique(
        where={"slug": slug}, include=_WITH_PAGES
    )
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return story_dict(story)
