/* ============================================================ view 7: use-case advisor
   idea (free text) -> skills, effort, complexity -> value model (editable) -> team from people with skills AND time
   -> hiring proposal only where nobody available can cover a skill.
   Deterministic rules here; in the product an LLM does the interpretation and calls these same functions as tools. */
const UC_TEMPLATES = [
  { id: 'churn', title: 'Customer churn prediction', goal: 'gol_growth', months: 5, fteMonths: 14, conf: 0.55, vtype: 'revenue',
    keywords: ['churn', 'retention', 'cancel', 'attrition', 'leaving', 'at-risk', 'top accounts'],
    skills: { 'Machine Learning': 4, 'Data Engineering': 3, 'Python': 3, 'SQL': 3, 'Customer Success': 3 },
    assume: [{ id: 'acc', label: 'Accounts in scope', unit: '', def: 120, min: 10, max: 300, step: 5 }, { id: 'arr', label: 'Average ARR per account', unit: '€k', def: 80, min: 10, max: 250, step: 5 }, { id: 'red', label: 'Churn reduction', unit: 'pp', def: 4, min: 0.5, max: 10, step: 0.5 }],
    value: a => a.acc * a.arr * 1000 * a.red / 100, basis: a => `${a.acc} accounts × €${a.arr}k ARR × ${a.red}pp less churn` },
  { id: 'invoice', title: 'Invoice matching automation', goal: 'gol_ops', months: 6, fteMonths: 12, conf: 0.75, vtype: 'savings',
    keywords: ['invoice', 'payable', 'reconciliation', 'finance ops', 'month-end', 'back office'],
    skills: { 'Financial Reporting': 3, 'Python': 3, 'SQL': 3, 'Data Engineering': 3, 'Change Management': 3 },
    assume: [{ id: 'inv', label: 'Invoices per month', unit: '', def: 4000, min: 500, max: 20000, step: 500 }, { id: 'min', label: 'Minutes saved per invoice', unit: 'min', def: 6, min: 1, max: 20, step: 1 }, { id: 'rate', label: 'Loaded cost per hour', unit: '€', def: 45, min: 25, max: 90, step: 5 }],
    value: a => a.inv * 12 * (a.min / 60) * a.rate, basis: a => `${a.inv}/month × ${a.min} min × €${a.rate}/h` },
  { id: 'copilot', title: 'AI dispatch copilot', goal: 'gol_ops', months: 7, fteMonths: 22, conf: 0.45, vtype: 'savings',
    keywords: ['copilot', 'llm', 'assistant', 'chatbot', 'generative', 'gpt', 'dispatch', 'ai '],
    skills: { 'Machine Learning': 4, 'Python': 4, 'API Design': 3, 'UX Research': 3, 'Cybersecurity': 3, 'Product Discovery': 3 },
    assume: [{ id: 'users', label: 'Dispatchers using it', unit: '', def: 45, min: 5, max: 200, step: 5 }, { id: 'hrs', label: 'Hours saved per week each', unit: 'h', def: 3.5, min: 0.5, max: 10, step: 0.5 }, { id: 'rate', label: 'Loaded cost per hour', unit: '€', def: 42, min: 25, max: 90, step: 1 }],
    value: a => a.users * a.hrs * 46 * a.rate, basis: a => `${a.users} users × ${a.hrs} h/week × 46 weeks × €${a.rate}/h` },
  { id: 'multiregion', title: 'Multi-region zero-downtime platform', goal: 'gol_platform', months: 8, fteMonths: 16, conf: 0.6, vtype: 'revenue',
    keywords: ['multi-region', 'multi region', 'zero downtime', 'zero-downtime', 'high availability', 'disaster recovery', 'resilien', 'uptime', 'failover', 'sla'],
    skills: { 'Kubernetes': 5, 'AWS': 4, 'Cybersecurity': 4, 'Risk Management': 3, 'Program Management': 3 },
    assume: [{ id: 'n', label: 'Enterprise deals gated on 99.95% SLA', unit: '', def: 5, min: 1, max: 20, step: 1 }, { id: 'arr', label: 'ARR per deal', unit: '€k', def: 220, min: 50, max: 500, step: 10 }, { id: 'share', label: 'Share unlocked', unit: '%', def: 70, min: 10, max: 100, step: 5 }],
    value: a => a.n * a.arr * 1000 * a.share / 100, basis: a => `${a.n} deals × €${a.arr}k × ${a.share}% unlocked` },
  { id: 'nordics', title: 'Nordic market launch', goal: 'gol_growth', months: 9, fteMonths: 24, conf: 0.4, vtype: 'revenue',
    keywords: ['nordic', 'sweden', 'norway', 'denmark', 'finland', 'scandinavia', 'new market', 'launch in'],
    skills: { 'Enterprise Sales': 4, 'Negotiation': 3, 'Customer Success': 3, 'GDPR & Compliance': 3, 'Supply Chain': 3 },
    assume: [{ id: 'acc', label: 'Target accounts', unit: '', def: 12, min: 3, max: 40, step: 1 }, { id: 'arr', label: 'ARR per account', unit: '€k', def: 90, min: 30, max: 300, step: 10 }, { id: 'win', label: 'Win rate', unit: '%', def: 35, min: 10, max: 70, step: 5 }],
    value: a => a.acc * a.arr * 1000 * a.win / 100, basis: a => `${a.acc} accounts × €${a.arr}k × ${a.win}% win rate` },
];
const UC_EXAMPLES = [['Predict churn for our top accounts', 'churn'], ['Build an AI copilot for dispatchers', 'copilot'], ['Zero-downtime multi-region platform', 'multiregion'], ['Launch in the Nordics', 'nordics'], ['Automate invoice matching in finance', 'invoice']];
const ROLE_FOR = { 'Kubernetes': 'Site Reliability Engineer', 'Cybersecurity': 'Security Engineer', 'Machine Learning': 'ML Engineer', 'GDPR & Compliance': 'Privacy & Compliance Officer', 'Enterprise Sales': 'Enterprise Account Executive', 'Data Engineering': 'Data Engineer', 'AWS': 'Cloud Engineer', 'Python': 'Software Engineer', 'TypeScript': 'Frontend Engineer', 'UX Research': 'UX Researcher', 'Supply Chain': 'Supply Chain Analyst', 'Financial Reporting': 'Finance Analyst' };

