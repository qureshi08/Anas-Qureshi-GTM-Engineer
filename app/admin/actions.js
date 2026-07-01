'use server';

import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { revalidatePath } from 'next/cache';

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function createCampaign(formData) {
  await requireUser();
  const name = formData.get('name');
  const goal = formData.get('goal');
  const icp = formData.get('icp') || '';
  if (!name || !goal) return;
  const admin = createAdminClient();
  await admin.from('campaigns').insert({ name, goal, icp, platform: 'email', status: 'draft' });
  revalidatePath('/admin');
}

export async function addLead(formData) {
  await requireUser();
  const campaign_id = Number(formData.get('campaign_id'));
  const first_name = formData.get('first_name');
  const email = formData.get('email');
  const company = formData.get('company') || '';
  if (!campaign_id || !first_name || !email) return;
  const admin = createAdminClient();
  await admin.from('leads').insert({ campaign_id, first_name, email, company });
  revalidatePath('/admin');
}

// ── SOURCING (queue a job for the worker) ───────────────────
export async function createSourcingJob(formData) {
  await requireUser();
  const market = formData.get('market');
  const industry = formData.get('industry');
  if (!market || !industry) return;
  const admin = createAdminClient();
  await admin.from('sourcing_jobs').insert({
    market,
    industry,
    source: 'google_maps',
    max_results: Number(formData.get('max_results')) || 40,
    status: 'pending',
  });
  revalidatePath('/admin');
}

// ── PROSPECTS (the pipeline) ────────────────────────────────
export async function addProspect(formData) {
  await requireUser();
  const company = formData.get('company');
  if (!company) return;
  const admin = createAdminClient();
  await admin.from('prospects').insert({
    company,
    contact_name: formData.get('contact_name') || null,
    website: formData.get('website') || null,
    niche: formData.get('niche') || null,
    status: 'new',
  });
  revalidatePath('/admin');
}

export async function updateProspect(formData) {
  await requireUser();
  const id = formData.get('id');
  if (!id) return;
  const admin = createAdminClient();
  await admin.from('prospects').update({
    contact_name: formData.get('contact_name') || null,
    linkedin: formData.get('linkedin') || null,
    status: formData.get('status') || 'new',
    notes: formData.get('notes') || null,
  }).eq('id', id);
  revalidatePath('/admin');
}

// Paste/CSV import — runs entirely on Vercel, no worker, no browser.
export async function importProspects(formData) {
  await requireUser();
  const raw = (formData.get('list') || '').toString();
  const rows = raw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(',').map(s => (s || '').trim());
    const company = parts[0];
    if (!company) return null;
    return { company, website: parts[1] || null, niche: parts.slice(2).join(', ') || null, source: 'import', status: 'new' };
  }).filter(Boolean);
  if (!rows.length) return;
  const admin = createAdminClient();
  await admin.from('prospects').insert(rows);
  revalidatePath('/admin');
}

const FIRST_BATCH = [
  { company: 'OutreachBloom', website: 'outreachbloom.com', niche: 'Done-for-you cold email, quality over volume' },
  { company: 'OneAway', website: 'oneaway.io', niche: 'Deliverability-first email + LinkedIn' },
  { company: 'Hypergen', website: 'hypergen.io', niche: 'Clay-powered, signal-based lead gen' },
  { company: 'Beanstalk Consulting', website: 'beanstalkconsulting.co', niche: 'Books meetings for B2B SaaS' },
  { company: 'NerdyJoe', website: 'nerdyjoe.com', niche: 'Human-written cold emails' },
  { company: 'Growth Rhino', website: 'growthrhino.com', niche: 'Messaging / channel tests for startups' },
  { company: 'ColdIQ', website: 'coldiq.com', niche: 'Intent-driven personalization' },
  { company: 'SalesBread', website: 'salesbread.com', niche: 'Ultra-personalized LinkedIn + email', contact_name: 'Jack Reamer' },
  { company: 'LevelUp Leads', website: 'levelupleads.io', niche: 'Targets technical / SaaS buyers' },
  { company: 'Klean Leads', website: 'kleanleads.com', niche: 'Lead quality + verification' },
  { company: 'Pipeful', website: 'pipeful.io', niche: 'Cold email for B2B SaaS' },
  { company: 'Revboss', website: 'revboss.com', niche: 'Structured outreach + CRM backend' },
  { company: 'Addlium', website: 'addlium.com', niche: 'Multilingual LinkedIn outreach (EU)' },
  { company: 'CleverViral', website: 'cleverviral.com', niche: 'Cold email copywriting' },
  { company: 'Leadium', website: 'leadium.com', niche: 'Omnichannel (email / phone / LinkedIn)' },
  { company: 'Growth.cx', website: 'growth.cx', niche: 'B2B startup outbound' },
  { company: 'Instream Group', website: 'instreamgroup.com', niche: 'Cold email across 40+ markets' },
  { company: 'Leads Monky', website: 'leadsmonky.com', niche: 'Results-guarantee cold email' },
  { company: 'IntentSignal', website: 'intentsignal.io', niche: 'Intent-based outreach' },
  { company: 'Respona', website: 'respona.com', niche: 'Publisher / link-building outreach' },
];

export async function seedFirstBatch() {
  await requireUser();
  const admin = createAdminClient();
  const { count } = await admin.from('prospects').select('id', { count: 'exact', head: true }).eq('source', 'first-batch-agencies');
  if (count && count > 0) { revalidatePath('/admin'); return; }
  const rows = FIRST_BATCH.map(p => ({ ...p, source: 'first-batch-agencies', status: 'new' }));
  await admin.from('prospects').insert(rows);
  revalidatePath('/admin');
}
