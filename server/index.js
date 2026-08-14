import crypto from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import ffmpegPath from 'ffmpeg-static'
import youtubedl from 'youtube-dl-exec'

const app = express()
const port = Number(process.env.PORT) || 8787
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const downloadDir = path.join(root, 'downloads')
const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'])
const generatedCookiesPath = path.join(os.tmpdir(), 'locallens-youtube-cookies.txt')

function resolveCookiesFile() {
  if (process.env.YOUTUBE_COOKIES_FILE) return process.env.YOUTUBE_COOKIES_FILE
  if (!process.env.YOUTUBE_COOKIES_BASE64) return null

  try {
    const contents = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf8')
    if (!/^# (?:Netscape )?HTTP Cookie File/m.test(contents)) {
      throw new Error('Cookie data is not in Netscape format.')
    }
    fsSync.writeFileSync(generatedCookiesPath, contents.replace(/\r\n/g, '\n'), { mode: 0o600 })
    return generatedCookiesPath
  } catch (error) {
    console.error(`Could not load YOUTUBE_COOKIES_BASE64: ${error.message}`)
    return null
  }
}

const cookiesFile = resolveCookiesFile()
const ytDlpDefaults = {
  jsRuntimes: 'node',
  noPlaylist: true,
  noWarnings: true,
  ...(cookiesFile ? { cookies: cookiesFile } : {}),
  ...(process.env.YOUTUBE_PROXY ? { proxy: process.env.YOUTUBE_PROXY } : {}),
}
const youtubeInfoAttempts = [
  null,
  'youtube:player_client=tv,mweb;formats=incomplete',
  'youtube:player_client=web_embedded,android_vr;formats=incomplete',
]
const youtubeRetryDelays = [0, 800, 1600]

function validateYouTubeUrl(value) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) return null
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const videoId = parsed.hostname === 'youtu.be'
      ? pathParts[0]
      : parsed.searchParams.get('v') || (['shorts', 'live', 'embed'].includes(pathParts[0]) ? pathParts[1] : null)
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId || '')) return null
    return `https://www.youtube.com/watch?v=${videoId}`
  } catch {
    return null
  }
}

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video'
}

function isYouTubeBotChallenge(error) {
  const text = String(error?.stderr || error?.message || '')
  return /sign in to confirm.*not a bot|confirm you(?:'|’)re not a bot/i.test(text)
}

async function extractVideoInfo(url) {
  const baseOptions = {
    ...ytDlpDefaults,
    dumpSingleJson: true,
    skipDownload: true,
  }
  let lastError

  for (let index = 0; index < youtubeInfoAttempts.length; index += 1) {
    const extractorArgs = youtubeInfoAttempts[index]
    if (youtubeRetryDelays[index]) {
      await new Promise((resolve) => setTimeout(resolve, youtubeRetryDelays[index]))
    }
    try {
      return {
        info: await youtubedl(url, { ...baseOptions, ...(extractorArgs ? { extractorArgs } : {}) }),
        extractorArgs,
      }
    } catch (error) {
      if (!isYouTubeBotChallenge(error)) throw error
      lastError = error
    }
  }

  throw lastError
}

function errorMessage(error) {
  const text = String(error?.stderr || error?.message || '')
  if (/private video/i.test(text)) return 'That video is private.'
  if (isYouTubeBotChallenge(error)) return 'YouTube blocked this server IP. Add YouTube cookies or a permitted proxy to the container.'
  if (/sign in|age-restricted|age restricted/i.test(text)) return 'That video requires sign-in and cannot be prepared here.'
  if (/unavailable|not available/i.test(text)) return 'That video is unavailable.'
  return 'This video could not be prepared. Check the link and try again.'
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/info', async (req, res) => {
  const url = validateYouTubeUrl(String(req.query.url || ''))
  if (!url) return res.status(400).json({ error: 'Enter a valid HTTPS YouTube URL.' })

  try {
    const { info } = await extractVideoInfo(url)
    return res.json({
      title: info.title || 'Untitled video',
      uploader: info.uploader || info.channel || 'Unknown channel',
      duration: Number(info.duration) || null,
      thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || '',
      webpageUrl: info.webpage_url || url,
    })
  } catch (error) {
    return res.status(422).json({ error: errorMessage(error) })
  }
})

app.get('/api/download', async (req, res) => {
  const url = validateYouTubeUrl(String(req.query.url || ''))
  const quality = ['1080', '720', '480'].includes(String(req.query.quality)) ? String(req.query.quality) : '720'
  if (!url) return res.status(400).json({ error: 'Enter a valid HTTPS YouTube URL.' })

  await fs.mkdir(downloadDir, { recursive: true })
  const id = crypto.randomUUID()
  const outputTemplate = path.join(downloadDir, `${id}.%(ext)s`)

  try {
    const { info, extractorArgs } = await extractVideoInfo(url)
    const filename = `${safeFilename(info.title || 'video')}.mp4`
    await youtubedl(url, {
      ...ytDlpDefaults,
      ...(extractorArgs ? { extractorArgs } : {}),
      output: outputTemplate,
      format: `bestvideo[ext=mp4][height<=${quality}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${quality}]/best[height<=${quality}]`,
      mergeOutputFormat: 'mp4',
      ffmpegLocation: ffmpegPath,
    })

    const files = await fs.readdir(downloadDir)
    const downloadedName = files.find((name) => name.startsWith(`${id}.`))
    if (!downloadedName) throw new Error('Download did not produce a file.')
    const downloadedPath = path.join(downloadDir, downloadedName)
    res.download(downloadedPath, filename, async () => {
      await fs.rm(downloadedPath, { force: true }).catch(() => {})
    })
  } catch (error) {
    const files = await fs.readdir(downloadDir).catch(() => [])
    await Promise.all(files.filter((name) => name.startsWith(id)).map((name) => fs.rm(path.join(downloadDir, name), { force: true })))
    if (!res.headersSent) res.status(422).json({ error: errorMessage(error) })
  }
})

app.use(express.static(path.join(root, 'dist')))
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(root, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`LocalLens is running at http://localhost:${port}`)
})
