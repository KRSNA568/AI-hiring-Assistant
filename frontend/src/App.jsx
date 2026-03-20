import { useState, useRef, useCallback, Component } from 'react'
import axios from 'axios'
import {
  BrainCircuit, LayoutDashboard, FileText, Settings, Search, CheckCircle2,
  AlertCircle, UploadCloud, X, Plus, Download, ChevronDown, Activity,
  FileBox, UserCheck, AlertTriangle, Users
} from 'lucide-react'

const API_BASE = 'http://localhost:8000'
const MIN_JD_LENGTH = 30

// ── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 75) return 'bg-emerald-100 text-emerald-800'
  if (score >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

function RecLabel({ rec }) {
  if (rec === 'Strong Fit') return <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600"><CheckCircle2 size={16} /> Strong Fit</span>
  if (rec === 'Moderate Fit') return <span className="flex items-center gap-1.5 text-sm font-medium text-amber-500"><AlertTriangle size={16} /> Moderate Fit</span>
  return <span className="flex items-center gap-1.5 text-sm font-medium text-red-500"><X size={16} /> Not a Fit</span>
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
      <div className="flex items-start gap-2 bg-red-50 border-l-4 border-red-500 text-red-700 p-4 m-8 rounded-r-md text-sm shadow-sm">
        <AlertCircle size={20} className="mt-0.5" />
        <div>
          <strong className="block mb-1">System Error:</strong> {this.state.error?.message}
          <button
            className="mt-3 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded shadow-sm hover:bg-slate-50 transition-colors text-xs font-medium"
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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all duration-200">
      <div 
        className="flex justify-between items-center p-5 cursor-pointer hover:bg-slate-50 select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-4">
          <span className={`flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${candidate.ranking === 1 ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
            {candidate.ranking}
          </span>
          <div>
            <div className="text-base font-semibold text-slate-900">{candidate.name}</div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span>{candidate.file_name}</span>
              <span>•</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreColor(candidate.match_score)}`}>
                {candidate.match_score}/100
              </span>
              <span>•</span>
              <RecLabel rec={candidate.recommendation} />
            </div>
          </div>
        </div>
        <ChevronDown size={20} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="px-6 pb-6 pt-2 border-t border-slate-100 grid md:grid-cols-2 gap-8">
          <div>
            <h5 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 mb-3">
              <CheckCircle2 size={16} /> Key Strengths
            </h5>
            <ul className="space-y-2.5">
              {(candidate.strengths || []).map((s, i) => (
                <li key={i} className="text-sm text-slate-700 pl-4 relative before:absolute before:left-0 before:top-1.5 before:w-1.5 before:h-1.5 before:rounded-full before:bg-emerald-500 leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 mb-3">
              <AlertTriangle size={16} /> Identified Gaps
            </h5>
            <ul className="space-y-2.5">
              {(candidate.gaps || []).map((g, i) => (
                <li key={i} className="text-sm text-slate-700 pl-4 relative before:absolute before:left-0 before:top-1.5 before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500 leading-relaxed">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton({ count }) {
  return (
    <div className="flex flex-col gap-3 mt-6">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="h-[72px] bg-slate-100 rounded-lg animate-pulse" 
          style={{ animationDelay: `${i * 0.15}s` }} 
        />
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

    if (tooBig.length) setError(`${tooBig.map(f => f.name).join(', ')} exceed 10 MB and were skipped.`)
    else setError('')
    
    setFiles(prev => [...prev, ...valid.filter(f => f.size <= 10 * 1024 * 1024)])
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDrag(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

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
      setError(err.response?.data?.detail || err.message || 'Unknown error')
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
        
        {/* ── Sidebar ── */}
        <aside className="w-72 bg-slate-900 text-slate-50 p-10 flex flex-col gap-10 shrink-0 border-r border-slate-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5 text-lg font-bold text-white tracking-tight">
              <BrainCircuit size={26} className="text-indigo-400" />
              AI Hiring Assistant
            </div>
            <div className="text-xs text-slate-400 pl-9 font-medium uppercase tracking-widest">Autonomous Screening</div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4">Configuration</h3>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-bold">
              <Activity size={14} /> Intelligence Active
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4">Pipeline Sequence</h3>
            <ul className="flex flex-col gap-4">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <FileText size={18} className="text-indigo-400 shrink-0" />
                <span><strong className="text-slate-100">Ingest</strong> — Parse document</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Search size={18} className="text-indigo-400 shrink-0" />
                <span><strong className="text-slate-100">Extract</strong> — Structured entities</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <LayoutDashboard size={18} className="text-indigo-400 shrink-0" />
                <span><strong className="text-slate-100">Analyze</strong> — Gaps & fit logic</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Settings size={18} className="text-indigo-400 shrink-0" />
                <span><strong className="text-slate-100">Grade</strong> — 100% LLM Scored</span>
              </li>
            </ul>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-800 text-xs text-slate-500 leading-relaxed">
            Powered by LangGraph & FastAPI<br/>
            Engine: Llama 3.3
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 p-12 lg:p-16 overflow-y-auto">
          <div className="mb-10">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Candidate Evaluation Workspace</h1>
            <p className="text-slate-500 mt-2 text-base">Supply criteria and candidatures algorithms to generate a ranked shortlist.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-10">
            {/* JD Input */}
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
                <FileBox size={18} className="text-slate-400" /> Position Criteria (Job Description)
              </div>
              <textarea
                className="w-full h-64 p-5 border border-slate-300 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm leading-relaxed placeholder:text-slate-400"
                placeholder="Paste the full job description here...&#10;&#10;E.g., We require a Senior Engineer proficient in Python, SQL, and AWS infrastructure."
                value={jdText}
                onChange={e => setJdText(e.target.value)}
              />
              <div className="flex justify-between mt-2 px-1">
                <span className="text-xs font-medium text-slate-400">
                  {jdText.trim().length} / {MIN_JD_LENGTH} characters min.
                </span>
                {jdTooShort && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
                    <AlertTriangle size={12} /> Input too brief
                  </span>
                )}
              </div>
            </div>

            {/* Resume Upload Dropzone */}
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
                <Users size={18} className="text-slate-400" /> Candidate Documentation
              </div>
              <div
                className={`w-full h-64 border-2 border-dashed rounded-xl bg-white flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDrag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDrag(true) }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
              >
                <input ref={fileRef} type="file" multiple accept=".pdf,.docx" className="hidden" onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = '' }} />

                {files.length === 0 ? (
                  <>
                    <UploadCloud size={44} className="text-slate-300 mb-3" />
                    <p className="text-slate-600 text-sm mb-1">Drag files here or <strong className="text-indigo-600">click to browse</strong></p>
                    <span className="text-xs text-slate-400 font-medium">Supported: PDF, DOCX (Max 10MB)</span>
                  </>
                ) : (
                  <div className="w-full h-full overflow-y-auto pr-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm mb-4 pb-2 border-b border-slate-100">
                      <CheckCircle2 size={18} /> {files.length} Document{files.length !== 1 ? 's' : ''} Staged
                    </div>
                    <div className="flex flex-col gap-2 mb-4">
                      {files.map((f, i) => (
                        <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50 border border-slate-100 rounded-lg hover:border-slate-200 transition-colors">
                          <div className="flex items-center gap-2.5 truncate">
                            <FileText size={16} className="text-slate-400 shrink-0" /> 
                            <span className="text-sm font-medium text-slate-700 truncate">{f.name}</span>
                            <span className="text-xs text-slate-400 shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                          </div>
                          <button 
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" 
                            onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 shadow-sm text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors" 
                      onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
                    >
                      <Plus size={16} /> Append Files
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <hr className="my-10 border-t border-slate-200" />

          <button 
            className={`flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-sm shadow-sm transition-all duration-200 ${canRun ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`} 
            onClick={handleAnalyze} 
            disabled={!canRun}
          >
            {loading ? <Activity className="animate-spin" size={18} /> : <BrainCircuit size={18} />}
            {loading ? 'Processing Candidates...' : 'Run Pipeline'}
          </button>

          {!canRun && !loading && (
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500 mt-4">
              <AlertCircle size={16} className="text-slate-400" />
              {jdText.trim().length < MIN_JD_LENGTH ? 'Provide position criteria to initiate.' : 'Upload candidate documentation to initiate.'}
            </p>
          )}

          {loading && <LoadingSkeleton count={files.length || 2} />}

          {status && !loading && !error && (
            <div className="flex items-center gap-2.5 bg-indigo-50/80 border border-indigo-100 text-indigo-700 px-5 py-3.5 mt-6 rounded-xl text-sm font-semibold shadow-sm">
              <CheckCircle2 size={18} className="text-indigo-500" /> {status}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-800 px-5 py-4 mt-6 rounded-xl text-sm shadow-sm">
              <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold mb-1">Pipeline Exception</strong>
                <p className="text-red-700/90 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* ── Results Container ── */}
          {results && !loading && (
            <div className="mt-14 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 text-xl font-extrabold text-slate-900 mb-6">
                <UserCheck size={26} className="text-indigo-500" /> Evaluation Output
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
                {[
                  ['Volume', results.total],
                  ['Median Score', `${results.avg_score}`],
                  ['Optimal Fit', results.strong_fits],
                  ['Partial Fit', results.moderate_fits],
                  ['Unqualified', results.not_fits],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm">
                    <div className="text-3xl font-black tracking-tight text-slate-900">{value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                        <th className="px-6 py-4">Rank</th>
                        <th className="px-6 py-4">Candidate</th>
                        <th className="px-6 py-4">Source Document</th>
                        <th className="px-6 py-4">Score</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Tech Fit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.candidates.map(c => (
                        <tr key={c.file_name} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md font-bold text-xs ${c.ranking === 1 ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}>
                              {c.ranking}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900">{c.name}</td>
                          <td className="px-6 py-4 text-slate-500 text-xs">{c.file_name}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded font-bold text-xs ${scoreColor(c.match_score)}`}>
                              {c.match_score}
                            </span>
                          </td>
                          <td className="px-6 py-4"><RecLabel rec={c.recommendation} /></td>
                          <td className="px-6 py-4 font-medium text-slate-700">{c.llm_score}/100</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button 
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-slate-200 shadow-sm text-sm font-semibold text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
                onClick={() => downloadCSV(results.candidates)}
              >
                <Download size={16} className="text-slate-400" /> Export Data (CSV)
              </button>

              <hr className="my-12 border-t border-slate-200" />
              
              <div className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900 mb-6">
                <Search size={22} className="text-slate-400" /> Contextual Analysis
              </div>
              
              <div className="flex flex-col gap-4">
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
