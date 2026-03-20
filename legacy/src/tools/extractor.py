"""
src/tools/extractor.py
Tool 2: Extracts key entities (name, skills, experience) from resume text.
Uses simple heuristics + optional LLM for candidate name detection.
"""
import re
import os
import json
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


EXTRACTION_PROMPT = """\
Extract structured information from this resume text.

Resume:
{resume_text}

Respond ONLY with valid JSON:
{{
  "candidate_name": "Full Name or Unknown",
  "years_of_experience": 3,
  "top_skills": ["Python", "Machine Learning", "AWS"],
  "education": "B.Tech Computer Science"
}}
"""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def extract_entities(resume_text: str) -> dict:
    """
    Extract candidate name, skills, and experience from resume text.

    Returns:
        dict with keys: candidate_name, years_of_experience, top_skills, education
    """
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    client = _get_client()

    response = client.chat.completions.create(
        model=model,
        messages=[{
            "role": "user",
            "content": EXTRACTION_PROMPT.format(resume_text=resume_text[:3000])
        }],
        temperature=0.0,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: return defaults
        result = {}

    return {
        "candidate_name": result.get("candidate_name", "Unknown Candidate"),
        "years_of_experience": result.get("years_of_experience", 0),
        "top_skills": result.get("top_skills", []),
        "education": result.get("education", "Not specified"),
    }
