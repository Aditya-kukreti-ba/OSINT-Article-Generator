/**
 * OSINT Article AI — Enterprise RAG Pipeline (Clean Rewrite)
 * ===========================================================
 * 1.  Hard domain whitelist (source locking)
 * 2.  Real HTML content extraction
 * 3.  Chunking with source metadata
 * 4.  2-pass TF-IDF retrieval (diversity-first)
 * 5.  Strict RAG prompt → Groq LLaMA 70B (7-section OSINT template)
 * 6.  Post-generation cleanup (strip filler phrases)
 * 7.  Source Validation Agent → llama-3.1-8b-instant (separate TPM pool)
 * 8.  Structural quality checks (diversity, density, duplicates)
 * 9.  Named entity + statistic verification
 * 10. Auto-regenerate if INVALID (max 1 retry)
 */

import express from 'express'
import cors    from 'cors'
import dotenv  from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ─────────────────────────────────────────────────────────────
//  ENVIRONMENT
// ─────────────────────────────────────────────────────────────
const GROQ_API_KEY   = process.env.GROQ_API_KEY
const SERPER_API_KEY = process.env.SERPER_API_KEY

if (!GROQ_API_KEY || !SERPER_API_KEY) {
  console.error('Missing API keys — add GROQ_API_KEY and SERPER_API_KEY to .env')
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const CFG = {
  CHUNK_SIZE:            220,
  CHUNK_OVERLAP:         30,
  TOP_CHUNKS:            8,
  MAX_PER_DOMAIN:        2,
  MIN_DOMAINS:           3,
  MAX_CONTENT_CHARS:     2000,
  FETCH_TIMEOUT_MS:      7000,
  RATE_LIMIT_RETRIES:    4,
  RATE_LIMIT_BASE_MS:    12000,
  MODEL_ARTICLE:         'llama-3.3-70b-versatile',
  MODEL_VALIDATION:      'llama-3.1-8b-instant',
  MAX_ARTICLE_TOKENS:    1800,
  MAX_VALIDATION_TOKENS: 500,
  LLM_TEMPERATURE:       0.25,
  MAX_RETRIES:           1,
}

// ─────────────────────────────────────────────────────────────
//  ALLOWED DOMAINS
// ─────────────────────────────────────────────────────────────
const ALLOWED_DOMAINS = [
  'reuters.com','apnews.com','bbc.com','theguardian.com','ft.com',
  'techcrunch.com','wired.com','arstechnica.com','zdnet.com',
  'thenextweb.com','venturebeat.com','theregister.com',
  'cnbc.com','forbes.com','businessinsider.com','bloomberg.com',
  'wsj.com','nytimes.com','washingtonpost.com',
  'nature.com','sciencedirect.com','arxiv.org',
  'pubmed.ncbi.nlm.nih.gov','mit.edu','stanford.edu',
  'cisa.gov','nist.gov','ftc.gov','whitehouse.gov',
  'ibm.com','microsoft.com','google.com','anthropic.com',
  'securityweek.com','darkreading.com','krebsonsecurity.com',
  'cybersecurityventures.com','cyberdefensemagazine.com',
  'helpnetsecurity.com','infosecurity-magazine.com',
  'therecord.media','cyberscoop.com','bleepingcomputer.com',
]

function isDomainAllowed(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return ALLOWED_DOMAINS.some(d => host === d || host.endsWith('.' + d))
  } catch { return false }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log   = msg => console.log(msg)

// ─────────────────────────────────────────────────────────────
//  STEP 1 — SEARCH
// ─────────────────────────────────────────────────────────────
async function serperSearch(endpoint, query) {
  const res = await fetch('https://google.serper.dev/' + endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_API_KEY },
    body:    JSON.stringify({ q: query, num: 10, hl: 'en', gl: 'us' }),
  })
  return res.json()
}

