"""
app.py — AI Hiring Assistant
Streamlit UI for the LangChain-based resume screening agent.
"""
import os
import sys
import pandas as pd
import streamlit as st
from dotenv import load_dotenv

# Load .env from project root immediately so the API key is available
load_dotenv()

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="AI Hiring Assistant",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Clean CSS (no dark-mode bleeding) ────────────────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  html, body, [class*="css"] { font-family: 'Inter', sans-serif !important; }

  /* Sidebar gradient */
  [data-testid="stSidebar"] > div:first-child {
      background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%) !important;
  }
  [data-testid="stSidebar"] * { color: #e2e8f0 !important; }
  [data-testid="stSidebar"] input { color: #0f172a !important; }

  /* Main area stays white/light */
  .main .block-container { padding-top: 2rem; }

  /* Section title bar */
  .section-title {
      font-size: 1rem; font-weight: 700; color: #4f46e5;
      text-transform: uppercase; letter-spacing: 0.05em;
      border-bottom: 2px solid #e0e7ff; padding-bottom: 6px;
      margin-bottom: 1rem;
  }

  /* Key status pill */
  .key-ok  { background:#dcfce7; color:#166534; padding:4px 12px; border-radius:999px; font-weight:600; font-size:0.8rem; }
  .key-bad { background:#fee2e2; color:#991b1b; padding:4px 12px; border-radius:999px; font-weight:600; font-size:0.8rem; }
</style>
""", unsafe_allow_html=True)


# ── Helper: load agent (cached) ───────────────────────────────────────────────
@st.cache_resource
def get_agent():
    from src.agent import HiringAgent
    return HiringAgent()


# ════════════════════════════════════════════════════════════════════════════
#  SIDEBAR
# ════════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("## 🤖 AI Hiring Assistant")
    st.markdown("*Autonomous resume screening agent*")
    st.divider()

    # API Key
    st.markdown("### ⚙️ Configuration")
    env_key = os.getenv("OPENAI_API_KEY", "")
    key_input = st.text_input(
        "OpenAI API Key",
        value=env_key,
        type="password",
        placeholder="sk-...",
        help="Loaded from .env automatically. Override here if needed.",
    )
    if key_input:
        os.environ["OPENAI_API_KEY"] = key_input

    # Show key status
    if os.getenv("OPENAI_API_KEY"):
        st.markdown('<span class="key-ok">✅ API Key Loaded</span>', unsafe_allow_html=True)
    else:
        st.markdown('<span class="key-bad">❌ No API Key</span>', unsafe_allow_html=True)

    st.write("")
    model_choice = st.selectbox(
        "LLM Model",
        ["gpt-4o-mini", "gpt-4o"],
        index=0,
        help="gpt-4o-mini is recommended (faster + cheaper).",
    )
    os.environ["LLM_MODEL"] = model_choice

    st.divider()
    st.markdown("### 🧠 How It Works")
    st.markdown("""
1. 📄 **Parse** resumes (PDF/DOCX)  
2. 🔍 **Extract** skills & experience  
3. 🧠 **Embed** semantic similarity  
4. 💡 **Analyze** strengths & gaps  
5. 📊 **Score**: `60% Semantic + 40% AI`
    """)
    st.divider()
    st.caption("Built with LangChain · OpenAI · Streamlit")


# ════════════════════════════════════════════════════════════════════════════
#  MAIN CONTENT
# ════════════════════════════════════════════════════════════════════════════
st.title("🤖 AI Hiring Assistant")
st.markdown("**Upload a Job Description and candidate resumes — the AI agent ranks them in seconds.**")
st.divider()

# ── Two-column input ──────────────────────────────────────────────────────
col_jd, col_res = st.columns(2, gap="large")

with col_jd:
    st.markdown('<div class="section-title">📋 Job Description</div>', unsafe_allow_html=True)
    input_mode = st.radio("JD mode", ["Paste text", "Upload PDF"], horizontal=True, label_visibility="collapsed")

    jd_text = ""
    if input_mode == "Paste text":
        jd_text = st.text_area(
            "jd_text",
            height=240,
            placeholder=(
                "Paste the full job description here...\n\n"
                "Example: We are looking for a Python ML Engineer "
                "with 3+ years experience, TensorFlow, Docker, and AWS."
            ),
            label_visibility="collapsed",
        )
    else:
        jd_pdf = st.file_uploader("JD PDF", type=["pdf"], label_visibility="collapsed")
        if jd_pdf:
            from src.tools.parser import parse_resume as _parse
            try:
                jd_text = _parse(jd_pdf)
                st.success(f"✅ JD parsed — {len(jd_text)} characters")
                with st.expander("Preview extracted JD text"):
                    st.text(jd_text[:800])
            except Exception as e:
                st.error(f"Could not parse PDF: {e}")

with col_res:
    st.markdown('<div class="section-title">📂 Candidate Resumes</div>', unsafe_allow_html=True)
    resume_files = st.file_uploader(
        "resumes",
        type=["pdf", "docx", "doc"],
        accept_multiple_files=True,
        label_visibility="collapsed",
    )
    if resume_files:
        st.success(f"✅ {len(resume_files)} resume(s) ready")
        for f in resume_files:
            st.caption(f"• {f.name}")

st.divider()

# ── Analyze button ────────────────────────────────────────────────────────
btn_col, hint_col = st.columns([1, 3])
with btn_col:
    analyze = st.button(
        "🚀 Analyze Candidates",
        type="primary",
        use_container_width=True,
        disabled=(not jd_text or not resume_files),
    )

if not jd_text:
    st.info("👆 Paste a Job Description on the left to get started.")
elif not resume_files:
    st.info("👆 Upload at least one resume on the right.")

# ── Run analysis ──────────────────────────────────────────────────────────
if analyze and jd_text and resume_files:
    if not os.getenv("OPENAI_API_KEY"):
        st.error("❌ No OpenAI API Key found. Add it in the sidebar or create a `.env` file.")
        st.stop()

    progress = st.progress(0, text="Starting...")
    total = len(resume_files)

    def on_progress(msg: str, idx: int, tot: int):
        pct = int(((idx + 0.5) / tot) * 100)
        progress.progress(pct, text=f"⏳ {msg}  ({idx+1}/{tot})")

    agent = get_agent()
    with st.spinner("AI agent is screening candidates..."):
        try:
            results = agent.evaluate_batch(
                jd_text=jd_text,
                file_sources=resume_files,
                progress_callback=on_progress,
            )
        except Exception as e:
            st.error(f"❌ Evaluation error: {e}")
            st.stop()

    progress.progress(100, text="✅ Done!")
    st.session_state["results"] = results
    st.success(f"✅ Screened {len(results)} candidate(s) successfully!")


# ════════════════════════════════════════════════════════════════════════════
#  RESULTS
# ════════════════════════════════════════════════════════════════════════════
if "results" in st.session_state and st.session_state["results"]:
    results = st.session_state["results"]

    st.divider()
    st.markdown("## 📊 Screening Results")

    # Metrics row
    total_c = len(results)
    avg_s   = round(sum(r.match_score for r in results) / total_c, 1)
    strong  = sum(1 for r in results if r.recommendation == "Strong Fit")
    moderate= sum(1 for r in results if r.recommendation == "Moderate Fit")
    not_fit = sum(1 for r in results if r.recommendation == "Not a Fit")

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("👥 Candidates", total_c)
    m2.metric("📈 Avg Score", f"{avg_s}/100")
    m3.metric("✅ Strong Fit", strong)
    m4.metric("🟡 Moderate", moderate)
    m5.metric("❌ Not a Fit", not_fit)

    st.divider()

    # Results table
    st.markdown('<div class="section-title">🏆 Ranked Candidates</div>', unsafe_allow_html=True)

    rows = []
    for r in results:
        rows.append({
            "Rank":           f"#{r.ranking}",
            "Candidate":      r.name,
            "File":           r.file_name,
            "Match Score":    r.match_score,
            "Recommendation": r.recommendation,
            "Semantic %":     round(r.embedding_score * 100, 1),
            "AI Score":       r.llm_score,
        })

    df = pd.DataFrame(rows)

    # Use pandas Styler (map replaces deprecated applymap in pandas >=2.1)
    def score_color(val):
        if val >= 75:
            return "background-color: #dcfce7; color: #166534; font-weight:600"
        elif val >= 45:
            return "background-color: #fef9c3; color: #854d0e; font-weight:600"
        return "background-color: #fee2e2; color: #991b1b; font-weight:600"

    try:
        # pandas >= 2.1
        styled = df.style.map(score_color, subset=["Match Score"])
    except AttributeError:
        # pandas < 2.1 fallback
        styled = df.style.applymap(score_color, subset=["Match Score"])

    st.dataframe(styled, use_container_width=True, hide_index=True)

    # CSV download
    st.download_button(
        "⬇️ Download CSV",
        data=df.to_csv(index=False),
        file_name="hiring_results.csv",
        mime="text/csv",
    )

    st.divider()

    # Candidate detail cards
    st.markdown('<div class="section-title">🔍 Candidate Breakdowns</div>', unsafe_allow_html=True)

    for r in results:
        medal  = "🥇" if r.ranking == 1 else "🥈" if r.ranking == 2 else "🥉" if r.ranking == 3 else f"#{r.ranking}"
        rec_icon = "✅" if r.recommendation == "Strong Fit" else "🟡" if r.recommendation == "Moderate Fit" else "❌"
        label  = f"{medal} {r.name}  —  **{r.match_score}/100**  {rec_icon} {r.recommendation}"

        with st.expander(label, expanded=(r.ranking == 1)):
            left, right = st.columns(2)
            with left:
                st.markdown("**✅ Strengths**")
                for s in r.strengths:
                    st.markdown(f"- {s}")
            with right:
                st.markdown("**⚠️ Gaps**")
                for g in r.gaps:
                    st.markdown(f"- {g}")

            st.divider()
            s1, s2, s3 = st.columns(3)
            s1.metric("Hybrid Score",   f"{r.match_score}/100")
            s2.metric("Semantic Sim.",   f"{round(r.embedding_score * 100, 1)}%")
            s3.metric("AI Reasoning",    f"{r.llm_score}/100")

            if r.raw_text_preview:
                with st.expander("📝 Resume Text Preview"):
                    st.text(r.raw_text_preview)
