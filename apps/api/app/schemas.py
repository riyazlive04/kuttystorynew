from typing import Literal, Optional
from pydantic import BaseModel, EmailStr, Field

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
    gallery: list[str]
    themeColor: str
    supportsTamil: bool
    highlights: list[str]
    genderLock: Optional[Literal["boy", "girl"]] = None


class PersonalizationIn(BaseModel):
    storySlug: str
    childName: str = Field(min_length=1, max_length=40)
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
    amount: int  # rupees
    receipt: Optional[str] = None  # our reference, shown in the Razorpay dashboard


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
