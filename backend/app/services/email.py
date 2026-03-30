"""Email digest service via SendGrid."""

import hashlib
import hmac
import html as html_mod
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import structlog

from app.config import get_settings

logger = structlog.get_logger()

_BRT = ZoneInfo("America/Sao_Paulo")


def _get_hmac_key() -> bytes:
    """Get the HMAC signing key. Uses dedicated key if available, falls back to SendGrid key."""
    settings = get_settings()
    key = settings.email_hmac_key or settings.sendgrid_api_key[:32]
    return key.encode()


def _generate_unsubscribe_token(uid: str) -> str:
    """Generate a signed HMAC token for unsubscribe links (no expiry)."""
    timestamp = str(int(time.time()))
    payload = f"{uid}:{timestamp}"
    signature = hmac.new(
        _get_hmac_key(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{signature}"


def verify_unsubscribe_token(token: str) -> str | None:
    """Verify an unsubscribe token. Returns uid if valid, None if invalid."""
    parts = token.split(":")
    if len(parts) != 3:
        return None

    uid, timestamp_str, signature = parts

    # Verify signature
    payload = f"{uid}:{timestamp_str}"
    expected = hmac.new(
        _get_hmac_key(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        return None

    # Validate timestamp is a number (no TTL check — tokens don't expire)
    try:
        int(timestamp_str)
    except ValueError:
        return None

    return uid


def _esc(text: str) -> str:
    """HTML-escape a string for safe email template interpolation."""
    return html_mod.escape(str(text)) if text else ""


async def send_job_digest(
    email: str,
    name: str,
    uid: str,
    matches: list[dict],
    date: str,
    frequency: str = "daily",
) -> bool:
    """Send job digest email via SendGrid.

    Returns True if sent successfully, False otherwise.
    All dynamic content is HTML-escaped to prevent injection.
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

        count = len(matches)
        vaga_word = "vaga" if count == 1 else "vagas"
        first_name = _esc(name.split()[0]) if name else ""
        greeting = f"Olá {first_name}," if first_name else "Olá,"
        dashboard_url = "https://merlincv.com/dashboard/vagas"

        unsubscribe_token = _generate_unsubscribe_token(uid)
        unsubscribe_url = f"https://merlincv.com/api/jobs/unsubscribe?token={unsubscribe_token}"

        freq_text = "diariamente" if frequency == "daily" else "semanalmente"

        # Plain text email
        job_lines = []
        for i, m in enumerate(matches[:10], 1):
            title = m.get("title", "")
            company = m.get("company", "")
            company_str = f" — {company}" if company else ""
            job_lines.append(f"{i}. {title}{company_str}")

        text_body = f"""Olá {name.split()[0] if name else 'candidato'},

Merlin encontrou {count} {vaga_word} que combinam com o seu perfil:

{chr(10).join(job_lines)}

Ver vagas: {dashboard_url}

---
Você recebe este email {freq_text}.
Para cancelar: {unsubscribe_url}
"""

        # HTML email — beautiful, responsive design
        job_cards = ""
        for m in matches[:10]:
            title = _esc(m.get("title", "Vaga"))
            company = _esc(m.get("company", ""))
            location = _esc(m.get("location", ""))
            work_mode = m.get("work_mode", "")
            score = m.get("ats_score", 0)

            score_color = "#16a34a" if score >= 80 else "#ca8a04" if score >= 60 else "#dc2626"
            score_bg = "#f0fdf4" if score >= 80 else "#fefce8" if score >= 60 else "#fef2f2"

            meta_parts = [p for p in [company, location] if p]
            if work_mode == "remote":
                meta_parts.append("Remoto")
            elif work_mode == "hybrid":
                meta_parts.append("Híbrido")
            meta_str = " · ".join(meta_parts)

            job_cards += f"""
            <tr>
                <td style="padding:0 0 8px 0">
                    <a href="{dashboard_url}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;transition:border-color 0.2s">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="vertical-align:top">
                                <span style="font-size:15px;font-weight:600;color:#111827;line-height:1.4">{title}</span>
                                <br>
                                <span style="font-size:13px;color:#6b7280;line-height:1.6">{meta_str}</span>
                            </td>
                            <td width="52" style="vertical-align:top;text-align:right;padding-left:12px">
                                <span style="display:inline-block;background:{score_bg};color:{score_color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">{score:.0f}%</span>
                            </td>
                        </tr></table>
                    </a>
                </td>
            </tr>"""

        html_body = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- Logo -->
    <div style="text-align:center;padding:16px 0 24px">
        <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Merlin</span>
    </div>

    <!-- Header card -->
    <div style="background:#111827;border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:20px">
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3">
            {count} {vaga_word} encontrada{"" if count == 1 else "s"}
        </h1>
        <p style="margin:8px 0 0;font-size:14px;color:#9ca3af">
            {greeting} encontramos vagas que combinam com seu perfil
        </p>
    </div>

    <!-- Job list -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
        {job_cards}
    </table>

    <!-- CTA button -->
    <div style="text-align:center;padding:16px 0 24px">
        <a href="{dashboard_url}" style="display:inline-block;background:#111827;color:#ffffff;padding:14px 36px;border-radius:28px;text-decoration:none;font-weight:600;font-size:14px">
            Ver todas as vagas
        </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 8px;font-size:12px;color:#9ca3af">
            Você recebe este email {freq_text} · <a href="{unsubscribe_url}" style="color:#9ca3af;text-decoration:underline">Cancelar inscrição</a>
        </p>
        <p style="margin:0;font-size:11px;color:#d1d5db">
            Ella Executive Search Ltda · merlincv.com
        </p>
    </div>

</div>
</body>
</html>"""

        message = Mail(
            from_email=settings.sendgrid_from_email,
            to_emails=email,
            subject=f"Merlin encontrou {count} {vaga_word} para você",
            plain_text_content=text_body,
            html_content=html_body,
        )

        # Add List-Unsubscribe header (LGPD / RFC 8058)
        from sendgrid.helpers.mail import Header
        message.add_header(Header("List-Unsubscribe", f"<{unsubscribe_url}>"))
        message.add_header(Header("List-Unsubscribe-Post", "List-Unsubscribe=One-Click"))

        response = sg.send(message)

        if response.status_code in (200, 201, 202):
            logger.info("email_digest_sent", uid_hash=uid[:8], matches=count)
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


async def send_feature_announcement(
    email: str,
    name: str,
    uid: str,
) -> bool:
    """Send one-time feature announcement email about job search.

    Targets onboarded users who haven't set up job preferences yet.
    Informational tone — invites user to opt in, not promotional.
    """
    settings = get_settings()
    if not settings.sendgrid_api_key:
        logger.warning("sendgrid_key_missing")
        return False

    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail, Content

        sg = sendgrid.SendGridAPIClient(api_key=settings.sendgrid_api_key)

        first_name = _esc(name.split()[0]) if name else ""
        greeting = f"Olá {first_name}," if first_name else "Olá,"
        dashboard_url = "https://merlincv.com/dashboard/vagas"

        unsubscribe_token = _generate_unsubscribe_token(uid)
        unsubscribe_url = f"https://merlincv.com/api/jobs/unsubscribe?token={unsubscribe_token}"

        text_body = f"""Olá {name.split()[0] if name else 'candidato'},

Uma nova funcionalidade está disponível no Merlin: busca automática de vagas.

O Merlin agora busca vagas todos os dias em plataformas como LinkedIn, Gupy e outras. Basta configurar o tipo de vaga que você procura e receberá notificações quando encontrarmos oportunidades compatíveis com seu perfil.

Como funciona:
1. Configure os cargos desejados, localidade e modalidade
2. O Merlin busca vagas diariamente
3. Você recebe um email quando encontramos vagas relevantes

Configurar: {dashboard_url}

---
Para não receber comunicações do Merlin: {unsubscribe_url}
"""

        html_body = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- Logo -->
    <div style="text-align:center;padding:16px 0 24px">
        <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Merlin</span>
    </div>

    <!-- Hero -->
    <div style="background:#111827;border-radius:16px;padding:40px 32px;text-align:center;margin-bottom:24px">
        <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3">
            Merlin agora busca vagas para você
        </h1>
        <p style="margin:12px 0 0;font-size:15px;color:#9ca3af;line-height:1.5">
            {greeting} uma nova funcionalidade está disponível
        </p>
    </div>

    <!-- Features -->
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:28px 24px;margin-bottom:24px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td style="padding:0 0 20px 0">
                    <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:36px;vertical-align:top">
                            <div style="width:28px;height:28px;background:#f0fdf4;border-radius:8px;text-align:center;line-height:28px;font-size:14px">&#128269;</div>
                        </td>
                        <td style="vertical-align:top">
                            <strong style="font-size:14px;color:#111827">Busca diária automática</strong>
                            <br><span style="font-size:13px;color:#6b7280">Vagas de LinkedIn, Gupy e outras plataformas, todos os dias</span>
                        </td>
                    </tr></table>
                </td>
            </tr>
            <tr>
                <td style="padding:0 0 20px 0">
                    <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:36px;vertical-align:top">
                            <div style="width:28px;height:28px;background:#eff6ff;border-radius:8px;text-align:center;line-height:28px;font-size:14px">&#129504;</div>
                        </td>
                        <td style="vertical-align:top">
                            <strong style="font-size:14px;color:#111827">Matching inteligente</strong>
                            <br><span style="font-size:13px;color:#6b7280">IA compara cada vaga com suas competências e experiência</span>
                        </td>
                    </tr></table>
                </td>
            </tr>
            <tr>
                <td style="padding:0">
                    <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:36px;vertical-align:top">
                            <div style="width:28px;height:28px;background:#fef3c7;border-radius:8px;text-align:center;line-height:28px;font-size:14px">&#128232;</div>
                        </td>
                        <td style="vertical-align:top">
                            <strong style="font-size:14px;color:#111827">Notificação por email</strong>
                            <br><span style="font-size:13px;color:#6b7280">Receba as melhores vagas diretamente no seu inbox</span>
                        </td>
                    </tr></table>
                </td>
            </tr>
        </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;padding:8px 0 32px">
        <a href="{dashboard_url}" style="display:inline-block;background:#111827;color:#ffffff;padding:16px 40px;border-radius:28px;text-decoration:none;font-weight:600;font-size:15px">
            Configurar minhas preferências
        </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 8px;font-size:12px;color:#9ca3af">
            <a href="{unsubscribe_url}" style="color:#9ca3af;text-decoration:underline">Não desejo receber comunicações</a>
        </p>
        <p style="margin:0;font-size:11px;color:#d1d5db">
            Ella Executive Search Ltda · merlincv.com
        </p>
    </div>

</div>
</body>
</html>"""

        message = Mail(
            from_email=settings.sendgrid_from_email,
            to_emails=email,
            subject="Merlin agora busca vagas para você automaticamente",
            plain_text_content=text_body,
            html_content=html_body,
        )
        from sendgrid.helpers.mail import Header
        message.add_header(Header("List-Unsubscribe", f"<{unsubscribe_url}>"))
        message.add_header(Header("List-Unsubscribe-Post", "List-Unsubscribe=One-Click"))

        response = sg.send(message)

        if response.status_code in (200, 201, 202):
            logger.info("announcement_sent", uid_hash=uid[:8])
            return True
        else:
            logger.error("announcement_failed", uid_hash=uid[:8], status=response.status_code)
            return False

    except ImportError:
        logger.error("sendgrid_not_installed")
        return False
    except Exception as e:
        logger.error("announcement_error", uid_hash=uid[:8], error=str(e))
        return False
