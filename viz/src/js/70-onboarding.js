/* ============================================================ view 6: onboarding chat
   CV or questions -> proposed claims with evidence -> person confirms -> graph updated. */
const SAMPLE_CV = `SANNE VERMEULEN
Compliance & Security Analyst · Rotterdam

SUMMARY
Information security and data protection professional with 8 years of experience across fintech and shipping.

EXPERIENCE
2021–2026  Senior Privacy & Security Analyst, PortLink Ltd.
• Led the GDPR compliance programme and served as DPO for 3 entities; ran 25+ DPIAs.
• Owned the ISO 27001 certification: risk assessment, internal audits and management reporting.
• Ran penetration testing and incident response exercises with the SecOps team.
• Coordinated vendor security reviews and contract negotiation with cloud suppliers.
2018–2021  Risk & Compliance Analyst, Northsea Bank
• Built the enterprise risk register (ISO 31000) and quarterly board reporting.
• Automated compliance checks in Python and SQL (PostgreSQL).
• Trained 200+ staff on data protection; mentoring two junior analysts.

SKILLS
GDPR, DPIA, ISO 27001, risk assessment, incident response, Python, SQL, AWS security basics, stakeholder management

EDUCATION
MSc Information Security`;

const OB = { step: 'welcome', source: 'cv', cvText: SAMPLE_CV, claims: [], picked: new Set(), person: { name: 'Sanne Vermeulen', title: 'Compliance & Security Analyst', unit: 'org_people_finance' }, answers: { recency: null, useMore: [], learn: [] }, before: null, delta: null, saved: false, seq: 0 };
const OB_STEPS = ['Start', 'Review skills', 'Questions', 'Saved'];
const VERB = /\b(led|lead|owned|architect\w*|designed|built|ran|managed|served as|launched|drove|delivered|automated|introduced|trained)\b/i;
const WEAK = /\b(basic|basics|familiar|exposure|beginner)\b/i;
// "AWS security basics" weakens AWS, not every other skill on the same line
const weakAround = (text, r) => {
  const m = r.exec(text); if (!m) return false;
  const after = text.slice(m.index + m[0].length).split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  const before = text.slice(0, m.index).split(/\s+/).filter(Boolean).slice(-2).join(' ');
  return WEAK.test(after) || WEAK.test(before);
};
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---- extraction: alias matching + evidence-based levels. Runs locally; in production an LLM does this step and returns the same shape. */
function extractSkills(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  let inSkills = false;
  const tagged = lines.map(l => { if (/^[A-Z][A-Z &/-]{3,}$/.test(l)) inSkills = /^(TECHNICAL )?SKILLS|COMPETENC/.test(l); return { text: l, skillsList: inSkills && !/^[A-Z][A-Z &/-]{3,}$/.test(l) }; });
  const yrs = Math.max(0, ...[...text.matchAll(/(\d+)\+?\s*(?:years|yrs)/gi)].map(m => +m[1]));
  const claims = [];
  for (const s of D.skills) {
    const terms = [...new Set([s.name.toLowerCase(), ...D.skill_alias.filter(a => a.skill_id === s.id).map(a => a.alias)])];
    const res = terms.map(t => new RegExp('(^|[^a-z0-9])' + escRe(t) + '(?![a-z0-9])', 'i'));
    const hits = tagged.filter(l => res.some(r => r.test(l.text)));
    if (!hits.length) continue;
    const use = hits.filter(h => !h.skillsList);
    let level = 2;
    if (use.some(h => VERB.test(h.text))) level += 1;
    if (use.length >= 2) level += 1;
    if (yrs >= 6 && use.length >= 3) level += 1;
    if (hits.some(h => res.some(r => weakAround(h.text, r)))) level = Math.min(level, 2);
    level = Math.min(4, level);                       // a CV alone never proves "Expert"
    const best = use.find(h => VERB.test(h.text)) || use[0] || hits[0];
    claims.push({ sid: s.id, level, conf: use.length ? Math.min(0.85, 0.6 + 0.08 * use.length) : 0.5, excerpt: best.text.replace(/^[•\-*]\s*/, ''), lines: use.length, source: 'cv' });
  }
  return claims.sort((a, b) => b.level - a.level || b.conf - a.conf).slice(0, 10);
}
function parseIdentity(text) {
  const ls = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const name = ls[0] && /^[A-Za-zÀ-ÿ' .-]{3,40}$/.test(ls[0]) ? ls[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'New colleague';
  const title = ls[1] ? ls[1].split('·')[0].trim().slice(0, 60) : 'New colleague';
  return { name, title };
}

/* ---- side panel */
function obStepIndex() { return { welcome: 0, cv: 0, pick: 0, review: 1, questions: 2, save: 2, done: 3 }[OB.step]; }
function obStepsHTML() { const i = obStepIndex(); return `<div class="steps">${OB_STEPS.map((s, k) => `<span class="st ${k < i ? 'done' : k === i ? 'now' : ''}">${k + 1}. ${s}</span>`).join('')}</div>`; }
function skillsSnapshot() { return new Map(D.skills.map(s => [s.id, { status: SS.get(s.id).status, holders: SS.get(s.id).holders.length, experts: SS.get(s.id).experts.length }])); }

function renderObSide() {
  const el = $('#ob-side');
  let h = `${obStepsHTML()}`;
  if (OB.step === 'welcome') {
    h += `<h3>What Maieutica will do</h3><p class="why">A profile that belongs to the person, built from evidence they approve.</p>
      <div class="list"><div class="row"><span>1. Read a CV, or ask a few questions</span></div><div class="row"><span>2. Propose skills, each with the sentence that supports it</span></div><div class="row"><span>3. You correct levels or remove anything wrong</span></div><div class="row"><span>4. Ask only what your organisation is missing</span></div><div class="row"><span>5. Save, and show what changed</span></div></div>
      <h4>What it will not do</h4><p class="note">Write anything to the graph before you confirm. Infer skills from your email or chats. Rate your performance.</p>`;
  } else if (OB.step === 'cv') {
    h += `<h3>Your CV</h3><p class="why">Paste text or edit the sample. The reading happens on this page; nothing leaves it in this demo.</p>
      <textarea class="cvbox" id="ob-cv" aria-label="CV text">${esc(OB.cvText)}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="ob-read">Read this CV</button><button class="btn secondary" id="ob-samplebtn">Reset to sample</button></div>`;
  } else if (OB.step === 'pick') {
    h += `<h3>Which skills do you use most?</h3><p class="why">Pick up to 8, then set your level honestly. Working (3) means you do it without help.</p>
      <div class="sqs" style="gap:6px" id="ob-pick">${D.skills.map(s => `<button class="qbtn ${OB.picked.has(s.id) ? 'on' : 'ghost'}" data-s="${s.id}" type="button">${esc(s.name)}</button>`).join('')}</div>
      <div style="margin-top:12px"><button class="btn" id="ob-pickgo" ${OB.picked.size ? '' : 'disabled'}>Continue with ${OB.picked.size} skill${OB.picked.size === 1 ? '' : 's'}</button></div>`;
  } else {
    // review / questions / save / done all show the identity + claims
    const id = OB.person, locked = OB.saved;
    h += `<h3>${esc(id.name)}</h3><p class="why">${esc(id.title)} · ${esc(Units.get(id.unit).name)}</p>`;
    if (OB.step === 'review') h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><input type="text" id="ob-name" value="${esc(id.name)}" aria-label="Name" style="flex:1;min-width:140px;padding:6px 8px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--ink);font:inherit"><input type="text" id="ob-title" value="${esc(id.title)}" aria-label="Title" style="flex:1;min-width:160px;padding:6px 8px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--ink);font:inherit"><select id="ob-unit" aria-label="Unit" style="padding:6px 8px;border:1px solid var(--line);border-radius:5px;background:var(--bg);color:var(--ink);font:inherit">${D.org_units.map(u => `<option value="${u.id}" ${u.id === id.unit ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>`;
    h += `<h4>Proposed skills ${locked ? '(saved)' : '(you decide)'}</h4>`;
    h += OB.claims.length ? OB.claims.map((c, i) => `<div class="claim"><span class="nm">${esc(Skills.get(c.sid).name)}${SS.get(c.sid).status === 'critical' ? ' ' + chip('org is thin here', 'bad') : SS.get(c.sid).status === 'watch' ? ' ' + chip('thin cover', 'warn') : ''}</span>
      <span class="lvl" role="group" aria-label="Level for ${esc(Skills.get(c.sid).name)}">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${c.level === n ? 'on' : ''}" data-i="${i}" data-n="${n}" title="${LEVEL[n]}" ${locked ? 'disabled' : ''}>${n}</button>`).join('')}</span>
      ${locked ? '<span></span>' : `<button class="x" data-rm="${i}" aria-label="Remove ${esc(Skills.get(c.sid).name)}">×</button>`}
      <span class="ev">${c.source === 'cv' ? `“${esc(clip(c.excerpt, 120))}” · ${c.lines ? c.lines + ' mention' + (c.lines > 1 ? 's' : '') : 'listed only'} · confidence ${c.conf.toFixed(2)}` : 'self-reported · confidence 0.55'}</span></div>`).join('') : '<p class="note">No skills yet.</p>';
    if (OB.step === 'review') h += `<p class="note" style="margin-top:8px">A CV alone tops out at Advanced (4). Expert (5) needs a manager or an assessment to confirm.</p>`;
    if (OB.answers.useMore.length || OB.answers.learn.length) h += `<h4>Aspirations</h4><div class="list">${OB.answers.useMore.length ? `<div class="row"><span>Wants to use more</span><span class="note">${OB.answers.useMore.map(s => esc(Skills.get(s).name)).join(', ')}</span></div>` : ''}${OB.answers.learn.length ? `<div class="row"><span>Wants to learn</span><span class="note">${OB.answers.learn.map(s => esc(Skills.get(s).name)).join(', ')}</span></div>` : ''}</div>`;
    if (OB.step === 'done' && OB.delta) {
      h += `<h4>What changed for the organisation</h4><div class="delta">${OB.delta.rows.map(r => `<div class="row"><span><b>${esc(r.name)}</b></span><span>${r.from === r.to ? chip(r.to, r.cls) : `${chip(r.from, 'bad')}<span class="arrow">→</span>${chip(r.to, r.cls)}`} <span class="note">${r.hb}→${r.ha} holders · ${r.eb}→${r.ea} experts</span></span></div>`).join('')}
        <div class="row"><span>Single points of failure</span><span><b>${OB.delta.critBefore}</b><span class="arrow">→</span><b>${OB.delta.critAfter}</b></span></div></div>
        ${OB.delta.fit.length ? `<h4>Where ${esc(short(id.name))} would add cover</h4><div class="list">${OB.delta.fit.map(f => `<div class="row" style="display:block">${jump('j:' + f.pid, pname(f.pid))}<br><span class="note">adds a second person for ${f.skills.map(s => esc(Skills.get(s).name)).join(', ')}</span></div>`).join('')}</div>` : ''}
        <div style="margin-top:14px"><button class="btn secondary" id="ob-undo">Undo: remove ${esc(short(id.name))} from the demo</button></div>`;
    }
  }
  el.innerHTML = h;
  wireObSide();
}

function wireObSide() {
  const el = $('#ob-side');
  const read = $('#ob-read'); if (read) read.addEventListener('click', () => { OB.cvText = $('#ob-cv').value; obReadCv(); });
  const smp = $('#ob-samplebtn'); if (smp) smp.addEventListener('click', () => { OB.cvText = SAMPLE_CV; $('#ob-cv').value = SAMPLE_CV; });
  const pick = $('#ob-pick'); if (pick) pick.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.s; if (OB.picked.has(s)) OB.picked.delete(s); else if (OB.picked.size < 8) OB.picked.add(s); renderObSide();
  }));
  const go = $('#ob-pickgo'); if (go) go.addEventListener('click', obPickDone);
  el.querySelectorAll('.lvl button').forEach(b => b.addEventListener('click', () => { OB.claims[+b.dataset.i].level = +b.dataset.n; renderObSide(); }));
  el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { OB.claims.splice(+b.dataset.rm, 1); renderObSide(); }));
  const nm = $('#ob-name'); if (nm) nm.addEventListener('input', () => { OB.person.name = nm.value; });
  const tt = $('#ob-title'); if (tt) tt.addEventListener('input', () => { OB.person.title = tt.value; });
  const un = $('#ob-unit'); if (un) un.addEventListener('change', () => { OB.person.unit = un.value; });
  wireJumps(el, k => { showTab('layers'); LAY.pinned = k; renderLayers(); });
  const undo = $('#ob-undo'); if (undo) undo.addEventListener('click', () => { resetData(); obStart(); });
}

/* ---- conversation */
async function obStart() {
  const seq = ++OB.seq;
  Object.assign(OB, { step: 'welcome', source: 'cv', claims: [], picked: new Set(), cvText: SAMPLE_CV, answers: { recency: null, useMore: [], learn: [] }, before: null, delta: null, saved: false, person: { name: 'Sanne Vermeulen', title: 'Compliance & Security Analyst', unit: 'org_people_finance' } });
  clearChat('ob'); renderObSide();
  await botSay('ob', `Hi, I'm <b>Maieutica</b>. Welcome to ${esc(D.tenant[0].name.replace(' (synthetic demo)', ''))}. I help the company see where everyone's skills are best used, and it starts with you.`);
  if (seq !== OB.seq) return;
  await botSay('ob', `It takes about three minutes. <b>You stay in control</b>: I only propose, and nothing is saved until you confirm it. How would you like to start?`);
  if (seq !== OB.seq) return;
  setQuick('ob', [
    { id: 'ob-sample', label: 'Use the sample CV', fn: obUseSample },
    { id: 'ob-paste', label: 'Paste my own CV', fn: obPaste },
    { id: 'ob-questions', label: 'Ask me questions instead', ghost: true, fn: obQuestionsPath },
  ]);
}
async function obUseSample() {
  userSay('ob', `<span class="file">📎 sanne_vermeulen_cv.pdf</span>`);
  OB.cvText = SAMPLE_CV; OB.step = 'cv'; renderObSide();
  await botSay('ob', `Thanks. I put the text on the right so you can see exactly what I read. Reading it now.`);
  obReadCv();
}
async function obPaste() {
  userSay('ob', 'I will paste my CV.'); OB.cvText = ''; OB.step = 'cv'; renderObSide();
  await botSay('ob', `Paste it into the panel on the right and press <b>Read this CV</b>. Remove anything you would rather not share first.`);
}
async function obQuestionsPath() {
  userSay('ob', 'I will answer questions.'); OB.source = 'questions'; OB.step = 'pick'; renderObSide();
  await botSay('ob', `Fine. Pick the skills you use most on the right (up to 8), then I will ask you to rate each.`);
}
async function obPickDone() {
  OB.claims = [...OB.picked].map(sid => ({ sid, level: 3, conf: 0.55, excerpt: '', lines: 0, source: 'self_reported' }));
  OB.person = { name: 'New colleague', title: 'New colleague', unit: 'org_engineering' };
  OB.step = 'review'; renderObSide();
  await botSay('ob', `Set your honest level for each skill on the right: <b>3 = working</b>, 4 = advanced, 5 = expert. Remove any that do not belong, then continue.`);
  setQuick('ob', [{ id: 'ob-continue', label: 'Looks right, continue', fn: obAfterReview }]);
}
async function obReadCv() {
  const seq = ++OB.seq;
  const id = parseIdentity(OB.cvText);
  OB.claims = extractSkills(OB.cvText); OB.source = 'cv';
  if (id.name !== 'New colleague') OB.person = { ...OB.person, ...id };
  OB.step = 'review'; renderObSide();
  if (!OB.claims.length) { await botSay('ob', `I could not find any skills I recognise. Try pasting more of the CV, or answer questions instead.`); setQuick('ob', [{ label: 'Ask me questions instead', fn: obQuestionsPath }]); return; }
  await botSay('ob', `I found <b>${OB.claims.length} skills</b>. For each one I show the sentence that supports it and my confidence. <b>Check the levels on the right, remove anything wrong</b>: they are your claims, not mine.`);
  if (seq !== OB.seq) return;
  setQuick('ob', [{ id: 'ob-continue', label: 'Looks right, continue', fn: obAfterReview }]);
}

async function obAfterReview() {
  userSay('ob', 'Looks right, continue.');
  OB.step = 'questions'; renderObSide();
  const claimed = OB.claims.filter(c => c.level >= 3);
  const risky = claimed.filter(c => ['critical', 'watch'].includes(SS.get(c.sid).status)).sort((a, b) => STATUS[SS.get(a.sid).status].rank - STATUS[SS.get(b.sid).status].rank || b.level - a.level)[0];
  if (risky) {
    const st = SS.get(risky.sid), name = Skills.get(risky.sid).name;
    await botSay('ob', `Three quick questions, chosen because of what the company is missing. First: <b>${esc(name)}</b> is one of our most exposed skills (${st.demand} live project${st.demand === 1 ? '' : 's'} need it, ${st.holders.length} ${st.holders.length === 1 ? 'person' : 'people'} can do it). Have you used it <b>hands-on in the last 12 months</b>?`);
    setQuick('ob', [
      { id: 'ob-q1a', label: 'Yes, hands-on', fn: () => obRecency(risky, 'hands-on') },
      { label: 'Advisory only', ghost: true, fn: () => obRecency(risky, 'advisory') },
      { label: 'Not recently', ghost: true, fn: () => obRecency(risky, 'earlier') },
    ]);
  } else obAskUseMore();
}
async function obRecency(c, how) {
  userSay('ob', how === 'hands-on' ? 'Yes, hands-on.' : how === 'advisory' ? 'Advisory only.' : 'Not recently.');
  OB.answers.recency = { sid: c.sid, how };
  if (how !== 'hands-on') c.conf = Math.min(c.conf, 0.6);
  renderObSide();
  await botSay('ob', how === 'hands-on' ? 'Noted, I will mark it as recently used. That raises the weight I give it when matching you to work.' : 'Understood. I will keep the level but record it as less recent, so it counts for less.');
  obAskUseMore();
}
async function obAskUseMore() {
  const opts = OB.claims.slice(0, 6).map(c => ({ label: Skills.get(c.sid).name, value: c.sid }));
  await botSay('ob', `Second: which of these would you <b>like to use more</b> in your next project? Pick any, or none.`);
  setChoices('ob', opts, 'Done', async picked => {
    userSay('ob', picked.length ? picked.map(s => esc(Skills.get(s).name)).join(', ') : 'None in particular.');
    OB.answers.useMore = picked; renderObSide(); obAskLearn();
  });
}
async function obAskLearn() {
  const lacking = D.skills.filter(s => ['critical', 'watch'].includes(SS.get(s.id).status) && !OB.claims.some(c => c.sid === s.id && c.level >= 3)).sort((a, b) => STATUS[SS.get(a.id).status].rank - STATUS[SS.get(b.id).status].rank).slice(0, 5);
  await botSay('ob', `Last one: these are skills the company needs more people on. Is there anything you would like to <b>learn</b>? It helps me plan development where it also closes a gap.`);
  setChoices('ob', lacking.map(s => ({ label: s.name, value: s.id })), 'Done', async picked => {
    userSay('ob', picked.length ? picked.map(s => esc(Skills.get(s).name)).join(', ') : 'Nothing right now.');
    OB.answers.learn = picked; OB.step = 'save'; renderObSide();
    await botSay('ob', `Thank you. Here is what I will save to <b>${esc(OB.person.name)}</b>'s profile: <b>${OB.claims.length} skills</b> with their evidence${OB.answers.useMore.length + OB.answers.learn.length ? ' and your aspirations' : ''}. You can edit or delete it later.`);
    setQuick('ob', [{ id: 'ob-save', label: 'Save to my profile', fn: obSave }, { label: 'Not now', ghost: true, fn: () => obStart() }]);
  });
}

function obSave() {
  userSay('ob', 'Save to my profile.');
  OB.before = skillsSnapshot();
  const critBefore = D.skills.filter(s => SS.get(s.id).status === 'critical').length;
  const n = D.people.length + 1, pid = 'per_' + String(n).padStart(2, '0'), T = D.tenant[0].id, today = '2026-09-24';
  D.person.push({ id: pid, tenant_id: T, external_ref: 'E' + (1000 + n), full_name: OB.person.name, title: OB.person.title, org_unit_id: OB.person.unit, manager_id: null, cost_band_id: 'cb_mid', hired_on: today, left_on: null, status: 'active' });
  OB.claims.forEach((c, i) => {
    const recent = OB.answers.recency && OB.answers.recency.sid === c.sid && OB.answers.recency.how !== 'hands-on' ? '2024-01-01' : today;
    D.person_skill.push({ tenant_id: T, person_id: pid, skill_id: c.sid, level: c.level, confidence: c.conf, source: c.source, last_used_on: recent, valid_from: today, valid_to: null });
    if (c.source === 'cv') D.evidence.push({ id: `ev_${pid}_${i}`, tenant_id: T, person_id: pid, skill_id: c.sid, source_type: 'cv', source_ref: 'cv.pdf', excerpt: c.excerpt, proposed_level: c.level, extracted_by: 'maieutica-extractor/rules-0.1', status: 'confirmed', created_at: today });
  });
  OB.answers.useMore.forEach(s => D.person_aspiration.push({ tenant_id: T, person_id: pid, skill_id: s, kind: 'use_more', created_at: today }));
  OB.answers.learn.forEach(s => D.person_aspiration.push({ tenant_id: T, person_id: pid, skill_id: s, kind: 'learn', created_at: today }));
  refreshAll();
  const rows = OB.claims.map(c => c.sid).map(sid => {
    const a = SS.get(sid), b = OB.before.get(sid);
    return { sid, name: Skills.get(sid).name, from: STATUS[b.status].label, to: STATUS[a.status].label, cls: STATUS[a.status].cls, hb: b.holders, ha: a.holders.length, eb: b.experts, ea: a.experts.length, changed: b.status !== a.status || b.holders !== a.holders.length, rank: STATUS[b.status].rank };
  }).filter(r => r.changed).sort((a, b) => a.rank - b.rank).slice(0, 4);
  const fit = D.projects.filter(j => live(j.id)).map(j => ({ pid: j.id, skills: get(needsOfProject, j.id).filter(n => levelOf(pid, n.skill_id) >= n.min_level && get(membersOfProject, j.id).filter(m => levelOf(m.person_id, n.skill_id) >= n.min_level).length <= 1).map(n => n.skill_id) })).filter(f => f.skills.length).sort((a, b) => b.skills.length - a.skills.length).slice(0, 3);
  OB.delta = { rows, fit, critBefore, critAfter: D.skills.filter(s => SS.get(s.id).status === 'critical').length };
  OB.saved = true; OB.step = 'done'; renderObSide();
  (async () => {
    await botSay('ob', `Saved. ${OB.delta.rows.length ? `The effect is already visible: <b>${esc(OB.delta.rows[0].name)}</b> moved from “${esc(OB.delta.rows[0].from)}” to “${esc(OB.delta.rows[0].to)}”.` : 'Your skills are now part of the graph.'}`);
    if (OB.delta.fit.length) await botSay('ob', `You are not on a project yet. Where you would add the most cover: <b>${esc(pname(OB.delta.fit[0].pid))}</b>${OB.delta.fit[1] ? ' and ' + esc(pname(OB.delta.fit[1].pid)) : ''}. Your manager will see this as a suggestion, not a decision.`);
    setQuick('ob', [{ label: 'See the updated gaps', fn: () => showTab('gaps') }, { label: 'Onboard someone else', ghost: true, fn: () => { resetData(); obStart(); } }]);
  })();
}