// ─────────────────────────────────────────────────────────────
//  STEP 2 — DOMAIN LOCK
// ─────────────────────────────────────────────────────────────
function collectCandidates(webData, newsData) {
  const seen       = new Set()
  const candidates = []
  const rejected   = []

  function push(url, title, source, date, snippet, type) {
    if (seen.has(url)) return
    seen.add(url)
    if (isDomainAllowed(url)) {
      candidates.push({ url, title, source: source || getDomain(url), date: date || '', snippet: snippet || '', type })
    } else {
      rejected.push(getDomain(url))
    }
  }

  for (const n of (newsData.news   || [])) push(n.link, n.title, n.source, n.date, n.snippet, 'news')
  for (const r of (webData.organic || [])) push(r.link, r.title, getDomain(r.link), '', r.snippet, 'web')

  const rejectedUniq = [...new Set(rejected)]
  if (rejectedUniq.length) {
    log('   Rejected ' + rejected.length + ' non-whitelisted: ' + rejectedUniq.slice(0,5).join(', '))
  }
  return candidates
}

// ─────────────────────────────────────────────────────────────
//  STEP 3 — HTML EXTRACTION
// ─────────────────────────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<(script|style|nav|footer|header|aside|noscript|iframe|svg|form|button|menu)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function fetchContent(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CFG.FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) return null
    const html = await res.text()
    return stripHtml(html).slice(0, CFG.MAX_CONTENT_CHARS)
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
//  STEP 4 — CHUNKING WITH METADATA
// ─────────────────────────────────────────────────────────────
function chunkSource(source) {
  const chunks = []
  const text   = source.content
  let start    = 0

  while (start < text.length) {
    const end   = Math.min(start + CFG.CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 60) {
      chunks.push({
        chunk,
        source_title:  source.title,
        source_url:    source.url,
        source_domain: source.source,
        source_date:   source.date,
      })
    }
    start += CFG.CHUNK_SIZE - CFG.CHUNK_OVERLAP
  }
  return chunks
}

// ─────────────────────────────────────────────────────────────
//  STEP 5 — TF-IDF RETRIEVAL (2-pass diversity-first)
// ─────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','had','her',
  'was','one','our','out','get','has','him','his','how','its','may',
  'new','now','use','who','did','been','have','from','they','this',
  'that','with','were','what','when','will','your','also','more',
  'most','over','said','some','such','than','them','then','there',
  'these','time','about','into','than','just','like','very','much',
])

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
}

function tfIdf(queryTokens, chunkTokens) {
  const qSet = new Set(queryTokens)
  const freq = {}
  for (const t of chunkTokens) freq[t] = (freq[t] || 0) + 1
  let score = 0
  for (const qt of qSet) {
    if (freq[qt]) score += freq[qt] * 2
    for (const ct of Object.keys(freq)) {
      if (ct !== qt && (ct.startsWith(qt) || qt.startsWith(ct))) {
        score += freq[ct] * 0.5
      }
    }
  }
  return score
}

function retrieveChunks(query, allChunks) {
  const qTokens = tokenize(query)
  const scored  = allChunks
    .map(c => ({ ...c, score: tfIdf(qTokens, tokenize(c.chunk)) }))
    .sort((a, b) => b.score - a.score)

  const selected    = []
  const domainCount = {}

  // Pass 1 — one best chunk per domain (guarantees all sources represented)
  const seen = new Set()
  for (const c of scored) {
    if (!seen.has(c.source_domain)) {
      seen.add(c.source_domain)
      domainCount[c.source_domain] = 1
      selected.push(c)
    }
    if (selected.length >= CFG.TOP_CHUNKS) break
  }

  // Pass 2 — fill remaining slots (capped at MAX_PER_DOMAIN)
  for (const c of scored) {
    if (selected.length >= CFG.TOP_CHUNKS) break
    if (selected.includes(c)) continue
    const d = c.source_domain
    domainCount[d] = (domainCount[d] || 0) + 1
    if (domainCount[d] <= CFG.MAX_PER_DOMAIN) selected.push(c)
  }

  const uniqueDomains = new Set(selected.map(c => c.source_domain)).size
  if (uniqueDomains < CFG.MIN_DOMAINS) {
    log('   Warning: only ' + uniqueDomains + ' unique domains in chunks')
  }
  log('   ' + selected.length + ' chunks from ' + uniqueDomains + ' unique domains')
  return selected
}

