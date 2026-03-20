"""
backend/tools/parser.py — Tool 1: PDF/DOCX text extractor
"""
import io
import pdfplumber
import docx
from pathlib import Path


def parse_resume(file_source) -> str:
    if hasattr(file_source, "name"):
        file_name = file_source.name
    else:
        file_name = str(file_source)

    suffix = Path(file_name).suffix.lower()

    if suffix == ".pdf":
        return _parse_pdf(file_source)
    elif suffix in (".docx", ".doc"):
        return _parse_docx(file_source)
    else:
        raise ValueError(f"Unsupported format: {suffix}. Upload PDF or DOCX.")


def _parse_pdf(file_source) -> str:
    if hasattr(file_source, "read"):
        data = file_source.read()
        pdf_file = io.BytesIO(data)
    else:
        pdf_file = file_source

    with pdfplumber.open(pdf_file) as pdf:
        pages = [p.extract_text() for p in pdf.pages if p.extract_text()]

    text = "\n".join(pages).strip()
    if not text:
        raise ValueError("No text found in PDF — it may be scanned/image-based.")
    return text


def _parse_docx(file_source) -> str:
    if hasattr(file_source, "read"):
        data = file_source.read()
        doc_file = io.BytesIO(data)
    else:
        doc_file = file_source

    doc = docx.Document(doc_file)
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()
    if not text:
        raise ValueError("No text found in DOCX file.")
    return text
