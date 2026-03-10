/**
 * Vercel Serverless Function — OSINT RAG Pipeline
 * File: /api/generate.js
 * ------------------------------------------------
 * All pipeline logic lives here. No Express needed.
 * Vercel calls the default export for every POST /api/generate request.
 */

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
  FETCH_TIMEOUT_MS:      6000,
  RATE_LIMIT_RETRIES:    4,
  RATE_LIMIT_BASE_MS:    10000,
  MODEL_ARTICLE:         'llama-3.3-70b-versatile',
  MODEL_VALIDATION:      'llama-3.1-8b-instant',
  MAX_ARTICLE_TOKENS:    1800,
  MAX_VALIDATION_TOKENS: 500,
  LLM_TEMPERATURE:       0.25,
  MAX_RETRIES:           1,
  // Reduced from 8s to 3s for Vercel timeout budget
  VALIDATION_PAUSE_MS:   3000,
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

// ─────────────────────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────────────────────
async function serperSearch(endpoint, query) {
  const res = await fetch('https://google.serper.dev/' + endpoint, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY':    process.env.SERPER_API_KEY,
    },
    body: JSON.stringify({ q: query, num: 10, hl: 'en', gl: 'us' }),
  })
  return res.json()
}

// ─────────────────────────────────────────────────────────────
//  DOMAIN LOCK
// ─────────────────────────────────────────────────────────────
function collectCandidates(webData, newsData) {
  const seen       = new Set()
  const candidates = []

  function push(url, title, source, date, snippet, type) {
    if (seen.has(url)) return
    seen.add(url)
    if (isDomainAllowed(url)) {
      candidates.push({ url, title, source: source || getDomain(url), date: date || '', snippet: snippet || '', type })
    }
  }

  for (const n of (newsData.news   || [])) push(n.link, n.title, n.source, n.date, n.snippet, 'news')
  for (const r of (webData.organic || [])) push(r.link, r.title, getDomain(r.link), '', r.snippet, 'web')
  return candidates
}

// ─────────────────────────────────────────────────────────────
//  HTML EXTRACTION
// ─────────────────────────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<(script|style|nav|footer|header|aside|noscript|iframe|svg|form|button|menu)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim()
}

async function fetchContent(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CFG.FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'Accept':     'text/html,application/xhtml+xml',
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
//  CHUNKING
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
//  TF-IDF RETRIEVAL (2-pass diversity-first)
// ─────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','had','her',
  'was','one','our','out','get','has','him','his','how','its','may',
  'new','now','use','who','did','been','have','from','they','this',
  'that','with','were','what','when','will','your','also','more',
  'most','over','said','some','such','than','them','then','there',
  'these','time','about','into','just','like','very','much',
])

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
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
      if (ct !== qt && (ct.startsWith(qt) || qt.startsWith(ct))) score += freq[ct] * 0.5
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

  // Pass 1 — one best chunk per domain
  const seen = new Set()
  for (const c of scored) {
    if (!seen.has(c.source_domain)) {
      seen.add(c.source_domain)
      domainCount[c.source_domain] = 1
      selected.push(c)
    }
    if (selected.length >= CFG.TOP_CHUNKS) break
  }

  // Pass 2 — fill remaining slots
  for (const c of scored) {
    if (selected.length >= CFG.TOP_CHUNKS) break
    if (selected.includes(c)) continue
    const d = c.source_domain
    domainCount[d] = (domainCount[d] || 0) + 1
    if (domainCount[d] <= CFG.MAX_PER_DOMAIN) selected.push(c)
  }

  return selected
}

// ─────────────────────────────────────────────────────────────
//  FORMAT CHUNKS
// ─────────────────────────────────────────────────────────────
function formatChunks(chunks) {
  const seen        = new Set()
  const sourceLines = []

  chunks.forEach(c => {
    if (!seen.has(c.source_domain)) {
      seen.add(c.source_domain)
      const date = c.source_date ? ' (' + c.source_date + ')' : ''
      sourceLines.push('  [' + sourceLines.length + 1 + '] ' + c.source_domain + ' — "' + c.source_title + '"' + date)
    }
  })

  const blocks = chunks.map((c, i) =>
    '[CHUNK ' + (i + 1) + ']\n' +
    'Domain : ' + c.source_domain + '\n' +
    'Title  : ' + c.source_title  + '\n' +
    'Date   : ' + (c.source_date || 'N/A') + '\n' +
    'Text   : ' + c.chunk
  ).join('\n---\n')

  return { sourceList: sourceLines.join('\n'), domainList: [...seen], blocks }
}

