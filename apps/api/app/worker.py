from celery import Celery

from .config import settings

celery_app = Celery(
    "kuttystory",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    # Ack a render only once it finishes, so a worker restart or crash redelivers
    # it instead of silently dropping a paying customer's book. Renders are the
    # only tasks here and they re-run from the top safely.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Real GPU rendering of a full preview (many pages, each a hosted model call,
    # plus rate-limit backoff) can take a while — allow generous headroom. The
    # soft limit lets a task clean up before the hard kill.
    task_time_limit=3600,
    task_soft_time_limit=3300,
    # Keep real stdout/stderr: Prisma spawns its query-engine subprocess and
    # needs a fd with .fileno(); Celery's LoggingProxy breaks that.
    worker_redirect_stdouts=False,
    beat_schedule={
        "purge-expired-hourly": {
            "task": "app.tasks.purge_expired",
            "schedule": 3600.0,  # every hour
        },
        # Often enough that a dead render is caught while the customer is still
        # on the page, rather than found the next morning.
        "reap-stalled-renders": {
            "task": "app.tasks.reap_stalled",
            "schedule": 300.0,  # every 5 minutes
        },
    },
)

# Ensure task modules are registered when the worker boots.
celery_app.autodiscover_tasks(["app"])

from . import tasks  # noqa: E402,F401
