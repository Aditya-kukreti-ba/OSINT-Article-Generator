import React, { useState, useRef } from "react";

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#f0ede8; --bg2:#e8e4de; --bg3:#ddd9d2; --surface:#faf8f5;
    --border:#d4cfc8; --accent:#2563eb; --accent-bg:#eff4ff;
    --success:#059669; --warn:#d97706; --danger:#dc2626;
    --text:#1a1714; --text2:#44403c; --text3:#78716c;
    --mono:'Geist Mono',monospace; --sans:'Geist',sans-serif; --serif:'Instrument Serif',serif;
    --radius:12px; --shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06);
    --shadow-lg:0 4px 6px rgba(0,0,0,.07),0 12px 40px rgba(0,0,0,.1);
  }
  html{font-size:16px}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;-webkit-font-smoothing:antialiased}
  .app{min-height:100vh;display:flex;flex-direction:column}

  /* Header */
  .header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;height:60px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100}
  .logo-mark{width:32px;height:32px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .logo-name{font-weight:700;font-size:17px;color:var(--text);letter-spacing:-.3px}
  .logo-tag{font-size:11px;font-weight:500;color:var(--accent);background:var(--accent-bg);padding:2px 8px;border-radius:20px;border:1px solid #bfdbfe}
  .header-right{margin-left:auto;display:flex;align-items:center;gap:8px}
  .live-badge{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--success);background:#ecfdf5;border:1px solid #a7f3d0;padding:4px 10px;border-radius:20px}
  .live-dot{width:6px;height:6px;background:var(--success);border-radius:50%;animation:livepulse 2s infinite}
  @keyframes livepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}

  /* Layout */
  .page{flex:1;display:grid;grid-template-columns:320px 1fr;min-height:calc(100vh - 60px)}
  .sidebar{background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;position:sticky;top:60px;height:calc(100vh - 60px)}
  .sidebar-inner{padding:20px;display:flex;flex-direction:column;gap:18px;flex:1}
  .form-section{display:flex;flex-direction:column;gap:6px}
  .form-label{font-size:11px;font-weight:700;color:var(--text2);letter-spacing:.5px;text-transform:uppercase}
  .form-hint{font-size:11px;color:var(--text3);margin-top:3px;line-height:1.5}

  textarea{width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--sans);font-size:14px;padding:12px 14px;resize:none;outline:none;transition:border-color .15s,box-shadow .15s;line-height:1.6}
  textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.1)}
  textarea::placeholder{color:var(--text3)}
  .keyword-input{width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--sans);font-size:14px;padding:10px 14px;outline:none;transition:border-color .15s,box-shadow .15s}
  .keyword-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.1)}
  .keyword-input::placeholder{color:var(--text3)}
  .tags-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .keyword-tag{display:flex;align-items:center;gap:4px;background:var(--accent-bg);border:1px solid #bfdbfe;color:var(--accent);font-size:12px;font-weight:500;padding:3px 10px;border-radius:20px;cursor:pointer}
  .keyword-tag:hover{background:#dbeafe}

  .options-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .opt-btn{padding:9px 10px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;color:var(--text2);font-family:var(--sans);font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;text-align:center}
  .opt-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-bg)}
  .opt-btn.active{border-color:var(--accent);color:var(--accent);background:var(--accent-bg);font-weight:600}
  .select-field{width:100%;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--sans);font-size:13px;padding:9px 12px;outline:none;cursor:pointer;transition:border-color .15s;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2378716c' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}

  .generate-btn{width:100%;padding:13px;background:var(--accent);color:white;border:none;border-radius:var(--radius);font-family:var(--sans);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;position:relative;overflow:hidden}
  .generate-btn:hover:not(:disabled){background:#1d4ed8;box-shadow:0 4px 12px rgba(37,99,235,.3);transform:translateY(-1px)}
  .generate-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
  .btn-shimmer{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);transform:translateX(-100%);animation:shimmer 1.4s infinite}
  @keyframes shimmer{to{transform:translateX(100%)}}
  .spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}

  /* Main content */
  .main-content{overflow-y:auto;padding:28px 32px;display:flex;flex-direction:column;gap:20px;background:var(--bg)}

  /* Progress */
  .progress-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow)}
  .progress-head{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .progress-head-title{font-weight:600;font-size:14px;color:var(--text)}
  .progress-head-sub{font-size:12px;color:var(--text3);margin-top:1px}
  .phase-list{display:flex;flex-direction:column;gap:2px}
  .phase-item{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:8px;font-size:13px;transition:background .15s}
  .phase-item.active{background:var(--accent-bg)}
  .phase-item.done{background:#f0fdf4}
  .phase-num{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
  .phase-item.pending .phase-num{background:var(--bg2);color:var(--text3);border:1.5px solid var(--border)}
  .phase-item.active .phase-num{background:var(--accent);color:white}
  .phase-item.done .phase-num{background:var(--success);color:white}
  .phase-text{flex:1;color:var(--text2)}
  .phase-item.active .phase-text{color:var(--accent);font-weight:500}
  .phase-item.done .phase-text{color:var(--success)}
  .phase-item.pending .phase-text{color:var(--text3)}
  .phase-status{font-family:var(--mono);font-size:10px;letter-spacing:.3px}
  .phase-item.active .phase-status{color:var(--accent)}
  .phase-item.done .phase-status{color:var(--success)}

  /* Stats grid */
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;box-shadow:var(--shadow)}
  .stat-card.good{border-color:#6ee7b7;background:#f0fdf4}
  .stat-card.warn{border-color:#fcd34d;background:#fffbeb}
  .stat-card.bad{border-color:#fca5a5;background:#fef2f2}
  .stat-num{font-family:var(--serif);font-size:30px;line-height:1;font-style:italic}
  .stat-card.good .stat-num{color:var(--success)}
  .stat-card.warn .stat-num{color:var(--warn)}
  .stat-card.bad .stat-num{color:var(--danger)}
  .stat-card:not(.good):not(.warn):not(.bad) .stat-num{color:var(--accent)}
  .stat-label{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}

  /* Validation panel */
  .validation-panel{border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
  .val-header{padding:14px 18px;display:flex;align-items:center;gap:10px}
  .val-header.valid{background:#f0fdf4;border:1px solid #6ee7b7;border-bottom:none;border-radius:var(--radius) var(--radius) 0 0}
  .val-header.invalid{background:#fffbeb;border:1px solid #fcd34d;border-bottom:none;border-radius:var(--radius) var(--radius) 0 0}
  .val-icon{font-size:20px}
  .val-title{font-weight:700;font-size:14px}
  .val-header.valid .val-title{color:#065f46}
  .val-header.invalid .val-title{color:#92400e}
  .val-sub{font-size:12px;margin-top:1px}
  .val-header.valid .val-sub{color:#047857}
  .val-header.invalid .val-sub{color:#b45309}
  .val-body{padding:14px 18px;background:var(--surface)}
  .val-header.valid + .val-body{border:1px solid #6ee7b7;border-top:none;border-radius:0 0 var(--radius) var(--radius)}
  .val-header.invalid + .val-body{border:1px solid #fcd34d;border-top:none;border-radius:0 0 var(--radius) var(--radius)}
  .val-section-title{font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
  .claim-list{display:flex;flex-direction:column;gap:4px}
  .claim-item{display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:6px 8px;border-radius:6px}
  .claim-item.hallucinated{background:#fef2f2;color:#7f1d1d}
  .claim-item.valid{background:#f0fdf4;color:#064e3b}
  .claim-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:4px}
  .claim-item.hallucinated .claim-dot{background:var(--danger)}
  .claim-item.valid .claim-dot{background:var(--success)}

  /* Article */
  .article-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-lg)}
  .article-topbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  .meta-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .badge{font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;letter-spacing:.2px}
  .badge-blue{background:var(--accent-bg);color:var(--accent);border:1px solid #bfdbfe}
  .badge-green{background:#f0fdf4;color:var(--success);border:1px solid #6ee7b7}
  .badge-warn{background:#fffbeb;color:var(--warn);border:1px solid #fcd34d}
  .badge-gray{background:var(--bg);color:var(--text3);border:1px solid var(--border);font-family:var(--mono);font-size:10px}
  .action-btn{padding:6px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-family:var(--sans);font-size:12px;font-weight:500;color:var(--text2);cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:5px}
  .action-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-bg)}
  .action-btn.success-btn{border-color:var(--success);color:var(--success);background:#f0fdf4}

  .article-body{padding:36px 40px;max-width:800px}
  .article-title{font-family:var(--serif);font-size:36px;line-height:1.15;color:var(--text);margin-bottom:16px;font-style:italic}
  .article-divider{height:3px;width:48px;background:var(--accent);border-radius:2px;margin-bottom:24px}
  .article-content{font-size:15.5px;line-height:1.85;color:var(--text2)}
  .article-content h2{font-family:var(--serif);font-size:24px;font-style:italic;color:var(--text);margin:34px 0 12px;line-height:1.3}
  .article-content h3{font-size:16px;font-weight:700;color:var(--text);margin:22px 0 8px}
  .article-content p{margin-bottom:16px}
  .article-content strong{color:var(--text);font-weight:600}
  .article-content ul{margin:10px 0 16px;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
  .article-content ul li{padding:8px 12px 8px 30px;position:relative;background:var(--bg);border-radius:7px;font-size:14.5px}
  .article-content ul li::before{content:'→';position:absolute;left:10px;color:var(--accent);font-weight:600}
  .article-content blockquote{border-left:3px solid var(--accent);padding:12px 18px;margin:18px 0;background:var(--accent-bg);border-radius:0 8px 8px 0;font-style:italic}
  .citation-tag{display:inline-block;font-family:var(--mono);font-size:10px;background:#f0fdf4;color:var(--success);border:1px solid #a7f3d0;padding:1px 7px;border-radius:4px;margin:0 2px;vertical-align:middle;font-weight:600;white-space:nowrap}
  .article-content h2{font-family:var(--serif);font-size:22px;font-style:italic;color:var(--text);margin:32px 0 10px;line-height:1.3;display:flex;align-items:center;gap:10px}
  .article-content hr{border:none;border-top:1px solid var(--border);margin:18px 0}
  .article-content ol{padding-left:20px;display:flex;flex-direction:column;gap:4px;margin-bottom:14px}
  .article-content ol li{font-size:14.5px;color:var(--text2);padding:3px 0}
  .kw-highlight{background:#fef9c3;border-bottom:2px solid #fbbf24;padding:0 2px;border-radius:2px;font-weight:500}

  /* Sources */
  .sources-wrap{border-top:1px solid var(--border);padding:22px 40px;background:var(--bg)}
  .sources-title{font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .sources-title::after{content:'';flex:1;height:1px;background:var(--border)}
  .sources-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
  .source-card{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;text-decoration:none;transition:all .15s;width:100%;box-sizing:border-box;overflow:hidden}
  .source-card:hover{border-color:var(--accent);box-shadow:0 2px 8px rgba(37,99,235,.1);transform:translateY(-1px)}
  .source-idx{flex:0 0 20px;font-family:var(--mono);font-size:10px;color:var(--text3);padding-top:2px}
  .source-body{flex:1 1 0;min-width:0;overflow:hidden}
  .source-name{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:block}
  .source-sub{font-size:11px;color:var(--text3);margin-top:2px;font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:block}
  .source-full-badge{font-size:9px;padding:1px 5px;background:#f0fdf4;color:var(--success);border:1px solid #6ee7b7;border-radius:3px;margin-top:3px;display:inline-block}

  /* Error */
  .error-card{background:#fef2f2;border:1px solid #fecaca;border-radius:var(--radius);padding:18px 22px;display:flex;gap:14px;align-items:flex-start}
  .error-title{font-weight:600;font-size:14px;color:var(--danger);margin-bottom:4px}
  .error-msg{font-size:13px;color:#7f1d1d;line-height:1.6}
  .error-hint{font-size:12px;color:#991b1b;margin-top:8px;font-family:var(--mono);background:#fee2e2;padding:6px 10px;border-radius:6px;display:inline-block}

  /* Empty state */
  .empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 20px;gap:16px;min-height:400px}
  .empty-icon-wrap{width:72px;height:72px;background:var(--surface);border:1.5px solid var(--border);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:var(--shadow)}
  .empty-title{font-family:var(--serif);font-size:26px;color:var(--text);font-style:italic}
  .empty-desc{font-size:14px;color:var(--text3);max-width:360px;line-height:1.7}
  .example-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px}
  .example-chip{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 14px;font-size:12px;color:var(--text2);cursor:pointer;transition:all .15s}
  .example-chip:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-bg)}

  /* Pipeline info */
  .pipeline-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
  .pipeline-row:last-child{border-bottom:none}
  .pipeline-icon{width:26px;height:26px;border-radius:6px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
  .pipeline-name{font-weight:500;color:var(--text);font-size:12px}
  .pipeline-desc{font-size:10px;color:var(--text3)}

  /* Structural quality panel */
  .quality-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
  .quality-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center}
  .quality-card.ok{border-color:#6ee7b7;background:#f0fdf4}
  .quality-card.warn{border-color:#fcd34d;background:#fffbeb}
  .quality-card.bad{border-color:#fca5a5;background:#fef2f2}
  .qc-val{font-family:var(--serif);font-size:22px;font-style:italic}
  .quality-card.ok .qc-val{color:var(--success)}
  .quality-card.warn .qc-val{color:var(--warn)}
  .quality-card.bad .qc-val{color:var(--danger)}
  .qc-label{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-top:3px}
  .issue-list{display:flex;flex-direction:column;gap:4px;margin-top:10px}
  .issue-item{background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:6px 10px;font-size:12px;color:#92400e;display:flex;gap:8px;align-items:center}

  /* Data intelligence box */
  .data-box{background:#f8faff;border:1.5px solid #bfdbfe;border-radius:10px;padding:18px 22px;margin:16px 0}
  .data-box-title{font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .data-table{width:100%;border-collapse:collapse;font-size:13px}
  .data-table th{text-align:left;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;border-bottom:1px solid var(--border)}
  .data-table td{padding:7px 10px;border-bottom:1px solid rgba(212,207,200,.4);color:var(--text2)}
  .data-table tr:last-child td{border-bottom:none}
  .data-table td:first-child{font-weight:600;color:var(--text)}
  .data-table td:last-child{font-family:var(--mono);font-size:11px;color:var(--accent)}

  /* Source diversity bar */
  .diversity-bar{height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-top:6px}
  .diversity-fill{height:100%;border-radius:3px;transition:width .4s}
  .diversity-fill.ok{background:var(--success)}
  .diversity-fill.warn{background:var(--warn)}

  /* Insufficient coverage callout */
  .article-content .insufficient{
    background:var(--bg2);border-left:3px solid var(--border);
    padding:10px 14px;border-radius:0 6px 6px 0;
    font-size:13px;color:var(--text3);font-style:italic;margin:8px 0;
  }

  /* Responsive */
  @media(max-width:900px){
    .page{grid-template-columns:1fr}
    .sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border)}
    .main-content{padding:20px 16px}
    .article-body{padding:24px 20px}
    .sources-wrap{padding:20px}
    .article-title{font-size:26px}
    .stats-grid{grid-template-columns:repeat(2,1fr)}
  }
  @media(max-width:560px){
    .header{padding:0 16px}
    .logo-tag{display:none}
    .article-title{font-size:22px}
    .stats-grid{grid-template-columns:repeat(2,1fr)}
    .sources-grid{grid-template-columns:1fr}
  }
`;

const OUTPUT_TYPES = [
  { id:"Blog Post",      label:"📝 Blog Post" },
  { id:"Research Brief", label:"🔬 Research Brief" },
  { id:"Threat Report",  label:"🛡️ Threat Report" },
  { id:"Newsletter",     label:"📨 Newsletter" },
];
const TONE_OPTIONS = [
  "Neutral & Analytical","Professional & Formal","Journalistic","Intelligence Brief"
];
const PHASES = [
  { label:"Searching web + news (Serper)" },
  { label:"Domain whitelist check (source lock)" },
  { label:"Extracting real page content" },
  { label:"Chunking with metadata + TF-IDF retrieval" },
  { label:"Writing article (strict RAG, temp=0.25)" },
  { label:"Source Validation Agent (2nd LLM)" },
];
const PHASE_KEYS = ["search","lock","extract","chunk","write","validate"];
const EXAMPLES = [
  "AI cyber threats 2026","Quantum computing breakthroughs",
  "Climate tech policy 2026","Autonomous vehicles safety",
];

function highlightKeywords(text, keywords) {
  if (!keywords.length) return text;
  const esc = keywords.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  return text.replace(new RegExp(`(${esc.join("|")})`, "gi"),
    `<mark class="kw-highlight">$1</mark>`);
}
// ── Citation styling ─────────────────────────────────────────────────────
// Handles both ⟨domain⟩ (new template) and [Source: domain] (legacy)
function styleCitations(text) {
  return text
    // ⟨domain⟩ → styled pill (native template format)
    .replace(/⟨([^⟩]+)⟩/g,
      (_,inner)=>`<span class="citation-tag">⟨${inner.trim()}⟩</span>`)
    // [Source: domain] → styled pill (legacy format)
    .replace(/\[Source:\s*([^\]]+)\]/gi,
      (_,inner)=>`<span class="citation-tag">⟨${inner.trim()}⟩</span>`)
    // (Insufficient source coverage phrases are stripped server-side before reaching here)
}

// ── Markdown table parser ─────────────────────────────────────────────────
function parseTable(lines, startIdx) {
  const rows = [];
  let i = startIdx;
  while (i < lines.length && lines[i].includes("|")) {
    const cells = lines[i].split("|").map(c => c.trim()).filter(Boolean);
    rows.push(cells);
    i++;
  }
  // row[0] = header, row[1] = separator (---|---), row[2+] = data
  if (rows.length < 3) return { el: null, nextIdx: i };
  const header = rows[0];
  const data   = rows.slice(2);
  const el = (
    <div className="data-box" key={`table-${startIdx}`}>
      <div className="data-box-title">📊 Data Intelligence Box</div>
      <table className="data-table">
        <thead>
          <tr>{header.map((h,j)=><th key={j}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row,ri)=>(
            <tr key={ri}>
              {row.map((cell,ci)=>(
                <td key={ci} dangerouslySetInnerHTML={{__html:styleCitations(cell)}}/>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return { el, nextIdx: i };
}

function renderMarkdown(text, keywords=[]) {
  const lines = text.split("\n");
  const els   = [];
  let i = 0;

  const process = (t) => styleCitations(highlightKeywords(
    t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>"),
    keywords
  ));

  while (i < lines.length) {
    const line = lines[i];

    // Section divider (---)
    if (/^---+$/.test(line.trim())) {
      els.push(<hr key={i} style={{border:"none",borderTop:"1px solid var(--border)",margin:"20px 0"}}/>);
      i++; continue;
    }

    // H1 inside body (shouldn't appear but handle gracefully)
    if (line.startsWith("# ")) {
      els.push(<h2 key={i} dangerouslySetInnerHTML={{__html:process(line.slice(2))}}/>);
      i++; continue;
    }

    // H2 — section header with number badge
    if (line.startsWith("## ")) {
      const raw = line.slice(3).trim();
      // Extract leading number like "1." or "1." from "1. Executive Brief"
      const numMatch = raw.match(/^(\d+\.?|📊)\s*/);
      const num   = numMatch ? numMatch[0].trim() : null;
      const label = numMatch ? raw.slice(numMatch[0].length).trim() : raw;
      els.push(
        <h2 key={i} style={{display:"flex",alignItems:"center",gap:"10px"}}>
          {num && <span style={{
            background:"var(--accent)",color:"white",
            borderRadius:"6px",padding:"2px 8px",
            fontSize:"12px",fontFamily:"var(--mono)",
            fontStyle:"normal",flexShrink:0
          }}>{num}</span>}
          <span dangerouslySetInnerHTML={{__html:process(label)}}/>
        </h2>
      );
      i++; continue;
    }

    if (line.startsWith("### ")) {
      els.push(<h3 key={i} dangerouslySetInnerHTML={{__html:process(line.slice(4))}}/>);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      els.push(<blockquote key={i} dangerouslySetInnerHTML={{__html:process(line.slice(2))}}/>);
      i++; continue;
    }

    // Markdown table
    if (line.includes("|") && line.trim().startsWith("|")) {
      const { el, nextIdx } = parseTable(lines, i);
      if (el) { els.push(el); i = nextIdx; continue; }
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(<li key={i} dangerouslySetInnerHTML={{__html:process(lines[i].slice(2))}}/>);
        i++;
      }
      els.push(<ul key={`ul${i}`}>{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} dangerouslySetInnerHTML={{__html:process(lines[i].replace(/^\d+\.\s/,""))}}/>);
        i++;
      }
      els.push(<ol key={`ol${i}`} style={{paddingLeft:"20px",display:"flex",flexDirection:"column",gap:"4px"}}>{items}</ol>);
      continue;
    }

    // Bold line (executive brief fields like "What happened:")
    if (line.match(/^\*\*[^*]+:\*\*/)) {
      els.push(<p key={i} dangerouslySetInnerHTML={{__html:process(line)}} style={{marginBottom:"6px"}}/>);
      i++; continue;
    }

    // Regular paragraph
    if (line.trim()) {
      els.push(<p key={i} dangerouslySetInnerHTML={{__html:process(line)}}/>);
    }
    i++;
  }
  return els;
}
function parseArticle(text) {
  const m = text.match(/^#\s+(.+)/m);
  if (m) return { title: m[1].replace(/\*\*/g,"").trim(), body: text.replace(m[0],"").trim() };
  return { title:"", body: text };
}

export default function OSINTArticleAI() {
  const [topic,        setTopic]        = useState("");
  const [kwInput,      setKwInput]      = useState("");
  const [keywords,     setKeywords]     = useState([]);
  const [outputType,   setOutputType]   = useState("Blog Post");
  const [tone,         setTone]         = useState("Neutral & Analytical");
  const [phase,        setPhase]        = useState(null);
  const [article,      setArticle]      = useState(null);
  const [stats,        setStats]        = useState(null);
  const [validation,   setValidation]   = useState(null);
  const [structural,   setStructural]   = useState(null);
  const [error,        setError]        = useState("");
  const [copied,       setCopied]       = useState(false);
  const mainRef = useRef(null);

  const phaseIdx = PHASE_KEYS.indexOf(phase);
  function getPS(i) {
    if (phase==="done")  return "done";
    if (phase==="error") return "pending";
    if (i <  phaseIdx)   return "done";
    if (i === phaseIdx)  return "active";
    return "pending";
  }

  function addKeyword(e) {
    if ((e.key==="Enter"||e.key===",") && kwInput.trim()) {
      e.preventDefault();
      const kw = kwInput.trim().replace(/,$/,"");
      if (kw && !keywords.includes(kw)) setKeywords([...keywords,kw]);
      setKwInput("");
    }
  }

  async function generate() {
    if (!topic.trim()) return;
    setError(""); setArticle(null); setStats(null); setValidation(null); setStructural(null);

    const delay = (ms) => new Promise(r=>setTimeout(r,ms));
    const phases = PHASE_KEYS;
    let pi = 0;

    async function nextPhase() { setPhase(phases[pi++]); await delay(600); }

    try {
      await nextPhase(); // search
      const fetchPromise = fetch("/api/generate",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({topic,outputType,tone,keywords})
      });

      await nextPhase(); // lock
      await nextPhase(); // extract
      await nextPhase(); // chunk

      const response = await fetchPromise;
      await nextPhase(); // write

      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.error||"Server error");
      }

      const data = await response.json();
      await nextPhase(); // validate
      await delay(300);

      if (!data.article?.trim()) throw new Error("No article generated.");

      const parsed = parseArticle(data.article);
      setArticle({...parsed, raw:data.article, type:outputType, keywords, sources:data.sources||[]});
      setStats(data.searchStats);
      setValidation(data.validation);
      setStructural(data.structural || null);
      setPhase("done");

      setTimeout(()=>mainRef.current?.scrollTo({top:0,behavior:"smooth"}),100);
    } catch(e) {
      setError(e.message);
      setPhase("error");
    }
  }

  function copy() {
    if (article?.raw) {
      navigator.clipboard.writeText(article.raw);
      setCopied(true);
      setTimeout(()=>setCopied(false),2000);
    }
  }

  const isLoading = phase && phase!=="done" && phase!=="error";
  const hCount    = validation?.hallucinated_claims?.length || 0;
  const isValid   = validation?.verdict==="VALID" && hCount===0;

  return (<>
    <style>{STYLE}</style>
    <div className="app">

      {/* Header */}
      <header className="header">
        <div className="logo-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <span className="logo-name">OSINT AI</span>
        <span className="logo-tag">ENTERPRISE RAG</span>
        <div className="header-right">
          <div className="live-badge"><div className="live-dot"/>Groq + Serper</div>
        </div>
      </header>

      <div className="page">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-inner">

            <div className="form-section">
              <label className="form-label">Topic / Query</label>
              <textarea rows={4} placeholder={"e.g. AI cyber threats 2026\ne.g. Quantum computing breakthroughs"}
                value={topic} onChange={e=>setTopic(e.target.value)} disabled={isLoading}/>
            </div>

            <div className="form-section">
              <label className="form-label">Keywords</label>
              <input className="keyword-input" placeholder="Type keyword + Enter"
                value={kwInput} onChange={e=>setKwInput(e.target.value)}
                onKeyDown={addKeyword} disabled={isLoading}/>
              {keywords.length>0&&(
                <div className="tags-row">
                  {keywords.map(k=>(
                    <div key={k} className="keyword-tag" onClick={()=>setKeywords(keywords.filter(x=>x!==k))}>
                      {k} <span>×</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="form-hint">Highlighted in article. Press Enter to add.</p>
            </div>

            <div className="form-section">
              <label className="form-label">Output Format</label>
              <div className="options-grid">
                {OUTPUT_TYPES.map(o=>(
                  <button key={o.id} className={`opt-btn ${outputType===o.id?"active":""}`}
                    onClick={()=>setOutputType(o.id)} disabled={isLoading}>{o.label}</button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <label className="form-label">Tone</label>
              <select className="select-field" value={tone}
                onChange={e=>setTone(e.target.value)} disabled={isLoading}>
                {TONE_OPTIONS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-section">
              <label className="form-label">Pipeline</label>
              {[
                {icon:"🔒",name:"Domain Whitelist",    desc:"Source lock — no external URLs"},
                {icon:"📄",name:"Content Extraction",  desc:"Real HTML → clean text"},
                {icon:"🧠",name:"TF-IDF Retrieval",    desc:"Top chunks by relevance"},
                {icon:"✍️",name:"Groq LLaMA 70B",      desc:"Strict RAG, temp=0.25"},
                {icon:"🛡️",name:"Validation Agent",    desc:"2nd LLM audits every claim"},
                {icon:"🔄",name:"Auto-regenerate",     desc:"Up to 2 retries if INVALID"},
              ].map(p=>(
                <div key={p.name} className="pipeline-row">
                  <div className="pipeline-icon">{p.icon}</div>
                  <div><div className="pipeline-name">{p.name}</div><div className="pipeline-desc">{p.desc}</div></div>
                </div>
              ))}
            </div>

            <button className="generate-btn" onClick={generate} disabled={isLoading||!topic.trim()}>
              {isLoading&&<span className="btn-shimmer"/>}
              {isLoading
                ? <><div className="spinner"/>Generating...</>
                : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Generate Article</>
              }
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="main-content" ref={mainRef}>

          {/* Progress */}
          {isLoading&&(
            <div className="progress-card">
              <div className="progress-head">
                <div className="spinner" style={{borderColor:"rgba(37,99,235,.2)",borderTopColor:"var(--accent)"}}/>
                <div>
                  <div className="progress-head-title">Enterprise RAG Pipeline running…</div>
                  <div className="progress-head-sub">Source lock → Extract → Chunk → Retrieve → Write → Validate</div>
                </div>
              </div>
              <div className="phase-list">
                {PHASES.map((p,i)=>{
                  const s=getPS(i);
                  return(
                    <div key={i} className={`phase-item ${s}`}>
                      <div className="phase-num">{s==="done"?"✓":s==="active"?"…":i+1}</div>
                      <div className="phase-text">{p.label}</div>
                      <div className="phase-status">{s==="done"?"DONE":s==="active"?"RUNNING":""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {phase==="done"&&stats&&(
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-num">{stats.sourcesUsed}</div>
                <div className="stat-label">Sources Used</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{stats.chunksUsed}</div>
                <div className="stat-label">Chunks Retrieved</div>
              </div>
              <div className={`stat-card ${isValid?"good":"warn"}`}>
                <div className="stat-num">{isValid?"✓":stats.attempts}</div>
                <div className="stat-label">{isValid?"Verified":"Attempts"}</div>
              </div>
              <div className={`stat-card ${hCount===0?"good":hCount<=2?"warn":"bad"}`}>
                <div className="stat-num">{hCount}</div>
                <div className="stat-label">Hallucinated</div>
              </div>
            </div>
          )}

          {/* Quality + Validation panel */}
          {phase==="done"&&(validation||structural)&&(
            <div className="validation-panel">
              <div className={`val-header ${isValid&&structural?.passed!==false?"valid":"invalid"}`}>
                <div className="val-icon">{isValid&&structural?.passed!==false?"✅":"⚠️"}</div>
                <div>
                  <div className="val-title">
                    {isValid&&structural?.passed!==false
                      ?"Intelligence Report — Quality Verified"
                      :"Intelligence Report — Issues Flagged"}
                  </div>
                  <div className="val-sub">
                    {isValid
                      ?`Source-grounded · ${validation?.valid_claims?.length||0} verified claims`
                      :`${hCount} claim${hCount!==1?"s":""} flagged`}
                    {structural&&!structural.passed?` · ${structural.issues.length} structural issue${structural.issues.length!==1?"s":""}`:""}
                  </div>
                </div>
              </div>
              <div className="val-body">

                {/* Structural quality cards */}
                {structural&&(
                  <>
                    <div className="val-section-title" style={{marginBottom:10}}>📊 Structural Quality</div>
                    <div className="quality-grid">
                      <div className={`quality-card ${structural.sourceDiversity?.passed?"ok":"warn"}`}>
                        <div className="qc-val">{structural.sourceDiversity?.pct||0}%</div>
                        <div className="qc-label">Top Source</div>
                        <div className="diversity-bar">
                          <div className={`diversity-fill ${(structural.sourceDiversity?.pct||0)<=40?"ok":"warn"}`}
                            style={{width:`${Math.min(structural.sourceDiversity?.pct||0,100)}%`}}/>
                        </div>
                      </div>
                      <div className={`quality-card ${structural.citationDensity?.passed?"ok":"warn"}`}>
                        <div className="qc-val">{structural.sourceDiversity?.total||0}</div>
                        <div className="qc-label">Total Citations</div>
                      </div>
                      <div className={`quality-card ${structural.duplicateHeaders?.passed?"ok":"bad"}`}>
                        <div className="qc-val">{structural.duplicateHeaders?.passed?"✓":"✗"}</div>
                        <div className="qc-label">No Dup Headers</div>
                      </div>
                    </div>
                    {structural.issues?.length>0&&(
                      <div className="issue-list">
                        {structural.issues.map((iss,i)=>(
                          <div key={i} className="issue-item">⚠ {iss}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Hallucination flags */}
                {hCount>0&&(
                  <div style={{marginTop:14}}>
                    <div className="val-section-title">⚠ Hallucinated / Unsupported Claims</div>
                    <div className="claim-list">
                      {validation.hallucinated_claims.map((c,i)=>(
                        <div key={i} className="claim-item hallucinated">
                          <div className="claim-dot"/>{c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Verified sample */}
                {validation?.valid_claims?.length>0&&(
                  <div style={{marginTop:hCount>0?12:0}}>
                    <div className="val-section-title">✓ Verified Claims (sample)</div>
                    <div className="claim-list">
                      {validation.valid_claims.slice(0,3).map((c,i)=>(
                        <div key={i} className="claim-item valid">
                          <div className="claim-dot"/>{c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Error */}
          {phase==="error"&&error&&(
            <div className="error-card">
              <span style={{fontSize:20}}>⚠️</span>
              <div>
                <div className="error-title">Pipeline Error</div>
                <div className="error-msg">{error}</div>
                <div className="error-hint">node server.js</div>
              </div>
            </div>
          )}

          {/* Article */}
          {article&&(
            <div className="article-card">
              <div className="article-topbar">
                <div className="meta-row">
                  <span className="badge badge-blue">{article.type}</span>
                  <span className="badge badge-gray">{new Date().toDateString()}</span>
                  {isValid
                    ? <span className="badge badge-green">✅ Fully sourced</span>
                    : <span className="badge badge-warn">⚠ {hCount} flagged</span>
                  }
                  {stats?.attempts>1&&<span className="badge badge-gray">{stats.attempts} attempts</span>}
                </div>
                <button className={`action-btn ${copied?"success-btn":""}`} onClick={copy}>
                  {copied?"✓ Copied!":"📋 Copy"}
                </button>
              </div>

              <div className="article-body">
                {article.title&&<>
                  <div className="article-title">{article.title}</div>
                  <div className="article-divider"/>
                </>}
                <div className="article-content">
                  {renderMarkdown(article.body, article.keywords||[])}
                </div>
              </div>

              {article.sources?.length>0&&(
                <div className="sources-wrap">
                  <div className="sources-title">Sources ({article.sources.length})</div>
                  <div className="sources-grid">
                    {article.sources.map((s,i)=>(
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="source-card">
                        <div className="source-idx">[{i+1}]</div>
                        <div className="source-body">
                          <div className="source-name">{s.title||s.name}</div>
                          <div className="source-sub">{s.name}{s.date?` · ${s.date}`:""}</div>
                          {s.hadFullContent&&<span className="source-full-badge">full content</span>}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading&&!article&&phase!=="error"&&(
            <div className="empty-state">
              <div className="empty-icon-wrap">🔍</div>
              <div className="empty-title">Enterprise OSINT pipeline</div>
              <div className="empty-desc">
                Source-locked → content-extracted → chunk-retrieved → strictly prompted → validation-audited.
                Every claim traced. Hallucinations flagged automatically.
              </div>
              <div className="example-chips">
                {EXAMPLES.map(ex=>(
                  <div key={ex} className="example-chip" onClick={()=>setTopic(ex)}>{ex}</div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  </>);
}
