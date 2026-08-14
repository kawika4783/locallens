import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'

const QUALITY_OPTIONS = [
  { value: '1080', label: 'MP4 · 1080p' },
  { value: '720', label: 'MP4 · 720p' },
  { value: '480', label: 'MP4 · 480p' },
]

function isYouTubeUrl(value) {
  try {
    const { hostname } = new URL(value)
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname)
  } catch {
    return false
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return ''
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return [hours || null, String(minutes).padStart(hours ? 2 : 1, '0'), String(seconds).padStart(2, '0')]
    .filter((part) => part !== null)
    .join(':')
}

function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="LocalLens home">
        LocalLens
      </a>
      <div className="privacy-label"><LockKeyhole size={17} />Private by design</div>
    </header>
  )
}

function Step({ number, icon: Icon, title, body, last }) {
  return (
    <div className="step">
      <span className="step-number">{number}</span>
      <span className="step-icon"><Icon size={22} /></span>
      <span className="step-copy"><strong>{title}</strong><small>{body}</small></span>
      {!last && <span className="step-connector" aria-hidden="true" />}
    </div>
  )
}

function VideoResult({ video, quality, setQuality, onReset, downloading, setDownloading, setNotice }) {
  const duration = formatDuration(video.duration)

  function downloadVideo() {
    setDownloading(true)
    setNotice('Your download has started. Keep this tab open while the file is prepared.')
    const params = new URLSearchParams({ url: video.webpageUrl, quality })
    window.location.href = `/api/download?${params}`
    window.setTimeout(() => setDownloading(false), 3500)
  }

  return (
    <section className="video-result" aria-live="polite">
      <div className="thumbnail-wrap">
        <img src={video.thumbnail} alt="" className="thumbnail" />
        {duration && <span className="duration-chip">{duration}</span>}
      </div>
      <div className="video-details">
        <div>
          <h2>{video.title}</h2>
          <div className="metadata"><span><UserRound size={18} />{video.uploader}</span><span><Clock3 size={18} />{duration}</span></div>
        </div>
        <div className="download-controls">
          <label htmlFor="quality">Choose quality</label>
          <div className="actions-row">
            <div className="select-wrap">
              <select id="quality" value={quality} onChange={(event) => setQuality(event.target.value)}>
                {QUALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </div>
            <button className="button primary download-button" type="button" onClick={downloadVideo} disabled={downloading}>
              {downloading ? <LoaderCircle className="spin" size={19} /> : <Download size={19} />}
              {downloading ? 'Preparing…' : 'Download video'}
            </button>
          </div>
          <button className="reset-button" type="button" onClick={onReset}><RefreshCw size={16} />Start over</button>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const [url, setUrl] = useState('')
  const [video, setVideo] = useState(null)
  const [quality, setQuality] = useState('1080')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canSubmit = url.trim().length > 0 && !loading

  async function prepareVideo(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!isYouTubeUrl(url.trim())) {
      setError('Enter a valid YouTube URL to continue.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(url.trim())}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'This video could not be prepared.')
      setVideo(data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setVideo(null)
    setUrl('')
    setError('')
    setNotice('')
    setQuality('1080')
  }

  return (
    <main className="page-shell">
      <Header />
      <div className="filmstrip filmstrip-left" aria-hidden="true" />
      <div className="filmstrip filmstrip-right" aria-hidden="true" />

      <section className="hero">
        <h1>Your videos, on your time.</h1>
        <p>Paste a YouTube link to prepare a local copy for offline viewing.</p>
      </section>

      <section className={`workspace ${video ? 'has-result' : ''}`}>
        <form className="url-form" onSubmit={prepareVideo}>
          <div className={`input-wrap ${error ? 'has-error' : ''}`}>
            <Link2 size={23} aria-hidden="true" />
            <input
              aria-label="YouTube video URL"
              aria-describedby={error ? 'url-error' : 'permission-note'}
              placeholder="https://youtube.com/watch?v=…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loading}
            />
          </div>
          <button className="button primary prepare-button" type="submit" disabled={!canSubmit}>
            {loading ? <LoaderCircle className="spin" size={20} /> : null}
            {loading ? 'Preparing…' : 'Prepare video'}
            {!loading && <ArrowRight size={20} />}
          </button>
        </form>
        <p className="permission-note" id="permission-note"><LockKeyhole size={16} />Download only videos you own or have permission to save.</p>
        {error && <p className="status error" id="url-error" role="alert">{error}</p>}
        {notice && <p className="status success" role="status"><Check size={17} />{notice}</p>}

        {video && (
          <VideoResult
            video={video}
            quality={quality}
            setQuality={setQuality}
            onReset={reset}
            downloading={downloading}
            setDownloading={setDownloading}
            setNotice={setNotice}
          />
        )}

        <div className="steps" aria-label="How it works">
          <Step number="1" icon={Link2} title="Paste link" body="Add a YouTube link above." />
          <Step number="2" icon={SlidersHorizontal} title="Choose quality" body="Pick the resolution you prefer." />
          <Step number="3" icon={Download} title="Save locally" body="Download the video to your device." last />
        </div>
      </section>

      <footer><ShieldCheck size={18} />Files are processed for your download and are not stored.</footer>
    </main>
  )
}