// ─────────────────────────────────────────────────────────────
//  STEP 6 — FORMAT CHUNKS FOR LLM
// ─────────────────────────────────────────────────────────────
function formatChunks(chunks) {
  const domainsSeen = new Set()
  const sourceLines = []

  chunks.forEach(c => {
    if (!domainsSeen.has(c.source_domain)) {
      domainsSeen.add(c.source_domain)
      const idx  = sourceLines.length + 1
      const date = c.source_date ? ' (' + c.source_date + ')' : ''
      sourceLines.push('  [' + idx + '] ' + c.source_domain + ' — "' + c.source_title + '"' + date)
    }
  })

  const blocks = chunks.map((c, i) => {
    return '[CHUNK ' + (i + 1) + ']\n' +
      'Domain : ' + c.source_domain + '\n' +
      'Title  : ' + c.source_title  + '\n' +
      'Date   : ' + (c.source_date || 'N/A') + '\n' +
      'URL    : ' + c.source_url    + '\n' +
      'Text   : ' + c.chunk
  }).join('\n---\n')

  return {
    sourceList:  sourceLines.join('\n'),
    domainList:  [...domainsSeen],
    blocks,
  }
}

// ─────────────────────────────────────────────────────────────
//  STEP 7 — GROQ API CALL (rate-limit retry)
// ─────────────────────────────────────────────────────────────
async function callGroq(messages, model, temperature, maxTokens) {
  for (let attempt = 0; attempt < CFG.RATE_LIMIT_RETRIES; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    })

    const data = await res.json()

    if (res.status === 429 || (data.error && data.error.message && data.error.message.includes('Rate limit'))) {
      const match  = data.error.message.match(/([\d.]+)s/)
      const waitMs = match
        ? Math.ceil(parseFloat(match[1]) * 1000) + 2000
        : CFG.RATE_LIMIT_BASE_MS * (attempt + 1)
      log('   Rate limit — waiting ' + Math.round(waitMs / 1000) + 's (attempt ' + (attempt + 1) + ')')
      await sleep(waitMs)
      continue
    }

    if (data.error) throw new Error(data.error.message)
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
  }
  throw new Error('Rate limit exceeded after retries. Please wait ~1 minute and try again.')
}

