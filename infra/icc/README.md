# CMYK output profile

Drop your printer's ICC profile here (`*.icc`) and the print PDF is converted
through it instead of through arithmetic.

`/health` tells you which is happening:

    "print": { "cmykProfile": "...", "colorManaged": true }

`colorManaged: false` means no profile was found. The book still prints — blacks
still land on the K plate rather than as a 300% three-colour overprint — but the
colour is not managed, and on artwork authored in Coated FOGRA39 (which the base
plates are) the difference is visible.

Three ways to provide one, in the order the code looks:

1. `CMYK_ICC_PROFILE=/path/to/profile.icc` in the environment
2. this directory, committed with the repo
3. `<storage volume>/icc/` on the server — `scp` it in, restart nothing:

       docker compose cp profile.icc api:/app/storage/icc/profile.icc

Ask your printer which profile they want. If they have no preference, Coated
FOGRA39 / ISO Coated v2 matches how the base art was authored.
