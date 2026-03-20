import { useState, useRef, useCallback } from 'react'
import axios from 'axios'
import './App.css'

const API_BASE = 'http://localhost:8000'
const MIN_JD_LENGTH = 30

// ── Helpers ──────────────────────────────────────────────────────────────────
function scoreClass(score) {
  if (score >= 75) return 'strong'
  if (score >= 45) return 'moderate'
  return 'weak'
}
function recLabel(rec) {
  if (rec === 'Strong Fit')   return '✅ Strong Fit'
  if (rec === 'Moderate Fit') return '🟡 Moderate Fit'
  return '❌ Not a Fit'
}
function downloadCSV(candidates) {
  const headers = ['Rank','Candidate','File','Score','Recommendation','AI Score']
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
import { Component } from 'react'
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) return (
      <div style={{padding:'2rem',color:'#991b1b',background:'#fee2e2',borderRadius:'8px',margin:'2rem'}}>
        <strong>Something went wrong:</strong> {this.state.error?.message}
        <button style={{marginLeft:'1rem',cursor:'pointer'}} onClick={() => this.setState({ hasError: false })}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

// ── CandidateCard ─────────────────────────────────────────────────────────────
function CandidateCard({ candidate, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const medal = ['🥇','🥈','🥉'][candidate.ranking - 1] ?? `#${candidate.ranking}`
  return (
    <div className="candidate-card">
      <div className="card-header" onClick={() => setOpen(o => !o)}>
        <div>
          <h4>{medal} {candidate.name}</h4>
          <p className="meta">
            {candidate.file_name} ·&nbsp;
            <span className={`score-pill ${scoreClass(candidate.match_score)}`}>
              {candidate.match_score}/100
            </span>
            &nbsp;·&nbsp;{recLabel(candidate.recommendation)}
          </p>
        </div>
        <span style={{color:'#94a3b8',fontSize:'1.1rem'}}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div>
          <div className="card-body">
            <div>
              <h5>✅ Strengths</h5>
              <ul>{(candidate.strengths || []).map((s,i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <h5>⚠️ Gaps</h5>
              <ul>{(candidate.gaps || []).map((g,i) => <li key={i}>{g}</li>)}</ul>
            </div>
          </div>
          <div style={{padding:'0 1.25rem 1.25rem'}}>
            <div className="score-mini-grid">
              {[
                ['Total Score',   `${candidate.match_score}/100`],
                ['AI Reasoning',   `${candidate.llm_score}/100`],
              ].map(([lbl, val]) => (
                <div key={lbl} className="score-mini">
                  <div className="val">{val}</div>
                  <div className="lbl">{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton({ count }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'0.75rem',marginTop:'0.5rem'}}>
      {Array.from({length: count}).map((_,i) => (
        <div key={i} style={{
          height:'72px', background:'#f1f5f9', borderRadius:'10px',
          animation:'pulse 1.4s ease-in-out infinite',
          animationDelay:`${i*0.15}s`
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [jdText,  setJdText]  = useState('')
  const [files,   setFiles]   = useState([])
  const [isDrag,  setIsDrag]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [status,  setStatus]  = useState('')
  const [results, setResults] = useState(null)
  const [error,   setError]   = useState('')
  const fileRef = useRef()

  // ── Input validation ────────────────────────────────────────────────────────
  const jdTooShort = jdText.trim().length > 0 && jdText.trim().length < MIN_JD_LENGTH
  const canRun = jdText.trim().length >= MIN_JD_LENGTH && files.length > 0 && !loading

  const addFiles = (incoming) => {
    const valid = incoming.filter(f =>
      f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.docx')
    )
    const tooBig = incoming.filter(f => f.size > 10 * 1024 * 1024)
    if (tooBig.length) setError(`⚠️ ${tooBig.map(f=>f.name).join(', ')} exceed 10 MB and were skipped.`)
    else setError('')
    setFiles(prev => [...prev, ...valid.filter(f => f.size <= 10*1024*1024)])
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDrag(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  const handleFileInput = (e) => { addFiles(Array.from(e.target.files)); e.target.value = '' }

  const handleAnalyze = async () => {
    if (!canRun) return
    setLoading(true); setError(''); setResults(null)
    setStatus(`🔍 Screening ${files.length} candidate(s) — ~${files.length * 12}s estimated...`)

    const form = new FormData()
    form.append('jd_text', jdText)
    files.forEach(f => form.append('resumes', f))

    try {
      const { data } = await axios.post(`${API_BASE}/api/evaluate`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600_000,
      })
      setResults(data)
      setStatus('✅ Screening complete!')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Unknown error'
      setError(`❌ ${msg}`)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ErrorBoundary>
      <div className="app">
        {/* Sidebar */}
        <aside className="sidebar">
          <div>
            <h1>🤖 AI Hiring Assistant</h1>
            <p className="subtitle">Autonomous resume screening</p>
          </div>
          <hr />
          <div>
            <h3>⚙️ Status</h3>
            <span className="key-badge ok">✅ Groq LLM Active</span>
          </div>
          <hr />
          <div>
            <h3>🧠 How It Works</h3>
            <ul className="how-it-works">
              <li>1. 📄 <strong>Parse</strong> — PDF/DOCX text</li>
              <li>2. 🔍 <strong>Extract</strong> — skills & experience</li>
              <li>3. 💡 <strong>Analyze</strong> — strengths/gaps (Groq)</li>
              <li>4. 📊 <strong>Score</strong> — 100% AI Reasoning</li>
            </ul>
          </div>
          <hr />
          <p className="sidebar-footer">LangGraph · FastAPI · Groq · React</p>
        </aside>

        {/* Main */}
        <main className="main">
          <h2 className="page-title">🤖 AI Hiring Assistant</h2>
          <p className="page-subtitle">Upload a Job Description and resumes — get a ranked candidate shortlist in seconds.</p>
          <hr className="divider" />

          <div className="input-grid">
            {/* JD */}
            <div>
              <p className="section-label">📋 Job Description</p>
              <textarea
                placeholder={"Paste the job description here...\n\nExample: We are looking for a Python ML Engineer with 3+ years experience, TensorFlow, Docker, and AWS."}
                value={jdText}
                onChange={e => setJdText(e.target.value)}
              />
              {jdTooShort && (
                <p style={{color:'#f59e0b',fontSize:'0.8rem',marginTop:'4px'}}>
                  ⚠️ Job description is too short (min {MIN_JD_LENGTH} characters)
                </p>
              )}
              <p style={{fontSize:'0.78rem',color:'#94a3b8',marginTop:'4px'}}>
                {jdText.trim().length} / {MIN_JD_LENGTH}+ characters
              </p>
            </div>

            {/* Dropzone */}
            <div>
              <p className="section-label">📂 Candidate Resumes</p>
              <div
                className={`dropzone ${isDrag ? 'active' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDrag(true) }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
              >
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx" style={{display:'none'}} onChange={handleFileInput} />
                {files.length === 0 ? (
                  <p>📁 Drag & drop or <strong>click to browse</strong><br /><small style={{color:'#94a3b8'}}>PDF · DOCX · Max 10 MB each</small></p>
                ) : (
                  <div className="file-list" onClick={e => e.stopPropagation()}>
                    <p style={{color:'#166534',fontWeight:600,marginBottom:'6px'}}>✅ {files.length} file(s) ready</p>
                    {files.map((f, i) => (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span className="file-item">• {f.name} <span style={{color:'#94a3b8'}}>({(f.size/1024).toFixed(0)} KB)</span></span>
                        <button style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:'1rem'}}
                          onClick={() => setFiles(prev => prev.filter((_,j) => j !== i))}>×</button>
                      </div>
                    ))}
                    <button style={{marginTop:'8px',background:'none',border:'none',color:'#6366f1',cursor:'pointer',fontSize:'0.82rem',padding:0}}
                      onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}>+ Add more files</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="divider" />

          <button className="btn-primary" onClick={handleAnalyze} disabled={!canRun}>
            {loading ? '⏳ Analyzing...' : `🚀 Analyze ${files.length > 0 ? files.length + ' ' : ''}Candidate${files.length !== 1 ? 's' : ''}`}
          </button>

          {!canRun && !loading && (
            <p style={{fontSize:'0.82rem',color:'#94a3b8',marginTop:'8px'}}>
              {jdText.trim().length < MIN_JD_LENGTH ? '👆 Add a job description (min 30 chars) · ' : ''}
              {files.length === 0 ? '👆 Upload at least one resume' : ''}
            </p>
          )}

          {loading && <LoadingSkeleton count={files.length || 2} />}
          {status && !loading && <div className="status-bar">{status}</div>}
          {error && <div className="error-box">{error}</div>}

          {/* Results */}
          {results && !loading && (
            <>
              <hr className="divider" />
              <h2 style={{fontSize:'1.3rem',fontWeight:700,marginBottom:'1rem'}}>📊 Screening Results</h2>

              <div className="metrics-grid">
                {[
                  ['👥 Candidates', results.total],
                  ['📈 Avg Score',  `${results.avg_score}/100`],
                  ['✅ Strong Fit', results.strong_fits],
                  ['🟡 Moderate',   results.moderate_fits],
                  ['❌ Not a Fit',  results.not_fits],
                ].map(([label, value]) => (
                  <div key={label} className="metric-card">
                    <div className="value">{value}</div>
                    <div className="label">{label}</div>
                  </div>
                ))}
              </div>

              <p className="section-label">🏆 Ranked Candidates</p>
              <table className="results-table">
                <thead>
                  <tr>{['Rank','Candidate','File','Score','Recommendation','AI Score'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {results.candidates.map(c => (
                    <tr key={c.file_name}>
                      <td><strong>#{c.ranking}</strong></td>
                      <td><strong>{c.name}</strong></td>
                      <td style={{color:'#64748b',fontSize:'0.82rem'}}>{c.file_name}</td>
                      <td><span className={`score-pill ${scoreClass(c.match_score)}`}>{c.match_score}/100</span></td>
                      <td>{recLabel(c.recommendation)}</td>
                      <td>{c.llm_score}/100</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button className="btn-outline" onClick={() => downloadCSV(results.candidates)}>
                ⬇️ Download CSV
              </button>

              <hr className="divider" style={{marginTop:'1.5rem'}} />
              <p className="section-label">🔍 Candidate Breakdowns</p>
              <div className="candidate-cards">
                {results.candidates.map((c, i) => (
                  <CandidateCard key={c.file_name + i} candidate={c} defaultOpen={i === 0} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </ErrorBoundary>
  )
}
