"""Helpers for source-aware job pipeline limits."""

from collections import Counter, deque


def count_jobs_by_source(jobs: list[dict]) -> dict[str, int]:
    """Return source counts for logging and cap diagnostics."""
    return dict(Counter((job.get("source") or "unknown") for job in jobs))


def cap_new_jobs_by_source(jobs: list[dict], max_jobs: int) -> list[dict]:
    """Cap new jobs without letting the first source starve later sources.

    Scrapers append sources in a fixed order. With Gupy first, a simple slice
    can fill the whole extraction budget before Catho/Vagas/ProgramaThor are
    ever processed. Round-robin keeps source order within each board while
    guaranteeing every board gets extraction slots when it has new jobs.
    """
    if max_jobs <= 0:
        return []
    if len(jobs) <= max_jobs:
        return jobs

    buckets: dict[str, deque[dict]] = {}
    source_order: list[str] = []
    for job in jobs:
        source = job.get("source") or "unknown"
        if source not in buckets:
            buckets[source] = deque()
            source_order.append(source)
        buckets[source].append(job)

    capped: list[dict] = []
    while len(capped) < max_jobs:
        added = False
        for source in source_order:
            bucket = buckets[source]
            if not bucket:
                continue
            capped.append(bucket.popleft())
            added = True
            if len(capped) >= max_jobs:
                break
        if not added:
            break

    return capped
