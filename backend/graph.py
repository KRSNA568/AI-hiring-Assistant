"""
backend/graph.py
LangGraph state machine for the AI Hiring Assistant.

Flow: parse_node → extract_node → analyze_node → score_node
"""
import os
from typing import TypedDict, List, Optional
from dotenv import load_dotenv

load_dotenv()

from langgraph.graph import StateGraph, END
from backend.tools.parser import parse_resume
from backend.tools.extractor import extract_entities
from backend.tools.analyzer import analyze_fit
from backend.models import CandidateResult

# ── Agent State ───────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    """
    The single source of truth passed between every node.
    """
    # Inputs
    jd_text: str
    file_source: object     # raw file-like object or bytes
    file_name: str

    # Intermediate results
    resume_text: str
    entities: dict          # candidate_name, top_skills, years_of_experience
    llm_analysis: dict      # strengths, gaps, llm_score, recommendation

    # Final output
    final_result: Optional[CandidateResult]
    error: Optional[str]


# ── Node 1: Parse ─────────────────────────────────────────────────────────────
def parse_node(state: AgentState) -> dict:
    try:
        text = parse_resume(state["file_source"])
        return {"resume_text": text, "error": None}
    except Exception as e:
        return {"resume_text": "", "error": f"Parse failed: {e}"}


# ── Node 2: Extract Entities ──────────────────────────────────────────────────
def extract_node(state: AgentState) -> dict:
    if state.get("error"):
        return {}
    try:
        entities = extract_entities(state["resume_text"])
        return {"entities": entities}
    except Exception as e:
        return {"entities": {}, "error": f"Extraction failed: {e}"}


# ── Node 3: Analyze ───────────────────────────────────────────────────────────
def analyze_node(state: AgentState) -> dict:
    if state.get("error"):
        return {}
    try:
        analysis = analyze_fit(state["jd_text"], state["resume_text"])
        return {"llm_analysis": analysis}
    except Exception as e:
        return {
            "llm_analysis": {
                "strengths": [], "gaps": [f"Analysis failed: {e}"],
                "llm_score": 0, "recommendation": "Not a Fit"
            }
        }


# ── Node 4: Score & Finalize ──────────────────────────────────────────────────
def score_node(state: AgentState) -> dict:
    """
    Assembles the final CandidateResult using 100% LLM scoring.
    """
    entities    = state.get("entities") or {}
    analysis    = state.get("llm_analysis") or {}
    llm_score   = float(analysis.get("llm_score", 0))

    final_score = int(round(max(0, min(100, llm_score))))

    if final_score >= 75:
        recommendation = "Strong Fit"
    elif final_score >= 50:
        recommendation = "Moderate Fit"
    else:
        recommendation = "Not a Fit"

    # Propagate any pipeline errors
    gaps = analysis.get("gaps", [])
    if state.get("error"):
        gaps.insert(0, f"Pipeline Error: {state['error']}")
        print(f"Graph Error: {state['error']}")

    result = CandidateResult(
        name              = entities.get("candidate_name", "Unknown Candidate"),
        file_name         = os.path.basename(state.get("file_name", "resume")),
        match_score       = final_score,
        llm_score         = round(llm_score, 1),
        ranking           = 0,
        strengths         = analysis.get("strengths", []),
        gaps              = gaps,
        recommendation    = recommendation,
        raw_text_preview  = (state.get("resume_text") or "")[:300],
    )
    return {"final_result": result}


# ── Build & Compile the Graph ─────────────────────────────────────────────────
def build_graph() -> StateGraph:
    builder = StateGraph(AgentState)

    builder.add_node("parse",    parse_node)
    builder.add_node("extract",  extract_node)
    builder.add_node("analyze",  analyze_node)
    builder.add_node("score",    score_node)

    builder.set_entry_point("parse")
    builder.add_edge("parse",   "extract")
    builder.add_edge("extract", "analyze")
    builder.add_edge("analyze", "score")
    builder.add_edge("score",   END)

    return builder.compile()

hiring_graph = build_graph()
