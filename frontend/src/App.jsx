import { useState, useRef, useCallback, Component } from 'react'
import axios from 'axios'
import {
  BrainCircuit, LayoutDashboard, FileText, Settings, Search, CheckCircle2,
  AlertCircle, UploadCloud, X, Plus, Download, ChevronDown, Activity,
  FileBox, UserCheck, AlertTriangle, Users
} from 'lucide-react'
import './App.css'

const API_BASE = 'http://localhost:8000'
const MIN_JD_LENGTH = 30

// ── Helpers ──────────────────────────────────────────────────────────────────
function scoreClass(score) {
  if (score >= 75) return 'strong'
  if (score >= 50) return 'moderate'
  return 'weak'
}

function RecLabel({ rec }) {
  if (rec === 'Strong Fit') return <span className="rec-label strong"><CheckCircle2 size={16} /> Strong Fit</span>
  if (rec === 'Moderate Fit') return <span className="rec-label moderate"><AlertTriangle size={16} /> Moderate Fit</span>
  return <span className="rec-label weak"><X size={16} /> Not a Fit</span>
}

function downloadCSV(candidates) {
  const headers = ['Rank', 'Candidate', 'File', 'Score', 'Recommendation', 'AI Score']
  const rows = candidates.map(c => [
    c.ranking, `"${c.name}"`, `"${c.file_name}"`, c.match_score,
    `"${c.recommendation}"`, c.llm_score
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: 'hiring_results.csv'
  })
  a.click()
}

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) return (
      <div className="error-box" style={{ margin: '2rem' }}>
        <AlertCircle size={20} />
        <div>
          <strong>System Error:</strong> {this.state.error?.message}
          <button
            className="btn-outline"
            style={{ padding: '0.3rem 0.8rem', marginTop: '0.5rem', display: 'block' }}
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      </div>
    )
    return this.props.children
  }
}

