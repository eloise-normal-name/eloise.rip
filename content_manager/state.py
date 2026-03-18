from __future__ import annotations

import threading
from dataclasses import dataclass, field


@dataclass
class AppState:
    jobs_lock: threading.Lock = field(default_factory=threading.Lock)
    jobs: dict = field(default_factory=dict)
    media_jobs: dict = field(default_factory=dict)
    drafts: dict = field(default_factory=dict)

    def update_store(self, store: dict, job_id: str, **updates) -> None:
        with self.jobs_lock:
            if job_id in store:
                store[job_id].update(updates)

    def set_job(self, job_id: str, **updates) -> None:
        self.update_store(self.jobs, job_id, **updates)

    def set_media_job(self, job_id: str, **updates) -> None:
        self.update_store(self.media_jobs, job_id, **updates)
