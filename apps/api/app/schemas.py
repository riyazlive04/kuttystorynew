from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator

Language = Literal["en", "ta", "bilingual"]
Format = Literal["pdf", "print"]


class PreviewPage(BaseModel):
    index: int
    imageUrl: str
    caption: str
    locked: bool


class StoryOut(BaseModel):
    id: str
    slug: str
    title: str
    tagline: str
    description: str
    categoryTag: str
    ageRange: str
    pdfPrice: int
    printPrice: int
    bilingualAddon: int
    pages: int
    coverImage: str
    coverImageGirl: Optional[str] = None
    gallery: list[str]
    themeColor: str
    supportsTamil: bool
    highlights: list[str]
    genderLock: Optional[Literal["boy", "girl"]] = None


def capitalize_name(name: str) -> str:
    """Give a typed-in name its capitals back: "aarav kumar" -> "Aarav Kumar".

    The name is printed in the book, so "aarav" on the page reads as a defect.
    Only the FIRST letter of each part is touched: an all-caps "AARAV" is left
    as typed (a parent who shouts the name meant to), and so are the internal
    capitals in "McArthur" or "D'Souza", which .title() would destroy.
    Hyphens and apostrophes start a new part -- "mary-jane" -> "Mary-Jane".
    """
    out, start_of_part = [], True
    for ch in (name or "").strip():
        out.append(ch.upper() if start_of_part else ch)
        start_of_part = ch in " -'’"
    return "".join(out)


class PersonalizationIn(BaseModel):
    storySlug: str
    childName: str = Field(min_length=1, max_length=40)

    @field_validator("childName")
    @classmethod
    def _capitalize(cls, v: str) -> str:
        return capitalize_name(v)
    gender: Literal["boy", "girl", "neutral"] = "neutral"
    ageYears: int = Field(default=4, ge=0, le=15)
    language: Language = "en"
    skinTone: Literal["light", "medium", "tan", "deep"] = "medium"
    dedication: Optional[str] = None
    photoUrl: Optional[str] = None       # rawPhotoUrl from /upload (primary)
    photoUrls: list[str] = []            # a few photos for stronger identity
    photoDataUrl: Optional[str] = None   # ignored server-side (client preview only)


class JobOut(BaseModel):
    id: str
    storySlug: str
    storyTitle: str
    childName: str
    language: str
    status: str
    progress: int
    pages: list[PreviewPage]
    createdAt: str


class CartItemIn(BaseModel):
    id: str
    jobId: str
    storySlug: str
    storyTitle: str
    childName: str
    format: Format
    language: Language
    coverImage: str
    unitPrice: int
    quantity: int = Field(ge=1)


class CustomerIn(BaseModel):
    name: str
    email: EmailStr
    phone: str
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


class ValidatePromoIn(BaseModel):
    code: str
    subtotal: int
    quantity: int = 1


class ValidatePromoOut(BaseModel):
    ok: bool
    discount: int = 0
    code: Optional[str] = None
    message: str
    total: int


class OrderIn(BaseModel):
    items: list[CartItemIn]
    customer: CustomerIn
    subtotal: int
    discount: int = 0
    promoCode: Optional[str] = None
    shipping: int = 0
    total: int


class OrderOut(BaseModel):
    id: str
    status: str
    items: list[CartItemIn]
    customer: CustomerIn
    subtotal: int
    shipping: int
    total: int
    createdAt: str


class CreatePaymentIn(BaseModel):
    # Names the order to pay for. Deliberately carries NO amount: the price is
    # whatever the server already stored against this order.
    orderId: str


class CreatePaymentOut(BaseModel):
    id: str
    amount: int  # paise
    currency: str = "INR"
    live: bool


class VerifyPaymentIn(BaseModel):
    orderId: str  # our order id
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
