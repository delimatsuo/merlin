from app.jobs.scraper import _is_brazilian_job


def test_is_brazilian_job_does_not_reject_brazilian_state_code_substrings():
    assert _is_brazilian_job("Campina Grande, PB")
    assert _is_brazilian_job("Candidatura rapida")


def test_is_brazilian_job_rejects_explicit_non_brazil_locations():
    assert not _is_brazilian_job("San Francisco, California")
