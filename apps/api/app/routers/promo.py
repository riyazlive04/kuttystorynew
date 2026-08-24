from fastapi import APIRouter

from ..promo import describe
from ..schemas import ValidatePromoIn, ValidatePromoOut

router = APIRouter(prefix="/promo", tags=["promo"])


@router.post("/validate", response_model=ValidatePromoOut)
async def validate_promo(payload: ValidatePromoIn):
    """Price a promo code server-side.

    The storefront no longer knows any discount rules, so the private admin code
    never has to appear in the JS bundle to work.
    """
    result = describe(payload.code, payload.subtotal, payload.quantity)
    discount = min(result["discount"], payload.subtotal)
    return ValidatePromoOut(
        ok=result["ok"],
        discount=discount,
        code=result["code"],
        message=result["message"],
        total=max(0, payload.subtotal - discount),
    )
