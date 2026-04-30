from scrapers.types import RawJob


def test_raw_job_required_fields():
    job: RawJob = {
        "source": "gupy",
        "source_id": "123",
        "source_url": "https://example.com/job/123",
        "raw_text": "Backend developer needed",
        "title_hint": "Backend Developer",
    }
    assert job["source"] == "gupy"
    assert job["source_id"] == "123"


def test_raw_job_optional_fields_default_none():
    job: RawJob = {
        "source": "catho",
        "source_id": "456",
        "source_url": "https://catho.com/vagas/dev/456",
        "raw_text": "Full description here",
        "title_hint": "Developer",
    }
    assert job.get("company_hint") is None
    assert job.get("salary_hint") is None
    assert job.get("location_hint") is None
