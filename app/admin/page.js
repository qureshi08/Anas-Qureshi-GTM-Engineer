import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { createCampaign, addLead, addProspect, updateProspect, seedFirstBatch } from './actions';
import LogoutButton from '../components/LogoutButton';

export const dynamic = 'force-dynamic';

const STAGES = ['new', 'connected', 'replied', 'call', 'won', 'lost'];
const STAGE_LABEL = { new: 'New', connected: 'Connected', replied: 'Replied', call: 'Call', won: 'Won', lost: 'Lost' };

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: prospects } = await admin.from('prospects').select('*').order('created_at', { ascending: false });
  const { data: inbound } = await admin.from('inbound_leads').select('*').order('created_at', { ascending: false }).limit(50);
  const { data: campaigns } = await admin.from('campaigns').select('*').order('created_at', { ascending: false });
  const { data: leads } = await admin.from('leads').select('campaign_id, status, sent_at');

  const ps = prospects || [];
  const stageCount = (s) => ps.filter(p => p.status === s).length;
  const countsFor = (id) => {
    const ls = (leads || []).filter(l => l.campaign_id === id);
    return { total: ls.length, sent: ls.filter(l => l.sent_at).length, replied: ls.filter(l => l.status === 'replied' || l.status === 'booked').length };
  };

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px 80px' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--ink)', paddingBottom: 16, marginBottom: 24 }}>
        <div>
          <div className="tag">GTM Engine</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, color: 'var(--ink)', lineHeight: 1 }}>Your pipeline.</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 8 }}>{user?.email}</div>
          <LogoutButton />
        </div>
      </div>

      {/* dashboard */}
      <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        {[['Prospects', ps.length], ...STAGES.map(s => [STAGE_LABEL[s], stageCount(s)])].map(([lbl, val], i) => (
          <div key={i} className="card" style={{ flex: '1 1 110px', padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 34, color: 'var(--ink)', lineHeight: 1 }}>{val}</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)', marginTop: 4 }}>{lbl}</div>
          </div>
        ))}
      </section>

      {/* prospects */}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--ink)', marginBottom: 12 }}>Prospects</h2>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="tag">Add a prospect</div>
        <form action={addProspect} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
          <input name="company" placeholder="Company" required style={{ flex: '1 1 160px' }} />
          <input name="contact_name" placeholder="Contact name" style={{ flex: '1 1 140px' }} />
          <input name="website" placeholder="Website" style={{ flex: '1 1 140px' }} />
          <input name="niche" placeholder="What they do" style={{ flex: '1 1 160px' }} />
          <button className="btn" type="submit" style={{ fontSize: 16, padding: '9px 18px' }}>+ Add</button>
        </form>
      </section>

      {ps.length === 0 && (
        <form action={seedFirstBatch} style={{ marginBottom: 20 }}>
          <button className="btn" type="submit">Import your first 20 agencies →</button>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 12 }}>the boutique outbound agencies we shortlisted</span>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {ps.map(p => (
          <div key={p.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>{p.company}</span>
                {p.website && (
                  <a href={`https://${p.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: 'var(--brick)', marginLeft: 10 }}>{p.website}</a>
                )}
                {p.niche && <div style={{ fontSize: 14, color: 'var(--ink3)' }}>{p.niche}</div>}
              </div>
              <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--brick)' }}>{STAGE_LABEL[p.status] || p.status}</span>
            </div>
            <form action={updateProspect} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
              <input type="hidden" name="id" value={p.id} />
              <input name="contact_name" placeholder="Contact" defaultValue={p.contact_name || ''} style={{ flex: '1 1 120px' }} />
              <input name="linkedin" placeholder="LinkedIn URL" defaultValue={p.linkedin || ''} style={{ flex: '1 1 160px' }} />
              <select name="status" defaultValue={p.status} style={{ flex: '0 1 130px' }}>
                {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
              <input name="notes" placeholder="Notes (reply, next step…)" defaultValue={p.notes || ''} style={{ flex: '1 1 200px' }} />
              <button className="btn" type="submit" style={{ fontSize: 15, padding: '8px 16px' }}>Save</button>
            </form>
          </div>
        ))}
      </div>

      {/* inbound */}
      <section className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="tag">Inbound · from your landing page</div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{(inbound || []).length}</span>
        </div>
        {(!inbound || inbound.length === 0) && <p style={{ color: 'var(--ink3)', marginTop: 10 }}>No inbound yet. Form submissions from your site show up here.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {(inbound || []).map(i => (
            <div key={i.id} style={{ borderBottom: '1px dashed rgba(26,18,5,0.15)', paddingBottom: 8 }}>
              <div style={{ fontWeight: 'bold', color: 'var(--ink)' }}>{i.email}</div>
              <div style={{ fontSize: 14, color: 'var(--ink2)' }}>{i.task}</div>
            </div>
          ))}
        </div>
      </section>

      {/* email campaigns (bulk) — secondary, tucked away */}
      <details>
        <summary className="mono" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Email campaigns (bulk)</summary>
        <section className="card" style={{ margin: '14px 0' }}>
          <div className="tag">New campaign</div>
          <form action={createCampaign} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
            <input name="name" placeholder="Name" required style={{ flex: '1 1 200px' }} />
            <input name="goal" placeholder="Goal" required style={{ flex: '1 1 200px' }} />
            <input name="icp" placeholder="ICP" style={{ flex: '1 1 200px' }} />
            <button className="btn" type="submit">Create</button>
          </form>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(campaigns || []).map(c => {
            const k = countsFor(c.id);
            return (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>{c.name}</div>
                    <div style={{ color: 'var(--ink3)', fontSize: 14 }}>{c.goal}{c.icp ? ` · ${c.icp}` : ''}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--ink2)' }}>{k.total} leads · {k.sent} sent · {k.replied} replied</div>
                </div>
                <form action={addLead} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
                  <input type="hidden" name="campaign_id" value={c.id} />
                  <input name="first_name" placeholder="First name" required style={{ flex: '1 1 120px' }} />
                  <input name="email" placeholder="Email" type="email" required style={{ flex: '1 1 160px' }} />
                  <input name="company" placeholder="Company" style={{ flex: '1 1 140px' }} />
                  <button className="btn" type="submit" style={{ fontSize: 16, padding: '9px 18px' }}>+ Lead</button>
                </form>
              </div>
            );
          })}
        </div>
      </details>
    </main>
  );
}