const UC = { jira: null, projectId: null, tpl: null, text: '', skills: {}, months: 6, fteMonths: 12, A: {}, team: [], hires: [], allowRelease: true, added: false, busy: false, seq: 0 };
let _skillRe = null;
function matchSkills(text) {
  if (!_skillRe) _skillRe = D.skills.map(s => ({ sid: s.id, res: [...new Set([s.name.toLowerCase(), ...D.skill_alias.filter(a => a.skill_id === s.id).map(a => a.alias)])].map(t => new RegExp('(^|[^a-z0-9])' + escRe(t) + '(?![a-z0-9])', 'i')) }));
  return _skillRe.filter(x => x.res.some(r => r.test(text))).map(x => x.sid);
}

/* ---- analysis */
function ucInterpret(text) {
  const t = text.toLowerCase();
  const scored = UC_TEMPLATES.map(tp => ({ tp, n: tp.keywords.filter(k => t.includes(k)).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const detected = matchSkills(text);
  if (scored.length) {
    const tp = scored[0].tp, skills = {};
    for (const [name, min] of Object.entries(tp.skills)) skills[D.skills.find(s => s.name === name).id] = min;
    const extra = detected.filter(s => !(s in skills));
    extra.forEach(s => { skills[s] = 3; });
    return { tpl: tp, skills, months: tp.months, fteMonths: tp.fteMonths, extra, A: Object.fromEntries(tp.assume.map(a => [a.id, a.def])) };
  }
  if (detected.length) {
    const skills = Object.fromEntries(detected.slice(0, 6).map(s => [s, 3]));
    const n = Object.keys(skills).length, months = Math.min(10, Math.round(3 + 1.5 * n)), fteMonths = Math.round(months * (1 + 0.5 * n));
    const dens = [...ECON.values()].filter(r => !r.proposed && r.adj > 0).map(r => r.adj / r.fteMonths).sort((a, b) => a - b), med = dens[Math.floor(dens.length / 2)] || 15000;
    const tpl = { id: 'generic', title: clip(text.replace(/^./, c => c.toUpperCase()), 48), goal: null, conf: 0.3, vtype: 'strategic', keywords: [],
      assume: [{ id: 'dens', label: 'Value per FTE-month (median of your portfolio)', unit: '€k', def: Math.round(med / 1000), min: 2, max: 120, step: 1 }],
      value: (a, ctx) => a.dens * 1000 * ctx.fteMonths, basis: a => `€${a.dens}k per FTE-month, from comparable projects` };
    return { tpl, skills, months, fteMonths, extra: [], A: { dens: Math.round(med / 1000) } };
  }
  return null;
}

function proposeTeam(skills, months, fteMonths, allowRelease) {
  const need = fteMonths / months;
  const weak = new Set(D.projects.filter(j => j.status !== 'proposed' && ['under', 'novalue'].includes(ECON.get(j.id).verdict)).map(j => j.id));
  const cands = D.people.filter(p => p.status === 'active').map(p => {
    const free = Math.max(0, 100 - loadOf(p.id)), rel = allowRelease ? get(projectsOfPerson, p.id).filter(e => weak.has(e.project_id)) : [];
    const relPct = sum(rel, e => e.allocation_pct);
    return { p, free, relPct, relFrom: rel.map(e => pname(e.project_id)), eff: Math.min(100, free + relPct), covers: [], support: false };
  });
  const remaining = new Map(Object.entries(skills)), team = [];
  while (remaining.size && team.length < 8) {
    let best = null, bestGain = 0, bestCov = [];
    for (const c of cands) {
      if (team.includes(c) || c.eff < 20) continue;
      const cov = [...remaining].filter(([sid, min]) => levelOf(c.p.id, sid) >= min);
      if (!cov.length) continue;
      const cohesion = team.length ? team.filter(t => NET.adjOf('p:' + t.p.id).has('p:' + c.p.id)).length / team.length : 0;
      const gain = sum(cov, ([, min]) => min) * (0.5 + Math.min(c.eff, 60) / 120) * (1 + 0.15 * cohesion);
      if (gain > bestGain) { best = c; bestGain = gain; bestCov = cov.map(x => x[0]); }
    }
    if (!best) break;
    best.covers = bestCov; team.push(best); bestCov.forEach(s => remaining.delete(s));
  }
  const uncovered = [...remaining.keys()];
  let alloc = team.map(c => Math.max(20, Math.min(60, c.eff))), total = sum(alloc, a => a) / 100;
  if (total < need) {                                          // add capacity from people with relevant skills
    const n = Object.keys(skills).length;
    const pool = cands.filter(c => !team.includes(c) && c.eff >= 20).map(c => ({ c, rel: sum(Object.entries(skills), ([sid, min]) => Math.min(levelOf(c.p.id, sid), min) / min) / n })).filter(x => x.rel > 0.25).sort((a, b) => b.rel - a.rel);
    for (const x of pool) { if (total >= need || team.length >= 8) break; x.c.support = true; team.push(x.c); const a = Math.min(60, x.c.eff); alloc.push(a); total += a / 100; }
  }
  if (total > need * 1.15) { const k = need / total; alloc = alloc.map(a => Math.max(10, Math.round(a * k / 5) * 5)); total = sum(alloc, a => a) / 100; }
  const members = team.map((c, i) => ({ c, pid: c.p.id, alloc: alloc[i], covers: c.covers, support: c.support }));
  members.sort((a, b) => sum(b.covers, s => skills[s]) - sum(a.covers, s => skills[s]));
  members.forEach((m, i) => { m.role = i === 0 ? 'Lead' : m.support ? 'Support' : 'Contributor'; });

  // hires: one specialist for skills nobody available has, plus capacity hires (<= 1 FTE each) for any remaining gap
  const hires = [], shortage = Math.max(0, need - total), round1 = x => Math.round(x * 10) / 10;
  const top2 = Object.entries(skills).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([sid, min]) => ({ sid, min }));
  const roleOf = sid => ROLE_FOR[Skills.get(sid).name] || Skills.get(sid).name + ' specialist';
  let gap = shortage;
  if (uncovered.length) {
    const unc = uncovered.map(sid => ({ sid, min: skills[sid] })).sort((a, b) => b.min - a.min);
    const upskill = unc.map(u => { const c = cands.filter(x => levelOf(x.p.id, u.sid) === u.min - 1 && x.eff >= 20).sort((a, b) => b.eff - a.eff)[0]; return c ? { sid: u.sid, who: c.p.full_name, from: u.min - 1, to: u.min } : null; }).filter(Boolean);
    const base = Math.min(1, round1(0.4 + 0.3 * unc.length)), fte = Math.min(1, Math.max(base, round1(gap)));   // this hire also supplies capacity
    gap = Math.max(0, gap - fte);
    hires.push({ skills: unc, fte, role: roleOf(unc[0].sid), upskill,
      reason: `Nobody with the time has ${unc.map(u => `${Skills.get(u.sid).name} at ${u.min}+`).join(', ')}.${fte > base ? ' Also covers most of the capacity gap.' : ''}` });
  }
  while (gap > 0.25 && hires.length < 4) {
    const fte = Math.min(1, round1(gap));
    hires.push({ skills: top2, fte, role: roleOf(top2[0].sid), upskill: [], reason: `The skills are covered, but only ${total.toFixed(1)} of ${need.toFixed(1)} FTE is available in the team.` });
    gap -= fte;
  }
  return { members, hires, need, total, uncovered };
}

function ucRun(text) {
  const r = ucInterpret(text);
  if (!r) return null;
  Object.assign(UC, { text, tpl: r.tpl, skills: r.skills, months: r.months, fteMonths: r.fteMonths, A: r.A, extra: r.extra, added: false, jira: null, projectId: null });
  ucTeam();
  return r;
}
function ucTeam() {
  const t = proposeTeam(UC.skills, UC.months, UC.fteMonths, UC.allowRelease);
  UC.team = t.members; UC.hires = t.hires; UC.need = t.need; UC.teamFte = t.total; UC.uncovered = t.uncovered;
}
function ucNumbers() {
  const months = UC.months, fteInt = sum(UC.team, m => m.alloc) / 100, fteHire = sum(UC.hires, h => h.fte);
  const costInt = sum(UC.team, m => m.alloc / 100 * months * bandRate(People.get(m.pid).cost_band_id)), costHire = sum(UC.hires, h => hireCost(h.fte, months));
  const cost = costInt + costHire, value = UC.tpl.value(UC.A, { fteMonths: (fteInt + fteHire) * months }), adj = value * UC.tpl.conf, roi = cost ? adj / cost : 0;
  const skillsN = Object.keys(UC.skills).length, depth = sum(Object.values(UC.skills), x => x) / skillsN, cx = complexityOf(skillsN, months, depth);
  return { months, fteInt, fteHire, fte: fteInt + fteHire, costInt, costHire, cost, value, adj, roi, payback: adj ? cost / (adj / 12) : Infinity, verdict: verdictOf(value, roi), cx, skillsN, depth };
}

/* ---- side panel */
function ucVerdictHTML(n) {
  const nh = UC.hires.length, hireTxt = UC.hires.map(h => `${h.role} (${h.fte.toFixed(1)} FTE)`).join(' + ');
  if (n.roi < ROI_UNDER) return `<div class="verdictline bad"><b>Weak business case.</b> It returns ${n.roi.toFixed(1)}× its cost in a year, below the ${ROI_UNDER}× bar. Improve the value assumptions or cut scope before staffing it.</div>`;
  if (nh) return `<div class="verdictline warn"><b>Feasible, with ${nh === 1 ? 'one hire' : nh + ' hires'}:</b> ${esc(hireTxt)}. Everything else can be staffed from today's team. ${n.roi >= ROI_HEALTHY ? 'The return justifies it.' : 'The return is modest: check the assumptions first.'}</div>`;
  return `<div class="verdictline ok"><b>Feasible with today's team.</b> ${UC.team.length} people cover all ${n.skillsN} skill sets and have the time. Returns ${n.roi.toFixed(1)}× in year one.</div>`;
}
function renderUcNumbers() {
  const n = ucNumbers(), v = VERDICT[n.verdict], hi = n.value * 1.4, lo = n.value * 0.6, mx = hi * 1.1;
  $('#uc-numbers').innerHTML = `${ucVerdictHTML(n)}
    <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
      <div class="kpi" style="padding:8px 4px"><div class="n" style="font-size:20px">${eur(n.adj)}</div><div class="l">value / yr<br>risk-adjusted</div></div>
      <div class="kpi" style="padding:8px 4px"><div class="n" style="font-size:20px">${eur(n.cost)}</div><div class="l">cost<br>${n.fte.toFixed(1)} FTE × ${n.months} mo</div></div>
      <div class="kpi" style="padding:8px 4px"><div class="n" style="font-size:20px">${n.roi.toFixed(1)}×</div><div class="l">ROI, year one</div></div>
      <div class="kpi" style="padding:8px 4px"><div class="n" style="font-size:20px">${Number.isFinite(n.payback) ? n.payback.toFixed(0) : '–'}</div><div class="l">months<br>to pay back</div></div></div>
    <div class="range3" title="Value range"><div class="tr"></div><div class="fill" style="left:${lo / mx * 100}%;width:${(hi - lo) / mx * 100}%"></div><div class="mk" style="left:${n.value / mx * 100}%"></div></div>
    <p class="note">Unadjusted value ${eur(lo)} – ${eur(hi)} (base ${eur(n.value)}) × confidence ${pct(UC.tpl.conf)} · ${chip(v.label, v.cls)}</p>`;
  const cx = n.cx;
  $('#uc-complexity').innerHTML = `${cxBars(cx.cx)}<b>${cx.label}</b> <span class="note">(${cx.cx}/5)</span>
    <div class="kv" style="margin-top:6px"><span>Skill sets needed</span><span class="r">${n.skillsN}</span><span>Timeframe</span><span class="r">${n.months} months</span><span>Depth (avg. required level)</span><span class="r">${n.depth.toFixed(1)}</span><span>Effort</span><span class="r">${(n.fte * n.months).toFixed(0)} FTE-months</span></div>`;
}

function renderUcSide() {
  const el = $('#uc-side');
  if (!UC.tpl) {
    el.innerHTML = `<div class="empty-state"><h3 style="margin-bottom:8px">Your proposal appears here</h3><p>Describe an idea or pick an example. You will get complexity, effort, an editable value model, the right team, and a hiring recommendation only if one is needed.</p></div>`;
    return;
  }
  const tp = UC.tpl, goal = tp.goal ? Goals.get(tp.goal) : null;
  const releasing = UC.team.filter(m => m.c.relPct && Math.max(0, 100 - loadOf(m.pid)) < m.alloc);
  el.innerHTML = `<h3>${esc(tp.title)}</h3>
    <p class="why">${goal ? `Serves “${esc(goal.name)}” · ` : 'No goal matched · '}${Object.keys(UC.skills).length} skill sets${UC.extra && UC.extra.length ? ` (you also mentioned ${UC.extra.map(s => esc(Skills.get(s).name)).join(', ')}, so I added ${UC.extra.length > 1 ? 'them' : 'it'})` : ''}</p>
    <div id="uc-numbers"></div>
    <h4>Value assumptions <span style="text-transform:none;letter-spacing:0;font-family:var(--font-body);color:var(--ink3)">(edit to test)</span></h4>
    <div class="assume">${tp.assume.map(a => `<label>${esc(a.label)}<output id="ao-${a.id}">${UC.A[a.id]}${a.unit ? ' ' + a.unit : ''}</output><input type="range" id="ai-${a.id}" min="${a.min}" max="${a.max}" step="${a.step}" value="${UC.A[a.id]}"></label>`).join('')}</div>
    <p class="note" style="margin-top:4px">${esc(tp.basis(UC.A, { fteMonths: UC.fteMonths }))}. Defaults are illustrative; replace them with your finance team's numbers.</p>
    <h4>Complexity</h4><div id="uc-complexity"></div>
    <h4>Recommended team · ${UC.team.length} people</h4>
    <div class="team">${UC.team.map(m => {
      const stretch = m.c.relPct && m.alloc > m.c.free ? `frees ${Math.min(m.c.relPct, m.alloc - m.c.free)}% from ${esc(m.c.relFrom.join(', '))}` : `${m.c.free}% free`;
      return `<div class="tm"><span>${jump('p:' + m.pid, People.get(m.pid).full_name)} <span class="note">${esc(People.get(m.pid).title)}</span></span><span><b>${m.alloc}%</b> <span class="note">${m.role}</span></span>
        <p class="why">${m.covers.length ? 'Covers ' + m.covers.map(s => `${esc(Skills.get(s).name)} (${levelOf(m.pid, s)}/${UC.skills[s]})`).join(', ') : 'Adds capacity on related skills'} · ${stretch}</p></div>`;
    }).join('')}</div>
    <p class="note" style="margin-top:6px">${UC.team.length} people is the smallest team that covers every skill some one can actually staff${UC.teamFte < UC.need ? '' : ' and reaches the ' + UC.need.toFixed(1) + ' FTE needed'}. ${releasing.length ? 'Some time comes from under-optimised projects.' : ''}</p>
    <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px"><input type="checkbox" id="uc-release" ${UC.allowRelease ? 'checked' : ''}> Allow freeing people from under-optimised work</label>
    ${UC.hires.length ? `<h4>Hiring recommendation</h4>${UC.hires.map(h => `<div class="hire"><b>${esc(h.role)} · ${h.fte.toFixed(1)} FTE · ${UC.months} months</b>${esc(h.reason)}<br>Must have: ${h.skills.map(s => `${esc(Skills.get(s.sid).name)} ${s.min}+`).join(', ')}.${h.upskill.length ? `<br><span class="note">Alternative: upskill ${h.upskill.map(u => `${esc(u.who)} in ${esc(Skills.get(u.sid).name)} (${u.from}→${u.to})`).join(', ')}, if the timeline allows.</span>` : ''}<br><span class="note">Estimated cost incl. ${pct(RECRUIT_FEE_RATE)} recruiting fee: ${eur(hireCost(h.fte, UC.months))}. Cheaper than a bad staffing decision.</span></div>`).join('')}` : ''}
    ${ucJiraHTML()}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn" id="uc-add" ${UC.added ? 'disabled' : ''}>${UC.added ? 'Added to portfolio' : 'Add to portfolio as proposed'}</button>${UC.added ? '<button class="btn secondary" id="uc-see">See it in Portfolio economics</button>' : ''}</div>`;
  renderUcNumbers();
  tp.assume.forEach(a => { $('#ai-' + a.id).addEventListener('input', e => { UC.A[a.id] = +e.target.value; $('#ao-' + a.id).textContent = e.target.value + (a.unit ? ' ' + a.unit : ''); renderUcNumbers(); }); });
  $('#uc-release').addEventListener('change', e => { UC.allowRelease = e.target.checked; ucTeam(); renderUcSide(); });
  $('#uc-add').addEventListener('click', ucAdd);
  wireUcJira();
  const see = $('#uc-see'); if (see) see.addEventListener('click', () => showTab('econ'));
  wireJumps(el, k => { showTab('layers'); LAY.pinned = k; renderLayers(); });
}

/* ---- conversation */
async function ucStart() {
  const seq = ++UC.seq;
  Object.assign(UC, { tpl: null, added: false, busy: false });
  clearChat('uc'); renderUcSide();
  await botSay('uc', `Tell me about an idea: something you would like the company to try. I will work out <b>how complex it is</b>, <b>what it could be worth</b>, <b>who should do it</b>, and whether we would need to <b>hire</b>.`);
  if (seq !== UC.seq) return;
  setUcExamples();
}
function setUcExamples() { setQuick('uc', UC_EXAMPLES.map(([label]) => ({ label, ghost: true, fn: () => ucHandle(label) }))); }

async function ucHandle(text) {
  text = text.trim(); if (!text || UC.busy) return;
  UC.busy = true; $('#uc-quick').innerHTML = '';
  userSay('uc', esc(text));
  const seq = ++UC.seq;
  const stepsHTML = done => `<div class="steps">${['Reading your idea', 'Mapping to skills', 'Checking who has skills and time', 'Estimating value and cost'].map((s, i) => `<span class="st ${i < done ? 'done' : i === done ? 'now' : ''}">${s}</span>`).join('')}</div>`;
  const m = await botSay('uc', stepsHTML(0), { delay: 200 });
  for (let i = 1; i <= 4; i++) { await sleep(520 * PACE); if (seq !== UC.seq) return; m.innerHTML = stepsHTML(i); }
  const r = ucRun(text);
  if (!r) {
    UC.tpl = null; renderUcSide(); UC.busy = false;
    m.remove();
    await botSay('uc', `I could not map that to skills I know about. Say what the work involves (for example data, security, sales, cloud, design), or start from an example.`);
    setUcExamples(); return;
  }
  m.remove(); renderUcSide();
  const n = ucNumbers(), nh = UC.hires.length;
  await botSay('uc', `Here is the short version for <b>${esc(UC.tpl.title)}</b>: <b>${n.cx.label.toLowerCase()} complexity</b> (${n.skillsN} skill sets, ${n.months} months), about <b>${eur(n.adj)}/yr</b> of risk-adjusted value for <b>${eur(n.cost)}</b> and ${n.fte.toFixed(1)} FTE. ${nh ? `I would staff ${UC.team.length} people from the company and <b>hire a ${esc(UC.hires[0].role)}</b>, because nobody with the time has the skills.` : `I would staff ${UC.team.length} people from the company: no hire needed.`}`);
  if (r.tpl.id === 'generic') await botSay('uc', `I could not find a specific value model for this, so I used the median value per FTE-month across your portfolio, with low confidence. Adjust it on the right.`);
  else await botSay('uc', `The numbers on the right are editable: change an assumption and the value, ROI and payback update. Add it to the portfolio when you are happy.`);
  UC.busy = false;
  setQuick('uc', [{ id: 'uc-addq', label: 'Add to portfolio', fn: () => { userSay('uc', 'Add it to the portfolio.'); ucAdd(); } }, { label: 'Try another idea', ghost: true, fn: () => { userSay('uc', 'Let me try another idea.'); botSay('uc', 'Go ahead.'); setUcExamples(); } }]);
}

function ucAdd() {
  if (UC.added || !UC.tpl) return;
  const n = ucNumbers(), T = D.tenant[0].id, tp = UC.tpl, jid = 'prj_uc_' + tp.id + '_' + (D.projects.length + 1);
  UC.projectId = jid;
  const start = '2026-11-01', s = new Date(start), e = new Date(s); e.setMonth(e.getMonth() + Math.round(UC.months));
  D.project.push({ id: jid, tenant_id: T, name: tp.title, description: UC.text, status: 'proposed', start_on: start, end_on: e.toISOString().slice(0, 10), planned_months: UC.months, expected_value_eur: Math.round(n.value), value_type: tp.vtype, value_basis: tp.basis(UC.A, { fteMonths: n.fte * n.months }), value_confidence: tp.conf, external_ref: null });
  Object.entries(UC.skills).forEach(([sid, min]) => D.project_skill.push({ tenant_id: T, project_id: jid, skill_id: sid, min_level: min, importance: 1 }));
  if (tp.goal) D.project_goal.push({ tenant_id: T, project_id: jid, goal_id: tp.goal, contribution: 0.8 });
  UC.team.forEach(m => D.person_project.push({ tenant_id: T, person_id: m.pid, project_id: jid, role: m.role, allocation_pct: m.alloc, valid_from: start, valid_to: null }));
  UC.hires.forEach((h, i) => D.hiring_need.push({ id: `hn_${jid}_${i}`, tenant_id: T, project_id: jid, skill_id: h.skills[0].sid, min_level: h.skills[0].min, fte: h.fte, rationale: h.reason, status: 'proposed' }));
  UC.added = true; refreshAll(); renderUcSide();
  botSay('uc', `Added as <b>proposed</b>. It now shows in the graph and in Portfolio economics, but it does not consume anyone's capacity until it is approved.`);
  setQuick('uc', [{ label: 'See it in Portfolio economics', fn: () => showTab('econ') }, { label: 'Try another idea', ghost: true, fn: () => { botSay('uc', 'Go ahead.'); setUcExamples(); } }]);
}


/* ---- graph -> board: a proposal becomes a Jira epic with skill-tagged stories
   (mirrors build_issue_payloads() in integrations/boards.py; nothing is sent from this page) */
const skillLabel = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pointsFor = min => min >= 5 ? 8 : min === 4 ? 5 : 3;
function ucJiraPlan() {
  const tp = UC.tpl, words = tp.title.split(/[^A-Za-z]+/).filter(Boolean);
  let key = words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
  if (key.length < 3) key = (words[0] || 'UC').slice(0, 4).toUpperCase();
  const taken = new Set(D.projects.map(p => p.external_ref)); let k = key, i = 2; while (taken.has(k)) k = key + i++;
  const hireOf = new Map(); UC.hires.forEach(h => h.skills.forEach(s => hireOf.set(s.sid, h)));
  const usedHire = new Set(), stories = [];
  Object.entries(UC.skills).sort((a, b) => b[1] - a[1]).forEach(([sid, min]) => {
    const sk = Skills.get(sid).name, owner = UC.team.find(m => m.covers.includes(sid) && levelOf(m.pid, sid) >= min), hire = !owner && hireOf.get(sid);
    if (hire && usedHire.has(hire)) return;
    if (hire) usedHire.add(hire);
    stories.push({ summary: hire ? `Hire: ${hire.role} (${hire.fte.toFixed(1)} FTE)` : (D.ticket_titles[sk] || [sk + ' work'])[0], skill: sk, sid, min_level: min,
      assignee_person_id: owner ? owner.pid : null, hiring: !!hire, description: hire ? hire.reason : `Needs ${sk} at level ${min}+. Suggested owner from skills and free capacity.` });
  });
  return { key: k, title: tp.title, description: `${UC.text}\n\nValue basis: ${tp.basis(UC.A, { fteMonths: UC.fteMonths })}`, stories };
}
function jiraPayloads(plan) {
  const acct = new Map((D.external_identity || []).filter(i => i.system === 'jira').map(i => [i.person_id, i.external_id]));
  const adf = t => ({ type: 'doc', version: 1, content: String(t || '').split('\n\n').filter(Boolean).map(p => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) });
  return {
    epic: { fields: { project: { key: plan.key }, issuetype: { name: 'Epic' }, summary: plan.title, description: adf(plan.description), labels: ['maieutica'] } },
    stories: plan.stories.map(s => ({ fields: { project: { key: plan.key }, issuetype: { name: 'Story' }, summary: s.summary, description: adf(s.description),
      labels: ['maieutica', skillLabel(s.skill)].concat(s.hiring ? ['hiring'] : []), customfield_10016: pointsFor(s.min_level), parent: { key: '{epic-key}' },
      ...(s.assignee_person_id && acct.get(s.assignee_person_id) ? { assignee: { accountId: acct.get(s.assignee_person_id) } } : {}) } })),
  };
}
function ucJiraHTML() {
  if (!UC.tpl) return '';
  if (!UC.jira) return `<h4>Jira</h4><p class="note">Turn this proposal into an epic with one story per skill, owners suggested from the team above.</p><button class="btn secondary" id="uc-jira-btn" type="button" style="margin-top:8px">Preview Jira tickets</button>`;
  const plan = ucJiraPlan(), made = UC.jira.created, P = jiraPayloads(plan), key = made ? made.epic.split('-')[0] : plan.key;
  const rows = [`<div class="jr-row"><span class="mono">${key}-1</span><span><b>${esc(plan.title)}</b></span><span class="chip">Epic</span></div>`].concat(plan.stories.map((s, i) => {
    const who = s.assignee_person_id ? People.get(s.assignee_person_id) : null;
    return `<div class="jr-row"><span class="mono">${key}-${i + 2}</span><span>${esc(s.summary)}<br><span class="note">${who ? esc(who.full_name) : s.hiring ? 'requisition, no assignee' : 'unassigned'} · ${pointsFor(s.min_level)} pts · ${esc(skillLabel(s.skill))}</span></span><span class="chip ${s.hiring ? 'warn' : ''}">${s.hiring ? 'Hiring' : 'Story'}</span></div>`;
  })).join('');
  return `<h4>Jira</h4><div class="jira-box">${rows}
    <details style="margin-top:8px"><summary>API payloads (Jira Cloud REST v3)</summary><pre class="payload">1) POST /rest/api/3/issue\n${esc(JSON.stringify(P.epic, null, 2))}\n\n2) POST /rest/api/3/issue/bulk   (${P.stories.length} stories, parent = key from step 1)\n${esc(JSON.stringify(P.stories[0], null, 2))}</pre></details>
    ${made ? `<p style="margin-top:10px">${chip('created (demo)', 'ok')} ${made.stories.length + 1} tickets under <b>${esc(made.epic)}</b>. <span class="note">Nothing left this page. With credentials the same payloads are posted.</span></p><button class="btn" id="uc-open-board" type="button" style="margin-top:6px">Open the board</button>`
      : `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="uc-jira-create" type="button">Create in Jira (demo)</button></div><p class="note" style="margin-top:6px">Demo: creates the tickets on the board in this app. Creating also adds the use case to the portfolio.</p>`}</div>`;
}
function wireUcJira() {
  const pre = $('#uc-jira-btn'); if (pre) pre.addEventListener('click', () => { UC.jira = { created: null }; renderUcSide(); });
  const cr = $('#uc-jira-create'); if (cr) cr.addEventListener('click', ucJiraCreate);
  const op = $('#uc-open-board'); if (op) op.addEventListener('click', () => { JR.project = UC.projectId; JR.selected = null; renderJira(); showTab('jira'); });
}
function ucJiraCreate() {
  if (!UC.added) ucAdd();
  const plan = ucJiraPlan(), T = D.tenant[0].id, proj = D.project.find(p => p.id === UC.projectId), today = '2026-09-24';
  proj.external_ref = plan.key;
  const wi = (n, type, title, extra = {}) => ({ id: `wi_${plan.key.toLowerCase()}_${n}`, tenant_id: T, project_id: proj.id, external_ref: `${plan.key}-${n}`, title, item_type: type, status: 'To Do', status_category: 'new',
    story_points: null, assignee_id: null, created_on: today, resolved_on: null, blocked: 0, labels: 'maieutica', source: 'maieutica', ...extra });
  D.work_item.push(wi(1, 'Epic', plan.title));
  plan.stories.forEach((s, i) => {
    const w = wi(i + 2, 'Story', s.summary, { story_points: pointsFor(s.min_level), assignee_id: s.assignee_person_id, labels: 'maieutica,' + skillLabel(s.skill) + (s.hiring ? ',hiring' : '') });
    D.work_item.push(w); D.work_item_skill.push({ work_item_id: w.id, skill_id: s.sid });
  });
  UC.jira = { created: { epic: `${plan.key}-1`, stories: plan.stories.map((s, i) => `${plan.key}-${i + 2}`) } };
  refreshAll(); renderUcSide();
  botSay('uc', `Created <b>${plan.stories.length + 1} tickets</b> under <b>${esc(plan.key)}-1</b> (demo: nothing left this page). Owners are suggestions from skills and free capacity; anyone can change them in Jira.`);
}
