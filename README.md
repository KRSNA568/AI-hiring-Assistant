# AI Hiring Assistant

> An autonomous, full-stack AI agent that screens resumes against a job description and returns a ranked shortlist with detailed strengths and gaps — powered by LangGraph and Groq.

![Python](https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-purple?style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38BDF8?style=flat-square&logo=tailwindcss)
![Groq](https://img.shields.io/badge/Groq-LLM-orange?style=flat-square)

---

## What It Does

Paste a job description, upload any number of PDF or DOCX resumes, and the AI agent:

1. **Parses** each document to extract raw, clean text
2. **Extracts** structured entities (skills, experience, candidate name)
3. **Analyzes** the resume against the JD using a strict LLM grading rubric
4. **Scores & Ranks** all candidates from 0–100 with a final Fit recommendation

The output is a ranked dashboard with per-candidate strengths, gaps, and a CSV export.

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Orchestration | LangGraph (state-driven DAG) |
| LLM Engine | Groq — `llama-3.3-70b-versatile` (Free) |
| Backend API | FastAPI + Uvicorn |
| Frontend | React 18 + Vite + Tailwind CSS |
| Icons | Lucide React |
| Resume Parsing | PDFPlumber + python-docx |

---

## Architecture

```
Upload → [Parse Node] → [Extract Node] → [Analyze Node] → [Score Node] → Ranked Output
            ↓               ↓                ↓                ↓
         Raw Text       Skills/Name      Strengths/Gaps    Final Score (LLM)
```

The entire pipeline is a **LangGraph** state machine. Each node is a discrete, testable function. The final score is **100% LLM-reasoned** — no keyword matching, no bias from truncated embeddings.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ai-hiring-assistant.git
cd ai-hiring-assistant
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and add your [free Groq API key](https://console.groq.com):

```env
GROQ_API_KEY=gsk_your_actual_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

### 3. Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Start the Backend

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend is now live at `http://localhost:8000`. Verify with `http://localhost:8000/health`.

### 5. Install & Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is now live at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check with Groq key status |
| `POST` | `/api/evaluate` | Upload resumes (multipart) + JD for evaluation |

### Example Request

```bash
curl -X POST "http://localhost:8000/api/evaluate" \
  -F "jd_text=We need a Full Stack Developer proficient in React, Node.js, and AWS." \
  -F "resumes=@/path/to/resume.pdf"
```

---

## Constraints

| Limit | Value |
|---|---|
| Max file size | 10 MB per resume |
| Max resumes per request | 20 |
| Supported formats | PDF, DOCX only |
| Job description minimum | 30 characters |

---

## Project Structure

```
.
├── backend/
│   ├── main.py           # FastAPI app, CORS, endpoints
│   ├── graph.py          # LangGraph state machine
│   ├── models.py         # Pydantic data models
│   └── tools/
│       ├── parser.py     # PDF & DOCX text extraction
│       ├── extractor.py  # LLM entity extraction
│       └── analyzer.py   # Groq fit analysis + strict scoring
├── frontend/
│   └── src/
│       ├── App.jsx       # React UI (Tailwind CSS)
│       └── main.jsx      # Entry point
├── .env.example          # Environment variable template
└── README.md
```

---

## License

MIT License — free to use, modify, and distribute.
