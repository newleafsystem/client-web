#!/usr/bin/env node
/**
 * send-weekly-email.js
 *
 * Sends a weekly picks newsletter to all registered subscribers.
 * Fetches subscriber emails from Firestore `users` collection.
 *
 * Usage:
 *   node pipeline/send-weekly-email.js                   # send for current week
 *   node pipeline/send-weekly-email.js --week 2026-W17   # specific week
 *   node pipeline/send-weekly-email.js --dry-run          # preview without sending
 *   node pipeline/send-weekly-email.js --preview          # save HTML to file and open
 *
 * Config: SMTP_*, EMAIL_*, FIREBASE_*, and R2_* values from .env or runtime env.
 */

import nodemailer from 'nodemailer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const { getFirestoreDb } = require('../lib/firebase-admin.cjs');
const { loadRuntimeConfig } = require('../lib/runtime-config.cjs');

// ── Config ───────────────────────────────────────────────────────────────────
const runtimeConfig = loadRuntimeConfig();
const TEMPLATE_PATH = resolve(__dirname, 'templates/weekly-email-template.html');
const R2_BASE_URL = runtimeConfig.r2.publicBaseUrl;

const DRY_RUN = process.argv.includes('--dry-run');
const PREVIEW = process.argv.includes('--preview');

function getFlag(name) {
  const idx = process.argv.indexOf('--' + name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function formatStrategy(strategy) {
  if (!strategy) return 'Options Strategy';
  return strategy
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatDirection(dir) {
  if (!dir) return '';
  const d = dir.toLowerCase();
  if (d === 'bullish') return '&#9650; Bullish';
  if (d === 'bearish') return '&#9660; Bearish';
  return '&#9644; Neutral';
}

function directionColor(dir) {
  if (!dir) return '#64748b';
  const d = dir.toLowerCase();
  if (d === 'bullish') return '#16a34a';
  if (d === 'bearish') return '#dc2626';
  return '#64748b';
}

// ── Firebase ─────────────────────────────────────────────────────────────────
const db = getFirestoreDb();

// ── Build pick card HTML ────────────────────────────────────────────────────
function buildPickCard(pick) {
  const sym = pick.symbol || '';
  const strategy = formatStrategy(pick.strategy);
  const direction = formatDirection(pick.direction);
  const dirColor = directionColor(pick.direction);
  const rr = pick.rewardRisk ? pick.rewardRisk.toFixed(2) + ':1' : '—';
  const pop = pick.oddsOfProfit ? pick.oddsOfProfit + '%' : '—';
  const maxProfit = pick.maxProfit ? '$' + pick.maxProfit.toLocaleString() : '—';
  const maxLoss = pick.maxLoss ? '$' + Math.abs(pick.maxLoss).toLocaleString() : '—';
  const expiry = pick.expiry || '—';
  const dte = pick.dte ? pick.dte + ' DTE' : '';

  const analysisUrl = `https://newleafsystem.com/picks/analysis/${sym.toLowerCase()}`;
  const pdfUrl = `${R2_BASE_URL}/reports/pdf/${sym}/${sym}-Iron-Condor-latest.pdf`;

  return `
          <tr>
            <td style="padding:8px 40px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    <!-- Symbol + Strategy -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <span style="font-size:20px;font-weight:700;color:#0f172a;">${sym}</span>
                          <span style="font-size:14px;color:#64748b;margin-left:8px;">${strategy}</span>
                        </td>
                        <td align="right">
                          <span style="font-size:13px;color:${dirColor};font-weight:600;">${direction}</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Expiry -->
                    <p style="margin:6px 0 12px;color:#94a3b8;font-size:13px;">
                      Exp: ${expiry} &nbsp;${dte ? '&middot; ' + dte : ''}
                    </p>

                    <!-- Metrics Row -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="25%" style="text-align:center;padding:8px 4px;background:#ffffff;border-radius:6px;">
                          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">R:R</div>
                          <div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:2px;">${rr}</div>
                        </td>
                        <td width="25%" style="text-align:center;padding:8px 4px;background:#ffffff;border-radius:6px;">
                          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">PoP</div>
                          <div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:2px;">${pop}</div>
                        </td>
                        <td width="25%" style="text-align:center;padding:8px 4px;background:#ffffff;border-radius:6px;">
                          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Max Profit</div>
                          <div style="font-size:16px;font-weight:700;color:#16a34a;margin-top:2px;">${maxProfit}</div>
                        </td>
                        <td width="25%" style="text-align:center;padding:8px 4px;background:#ffffff;border-radius:6px;">
                          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Max Loss</div>
                          <div style="font-size:16px;font-weight:700;color:#dc2626;margin-top:2px;">${maxLoss}</div>
                        </td>
                      </tr>
                    </table>

                    <!-- Action Links -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                      <tr>
                        <td>
                          <a href="${analysisUrl}" style="color:#1e3a5f;font-size:13px;font-weight:600;text-decoration:none;">
                            View Analysis &rarr;
                          </a>
                        </td>
                        <td align="right">
                          <a href="${pdfUrl}" style="color:#64748b;font-size:13px;text-decoration:none;">
                            &#128196; Download PDF
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

// ── Build full email HTML ───────────────────────────────────────────────────
function buildEmailHtml(weekDoc, picks) {
  let template = readFileSync(TEMPLATE_PATH, 'utf-8');

  const picksHtml = picks.map(p => buildPickCard(p)).join('\n');

  template = template.replace('{{WEEK_LABEL}}', `Week of ${weekDoc.dateRange || weekDoc.weekId}`);
  template = template.replace('{{THEME}}', weekDoc.theme || '');
  template = template.replace('{{PICK_COUNT}}', String(picks.length));
  template = template.replace('{{PICK_PLURAL}}', picks.length === 1 ? '' : 's');
  template = template.replace('{{PICKS_HTML}}', picksHtml);

  return template;
}

// ── Fetch subscribers from Firestore ────────────────────────────────────────
async function getSubscribers() {
  const usersSnap = await db.collection('users').get();
  const emails = [];
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    if (receivesWeeklyPicksEmail(data)) {
      emails.push(notificationEmail(data));
    }
  });
  return [...new Set(emails)]; // deduplicate
}

function receivesWeeklyPicksEmail(user) {
  if (String(user.status || '').toLowerCase() === 'deleted') {
    return false;
  }
  const email = user.notificationPreferences?.email || {};
  const address = notificationEmail(user);
  if (!address) {
    return false;
  }
  if (email.enabled === false) {
    return false;
  }
  return email.topics?.weeklyPicks !== false;
}

function notificationEmail(user) {
  return String(
    user.notificationPreferences?.email?.address ||
    user.communicationEmail ||
    user.email ||
    ''
  ).trim().toLowerCase();
}

// ── Send email ──────────────────────────────────────────────────────────────
async function sendEmail(html, pickCount, weekId, recipients) {
  const emailConfig = runtimeConfig.email;

  if (!emailConfig?.smtp?.host || !emailConfig?.smtp?.user || !emailConfig?.smtp?.pass || !emailConfig?.from) {
    console.error('  Error: Missing SMTP_* or EMAIL_FROM environment config');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: emailConfig.smtp.host,
    port: emailConfig.smtp.port,
    secure: emailConfig.smtp.port === 465,
    auth: {
      user: emailConfig.smtp.user,
      pass: emailConfig.smtp.pass
    }
  });

  const subject = `NewLeaf Weekly Newsletter — ${pickCount} New Recommendation${pickCount === 1 ? '' : 's'}`;

  // Send using BCC to protect subscriber privacy
  const info = await transporter.sendMail({
    from: emailConfig.from,
    to: emailConfig.from,  // send to self
    bcc: recipients.join(', '),
    subject,
    html
  });

  return info;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const weekId = getFlag('week') || getISOWeek();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  console.log(`\n  📧 WEEKLY NEWSLETTER — ${weekId}`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Mode:  ${DRY_RUN ? 'DRY RUN' : PREVIEW ? 'PREVIEW' : 'SEND'}`);
  console.log(`  ────────────────────────────────────────\n`);

  // Step 1: Fetch published picks from Firestore (strategy-builder tiles only)
  console.log('  Fetching published picks...');
  const tilesSnap = await db.collection('tiles')
    .where('isActive', '==', true)
    .where('source', '==', 'publish-pick')
    .get();

  const picks = tilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  if (picks.length === 0) {
    console.log('  ⚠️  No active tiles found. Nothing to email.\n');
    process.exit(0);
  }

  console.log(`  Found ${picks.length} active pick(s): ${picks.map(p => p.symbol).join(', ')}`);

  // Step 2: Fetch subscribers from Firestore
  console.log('  Fetching subscribers...');
  const subscribers = await getSubscribers();
  console.log(`  Found ${subscribers.length} subscriber(s) with weekly picks email enabled.\n`);

  if (subscribers.length === 0) {
    console.log('  ⚠️  No subscribers found in users collection.\n');
    process.exit(0);
  }

  // Build email HTML — use a synthetic weekDoc for template
  const weekDoc = {
    weekId,
    dateRange: today,
    theme: 'Options strategies selected by NewLeaf scoring engine'
  };
  const html = buildEmailHtml(weekDoc, picks);

  // Preview mode — save HTML and exit
  if (PREVIEW) {
    const outDir = resolve(__dirname, 'output');
    mkdirSync(outDir, { recursive: true });
    const previewPath = resolve(outDir, `weekly-email-${weekId}.html`);
    writeFileSync(previewPath, html);
    console.log(`  ✓ Preview saved: ${previewPath}`);
    try {
      execSync(`open "${previewPath}"`, { stdio: 'pipe' });
      console.log('  ✓ Opened in browser\n');
    } catch {
      console.log('  (open manually to preview)\n');
    }
    process.exit(0);
  }

  // Dry run — just show what would happen
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would send to ${subscribers.length} subscriber(s).`);
    console.log(`  [DRY RUN] Subject: NewLeaf Weekly Newsletter — ${picks.length} New Recommendation${picks.length === 1 ? '' : 's'}`);
    console.log(`  [DRY RUN] Picks: ${picks.map(p => p.symbol).join(', ')}\n`);
    process.exit(0);
  }

  // Send
  console.log(`  Sending newsletter to ${subscribers.length} subscriber(s)...`);
  try {
    const info = await sendEmail(html, picks.length, weekId, subscribers);
    console.log(`  ✓ Email sent! Message ID: ${info.messageId}`);
    console.log(`  ✓ Delivered to ${subscribers.length} subscriber(s)\n`);
  } catch (err) {
    console.error(`  ✗ Failed to send: ${err.message}\n`);
    process.exit(1);
  }

  console.log(`  ────────────────────────────────────────`);
  console.log(`  ✅ Weekly newsletter sent — ${picks.length} picks → ${subscribers.length} subscribers`);
  console.log(`  ────────────────────────────────────────\n`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Fatal:', err); process.exit(1); });