// ─────────────────────────────────────────────────────────────
//  STEP 8 — ARTICLE GENERATION
// ─────────────────────────────────────────────────────────────
function buildArticlePrompt(chunks, topic, outputType, tone, keywords) {
  const { sourceList, domainList, blocks } = formatChunks(chunks)
  const minCitations = Math.max(3, Math.floor(domainList.length * 0.7))
  const kwNote = keywords.length
    ? 'REQUIRED KEYWORDS — include ALL naturally: ' + keywords.map(k => '"' + k + '"').join(', ') + '\n'
    : ''

  const systemMsg =
    'You are a professional OSINT analyst writing a strict intelligence report.\n\n' +
    'ABSOLUTE SOURCE RULES:\n' +
    '1. Use ONLY the provided source chunks. Zero exceptions.\n' +
    '2. Every paragraph MUST contain at least one inline citation: (domain.com)\n' +
    '3. Use this citation format: (domain.com) — angle brackets like (reuters.com)\n' +
    '4. No factual claim may exist without a citation.\n' +
    '5. Do NOT invent organizations, statistics, people, or events.\n' +
    '6. Do NOT repeat definitions after Section 1.\n' +
    '7. Every sentence must add NEW information — no filler.\n' +
    '8. Paraphrase only — do not copy verbatim text.\n\n' +
    'MULTI-SOURCE REQUIREMENT:\n' +
    'You have chunks from ' + domainList.length + ' domains: ' + domainList.join(', ') + '\n' +
    'You MUST cite at least ' + minCitations + ' different domains across the article.\n' +
    'If you used one domain twice in a row, switch to a different one.\n\n' +
    kwNote +
    'TONE: ' + tone + '\n' +
    'FORMAT: ' + outputType

  const userMsg =
    'TOPIC: "' + topic + '"\n\n' +
    'AVAILABLE SOURCE DOMAINS (use as many as possible):\n' +
    sourceList + '\n\n' +
    'RETRIEVED SOURCE CHUNKS:\n' +
    blocks + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'WRITE THIS EXACT 7-SECTION INTELLIGENCE REPORT:\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '# [Precise, Fact-Based Title — No Generic Phrasing]\n\n' +
    '---\n\n' +
    '## 1. Executive Brief\n' +
    '*(Max 120 words. No definitions. No background. Facts only.)*\n\n' +
    'What happened: [1 sentence with citation]\n' +
    'Who is involved: [named entities from sources only]\n' +
    'Why it matters: [impact in 1 sentence] (domain)\n\n' +
    '---\n\n' +
    '## 2. Event & Development Overview\n' +
    '*(Each paragraph introduces NEW facts. No repetition from Section 1.)*\n\n' +
    'According to (domain), [specific event/development with date if available].\n' +
    '[New fact paragraph] (domain)\n' +
    '[New fact paragraph from a DIFFERENT source] (domain)\n\n' +
    '---\n\n' +
    '## 3. Threat & Risk Analysis\n' +
    '*(Inference only from cited content. No speculation without a source.)*\n\n' +
    'This suggests [logical inference] (domain)\n' +
    'The development indicates [analysis] (domain)\n' +
    'Compared to [other source finding] (domain)\n\n' +
    '---\n\n' +
    '## 4. Industry & Market Impact\n' +
    '*(Pull from any chunk mentioning companies, costs, adoption, vendor response, sector effects.)*\n\n' +
    'Write what the sources say about business and market impact. Cite every claim (domain).\n' +
    'Do NOT write placeholder text — write the best analysis the sources support.\n\n' +
    '---\n\n' +
    '## 5. Government & Regulatory Dimension\n' +
    '*(Pull from any chunk mentioning policy, law, regulation, guidance, enforcement, compliance.)*\n\n' +
    'Write what the sources say about government or regulatory activity. Cite every claim (domain).\n' +
    'Do NOT write placeholder text — write the best analysis the sources support.\n\n' +
    '---\n\n' +
    '## 6. Strategic Implications\n' +
    '*(Inference from Sections 2-5 only. Tie each point to a previously cited section.)*\n\n' +
    'For enterprises: [what this means] (domain)\n' +
    'For governments: [what this means] (domain)\n' +
    'For the threat/technology landscape: [trajectory signal] (domain)\n\n' +
    '---\n\n' +
    '## 7. Intelligence Takeaways\n' +
    '*(Bullet format. Dense. Non-repetitive. Each bullet adds unique value.)*\n\n' +
    '- [Specific fact-backed insight] (domain)\n' +
    '- [Operational takeaway] (domain)\n' +
    '- [Market or policy implication] (domain)\n' +
    '- [Strategic observation] (domain)\n\n' +
    (keywords.length ? 'Include these keywords naturally: ' + keywords.join(', ') + '\n\n' : '') +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'VERIFY before outputting:\n' +
    '- Every paragraph has at least one (domain) citation\n' +
    '- At least ' + minCitations + ' different source domains are cited\n' +
    '- No single source used in more than 40% of citations\n' +
    '- No definition repeated after Section 1\n' +
    '- No placeholder or filler text anywhere\n' +
    '- All named entities exist in the source chunks\n' +
    '- All statistics exist in the source chunks\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

  return { systemMsg, userMsg }
}

