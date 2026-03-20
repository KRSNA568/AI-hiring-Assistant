"""
src/models.py
Pydantic models for the AI Hiring Assistant.
"""
from pydantic import BaseModel
from typing import List, Literal


class CandidateResult(BaseModel):
    """Output schema for a single evaluated candidate."""
    name: str
    file_name: str
    match_score: int                      # 0–100 hybrid score
    embedding_score: float                # raw cosine similarity (0–1)
    llm_score: float                      # raw LLM score (0–100)
    ranking: int
    strengths: List[str]
    gaps: List[str]
    recommendation: Literal["Strong Fit", "Moderate Fit", "Not a Fit"]
    raw_text_preview: str = ""            # first 300 chars of resume text
