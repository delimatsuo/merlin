"""DOCX document generation service."""

import io

import structlog
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

logger = structlog.get_logger()


async def generate_resume_docx(resume_content: str) -> bytes:
    """Generate a professional resume DOCX from structured text content."""
    doc = Document()

    # Page margins
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    # Default font
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Calibri"
    font.size = Pt(11)

    # Parse content and build document
    lines = resume_content.strip().split("\n")

    for line in lines:
        line = line.strip()
        if not line:
            doc.add_paragraph("")
            continue

        # Detect headings (lines in ALL CAPS or starting with ##)
        if line.startswith("## "):
            heading = doc.add_heading(line[3:], level=2)
            heading.alignment = WD_ALIGN_PARAGRAPH.LEFT
        elif line.startswith("# "):
            heading = doc.add_heading(line[2:], level=1)
            heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif line.isupper() and len(line) < 60:
            heading = doc.add_heading(line.title(), level=2)
        elif line.startswith("- ") or line.startswith("• "):
            doc.add_paragraph(line[2:], style="List Bullet")
        else:
            doc.add_paragraph(line)

    # Save to bytes
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()


async def generate_cover_letter_docx(cover_letter_text: str) -> bytes:
    """Generate a cover letter DOCX."""
    doc = Document()

    for section in doc.sections:
        section.top_margin = Cm(3)
        section.bottom_margin = Cm(3)
        section.left_margin = Cm(3)
        section.right_margin = Cm(3)

    style = doc.styles["Normal"]
    font = style.font
    font.name = "Calibri"
    font.size = Pt(12)

    paragraphs = cover_letter_text.strip().split("\n\n")

    for i, para_text in enumerate(paragraphs):
        para_text = para_text.strip()
        if not para_text:
            continue

        p = doc.add_paragraph(para_text)

        # First paragraph (greeting) might need special formatting
        if i == 0:
            p.paragraph_format.space_after = Pt(12)
        else:
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.15

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()
