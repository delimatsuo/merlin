from app.api.applications_queue import _autoapply_rejection_reason


def test_gupy_vaga_ja_whatsapp_jobs_are_rejected_for_autoapply():
    reason = _autoapply_rejection_reason(
        "gupy",
        "https://vaga-ja.com/vagas/fitness-brasil-ltda/analista-de-marketing-digital-hibrido?jobBoardSource=gupy_portal",
    )

    assert reason == "unsupported_apply_method"


def test_gupy_io_and_catho_urls_remain_autoapply_supported():
    assert (
        _autoapply_rejection_reason(
            "gupy",
            "https://empresa.gupy.io/jobs/123?jobBoardSource=gupy_portal",
        )
        is None
    )
    assert (
        _autoapply_rejection_reason(
            "catho",
            "https://www.catho.com.br/vagas/supervisor-de-marketing/36403512",
        )
        is None
    )


def test_unknown_source_is_rejected_before_url_host_logic():
    assert _autoapply_rejection_reason("linkedin", "https://linkedin.com/jobs/1") == "unsupported_source"
