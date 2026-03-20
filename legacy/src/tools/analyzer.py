"""
src/tools/analyzer.py
Tool 4: Uses GPT-4o-mini to compare a JD and resume and produce
a structured analysis with strengths, gaps, LLM score, and recommendation.
"""
import json
import os
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


ANALYSIS_PROMPT = """\
You are an expert technical recruiter. Analyze the following Job Description (JD) and candidate Resume.

Your task:
1. Identify 2-3 specific STRENGTHS where the candidate's background clearly aligns with the JD requirements.
2. Identify 2-3 specific GAPS where the candidate is missing or weak on JD requirements.
3. Provide a numerical score from 0 to 100 representing how well the candidate fits this role, based purely on content analysis (not keyword matching).
4. Give a recommendation: "Strong Fit" (score 75-100), "Moderate Fit" (score 45-74), or "Not a Fit" (score 0-44).

JOB DESCRIPTION:
{jd_text}

CANDIDATE RESUME:
{resume_text}

You MUST respond ONLY with valid JSON in this EXACT format (no extra text):
{{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2", "gap 3"],
  "llm_score": 78,
  "recommendation": "Strong Fit"
}}
"""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def analyze_fit(jd_text: str, resume_text: str) -> dict:
    """
    Use GPT-4o-mini to analyze candidate fit and return structured output.

    Returns:
        dict with keys: strengths, gaps, llm_score, recommendation
    """
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    client = _get_client()

    prompt = ANALYSIS_PROMPT.format(
        jd_text=jd_text[:4000],       # Trim to stay within context
        resume_text=resume_text[:4000],
    )

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,  # Low temperature for consistent, deterministic output
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM returned invalid JSON: {e}\nRaw output: {raw}")

    # Validate and normalize
    result["strengths"] = result.get("strengths", ["N/A"])[:3]
    result["gaps"] = result.get("gaps", ["N/A"])[:3]
    result["llm_score"] = float(max(0, min(100, result.get("llm_score", 50))))

    # Enforce recommendation based on score if LLM drifts
    score = result["llm_score"]
    if result.get("recommendation") not in {"Strong Fit", "Moderate Fit", "Not a Fit"}:
        if score >= 75:
            result["recommendation"] = "Strong Fit"
        elif score >= 45:
            result["recommendation"] = "Moderate Fit"
        else:
            result["recommendation"] = "Not a Fit"

    return result
