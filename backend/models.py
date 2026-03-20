"""
backend/models.py
Shared Pydantic models for the AI Hiring Assistant API.
"""
from pydantic import BaseModel
from typing import List, Literal, Optional


class CandidateResult(BaseModel):
    name: str
    file_name: str
    match_score: int                        # 0–100 hybrid score
    llm_score: float                        # AI reasoning score (0–100)
    ranking: int
    strengths: List[str]
    gaps: List[str]
    recommendation: Literal["Strong Fit", "Moderate Fit", "Not a Fit"]
    raw_text_preview: Optional[str] = ""


class EvaluateResponse(BaseModel):
    candidates: List[CandidateResult]
    total: int
    avg_score: float
    strong_fits: int
    moderate_fits: int
    not_fits: int