// ─────────────────────────────────────────────────────────────
//  GROQ API CALL (rate-limit retry)
// ─────────────────────────────────────────────────────────────
async function callGroq(messages, model, temperature, maxTokens) {
  for (let attempt = 0; attempt < CFG.RATE_LIMIT_RETRIES; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    })

    const data = await res.json()

    if (res.status === 429 || (data.error && data.error.message && data.error.message.includes('Rate limit'))) {
      const match  = data.error.message.match(/([\d.]+)s/)
      const waitMs = match
        ? Math.ceil(parseFloat(match[1]) * 1000) + 2000
        : CFG.RATE_LIMIT_BASE_MS * (attempt + 1)
      await sleep(waitMs)
      continue
    }

    if (data.error) throw new Error(data.error.message)
    return (data.choices && data.choices[0].message.content) || ''
  }
  throw new Error('Rate limit exceeded. Please wait ~1 minute and try again.')
}

// ─────────────────────────────────────────────────────────────
//  ARTICLE GENERATION
// ─────────────────────────────────────────────────────────────
async function generateArticle(chunks, topic, outputType, tone, keywords) {
  const { sourceList, domainList, blocks } = formatChunks(chunks)
  const minCitations = Math.max(3, Math.floor(domainList.length * 0.7))
  const kwNote = keywords.length
    ? 'REQUIRED KEYWORDS — include ALL naturally: ' + keywords.map(k => '"' + k + '"').join(', ') + '\n'
    : ''

  const systemMsg =
    'You are a professional OSINT analyst writing a strict intelligence report.\n\n' +
    'ABSOLUTE RULES:\n' +
    '1. Use ONLY the provided source chunks.\n' +
    '2. Every paragraph MUST have at least one citation: (domain.com)\n' +
    '3. No invented organizations, statistics, or events.\n' +
    '4. No repeated definitions after Section 1.\n' +
    '5. Every sentence adds NEW information — no filler.\n' +
    '6. Paraphrase only — never copy verbatim.\n\n' +
    'MULTI-SOURCE REQUIREMENT:\n' +
    'Domains available: ' + domainList.join(', ') + '\n' +
    'Cite at least ' + minCitations + ' different domains. Spread citations — never use one domain twice in a row.\n\n' +
    kwNote +
    'TONE: ' + tone + ' | FORMAT: ' + outputType

  const userMsg =
    'TOPIC: "' + topic + '"\n\n' +
    'AVAILABLE DOMAINS:\n' + sourceList + '\n\n' +
    'SOURCE CHUNKS:\n' + blocks + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'WRITE THIS 7-SECTION INTELLIGENCE REPORT:\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '# [Precise, Fact-Based Title]\n\n' +
    '---\n\n' +
    '## 1. Executive Brief\n' +
    '*(Max 120 words. Facts only. No definitions.)*\n\n' +
    'What happened: [1 sentence] (domain)\n' +
    'Who is involved: [named entities from sources]\n' +
    'Why it matters: [impact] (domain)\n\n' +
    '---\n\n' +
    '## 2. Event & Development Overview\n' +
    '*(New facts each paragraph. No repetition from Section 1.)*\n\n' +
    'According to (domain), [event with date if available].\n' +
    '[New fact] (domain)\n' +
    '[New fact from a DIFFERENT source] (domain)\n\n' +
    '---\n\n' +
    '## 3. Threat & Risk Analysis\n' +
    '*(Inference from cited content only. No speculation.)*\n\n' +
    'This suggests [inference] (domain)\n' +
    'The development indicates [analysis] (domain)\n\n' +
    '---\n\n' +
    '## 4. Industry & Market Impact\n' +
    '*(Any chunk mentioning companies, costs, adoption, vendors, sector effects.)*\n\n' +
    'Write what the sources say. Cite every claim (domain).\n\n' +
    '---\n\n' +
    '## 5. Government & Regulatory Dimension\n' +
    '*(Any chunk mentioning policy, law, regulation, enforcement, compliance.)*\n\n' +
    'Write what the sources say. Cite every claim (domain).\n\n' +
    '---\n\n' +
    '## 6. Strategic Implications\n' +
    '*(Inference from Sections 2-5 only.)*\n\n' +
    'For enterprises: [implication] (domain)\n' +
    'For governments: [implication] (domain)\n' +
    'For the landscape: [signal] (domain)\n\n' +
    '---\n\n' +
    '## 7. Intelligence Takeaways\n\n' +
    '- [Fact-backed insight] (domain)\n' +
    '- [Operational takeaway] (domain)\n' +
    '- [Market or policy implication] (domain)\n' +
    '- [Strategic observation] (domain)\n\n' +
    (keywords.length ? 'Keywords to include: ' + keywords.join(', ') + '\n\n' : '') +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'VERIFY: Every paragraph cited | ' + minCitations + '+ domains used | No filler | All entities in chunks\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

  const raw = await callGroq(
    [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
    CFG.MODEL_ARTICLE, CFG.LLM_TEMPERATURE, CFG.MAX_ARTICLE_TOKENS,
  )

  return raw
    .replace(/[^\n.]*[Ii]nsufficient source coverage[^\n.]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─────────────────────────────────────────────────────────────
//  STRUCTURAL CHECKS
// ─────────────────────────────────────────────────────────────
function runStructuralChecks(text) {
  // Citation diversity
  const citations = text.match(/\(([a-z0-9.-]+\.[a-z]{2,})\)/g) || []
  const freq = {}
  citations.forEach(c => { const d = c.replace(/[()]/g,'').trim(); freq[d] = (freq[d]||0)+1 })
  const sorted   = Object.entries(freq).sort((a,b) => b[1]-a[1])
  const dominant = sorted[0] ? sorted[0][0] : null
  const pct      = sorted[0] ? Math.round((sorted[0][1] / citations.length) * 100) : 0
  const diversity = { passed: pct <= 40, pct, total: citations.length, dominant, freq }

  // Citation density per section
  const parts   = text.split(/^## /m).slice(1)
  const uncited = []
  parts.forEach(sec => {
    const header  = sec.split('\n')[0].trim()
    const body    = sec.slice(header.length).trim()
    const isShort = body.replace(/[*()\[\]_\n\-]/g,'').trim().length < 40
    const hasCite = /\([a-z0-9.-]+\.[a-z]{2,}\)/.test(sec)
    if (!hasCite && !isShort) uncited.push(header.slice(0, 50))
  })
  const density = { passed: uncited.length === 0, uncitedSections: uncited }

  // Duplicate headers
  const headers = (text.match(/^## .+/gm) || []).map(h => h.replace(/^## /,'').trim())
  const seen = new Set(); const dupes = []
  headers.forEach(h => { seen.has(h) ? dupes.push(h) : seen.add(h) })
  const dupesResult = { passed: dupes.length === 0, duplicates: dupes }

  const issues = []
  if (!diversity.passed) issues.push('"' + dominant + '" used in ' + pct + '% of citations (max 40%)')
  if (!density.passed)   issues.push('Uncited sections: ' + uncited.join(', '))
  if (!dupesResult.passed) issues.push('Duplicate headers: ' + dupes.join(', '))

  return { passed: issues.length === 0, issues, diversity, density, dupes: dupesResult }
}

// ─────────────────────────────────────────────────────────────
//  VALIDATION AGENT
// ─────────────────────────────────────────────────────────────
const IGNORE_WORDS = new Set([
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
      if (m.length >= 6 && !IGNORE_WORDS.has(m) && !words.some(w => IGNORE_WORDS.has(w)) && !orgs.includes(m)) {
        orgs.push(m)
      }
    }
  }
  return { orgs, stats }
}

async function runValidationAgent(article, chunks) {
  const sourceSummary = chunks.slice(0, 4)
    .map((c, i) => '[S' + (i+1) + '] ' + c.source_domain + ': ' + c.chunk.slice(0, 180))
    .join('\n')

  const { orgs, stats } = extractEntities(article)
  const checkList = [...orgs.slice(0,6), ...stats.slice(0,4)].join(', ')

  const systemMsg =
    'You are a Source Validation Agent. Respond ONLY in JSON. ' +
    'Do NOT flag article section headers or generic words. ' +
    'Only flag real org names and statistics not found in sources.'

  const userMsg =
    'ENTITIES TO CHECK: ' + (checkList || 'none') + '\n\n' +
    'SOURCE SUMMARIES:\n' + sourceSummary + '\n\n' +
    'Return ONLY JSON:\n' +
    '{"verdict":"VALID","valid_claims":[],"hallucinated_claims":[],"reasoning":""}'

  await sleep(CFG.VALIDATION_PAUSE_MS)

  const raw = await callGroq(
    [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
    CFG.MODEL_VALIDATION, 0.1, CFG.MAX_VALIDATION_TOKENS,
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
//  VERCEL HANDLER — default export
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS headers (needed because frontend and function are same origin on Vercel,
  // but add them anyway for local dev)
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const topic      = (req.body.topic      || '').trim()
  const outputType = req.body.outputType  || 'Intelligence Report'
  const tone       = req.body.tone        || 'Neutral & Analytical'
  const keywords   = req.body.keywords    || []

  if (!topic) return res.status(400).json({ error: 'Topic is required' })

  try {
    // 1. Search
    const [webData, newsData] = await Promise.all([
      serperSearch('search', topic),
      serperSearch('news',   topic),
    ])

    // 2. Domain lock
    const candidates = collectCandidates(webData, newsData)
    if (!candidates.length) {
      return res.status(422).json({ error: 'No URLs passed the domain whitelist. Try a different topic.' })
    }

    // 3. Extract content (parallel, capped at 8 URLs to save time)
    const withContent = await Promise.all(
      candidates.slice(0, 8).map(async c => {
        const content = await fetchContent(c.url)
        return { ...c, content: content || c.snippet || '' }
      })
    )
    const sources = withContent.filter(s => s.content.length > 80)
    if (!sources.length) {
      return res.status(422).json({ error: 'Could not extract content from any source.' })
    }

    // 4. Chunk
    const allChunks = sources.flatMap(s => chunkSource(s))

    // 5. Retrieve
    const topChunks    = retrieveChunks(topic + ' ' + keywords.join(' '), allChunks)
    const allChunkText = topChunks.map(c => c.chunk).join('\n')

    // 6. Generate
    let article    = ''
    let validation = null
    let attempt    = 0

    while (attempt <= CFG.MAX_RETRIES) {
      article    = await generateArticle(topChunks, topic, outputType, tone, keywords)
      validation = await runValidationAgent(article, topChunks)

      // Programmatic stat check
      const { stats } = extractEntities(article)
      const failedStats = stats.filter(s => {
        const norm = x => x.replace(/\s/g,'').toLowerCase()
        return !norm(allChunkText).includes(norm(s))
      })
      if (failedStats.length) {
        validation.hallucinated_claims = (validation.hallucinated_claims || [])
          .concat(failedStats.map(s => 'Stat not in sources: ' + s))
      }

      if (!(validation.hallucinated_claims && validation.hallucinated_claims.length)) break
      if (attempt >= CFG.MAX_RETRIES) break
      attempt++
    }

    const structural = runStructuralChecks(article)
    const finalOK    = !(validation.hallucinated_claims && validation.hallucinated_claims.length)

    return res.status(200).json({
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
        passed:          structural.passed,
        issues:          structural.issues,
        sourceDiversity: structural.diversity,
        citationDensity: structural.density,
        duplicateHeaders: structural.dupes,
      },
      searchStats: {
        webResults:  (webData.organic  || []).length,
        newsResults: (newsData.news    || []).length,
        sourcesUsed: sources.length,
        chunksTotal: allChunks.length,
        chunksUsed:  topChunks.length,
        wordCount:   article.split(/\s+/).length,
        attempts:    attempt + 1,
      },
    })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
