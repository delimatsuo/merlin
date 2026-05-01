from app.jobs.capping import cap_new_jobs_by_source


def _jobs(source: str, count: int) -> list[dict]:
    return [{"source": source, "source_id": f"{source}-{i}"} for i in range(count)]


def test_cap_new_jobs_by_source_does_not_starve_later_sources():
    jobs = _jobs("gupy", 10) + _jobs("catho", 3) + _jobs("vagas", 2)

    capped = cap_new_jobs_by_source(jobs, 6)

    sources = [job["source"] for job in capped]
    assert sources == ["gupy", "catho", "vagas", "gupy", "catho", "vagas"]


def test_cap_new_jobs_by_source_redistributes_when_source_exhausts():
    jobs = _jobs("gupy", 10) + _jobs("programathor", 1)

    capped = cap_new_jobs_by_source(jobs, 5)

    sources = [job["source"] for job in capped]
    assert sources == ["gupy", "programathor", "gupy", "gupy", "gupy"]
