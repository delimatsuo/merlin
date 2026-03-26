"""One-time migration: backfill category tags on existing jobs."""

import re
import unicodedata

import structlog

logger = structlog.get_logger()


def _normalize(text: str) -> str:
    """Lowercase, strip accents and extra whitespace."""
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text)


# Same mapping as matcher.py — kept in sync
_TITLE_TO_TAGS: dict[str, list[str]] = {
    "software": ["tech"], "developer": ["tech"], "desenvolvedor": ["tech"],
    "engenheiro de software": ["tech"], "engineer": ["tech"],
    "frontend": ["tech"], "backend": ["tech"], "full stack": ["tech"],
    "fullstack": ["tech"], "devops": ["tech"], "sre": ["tech"],
    "data engineer": ["tech"], "data scientist": ["tech"],
    "programador": ["tech"], "arquiteto de software": ["tech"],
    "tech lead": ["tech", "lead"], "mobile": ["tech"],
    "python": ["tech"], "java": ["tech"], "react": ["tech"],
    "node": ["tech"], "cloud": ["tech"], "ios": ["tech"], "android": ["tech"],
    "rh": ["hr"], "recursos humanos": ["hr"], "human resources": ["hr"],
    "hr": ["hr"], "people": ["hr"], "recrutador": ["hr"],
    "talent": ["hr"], "departamento pessoal": ["hr"],
    "business partner": ["hr"],
    "financeiro": ["finance"], "finance": ["finance"], "contabil": ["finance"],
    "contador": ["finance"], "controller": ["finance"], "fiscal": ["finance"],
    "tesoureiro": ["finance"], "fp&a": ["finance"], "custos": ["finance"],
    "marketing": ["marketing"], "social media": ["marketing"],
    "comunicacao": ["marketing"], "copywriter": ["marketing"],
    "conteudo": ["marketing"], "brand": ["marketing"], "growth": ["marketing"],
    "vendas": ["sales"], "comercial": ["sales"], "sales": ["sales"],
    "sdr": ["sales"], "bdr": ["sales"], "account": ["sales"],
    "product manager": ["tech", "manager"], "product owner": ["tech"],
    "pm": ["tech"], "produto": ["tech"],
    "designer": ["design"], "ux": ["design"], "ui": ["design"],
    "operacoes": ["operations"], "operations": ["operations"],
    "processos": ["operations"],
    "administrativo": ["admin"], "secretaria": ["admin"],
    "recepcao": ["admin"], "escritorio": ["admin"],
    "juridico": ["legal"], "advogado": ["legal"], "compliance": ["legal"],
    "engenheiro civil": ["engineering"], "engenheiro mecanico": ["engineering"],
    "engenheiro eletrico": ["engineering"], "engenheiro producao": ["engineering"],
    "logistica": ["supply_chain"], "compras": ["supply_chain"],
    "supply chain": ["supply_chain"],
    "enfermeiro": ["healthcare"], "farmaceutico": ["healthcare"],
    "nutricionista": ["healthcare"],
    "estagiario": ["intern"], "jovem aprendiz": ["intern"],
    "trainee": ["entry"], "aprendiz": ["intern"],
    "junior": ["entry"], "pleno": ["mid"], "senior": ["senior"],
    "gerente": ["manager"], "coordenador": ["manager"],
    "diretor": ["director"], "head": ["director"],
    "supervisor": ["manager"], "lider": ["lead"],
    "vp": ["executive"], "vice presidente": ["executive"],
    "analista": ["mid"],
    "auxiliar": ["entry"], "assistente": ["entry"],
}


def _title_to_tags(title: str, seniority: str = "") -> list[str]:
    """Convert a job title to category tags using keyword mapping."""
    tags = set()
    normalized = _normalize(title)

    for keyword, keyword_tags in _TITLE_TO_TAGS.items():
        if keyword in normalized:
            tags.update(keyword_tags)

    # Also check seniority field
    if seniority:
        seniority_lower = seniority.lower()
        if seniority_lower in _TITLE_TO_TAGS:
            tags.update(_TITLE_TO_TAGS[seniority_lower])

    # Default: if no tags found, assign "other"
    if not tags:
        tags.add("other")

    return list(tags)


async def backfill_job_tags() -> dict:
    """Backfill category tags on all jobs missing them."""
    from app.services.firestore import FirestoreService

    fs = FirestoreService()
    updated = 0
    skipped = 0
    already_tagged = 0

    async for doc in fs.db.collection("jobs").stream():
        data = doc.to_dict()

        # Skip if already has categories
        if data.get("categories"):
            already_tagged += 1
            continue

        title = data.get("title", "")
        seniority = data.get("seniority", "")

        if not title:
            skipped += 1
            continue

        tags = _title_to_tags(title, seniority)

        try:
            await doc.reference.update({"categories": tags})
            updated += 1
        except Exception as e:
            logger.warning("backfill_update_error", doc_id=doc.id, error=str(e))
            skipped += 1

    stats = {
        "updated": updated,
        "skipped": skipped,
        "already_tagged": already_tagged,
        "total": updated + skipped + already_tagged,
    }
    logger.info("backfill_complete", **stats)
    return stats
