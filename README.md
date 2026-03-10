# 🔍 OSINT Article Generator

> AI-powered intelligence report generator — transforms any topic into a verified, multi-source OSINT briefing in seconds.

**🌐 Live Demo: [osint-article-generator.vercel.app](https://osint-article-generator.vercel.app/)**

---

## What It Does

OSINT Article Generator searches trusted news and web sources, extracts real content, and uses a multi-step RAG (Retrieval-Augmented Generation) pipeline to produce structured intelligence reports — with every claim cited and verified.

No hallucinations. No made-up statistics. Every sentence is grounded in a real source.

---

## Features

- **7-Section Intelligence Report Template** — Executive Brief, Event Overview, Threat Analysis, Market Impact, Regulatory Dimension, Strategic Implications, and Intelligence Takeaways
- **Hard Domain Whitelist** — only pulls from trusted sources (Reuters, BBC, CISA, WIRED, ArsTechnica, and 35+ more)
- **2-Pass TF-IDF Retrieval** — guarantees every available source gets represented, not just the top 1-2
- **Anti-Hallucination Pipeline** — named entity and statistic verification against source chunks
- **Validation Agent** — second LLM audits every claim before the article is returned
- **Structural Quality Checks** — citation diversity, density per section, duplicate header detection
- **Auto-Regenerate** — if validation fails, the pipeline retries automatically

---

## How the Pipeline Works

```
User enters topic
      │
      ▼
1. Serper search (web + news, 10 results each)
      │
      ▼
2. Domain whitelist — rejects non-approved URLs
      │
      ▼
3. Real HTML extraction — strips tags, cleans text
      │
      ▼
4. Chunking with metadata (source, domain, date, URL)
      │
      ▼
5. 2-pass TF-IDF retrieval
   Pass 1: one best chunk per domain (guarantees breadth)
   Pass 2: fill remaining slots (capped at 2 per domain)
      │
      ▼
6. Strict RAG prompt → Groq LLaMA 70B
   (7-section template, multi-source requirement)
      │
      ▼
7. Validation Agent → Groq LLaMA 8B (separate TPM pool)
   Audits named entities and statistics against source chunks
      │
      ▼
8. Structural checks (diversity, citation density, duplicates)
      │
      ▼
9. Auto-regenerate if INVALID (max 1 retry)
      │
      ▼
Verified intelligence report returned to UI
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Vercel Serverless Functions |
| LLM (Article) | Groq — `llama-3.3-70b-versatile` |
| LLM (Validation) | Groq — `llama-3.1-8b-instant` |
| Search | Serper.dev (Google Search + News) |
| Retrieval | TF-IDF (in-memory, no vector DB needed) |
| Hosting | Vercel |

---

## Running Locally

### Prerequisites
- Node.js 18+
- A [Groq API key](https://console.groq.com) (free)
- A [Serper.dev API key](https://serper.dev) (free)

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/OSINT-Article-Generator.git
cd OSINT-Article-Generator

# Install dependencies
npm install

# Create your .env file
echo "GROQ_API_KEY=your_groq_key_here
SERPER_API_KEY=your_serper_key_here" > .env
```

### Start (two terminals)

```bash
# Terminal 1 — Backend
node server.js
# Runs on http://localhost:3001

# Terminal 2 — Frontend
npm run dev
# Runs on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Deploying to Vercel

The backend runs as a Vercel Serverless Function (`/api/generate.js`) — no separate server needed in production.

```bash
# 1. Push to GitHub
git add .
git commit -m "deploy"
git push

# 2. Import repo at vercel.com/new

# 3. Add environment variables in Vercel dashboard:
#    GROQ_API_KEY     = your_groq_key
#    SERPER_API_KEY   = your_serper_key
```

> **Note:** The pipeline takes ~20-30 seconds per request. Vercel Pro (60s timeout) is recommended. The free Hobby plan has a 10s limit which may cause timeouts.

---

## Trusted Source Domains

The whitelist covers 40+ domains across categories:

| Category | Sources |
|---|---|
| News Wire | Reuters, AP News, BBC |
| Tech | TechCrunch, WIRED, Ars Technica, ZDNet, The Register, VentureBeat |
| Finance | Bloomberg, FT, WSJ, CNBC, Forbes, Business Insider |
| Cybersecurity | CISA, Krebs on Security, Dark Reading, Bleeping Computer, CyberScoop, The Record |
| Science | Nature, arXiv, PubMed, MIT, Stanford |
| Government | NIST, FTC, Whitehouse.gov |

To add more domains, edit the `ALLOWED_DOMAINS` array in `api/generate.js`.

---

## Project Structure

```
OSINT-Article-Generator/
├── api/
│   └── generate.js      # Vercel serverless function (full RAG pipeline)
├── src/
│   └── App.jsx          # React frontend
├── server.js            # Express server (local dev only)
├── vercel.json          # Sets 60s function timeout
├── vite.config.js       # Local dev proxy to Express
├── package.json
└── .env                 # API keys — never commit this
```

---

## Environment Variables

| Variable | Where to get it |
|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `SERPER_API_KEY` | [serper.dev](https://serper.dev) |

---

## License

MIT
