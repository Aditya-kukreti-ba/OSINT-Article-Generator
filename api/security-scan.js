/**
 * CyberGuard AI — Security Monitor
 * Vercel Serverless Function: /api/security-scan
 * -----------------------------------------------
 * Scans incoming request data for attack patterns
 * and sends real-time alerts to Telegram.
 * 
 * Can be called directly as an API or imported
 * by other serverless functions as a scanner.
 */

// ─── Configuration ───────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8633083231:AAH2pNaqwF2jPflzGHxYR-4q-sHVvjv1mhs';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';

// ─── Attack Pattern Signatures ───────────────────────────────
const ATTACK_PATTERNS = [
  // SQL Injection
  { pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b.*\b(FROM|INTO|TABLE|SET|WHERE)\b)/i, type: '🛢️ SQL Injection', severity: 'CRITICAL' },
  { pattern: /('|")\s*(OR|AND)\s+('|"|\d)/i, type: '🛢️ SQL Injection', severity: 'CRITICAL' },
  { pattern: /(UNION\s+(ALL\s+)?SELECT)/i, type: '🛢️ SQL Injection', severity: 'CRITICAL' },
  { pattern: /(;\s*(DROP|DELETE|INSERT|UPDATE)\s)/i, type: '🛢️ SQL Injection', severity: 'CRITICAL' },

  // XSS (Cross-Site Scripting)
  { pattern: /(<script[\s>]|javascript\s*:|onerror\s*=|onload\s*=|onclick\s*=|onmouseover\s*=)/i, type: '🔴 XSS Attack', severity: 'HIGH' },
  { pattern: /(document\.(cookie|location|write)|eval\s*\(|alert\s*\()/i, type: '🔴 XSS Attack', severity: 'HIGH' },
  { pattern: /(<iframe|<embed|<object|<svg\s+onload)/i, type: '🔴 XSS Attack', severity: 'HIGH' },

  // Path Traversal
  { pattern: /(\.\.\/|\.\.\\){2,}/i, type: '📁 Path Traversal', severity: 'HIGH' },
  { pattern: /(\/etc\/(passwd|shadow|hosts)|\/proc\/self|\/var\/log)/i, type: '📁 Path Traversal', severity: 'CRITICAL' },
  { pattern: /(\.env|\.git\/|\.htaccess|wp-config\.php)/i, type: '📁 Sensitive File Probe', severity: 'HIGH' },

  // Directory / Admin Probing
  { pattern: /(\/wp-admin|\/wp-login|\/phpmyadmin|\/administrator|\/admin\.php)/i, type: '🔍 Directory Probing', severity: 'MEDIUM' },
  { pattern: /(\/\.git|\/\.svn|\/\.hg|\/\.env\.local|\/\.env\.production)/i, type: '🔍 Config File Probe', severity: 'HIGH' },

  // Command Injection
  { pattern: /(;\s*(ls|cat|wget|curl|bash|sh|nc|ncat|chmod|chown)\s)/i, type: '💀 Command Injection', severity: 'CRITICAL' },
  { pattern: /(\|\s*(ls|cat|id|whoami|uname|passwd))/i, type: '💀 Command Injection', severity: 'CRITICAL' },
  { pattern: /(\$\(|`)(.*)(cat|ls|id|whoami|curl)/i, type: '💀 Command Injection', severity: 'CRITICAL' },

  // SSRF (Server-Side Request Forgery)
  { pattern: /(127\.0\.0\.1|0\.0\.0\.0|169\.254\.169\.254|metadata\.google)/i, type: '🌐 SSRF Attempt', severity: 'HIGH' },

  // Log4Shell / JNDI
  { pattern: /(\$\{jndi:|ldap:\/\/|rmi:\/\/)/i, type: '☢️ Log4Shell/JNDI', severity: 'CRITICAL' },

  // XML External Entity (XXE)
  { pattern: /(<!ENTITY|<!DOCTYPE.*\[|SYSTEM\s+"file:)/i, type: '📄 XXE Attack', severity: 'CRITICAL' },
];

// ─── Severity Emojis ─────────────────────────────────────────
const SEVERITY_EMOJI = {
  CRITICAL: '🚨🚨🚨',
  HIGH:     '🚨🚨',
  MEDIUM:   '🚨',
  LOW:      '⚠️',
};

// ─── AI Recommendations Per Attack Type ──────────────────────
const RECOMMENDATIONS = {
  '🛢️ SQL Injection':     '→ Verify all API inputs are parameterized. Check Vercel function logs for suspicious query patterns.',
  '🔴 XSS Attack':        '→ Ensure output encoding is active. Review CSP headers. Check if any user input is rendered unescaped.',
  '📁 Path Traversal':    '→ Validate file paths. Ensure no directory traversal reaches sensitive files.',
  '📁 Sensitive File Probe': '→ Verify .env files are in .gitignore. Check Vercel environment variables are set via dashboard only.',
  '🔍 Directory Probing': '→ Automated scanning detected. Monitor for persistence. No action needed unless frequency increases.',
  '🔍 Config File Probe': '→ Confirm sensitive config files (.env, .git) are not accessible. Review Vercel deployment.',
  '💀 Command Injection': '→ CRITICAL: Review all exec/spawn calls immediately. Ensure no user input reaches shell commands.',
  '🌐 SSRF Attempt':      '→ Verify URL validation on fetch/request handlers. Block internal IP ranges in API routes.',
  '☢️ Log4Shell/JNDI':    '→ Not typically applicable to Node.js. Alert logged for pattern monitoring.',
  '📄 XXE Attack':        '→ Ensure XML parsing is disabled or uses safe defaults.',
};

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Telegram Alert Sender ───────────────────────────────────
async function sendTelegramAlert(alertData) {
  if (!TELEGRAM_CHAT_ID) {
    console.warn('[CyberGuard] No TELEGRAM_CHAT_ID set — skipping alert');
    return;
  }

  const { type, severity, path, ip, userAgent, method, timestamp } = alertData;

  const message = [
    `${SEVERITY_EMOJI[severity] || '⚠️'} <b>SECURITY ALERT</b>`,
    ``,
    `<b>Type:</b> ${type}`,
    `<b>Severity:</b> ${severity}`,
    `<b>Method:</b> ${method}`,
    `<b>Path:</b> <code>${escapeHtml(path.substring(0, 200))}</code>`,
    `<b>IP:</b> <code>${ip}</code>`,
    `<b>User-Agent:</b> <code>${escapeHtml((userAgent || 'unknown').substring(0, 100))}</code>`,
    `<b>Time:</b> ${timestamp}`,
    ``,
    `<b>🤖 AI Recommendation:</b>`,
    `${RECOMMENDATIONS[type] || '→ Review server logs and monitor for repeated attempts.'}`,
    ``,
    `<i>— CyberGuard AI | OSINT Article Generator</i>`,
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error('[CyberGuard] Telegram alert failed:', err.message);
  }
}

// ─── Core Scanner Function (importable) ──────────────────────
export function scanForThreats(requestData) {
  const { path, body, method, ip, userAgent } = requestData;
  const timestamp = new Date().toISOString();
  const threats = [];

  // Combine all scannable text
  const scanTargets = [path || ''];
  if (body && typeof body === 'string') scanTargets.push(body);
  if (body && typeof body === 'object') scanTargets.push(JSON.stringify(body));

  for (const target of scanTargets) {
    for (const { pattern, type, severity } of ATTACK_PATTERNS) {
      if (pattern.test(target)) {
        threats.push({ type, severity, path, ip, userAgent, method, timestamp });
        break; // one match per target is enough
      }
    }
  }

  return threats;
}

// ─── Alert Sender (importable) ───────────────────────────────
export async function alertThreats(threats) {
  for (const threat of threats) {
    console.warn(`[CyberGuard] ${threat.severity} | ${threat.type} | ${threat.ip} | ${threat.path}`);
    await sendTelegramAlert(threat);
  }
}

// ─── Vercel Handler — /api/security-scan ─────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip        = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const path      = req.url || '/api/security-scan';
  const method    = req.method;

  // Scan the request itself
  const threats = scanForThreats({
    path,
    body: req.body,
    method,
    ip,
    userAgent,
  });

  if (threats.length > 0) {
    await alertThreats(threats);
    return res.status(200).json({
      status: 'threats_detected',
      count: threats.length,
      threats: threats.map(t => ({ type: t.type, severity: t.severity })),
    });
  }

  return res.status(200).json({
    status: 'clean',
    message: 'No threats detected',
    scanned_at: new Date().toISOString(),
  });
}