async function generateArticle(chunks, topic, outputType, tone, keywords) {
  const { systemMsg, userMsg } = buildArticlePrompt(chunks, topic, outputType, tone, keywords)

  const raw = await callGroq(
    [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
    CFG.MODEL_ARTICLE,
    CFG.LLM_TEMPERATURE,
    CFG.MAX_ARTICLE_TOKENS,
  )

  // Strip filler phrases the LLM may add despite instructions
  return raw
    .replace(/[^\n.]*[Ii]nsufficient source coverage[^\n.]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─────────────────────────────────────────────────────────────
//  STEP 9 — STRUCTURAL CHECKS
// ─────────────────────────────────────────────────────────────
function checkSourceDiversity(text) {
  const citations = text.match(/\(([a-z0-9.-]+\.[a-z]{2,})\)/g) || []
  if (!citations.length) return { passed: false, pct: 0, total: 0, dominant: null, freq: {} }

  const freq = {}
  citations.forEach(c => {
    const d = c.replace(/[()]/g, '').trim()
    freq[d] = (freq[d] || 0) + 1
  })

  const sorted   = Object.entries(freq).sort((a, b) => b[1] - a[1])
  const dominant = sorted[0][0]
  const count    = sorted[0][1]
  const pct      = Math.round((count / citations.length) * 100)
  return { passed: pct <= 40, pct, total: citations.length, dominant, freq }
}

function checkCitationDensity(text) {
  const parts   = text.split(/^## /m).slice(1)
  const uncited = []
  parts.forEach(sec => {
    const header  = sec.split('\n')[0].trim()
    const body    = sec.slice(header.length).trim()
    const isShort = body.replace(/[*()\[\]_\n\-]/g, '').trim().length < 40
    const hasBox  = header.includes('Data Intelligence') || header.includes('📊')
    const hasCite = sec.includes('(') && /\([a-z0-9.-]+\.[a-z]{2,}\)/.test(sec)
    if (!hasCite && !isShort && !hasBox) uncited.push(header.slice(0, 60))
  })
  return { passed: uncited.length === 0, uncitedSections: uncited }
}

function checkDuplicateHeaders(text) {
  const headers = (text.match(/^## .+/gm) || []).map(h => h.replace(/^## /, '').trim())
  const seen    = new Set()
  const dupes   = []
  headers.forEach(h => { seen.has(h) ? dupes.push(h) : seen.add(h) })
  return { passed: dupes.length === 0, duplicates: dupes }
}

function runStructuralChecks(text) {
  const diversity = checkSourceDiversity(text)
  const density   = checkCitationDensity(text)
  const dupes     = checkDuplicateHeaders(text)
  const issues    = []

  if (!diversity.passed) {
    issues.push('"' + diversity.dominant + '" used in ' + diversity.pct + '% of citations (max 40%)')
  }
  if (!density.passed) {
    issues.push('Uncited sections: ' + density.uncitedSections.join(', '))
  }
  if (!dupes.passed) {
    issues.push('Duplicate headers: ' + dupes.duplicates.join(', '))
  }

  return { passed: issues.length === 0, issues, diversity, density, dupes }
}

// ─────────────────────────────────────────────────────────────
//  STEP 10 — VALIDATION AGENT
// ─────────────────────────────────────────────────────────────
const IGNORE_ENTITY_WORDS = new Set([
  'Key','Analysis','Impact','Findings','Trends','Context','Implications',
  'Summary','Overview','Conclusion','Background','Introduction','Section',
  'According','Based','Report','Study','Research','Data','Information',
  'Takeaways','Strategic','Executive','Government','Industry','Regulatory',
  'However','Moreover','Furthermore','Therefore','Additionally','Brief',
  'Event','Development','Threat','Risk','Market','Intelligence','Cyber',
])

function extractEntities(text) {
  const orgs  = []
  const stats = [...new Set(
    (text.match(/\$[\d,.]+(?:\s*(?:billion|million|trillion))?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:billion|million|trillion)/gi) || [])
  )]

  for (const line of text.split('\n')) {
    if (/^#/.test(line.trim())) continue
    const matches = line.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b/g) || []
    for (const m of matches) {
      const words = m.split(' ')
      const clean = !IGNORE_ENTITY_WORDS.has(m) && !words.some(w => IGNORE_ENTITY_WORDS.has(w))
      if (clean && m.length >= 6 && !orgs.includes(m)) orgs.push(m)
    }
  }

  return { orgs, stats }
}

function statInSources(stat, sourceText) {
  const norm = s => s.replace(/\s/g, '').toLowerCase()
  return norm(sourceText).includes(norm(stat))
}

async function runValidationAgent(article, chunks) {
  const sourceSummary = chunks.slice(0, 4)
    .map((c, i) => '[S' + (i + 1) + '] ' + c.source_domain + ': ' + c.chunk.slice(0, 180))
    .join('\n')

  const { orgs, stats } = extractEntities(article)
  const checkList = [...orgs.slice(0, 6), ...stats.slice(0, 4)].join(', ')

  const systemMsg =
    'You are a Source Validation Agent. Respond ONLY in JSON. ' +
    'Do NOT flag article section headers or generic words as hallucinated — ' +
    'only flag real organization names and specific statistics not found in sources.'

  const userMsg =
    'Check if these entities from the article exist in the source summaries.\n\n' +
    'ENTITIES TO CHECK: ' + (checkList || 'none') + '\n\n' +
    'SOURCE SUMMARIES:\n' + sourceSummary + '\n\n' +
    'Return ONLY valid JSON (no markdown):\n' +
    '{"verdict":"VALID","valid_claims":[],"hallucinated_claims":[],"reasoning":""}'

  log('   Pausing 8s before validation call...')
  await sleep(8000)

  const raw = await callGroq(
    [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
    CFG.MODEL_VALIDATION,
    0.1,
    CFG.MAX_VALIDATION_TOKENS,
  )

  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* fall through */ }

  return {
    verdict:             raw.includes('INVALID') ? 'INVALID' : 'VALID',
    valid_claims:        [],
    hallucinated_claims: [],
    reasoning:           raw.slice(0, 150),
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN ROUTE
// ─────────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const topic      = (req.body.topic      || '').trim()
  const outputType = req.body.outputType  || 'Intelligence Report'
  const tone       = req.body.tone        || 'Neutral & Analytical'
  const keywords   = req.body.keywords    || []

  if (!topic) return res.status(400).json({ error: 'Topic is required' })

  log('\n' + '='.repeat(60))
  log('  OSINT Pipeline — "' + topic + '"')
  log('='.repeat(60))

  try {
    // 1. Search
    log('\n[1/7] Searching web + news...')
    const [webData, newsData] = await Promise.all([
      serperSearch('search', topic),
      serperSearch('news',   topic),
    ])
    log('      Web: ' + (webData.organic  && webData.organic.length  || 0) +
        '  News: ' + (newsData.news && newsData.news.length || 0))

    // 2. Source lock
    log('\n[2/7] Applying domain whitelist...')
    const candidates = collectCandidates(webData, newsData)
    log('      ' + candidates.length + ' URLs passed')
    if (!candidates.length) {
      return res.status(422).json({ error: 'No URLs passed the domain whitelist. Try a different topic.' })
    }

    // 3. Extract content
    log('\n[3/7] Extracting page content...')
    const withContent = await Promise.all(
      candidates.slice(0, 10).map(async c => {
        const content = await fetchContent(c.url)
        log('      ' + (content ? 'OK ' + content.length + 'c' : 'blocked') + ' — ' + c.source)
        return { ...c, content: content || c.snippet || '' }
      })
    )
    const sources = withContent.filter(s => s.content.length > 80)
    log('      ' + sources.length + '/' + candidates.length + ' sources usable')

    if (!sources.length) {
      return res.status(422).json({ error: 'Could not extract content from any source.' })
    }

    // 4. Chunk
    log('\n[4/7] Chunking...')
    const allChunks = sources.flatMap(s => chunkSource(s))
    log('      ' + allChunks.length + ' chunks from ' + sources.length + ' sources')

    // 5. Retrieve
    log('\n[5/7] 2-pass TF-IDF retrieval...')
    const topChunks    = retrieveChunks(topic + ' ' + keywords.join(' '), allChunks)
    const allChunkText = topChunks.map(c => c.chunk).join('\n')

    // 6. Generate + validate loop
    log('\n[6/7] Generating article...')
    let article    = ''
    let validation = null
    let attempt    = 0

    while (attempt <= CFG.MAX_RETRIES) {
      if (attempt > 0) log('   Regenerating (attempt ' + (attempt + 1) + ')...')

      article = await generateArticle(topChunks, topic, outputType, tone, keywords)

      // 7. Validate
      log('\n[7/7] Validation agent (attempt ' + (attempt + 1) + ')...')
      validation = await runValidationAgent(article, topChunks)

      // Programmatic stat check
      const { stats } = extractEntities(article)
      const failedStats = stats.filter(s => !statInSources(s, allChunkText))
      if (failedStats.length) {
        validation.hallucinated_claims = (validation.hallucinated_claims || []).concat(
          failedStats.map(s => 'Stat not in sources: ' + s)
        )
      }

      const halCount = (validation.hallucinated_claims || []).length
      log('      Verdict: ' + validation.verdict + '  Hallucinated: ' + halCount)

      if (!halCount || attempt >= CFG.MAX_RETRIES) break
      attempt++
    }

    // Structural checks
    const structural = runStructuralChecks(article)
    const wordCount  = article.split(/\s+/).length
    const finalOK    = !(validation.hallucinated_claims && validation.hallucinated_claims.length)

    log('\n' + '-'.repeat(60))
    log('  Verdict    : ' + (finalOK ? 'VALID' : 'FLAGGED'))
    log('  Words      : ' + wordCount)
    log('  Structural : ' + (structural.passed ? 'OK' : 'Issues: ' + structural.issues.join(' | ')))
    log('  Diversity  : ' + structural.diversity.dominant + ' at ' + structural.diversity.pct + '%')
    log('  Attempts   : ' + (attempt + 1))
    log('-'.repeat(60) + '\n')

    res.json({
      article,
      sources: sources.map(s => ({
        name:           s.source,
        url:            s.url,
        date:           s.date,
        title:          s.title,
        hadFullContent: s.content !== s.snippet,
      })),
      validation: {
        verdict:             finalOK ? 'VALID' : 'INVALID',
        valid_claims:        validation.valid_claims        || [],
        hallucinated_claims: validation.hallucinated_claims || [],
        reasoning:           validation.reasoning           || '',
      },
      structural: {
        passed:           structural.passed,
        issues:           structural.issues,
        sourceDiversity:  structural.diversity,
        citationDensity:  structural.density,
        duplicateHeaders: structural.dupes,
      },
      searchStats: {
        webResults:  (webData.organic  && webData.organic.length)  || 0,
        newsResults: (newsData.news    && newsData.news.length)     || 0,
        sourcesUsed: sources.length,
        chunksTotal: allChunks.length,
        chunksUsed:  topChunks.length,
        wordCount,
        attempts:    attempt + 1,
      },
    })

  } catch (err) {
    log('Pipeline error: ' + err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

// ─────────────────────────────────────────────────────────────
app.listen(3001, () => {
  console.log('\n' + '='.repeat(60))
  console.log('  OSINT Article AI — Enterprise RAG (Clean Build)')
  console.log('  http://localhost:3001')
  console.log('='.repeat(60) + '\n')
})
