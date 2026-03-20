"""
backend/tools/analyzer.py — Tool 4: LLM strengths/gaps analysis via Groq (FREE)
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
You are an expert, ruthless technical recruiter. Your job is to grade candidates for this Job Description.
Be harsh. Start everyone at 0 points. Add points for actual professional experience, exact skill matches, and relevant projects.
Deduct points heavily if they lack the required years of experience or core technical skills.
Do not give above 80 unless they are a near-perfect match. DO NOT hallucinate fit.
Return ONLY valid JSON — no other text:
{{
  "strengths": ["Clear strength 1", "Strength 2", "Strength 3"],
  "gaps":      ["Critical gap 1", "Gap 2", "Gap 3"],
  "llm_score": 55,
  "recommendation": "Moderate Fit"
}}
recommendation must be exactly one of: "Strong Fit" (75-100), "Moderate Fit" (50-74), "Not a Fit" (0-49).

JOB DESCRIPTION:
{jd_text}

RESUME TEXT (ENTIRE):
{resume_text}
"""

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
def analyze_fit(jd_text: str, resume_text: str) -> dict:
    resp = _get_client().chat.completions.create(
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        messages=[{"role": "user", "content": PROMPT.format(
            jd_text=jd_text[:8000], resume_text=resume_text[:20000]
        )}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    try:
        result = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON from Groq: {e}")

    score = float(max(0, min(100, result.get("llm_score", 50))))
    result["llm_score"] = score
    result["strengths"] = result.get("strengths", [])[:3]
    result["gaps"]      = result.get("gaps", [])[:3]

    if result.get("recommendation") not in {"Strong Fit", "Moderate Fit", "Not a Fit"}:
        result["recommendation"] = (
            "Strong Fit"    if score >= 75 else
            "Moderate Fit"  if score >= 45 else
            "Not a Fit"
        )
    return result
