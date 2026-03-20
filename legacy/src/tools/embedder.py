"""
src/tools/embedder.py
Tool 3: Computes semantic similarity between a JD and a resume
using OpenAI text-embedding-3-small and cosine similarity.
"""
import numpy as np
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential


_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()  # reads OPENAI_API_KEY from env
    return _client


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _embed(text: str) -> np.ndarray:
    """Call OpenAI Embeddings API and return a numpy vector."""
    client = _get_client()
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text[:8000],  # stay within token limits
    )
    return np.array(response.data[0].embedding, dtype=np.float32)


def compute_similarity(jd_text: str, resume_text: str) -> float:
    """
    Compute the cosine similarity between the JD and resume embeddings.

    Returns:
        float: Similarity score between 0.0 and 1.0.
    """
    jd_vec = _embed(jd_text)
    resume_vec = _embed(resume_text)

    # Cosine similarity
    dot = float(np.dot(jd_vec, resume_vec))
    norm_jd = float(np.linalg.norm(jd_vec))
    norm_res = float(np.linalg.norm(resume_vec))

    if norm_jd == 0 or norm_res == 0:
        return 0.0

    similarity = dot / (norm_jd * norm_res)
    # Clamp to [0, 1] — cosine can technically go negative
    return max(0.0, min(1.0, similarity))
