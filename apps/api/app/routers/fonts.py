"""Serve the actual font files the text layer draws with.

The page editor used to preview text in a CSS stack that only approximated the
render: a page set to "Sans" showed Segoe UI in the admin's browser and printed
DejaVu Sans in the book, and an admin-uploaded font previewed as Segoe UI and
printed as itself. The editor is where the type is positioned and sized, so
previewing a different typeface makes every line break and every "does this
fit" judgement wrong.

Handing the browser the same file Pillow opens settles it. Public on purpose:
a @font-face request carries no Authorization header, and a font file is not a
secret. Only the families the text layer itself knows are served, by key, so
this can never be turned into a way to read arbitrary files.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..text_layer import font_file

router = APIRouter(prefix="/fonts", tags=["fonts"])

MEDIA_TYPES = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".ttc": "font/collection",
}


@router.get("/{key:path}/file")
async def font_file_download(key: str):
    path = font_file(key)
    if not path:
        raise HTTPException(status_code=404, detail="No such font")
    ext = os.path.splitext(path)[1].lower()
    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(ext, "application/octet-stream"),
        # The file for a given key never changes without the key changing, and
        # the editor asks for it on every keystroke-triggered re-render.
        headers={"Cache-Control": "public, max-age=86400"},
    )
