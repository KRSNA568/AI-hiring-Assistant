"""
src/agent.py
The HiringAgent orchestrates all 4 tools and applies the hybrid scoring formula:
    Final Score = (embedding_score × 0.6) + (llm_score × 0.4)
"""
import os
import sys

# Ensure src is in path when running directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from src.tools.parser import parse_resume
from src.tools.extractor import extract_entities
from src.tools.embedder import compute_similarity
from src.tools.analyzer import analyze_fit
from src.models import CandidateResult
from typing import List, Callable, Optional


# Hybrid weights (from PRD)
EMBEDDING_WEIGHT = 0.6
LLM_WEIGHT = 0.4


class HiringAgent:
    """
    Orchestrates resume evaluation using 4 specialized tools.
    Each candidate resume is evaluated against the provided Job Description.
    """

    def evaluate_candidate(
        self,
        jd_text: str,
        file_source,
        progress_callback: Optional[Callable[[str], None]] = None,
    ) -> CandidateResult:
        """
        Evaluate a single candidate resume against the JD.

        Args:
            jd_text: The job description as plain text.
            file_source: A file path string or Streamlit UploadedFile.
            progress_callback: Optional status update function (for UI).

        Returns:
            CandidateResult: Structured evaluation result.
        """
        def log(msg: str):
            if progress_callback:
                progress_callback(msg)

        # ── Tool 1: Parse ────────────────────────────────────────────────────
        log("📄 Parsing resume...")
        resume_text = parse_resume(file_source)

        # ── Tool 2: Extract entities ──────────────────────────────────────────
        log("🔍 Extracting candidate information...")
        entities = extract_entities(resume_text)
        candidate_name = entities.get("candidate_name", "Unknown Candidate")

        # ── Tool 3: Compute semantic similarity ───────────────────────────────
        log("🧠 Computing semantic similarity...")
        embedding_score = compute_similarity(jd_text, resume_text)
        embedding_scaled = embedding_score * 100  # scale to 0-100

        # ── Tool 4: LLM reasoning ─────────────────────────────────────────────
        log("💡 Analyzing strengths and gaps with AI...")
        analysis = analyze_fit(jd_text, resume_text)
        llm_score = analysis["llm_score"]

        # ── Hybrid Score ──────────────────────────────────────────────────────
        final_score = (embedding_scaled * EMBEDDING_WEIGHT) + (llm_score * LLM_WEIGHT)
        final_score = int(round(max(0, min(100, final_score))))

        # Map to recommendation bucket
        if final_score >= 75:
            recommendation = "Strong Fit"
        elif final_score >= 45:
            recommendation = "Moderate Fit"
        else:
            recommendation = "Not a Fit"

        # Get file name for display
        file_name = getattr(file_source, "name", str(file_source))

        return CandidateResult(
            name=candidate_name,
            file_name=os.path.basename(file_name),
            match_score=final_score,
            embedding_score=round(embedding_score, 4),
            llm_score=round(llm_score, 1),
            ranking=0,           # assigned by batch evaluator
            strengths=analysis["strengths"],
            gaps=analysis["gaps"],
            recommendation=recommendation,
            raw_text_preview=resume_text[:300],
        )

    def evaluate_batch(
        self,
        jd_text: str,
        file_sources: list,
        progress_callback: Optional[Callable[[str, int, int], None]] = None,
    ) -> List[CandidateResult]:
        """
        Evaluate multiple candidate resumes against a JD and return ranked results.

        Args:
            jd_text: Job description text.
            file_sources: List of file paths or UploadedFile objects.
            progress_callback: Called with (status_msg, current_index, total).

        Returns:
            List of CandidateResult, sorted by match_score descending.
        """
        results = []
        total = len(file_sources)

        for idx, file_source in enumerate(file_sources):
            file_name = getattr(file_source, "name", str(file_source))

            def cb(msg, idx=idx):
                if progress_callback:
                    progress_callback(msg, idx, total)

            try:
                cb(f"Evaluating candidate {idx + 1}/{total}...")
                result = self.evaluate_candidate(jd_text, file_source, progress_callback=cb)
                results.append(result)
            except Exception as e:
                # Don't crash the whole batch — record a failed result
                results.append(CandidateResult(
                    name=os.path.basename(file_name),
                    file_name=os.path.basename(file_name),
                    match_score=0,
                    embedding_score=0.0,
                    llm_score=0.0,
                    ranking=0,
                    strengths=[],
                    gaps=[f"Evaluation failed: {str(e)}"],
                    recommendation="Not a Fit",
                ))

        # Sort by score descending and assign rankings
        results.sort(key=lambda r: r.match_score, reverse=True)
        for i, r in enumerate(results):
            r.ranking = i + 1

        return results
