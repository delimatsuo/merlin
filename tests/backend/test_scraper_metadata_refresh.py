from app.jobs.scraper import _metadata_refresh_fields


def test_metadata_refresh_repairs_sparse_catho_existing_job():
    fields = _metadata_refresh_fields(
        {
            "source": "catho",
            "title_hint": "Supervisor de Marketing",
            "company_hint": "Qualitas Humanus",
            "location_hint": "Sorocaba, SP",
            "work_mode_hint": "onsite",
            "salary_hint": "BRL 9.001 - 10.000/mês",
            "posted_date_hint": "2026-05-05",
            "source_url": "https://www.catho.com.br/vagas/supervisor-de-marketing/36403512",
            "raw_text": (
                "Responsabilidades: liderar campanhas, CRM, trade marketing e indicadores. "
                "Planejar calendário comercial, acompanhar performance e apresentar relatórios."
            ),
        },
        {
            "title": "Supervisor de Marketing",
            "company": "Qualitas Humanus",
            "location": "Nao informado",
            "work_mode": "onsite",
            "posted_date": None,
            "raw_text": "Titulo: Supervisor de Marketing. Empresa: Qualitas Humanus.",
        },
        "2026-05-06T15:00:00+00:00",
    )

    assert fields["last_seen_at"] == "2026-05-06T15:00:00+00:00"
    assert fields["location"] == "Sorocaba, SP"
    assert fields["posted_date"] == "2026-05-05"
    assert fields["raw_text"].startswith("Responsabilidades")


def test_metadata_refresh_leaves_non_catho_as_last_seen_only():
    fields = _metadata_refresh_fields(
        {
            "source": "gupy",
            "location_hint": "São Paulo, SP",
            "posted_date_hint": "2026-05-05",
        },
        {},
        "2026-05-06T15:00:00+00:00",
    )

    assert fields == {"last_seen_at": "2026-05-06T15:00:00+00:00"}
