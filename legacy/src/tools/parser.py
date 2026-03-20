"""
src/tools/parser.py
Tool 1: Extracts raw text from PDF or DOCX resume files.
"""
import io
import pdfplumber
import docx
from pathlib import Path


def parse_resume(file_source) -> str:
    """
    Extract text from a PDF or DOCX file.

    Args:
        file_source: A file path (str/Path) OR a file-like object
                     (e.g., Streamlit UploadedFile).

    Returns:
        str: Extracted, cleaned text content.
    """
    # Determine file name for format detection
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
        raise ValueError(f"Unsupported file format: {suffix}. Please upload PDF or DOCX.")


def _parse_pdf(file_source) -> str:
    """Extract text from a PDF using pdfplumber."""
    text_parts = []

    # Handle both file paths and file-like objects
    if hasattr(file_source, "read"):
        data = file_source.read()
        file_source.seek(0)  # Reset for future reads
        pdf_file = io.BytesIO(data)
    else:
        pdf_file = file_source

    with pdfplumber.open(pdf_file) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    full_text = "\n".join(text_parts).strip()
    if not full_text:
        raise ValueError("Could not extract any text from the PDF. The file may be scanned/image-based.")
    return full_text


def _parse_docx(file_source) -> str:
    """Extract text from a DOCX using python-docx."""
    if hasattr(file_source, "read"):
        data = file_source.read()
        file_source.seek(0)
        doc_file = io.BytesIO(data)
    else:
        doc_file = file_source

    doc = docx.Document(doc_file)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(paragraphs).strip()

    if not full_text:
        raise ValueError("Could not extract any text from the DOCX file.")
    return full_text
