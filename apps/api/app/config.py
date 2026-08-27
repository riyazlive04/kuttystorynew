from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core
    app_name: str = "KuttyStory API"
    environment: str = "development"

    # Datastores
    database_url: str = "postgresql://kutty:kutty@localhost:5432/kuttystory"
    redis_url: str = "redis://localhost:6379/0"

    # CORS — comma-separated list of allowed origins
    cors_origins: str = "http://localhost:3000"

    # Admin dashboard bearer token
    admin_token: str = "kutty-admin-dev"

    # Razorpay (leave blank to run in mock-payment mode)
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # Private admin promo code: collapses any cart to `admin_test_promo_total`
    # rupees so a real payment can be pushed through the LIVE gateway cheaply.
    # Blank disables it entirely — there is no default, so a deploy that never
    # sets it simply has no such code. Never expose this to the client bundle.
    admin_test_promo_code: str = ""
    admin_test_promo_total: int = 5

    # GPU provider: "mock" | "runpod" | "replicate" | "comfyui"
    gpu_provider: str = "mock"

    # RunPod Serverless (ComfyUI worker)
    runpod_api_key: str = ""
    runpod_endpoint_id: str = ""

    # Replicate
    replicate_api_token: str = ""
    replicate_model_version: str = ""  # flux-pulid txt2img; e.g. "owner/model:versionhash"

    # Render mode on the replicate provider:
    #   "faceswap" — personalize the child's face onto a page's FIXED base
    #                illustration (true Diffrun behaviour: fixed pro art + identity
    #                = page-to-page character/style consistency). Falls back to
    #                txt2img when a page has no base art / no illustrated swapper.
    #   "txt2img"  — always render the scene from the prompt + identity (flux-pulid).
    replicate_mode: str = "faceswap"

    # Face personalization onto ILLUSTRATED base art. Diffrun-style consistency
    # needs a swapper that works on cartoon/illustrated targets. Segmind's
    # FaceSwap-Comic is purpose-built for this (real photo -> illustrated target);
    # generic Replicate swappers (inswapper/cdingram) fail to detect drawn faces.
    #   "segmind"  -> Segmind faceswap-comic  (needs SEGMIND_API_KEY)
    #   "replicate"-> a Replicate faceswap model (replicate_faceswap_model)
    faceswap_provider: str = "segmind"
    segmind_api_key: str = ""
    segmind_faceswap_model: str = "faceswap-comic"  # segmind model slug
    # How hard the swap pushes the child's own features against the drawn ones.
    # These are the dial to turn if a book comes back "close, but not him": the
    # geometry fixes (region shape, single feather) decide how MUCH of the face
    # is the child's, and these decide how strongly it is theirs within it.
    # Raised from 0.85 — a storybook plate is a stylised face, and the swap has
    # to overcome its drawn proportions, not blend politely into them.
    segmind_face_strength: float = 0.95
    # Held down against face_strength: this is how much of the ILLUSTRATION's
    # look survives, so pushing it up is exactly what makes a swap stop looking
    # like the child.
    segmind_style_strength: float = 0.6
    segmind_steps: int = 16
    # How far to relight the swapped face toward the plate's own lighting, 0-1.
    # Tone only — it cannot affect how much the face looks like the child, only
    # whether it looks lit by the same lamp. 0 disables it.
    segmind_tone_match: float = 0.55
    # Hosted Replicate face-swap model (used when faceswap_provider=replicate).
    # Known input schemas are auto-mapped:
    #   fofr/face-swap-with-ideogram -> target_image + character_image + prompt
    #   cdingram/face-swap           -> input_image  + swap_image
    replicate_faceswap_model: str = "fofr/face-swap-with-ideogram"
    # Plain txt2img model used to generate a page's GENERIC base illustration once
    # (no specific identity). Used by the admin "generate base art" action.
    replicate_txt2img_model: str = "black-forest-labs/flux-schnell"
    # Hosted LLM used by the AI story author (admin "Generate full story"): writes
    # a coherent per-page narrative (with {{name}}) + a scene prompt per page.
    replicate_story_model: str = "meta/meta-llama-3-70b-instruct"
    # Optional higher-quality story authors — if a key is set it takes priority
    # over Replicate automatically (no code change needed to upgrade).
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # --- OpenAI image personalization (admin-selectable alternative to Segmind) ---
    # Chosen at runtime via the admin "Image provider" toggle (app_settings.
    # imageProvider), NOT here — this block only holds the tuning knobs.
    #
    # Only the authored FACE REGION of a page is sent to OpenAI (cropped, squared,
    # padded) and the result is composited back into the untouched base plate. So
    # every pixel outside the face stays byte-identical to the authored art, which
    # is what keeps the character/scene/style consistent page to page — the same
    # property the Segmind path gets from _composite_face_region.
    openai_image_model: str = "gpt-image-1"
    # Square edge sent to /images/edits. The crop is a face, not a page, so the
    # smallest supported tier is plenty and it is also the cheapest.
    openai_image_size: str = "1024x1024"
    # "low" | "medium" | "high". Free preview pages (1..free_preview_pages) render
    # at `openai_preview_quality`; the paid/final render uses `openai_image_quality`.
    # Previews dominate spend — 13 free pages are rendered for every visitor,
    # including the ones who never buy — so they default a tier down.
    openai_image_quality: str = "medium"
    # Medium too, not a tier down: at input_fidelity="high" the input tokens
    # dominate the bill, so low only saves ~30% (~$0.106 vs ~$0.137 a page) while
    # visibly costing likeness — and the preview is what the customer judges.
    openai_preview_quality: str = "medium"
    # Preserves likeness from the input photo instead of re-imagining the face.
    openai_input_fidelity: str = "high"
    # Cache personalized face crops keyed on (plate, photo, region, quality) so a
    # retry or a re-render of the same page never bills a second time.
    openai_cache_enabled: bool = True

    # Admin-triggered SAM3 auto-tracing of a page's face outline. Off = the
    # button is refused; renders are unaffected either way, since a trace is
    # stored as an ordinary facePath.
    sam3_autotrace_enabled: bool = True

    # When a page has no traced face outline, detect one from the base art so the
    # hair-keeping composite still has a region to work with. Off = untraced
    # pages keep the old full-head swap.
    face_autodetect_enabled: bool = True

    # --- Public A/B provider comparison (/compare) -----------------------------
    # Renders ONE demo page through every configured provider. It spends money on
    # an anonymous request, so it is rate limited per IP and can be switched off
    # entirely. Admins (valid admin token) bypass the limit.
    compare_enabled: bool = True
    compare_rate_limit: int = 3
    compare_rate_window_seconds: int = 3600

    # Self-hosted ComfyUI API node
    comfyui_base_url: str = ""
    comfyui_api_key: str = ""

    # How long a mock render takes end-to-end (seconds)
    mock_render_seconds: int = 9
    free_preview_pages: int = 13  # pages 1-13 free; paywall at page 14
    total_pages: int = 28
    # How many pages render in parallel per job. Bounded so concurrent hosted
    # model calls don't trip Replicate's rate limit; raise once off shared infra.
    render_concurrency: int = 3

    # Data retention: non-purchased previews purged this long after expiry;
    # purchased/approved books preserved this many days (Diffrun: 48h / 30 days).
    data_retention_hours: int = 48
    preserved_retention_days: int = 30
    storage_dir: str = "/app/storage"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def payments_live(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)

    @property
    def gpu_live(self) -> bool:
        return self.gpu_provider != "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
