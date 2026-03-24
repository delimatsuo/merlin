"""Email digest service via SendGrid."""

import hashlib
import hmac
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import structlog

from app.config import get_settings

logger = structlog.get_logger()

_BRT = ZoneInfo("America/Sao_Paulo")
_HMAC_TTL_SECONDS = 90 * 24 * 60 * 60  # 90 days


def _generate_unsubscribe_token(uid: str) -> str:
    """Generate a signed HMAC token for unsubscribe links (90-day TTL)."""
    settings = get_settings()
    timestamp = str(int(time.time()))
    payload = f"{uid}:{timestamp}"
    signature = hmac.new(
        settings.sendgrid_api_key[:32].encode(),  # Use first 32 chars of API key as secret
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{signature}"


def verify_unsubscribe_token(token: str) -> str | None:
    """Verify an unsubscribe token. Returns uid if valid, None if invalid/expired."""
    settings = get_settings()
    parts = token.split(":")
    if len(parts) != 3:
        return None

    uid, timestamp_str, signature = parts

    # Verify signature
    payload = f"{uid}:{timestamp_str}"
    expected = hmac.new(
        settings.sendgrid_api_key[:32].encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        return None

    # Verify TTL
    try:
        token_time = int(timestamp_str)
        if time.time() - token_time > _HMAC_TTL_SECONDS:
            return None
    except ValueError:
        return None

    return uid


async def send_job_digest(
    email: str,
    name: str,
    uid: str,
    matches: list[dict],
    date: str,
) -> bool:
    """Send daily job digest email via SendGrid.

    Returns True if sent successfully, False otherwise.
    Uses plain-text job info only — no raw_text or source_url in email body.
    """
    settings = get_settings()
    if not settings.sendgrid_api_key:
        logger.warning("sendgrid_key_missing")
        return False

    if not matches:
        return False

    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail, Content

        sg = sendgrid.SendGridAPIClient(api_key=settings.sendgrid_api_key)

        # Build plain-text job list
        job_lines = []
        for i, match in enumerate(matches[:10], 1):
            score = match.get("ats_score", 0)
            title = match.get("title", "")
            company = match.get("company", "")
            location = match.get("location", "")
            company_str = f" — {company}" if company else ""
            location_str = f" ({location})" if location else ""
            job_lines.append(f"{i}. {title}{company_str}{location_str} (ATS: {score:.0f}%)")

        jobs_text = "\n".join(job_lines)
        greeting = name.split()[0] if name else "Olá"

        unsubscribe_token = _generate_unsubscribe_token(uid)
        unsubscribe_url = f"https://merlincv.com/api/jobs/unsubscribe?token={unsubscribe_token}"

        # Plain text email
        text_body = f"""Olá {greeting},

Merlin encontrou {len(matches)} {"vaga" if len(matches) == 1 else "vagas"} que combinam com o seu perfil hoje:

{jobs_text}

Ver todas as vagas: https://merlincv.com/dashboard/vagas

---
Para não receber mais esses e-mails: {unsubscribe_url}
"""

        # HTML email (simple, no raw_text, no source_url)
        job_rows = ""
        for match in matches[:10]:
            score = match.get("ats_score", 0)
            title = match.get("title", "")
            company = match.get("company", "")
            location = match.get("location", "")
            work_mode = match.get("work_mode", "")

            score_color = "#16a34a" if score >= 80 else "#eab308" if score >= 60 else "#dc2626"
            company_html = f"<br><span style='color:#666'>{company}</span>" if company else ""
            meta_parts = [p for p in [location, work_mode] if p]
            meta_html = f"<br><span style='color:#999;font-size:12px'>{' · '.join(meta_parts)}</span>" if meta_parts else ""

            job_rows += f"""
            <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
                    <strong>{title}</strong>{company_html}{meta_html}
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right">
                    <span style="background:{score_color};color:white;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:bold">{score:.0f}%</span>
                </td>
            </tr>"""

        html_body = f"""
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333">
    <div style="padding:24px 0;text-align:center">
        <h2 style="margin:0;font-size:20px">Merlin encontrou {len(matches)} {"vaga" if len(matches) == 1 else "vagas"} para você</h2>
        <p style="color:#666;margin:8px 0 0">{date}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
        <thead>
            <tr style="background:#f9f9f9">
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#666">Vaga</th>
                <th style="padding:10px 16px;text-align:right;font-size:12px;color:#666">ATS</th>
            </tr>
        </thead>
        <tbody>
            {job_rows}
        </tbody>
    </table>

    <div style="text-align:center;padding:24px 0">
        <a href="https://merlincv.com/dashboard/vagas" style="display:inline-block;background:#000;color:white;padding:12px 32px;border-radius:24px;text-decoration:none;font-weight:600">Ver todas as vagas</a>
    </div>

    <div style="text-align:center;padding:16px 0;border-top:1px solid #f0f0f0">
        <a href="{unsubscribe_url}" style="color:#999;font-size:11px;text-decoration:underline">Não desejo receber esses e-mails</a>
    </div>
</div>
"""

        message = Mail(
            from_email=settings.sendgrid_from_email,
            to_emails=email,
            subject=f"Merlin encontrou {len(matches)} {'vaga' if len(matches) == 1 else 'vagas'} para você",
        )
        message.content = [
            Content("text/plain", text_body),
            Content("text/html", html_body),
        ]

        # Add List-Unsubscribe header (LGPD / RFC 8058)
        message.header = {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }

        response = sg.send(message)

        if response.status_code in (200, 201, 202):
            logger.info("email_digest_sent", email=email[:5] + "***", matches=len(matches))
            return True
        else:
            logger.error("email_digest_failed", status=response.status_code)
            return False

    except ImportError:
        logger.error("sendgrid_not_installed")
        return False
    except Exception as e:
        logger.error("email_digest_error", error=str(e))
        return False
