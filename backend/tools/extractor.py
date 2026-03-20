"""
backend/tools/extractor.py — Tool 2: LLM entity extraction via Groq (FREE)
"""
import json, os
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

_client = None

def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.environ["GROQ_API_KEY"],
            base_url="https://api.groq.com/openai/v1",
        )
    return _client

PROMPT = """\
Extract structured information from the resume below.
Return ONLY valid JSON:
{{
  "candidate_name": "Full Name or Unknown",
  "years_of_experience": 3,
  "top_skills": ["Python", "AWS"],
  "education": "B.Tech Computer Science"
}}

Resume:
{resume_text}
"""

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def extract_entities(resume_text: str) -> dict:
    resp = _get_client().chat.completions.create(
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        messages=[{"role": "user", "content": PROMPT.format(resume_text=resume_text[:3000])}],
        temperature=0.0,
        response_format={"type": "json_object"},
    )
    try:
        result = json.loads(resp.choices[0].message.content)
    except Exception:
        result = {}
    return {
        "candidate_name": result.get("candidate_name", "Unknown Candidate"),
        "years_of_experience": result.get("years_of_experience", 0),
        "top_skills": result.get("top_skills", []),
        "education": result.get("education", "Not specified"),
    }
