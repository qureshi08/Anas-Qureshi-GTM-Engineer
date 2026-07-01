// GTM sourcing worker.
// Runs on YOUR machine (the cloud app can't drive a real browser). It polls the
// sourcing_jobs table, runs your leadgen scrape (maps.py) + email enrichment
// (enrich_fast.py), and writes the businesses straight into your prospects pipeline.
//
// Run from the Website/ folder:   node worker/source-worker.mjs
// Prereqs (one time), in the leadgen tools env:
//   pip install playwright requests beautifulsoup4 lxml
//   playwright install chromium

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// load .env.local (Website root) so this runs with a plain `node` command
(function loadEnv() {
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE in Website/.env.local');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// where your Python scrapers live (override with LEADGEN_DIR if you move them)
const LEADGEN = process.env.LEADGEN_DIR || path.resolve(__dirname, '..', '..', 'AI Automations', 'leadgen', 'tools');
const PY = process.env.PYTHON || 'python';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} ${args[0] ? path.basename(args[0]) : ''} exited ${code}`))));
    p.on('error', reject);
  });
}

async function processJob(job) {
  console.log(`\n> Job ${job.id}: "${job.industry} in ${job.market}" (max ${job.max_results})`);
  await db.from('sourcing_jobs').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', job.id);

  const query = `${job.industry} in ${job.market}`;
  const raw = path.join(os.tmpdir(), `gtm_${job.id}_raw.json`);
  const enriched = path.join(os.tmpdir(), `gtm_${job.id}_enriched.json`);

  // 1. scrape Google Maps
  await run(PY, [path.join(LEADGEN, 'maps.py'), query, '--max', String(job.max_results || 40), '--out', raw], { cwd: LEADGEN });

  // 2. enrich emails from each website (best-effort; skip if it fails)
  let file = raw;
  try {
    await run(PY, [path.join(LEADGEN, 'enrich_fast.py'), raw, '--out', enriched, '--workers', '10'], { cwd: LEADGEN });
    file = enriched;
  } catch (e) {
    console.warn('  email enrichment skipped:', e.message);
  }

  // 3. map to prospects and insert
  const businesses = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = businesses
    .filter(b => b.company)
    .map(b => ({
      company: b.company,
      website: b.website || null,
      phone: b.phone || null,
      address: b.notes || null,        // maps.py stores the address in `notes`
      email: b.email || null,
      niche: b.industry || job.industry,
      source: 'google_maps',
      status: 'new',
    }));

  if (rows.length) {
    const { error } = await db.from('prospects').insert(rows);
    if (error) throw error;
  }

  await db.from('sourcing_jobs').update({ status: 'done', found: rows.length, updated_at: new Date().toISOString() }).eq('id', job.id);
  console.log(`  done: ${rows.length} businesses into the pipeline (${rows.filter(r => r.email).length} with an email)`);
}

async function loop() {
  console.log('GTM sourcing worker up. Polling for jobs. Ctrl+C to stop.');
  for (;;) {
    const { data: jobs, error } = await db.from('sourcing_jobs').select('*').eq('status', 'pending').order('created_at').limit(1);
    if (error) { console.error('poll error:', error.message); await sleep(5000); continue; }
    const job = jobs && jobs[0];
    if (!job) { await sleep(5000); continue; }
    try {
      await processJob(job);
    } catch (e) {
      console.error(`  job ${job.id} failed:`, e.message);
      await db.from('sourcing_jobs').update({ status: 'error', error: String(e.message).slice(0, 500), updated_at: new Date().toISOString() }).eq('id', job.id);
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
loop();
