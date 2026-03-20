"""
backend/main.py
FastAPI app — production-hardened:
- Async endpoint with asyncio.to_thread() for non-blocking graph invocation
- 10 MB file size limit per resume
- CORS locked to dev origins (update to your domain before public deploy)
- Detailed error messages
"""
import os
import io
import asyncio
from typing import List

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from backend.models import CandidateResult, EvaluateResponse
from backend.graph import hiring_graph

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_RESUMES = 20


app = FastAPI(
    title="AI Hiring Assistant API",
    description="LangGraph-powered autonomous resume screening agent",
    version="2.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # Create-React-App dev server
        # Add your production domain here, e.g.:
        # "https://your-app.vercel.app"
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "groq_key_set": bool(os.getenv("GROQ_API_KEY")),
    }


# ── Helper: run synchronous LangGraph in a thread ─────────────────────────────
def _run_graph(initial_state: dict) -> dict:
    """Synchronous wrapper — called inside asyncio.to_thread() to avoid blocking."""
    return hiring_graph.invoke(initial_state)


# ── Evaluation Endpoint ───────────────────────────────────────────────────────
@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate_candidates(
    jd_text: str = Form(..., description="Job description text"),
    resumes: List[UploadFile] = File(..., description="Resume files (PDF or DOCX)"),
):
    # ── Input validation ──────────────────────────────────────────────────────
    if not jd_text.strip() or len(jd_text.strip()) < 10:
        raise HTTPException(status_code=422, detail="Job description is too short (min 10 characters).")

    if not resumes:
        raise HTTPException(status_code=422, detail="Upload at least one resume.")

    if len(resumes) > MAX_RESUMES:
        raise HTTPException(status_code=422, detail=f"Too many resumes. Max allowed: {MAX_RESUMES}.")

    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set on the server.")

    results: List[CandidateResult] = []

    for resume_file in resumes:
        # ── File format check ─────────────────────────────────────────────────
        fname = resume_file.filename or "resume"
        if not (fname.lower().endswith(".pdf") or fname.lower().endswith(".docx")):
            results.append(_failed_result(fname, f"Unsupported format. Upload PDF or DOCX."))
            continue

        # ── File size check ───────────────────────────────────────────────────
        file_bytes = await resume_file.read()
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            results.append(_failed_result(fname, f"File too large (max {MAX_FILE_SIZE_MB} MB)."))
            continue

        # ── Build file-like object with .name attribute ───────────────────────
        class _NamedBytes(io.BytesIO):
            def __init__(self, data, name):
                super().__init__(data)
                self.name = name

        file_obj = _NamedBytes(file_bytes, fname)

        initial_state = {
            "jd_text":          jd_text,
            "file_source":      file_obj,
            "file_name":        fname,
            "resume_text":      "",
            "entities":         {},
            "llm_analysis":     {},
            "final_result":     None,
            "error":            None,
        }

        # ── Invoke LangGraph asynchronously (non-blocking) ────────────────────
        try:
            final_state = await asyncio.to_thread(_run_graph, initial_state)
            candidate   = final_state.get("final_result")
            if candidate:
                results.append(candidate)
            else:
                results.append(_failed_result(fname, final_state.get("error", "Unknown error")))
        except Exception as e:
            results.append(_failed_result(fname, str(e)))

    # ── Rank & aggregate ──────────────────────────────────────────────────────
    results.sort(key=lambda r: r.match_score, reverse=True)
    for i, r in enumerate(results):
        r.ranking = i + 1

    total = len(results)
    avg   = round(sum(r.match_score for r in results) / total, 1) if total else 0.0

    return EvaluateResponse(
        candidates    = results,
        total         = total,
        avg_score     = avg,
        strong_fits   = sum(1 for r in results if r.recommendation == "Strong Fit"),
        moderate_fits = sum(1 for r in results if r.recommendation == "Moderate Fit"),
        not_fits      = sum(1 for r in results if r.recommendation == "Not a Fit"),
    )


def _failed_result(fname: str, reason: str) -> CandidateResult:
    """Returns a placeholder result for a resume that failed evaluation."""
    return CandidateResult(
        name=fname, file_name=fname, match_score=0,
        embedding_score=0.0, llm_score=0.0, ranking=0,
        strengths=[], gaps=[f"Evaluation failed: {reason}"],
        recommendation="Not a Fit",
    )