// ── CandidateCard ─────────────────────────────────────────────────────────────
function CandidateCard({ candidate, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="candidate-card">
      <div className="card-header" onClick={() => setOpen(o => !o)}>
        <div className="card-title-area">
          <span className={`rank-badge ${candidate.ranking === 1 ? 'top-rank' : ''}`}>
            {candidate.ranking}
          </span>
          <div>
            <div className="card-name">{candidate.name}</div>
            <div className="card-meta">
              <span>{candidate.file_name}</span>
              <span>•</span>
              <span className={`score-pill ${scoreClass(candidate.match_score)}`}>
                {candidate.match_score}/100
              </span>
              <span>•</span>
              <RecLabel rec={candidate.recommendation} />
            </div>
          </div>
        </div>
        <ChevronDown size={20} className={`card-icon ${open ? 'open' : ''}`} />
      </div>

      {open && (
        <div className="card-body">
          <div className="analysis-section strengths">
            <h5><CheckCircle2 size={16} /> Key Strengths</h5>
            <ul>{(candidate.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="analysis-section gaps">
            <h5><AlertTriangle size={16} /> Identified Gaps</h5>
            <ul>{(candidate.gaps || []).map((g, i) => <li key={i}>{g}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton({ count }) {
  return (
    <div className="skeleton-container">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-bar" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [jdText, setJdText] = useState('')
  const [files, setFiles] = useState([])
  const [isDrag, setIsDrag] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const jdTooShort = jdText.trim().length > 0 && jdText.trim().length < MIN_JD_LENGTH
  const canRun = jdText.trim().length >= MIN_JD_LENGTH && files.length > 0 && !loading

  const addFiles = (incoming) => {
    const valid = incoming.filter(f =>
      f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.docx')
    )
    const tooBig = incoming.filter(f => f.size > 10 * 1024 * 1024)

    if (tooBig.length) {
      setError(`${tooBig.map(f => f.name).join(', ')} exceed 10 MB and were skipped.`)
    } else {
      setError('')
    }
    setFiles(prev => [...prev, ...valid.filter(f => f.size <= 10 * 1024 * 1024)])
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDrag(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  const handleFileInput = (e) => { addFiles(Array.from(e.target.files)); e.target.value = '' }

  const handleAnalyze = async () => {
    if (!canRun) return
    setLoading(true); setError(''); setResults(null)
    setStatus(`Processing ${files.length} candidate${files.length !== 1 ? 's' : ''}...`)

    const form = new FormData()
    form.append('jd_text', jdText)
    files.forEach(f => form.append('resumes', f))

    try {
      const { data } = await axios.post(`${API_BASE}/api/evaluate`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600_000,
      })
      setResults(data)
      setStatus('Analysis Complete')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Unknown error'
      setError(msg)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ErrorBoundary>
      <div className="app">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-title">
              <BrainCircuit size={24} color="#6366f1" />
              AI Hiring Assistant
            </div>
            <div className="sidebar-subtitle">Autonomous Screening</div>
          </div>

          <div className="sidebar-section">
            <h3>Configuration</h3>
            <div className="status-badge">
              <Activity size={14} /> Intelligence Active
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Pipeline Sequence</h3>
            <ul className="how-it-works">
              <li><FileText size={16} className="step-icon" /> <span><strong>Ingest</strong> — Parse document</span></li>
              <li><Search size={16} className="step-icon" /> <span><strong>Extract</strong> — Structured entities</span></li>
              <li><LayoutDashboard size={16} className="step-icon" /> <span><strong>Analyze</strong> — Gaps & fit logic</span></li>
              <li><Settings size={16} className="step-icon" /> <span><strong>Grade</strong> — 100% LLM Scored</span></li>
            </ul>
          </div>

          <div className="sidebar-footer">
            Powered by LangGraph & FastAPI<br/>
            Engine: Llama 3.3
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="main">
          <div className="page-header">
            <h1 className="page-title">Candidate Evaluation Workspace</h1>
            <p className="page-subtitle">Supply criteria and candidatures algorithms to generate a ranked shortlist.</p>
          </div>

          <div className="input-grid">
            {/* JD Input */}
            <div>
              <div className="section-label">
                <FileBox size={18} /> Position Criteria (Job Description)
              </div>
              <textarea
                placeholder="Paste the full job description here...&#10;&#10;E.g., We require a Senior Engineer proficient in Python, SQL, and AWS infrastructure."
                value={jdText}
                onChange={e => setJdText(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {jdText.trim().length} / {MIN_JD_LENGTH} characters min.
                </span>
                {jdTooShort && (
                  <span style={{ color: '#f59e0b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={12} /> Input too brief
                  </span>
                )}
              </div>
            </div>

            {/* Resume Upload Dropzone */}
            <div>
              <div className="section-label">
                <Users size={18} /> Candidate Documentation
              </div>
              <div
                className={`dropzone ${isDrag ? 'active' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDrag(true) }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
              >
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx" style={{ display: 'none' }} onChange={handleFileInput} />

                {files.length === 0 ? (
                  <>
                    <UploadCloud size={40} className="dropzone-icon" />
                    <p>Drag files here or <strong>click to browse</strong></p>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Supported: PDF, DOCX (Max 10MB)</span>
                  </>
                ) : (
                  <div className="file-list" onClick={e => e.stopPropagation()}>
                    <div className="file-list-header">
                      <CheckCircle2 size={16} /> {files.length} Document{files.length !== 1 ? 's' : ''} Staged
                    </div>
                    {files.map((f, i) => (
                      <div key={i} className="file-item">
                        <div className="file-name">
                          <FileText size={14} color="#64748b" /> {f.name}
                          <span className="file-size">({(f.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button className="file-remove" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button className="add-more-btn" onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}>
                      <Plus size={14} /> Append Files
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="divider" />

          <button className="btn-primary" onClick={handleAnalyze} disabled={!canRun}>
            {loading ? <Activity className="animate-spin" size={18} /> : <BrainCircuit size={18} />}
            {loading ? 'Processing Candidates...' : 'Run Pipeline'}
          </button>

          {!canRun && !loading && (
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <AlertCircle size={14} />
              {jdText.trim().length < MIN_JD_LENGTH ? 'Provide position criteria.' : 'Upload candidate documentation.'}
            </p>
          )}

          {loading && <LoadingSkeleton count={files.length || 2} />}

          {status && !loading && (
            <div className="status-bar">
              <CheckCircle2 size={18} /> {status}
            </div>
          )}

          {error && (
            <div className="error-box">
              <AlertCircle size={18} />
              <div>
                <strong>Pipeline Exception</strong>
                <p style={{ marginTop: '0.2rem' }}>{error}</p>
              </div>
            </div>
          )}

          {/* ── Results Container ── */}
          {results && !loading && (
            <div style={{ marginTop: '3rem' }}>
              <div className="section-label" style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: '#0f172a' }}>
                <UserCheck size={24} /> Evaluation Output
              </div>

              <div className="metrics-grid">
                {[
                  ['Volume', results.total],
                  ['Median Score', `${results.avg_score}`],
                  ['Optimal Fit', results.strong_fits],
                  ['Partial Fit', results.moderate_fits],
                  ['Unqualified', results.not_fits],
                ].map(([label, value]) => (
                  <div key={label} className="metric-card">
                    <div className="value">{value}</div>
                    <div className="label">{label}</div>
                  </div>
                ))}
              </div>

              <div className="results-table-container">
                <table className="results-table">
                  <thead>
                    <tr>{['Rank', 'Candidate', 'Source Document', 'Score', 'Status', 'Technical Fit'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {results.candidates.map(c => (
                      <tr key={c.file_name}>
                        <td>
                          <span className={`rank-badge ${c.ranking === 1 ? 'top-rank' : ''}`}>{c.ranking}</span>
                        </td>
                        <td className="candidate-name">{c.name}</td>
                        <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{c.file_name}</td>
                        <td>
                          <span className={`score-pill ${scoreClass(c.match_score)}`}>{c.match_score}</span>
                        </td>
                        <td><RecLabel rec={c.recommendation} /></td>
                        <td>{c.llm_score}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="btn-outline" onClick={() => downloadCSV(results.candidates)}>
                <Download size={16} /> Export Data (CSV)
              </button>

              <hr className="divider" style={{ marginTop: '3rem', marginBottom: '2rem' }} />
              
              <div className="section-label" style={{ marginBottom: '1rem' }}>
                <Search size={18} /> Contextual Analysis
              </div>
              
              <div className="candidate-cards">
                {results.candidates.map((c, i) => (
                  <CandidateCard key={c.file_name + i} candidate={c} defaultOpen={i === 0} />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  )
}
