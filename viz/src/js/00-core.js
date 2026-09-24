'use strict';
/* ============================================================ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const groupBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const NS = 'http://www.w3.org/2000/svg';
const short = n => n.split(' ')[0];
const eur = n => Math.abs(n) >= 1e6 ? '€' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '€' + Math.round(n / 1e3) + 'k';
const pct = x => Math.round(x * 100) + '%';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAST = /[?&]fast\b/.test(location.search);            // test hook: skip typing delays
const PACE = FAST ? 0 : (parseFloat((/[?&]pace=([\d.]+)/.exec(location.search) || [])[1]) || 1);   // recording hook: scale typing delays

/* ============================================================ data + indexes
   All derived state is rebuilt from D by buildIndexes(), so onboarding a person
   or adding a use case simply mutates D and calls refreshAll(). */
let RAW, D;
let People, Skills, Projects, Goals, Units, Bands, unitIndex, PS, PP, JS, JG, objectives;
let skillsOfPerson, holdersOfSkill, membersOfProject, projectsOfPerson, needsOfProject, projectsNeeding, goalsOfProject, projectsOfGoal, SS, ECON;
const byId = a => new Map(a.map(x => [x.id, x]));
const get = (m, k) => m.get(k) || [];

function setData(raw) {
  RAW = raw;
  D = { ...raw, people: raw.person, skills: raw.skill, projects: raw.project, goals: raw.goal, org_units: raw.org_unit };
  buildIndexes();
}
function buildIndexes() {
  People = byId(D.people); Skills = byId(D.skills); Projects = byId(D.projects); Goals = byId(D.goals);
  Units = byId(D.org_units); Bands = byId(D.cost_band);
  unitIndex = new Map(D.org_units.map((u, i) => [u.id, i]));
  PS = D.person_skill.filter(e => !e.valid_to); PP = D.person_project.filter(e => !e.valid_to); JS = D.project_skill; JG = D.project_goal;
  skillsOfPerson = groupBy(PS, e => e.person_id); holdersOfSkill = groupBy(PS, e => e.skill_id);
  membersOfProject = groupBy(PP, e => e.project_id); projectsOfPerson = groupBy(PP, e => e.person_id);
  needsOfProject = groupBy(JS, e => e.project_id); projectsNeeding = groupBy(JS, e => e.skill_id);
  goalsOfProject = groupBy(JG, e => e.project_id); projectsOfGoal = groupBy(JG, e => e.goal_id);
  objectives = D.goals.filter(g => g.level === 'objective');
  SS = new Map(D.skills.map(s => [s.id, skillStats(s.id)]));
  ECON = new Map(D.projects.map(j => [j.id, projectEconomics(j)]));
}

const unitColor = id => `var(--d${unitIndex.get(id) + 1})`;
const live = pid => ['active', 'planned'].includes(Projects.get(pid).status);
const loadOf = pid => sum(get(projectsOfPerson, pid).filter(e => Projects.get(e.project_id).status !== 'proposed'), e => e.allocation_pct);
const levelOf = (pid, sid) => (get(skillsOfPerson, pid).find(e => e.skill_id === sid) || {}).level || 0;
const pname = id => Projects.get(id).name;
const LEVEL = ['', 'Aware', 'Basic', 'Working', 'Advanced', 'Expert'];
const SRC = { cv: 'from CV', self_reported: 'self-reported', manager_confirmed: 'manager-confirmed', project_inferred: 'seen in project work', assessment: 'assessed' };

/* ============================================================ skills: supply vs demand */
function skillStats(sid) {
  const holders = get(holdersOfSkill, sid).filter(e => e.level >= 3).sort((a, b) => b.level - a.level);
  const experts = holders.filter(e => e.level >= 4);
  const needing = get(projectsNeeding, sid).filter(e => live(e.project_id));
  const demand = needing.length;
  let status = 'healthy';
  if (experts.length <= 1 && holders.length <= 2 && demand >= 2) status = 'critical';
  else if (demand >= 1 && (experts.length <= 1 || holders.length <= 2)) status = 'watch';
  else if (demand === 0 && holders.length >= 2) status = 'untapped';
  return { holders, experts, needing, demand, status };
}
const STATUS = {
  critical: { label: 'Single point of failure', cls: 'bad', rank: 0 },
  watch: { label: 'Thin cover', cls: 'warn', rank: 1 },
  healthy: { label: 'Healthy', cls: 'ok', rank: 2 },
  untapped: { label: 'Untapped', cls: '', rank: 3 },
};
function goalExposure(gid) {
  const skillIds = new Set(get(projectsOfGoal, gid).filter(e => live(e.project_id)).flatMap(e => get(needsOfProject, e.project_id).map(n => n.skill_id)));
  const risky = [...skillIds].filter(s => ['critical', 'watch'].includes(SS.get(s).status));
  return { total: skillIds.size, risky, pct: skillIds.size ? risky.length / skillIds.size : 0 };
}

/* ============================================================ economics
   cost = sum(allocation x months x band rate) (+ hires); value = expected value x confidence.
   Verdict thresholds are deliberately simple and visible. */
const ROI_UNDER = 1.25, ROI_HEALTHY = 2.5, RECRUIT_FEE_RATE = 0.2;
const VERDICT = {
  under: { label: 'Under-optimised', cls: 'bad', rank: 0 },
  watch: { label: 'Watch', cls: 'warn', rank: 1 },
  healthy: { label: 'Healthy', cls: 'ok', rank: 2 },
  novalue: { label: 'No value case', cls: '', rank: 3 },
};
const bandRate = id => (Bands.get(id) || { eur_per_fte_month: 0 }).eur_per_fte_month;
const hireCost = (fte, months) => fte * months * bandRate('cb_senior') + RECRUIT_FEE_RATE * 12 * bandRate('cb_senior');

function complexityOf(nSkills, months, avgDepth) {
  const b = nSkills <= 2 ? 1 : nSkills === 3 ? 2 : nSkills === 4 ? 3 : nSkills === 5 ? 4 : 5;
  const d = months <= 3 ? 1 : months <= 6 ? 2 : months <= 9 ? 3 : months <= 12 ? 4 : 5;
  const dp = Math.max(1, Math.min(5, Math.round(avgDepth || 1)));
  const cx = Math.round((b + d + dp) / 3 * 10) / 10;
  return { b, d, dp, cx, label: cx < 2.5 ? 'Low' : cx < 3.5 ? 'Medium' : 'High' };
}
function verdictOf(value, roi) { return !value ? 'novalue' : roi < ROI_UNDER ? 'under' : roi < ROI_HEALTHY ? 'watch' : 'healthy'; }

function projectEconomics(j) {
  const mem = get(membersOfProject, j.id), months = j.planned_months || 0;
  const hires = D.hiring_need.filter(h => h.project_id === j.id && h.status !== 'dropped');
  const fteInt = sum(mem, m => m.allocation_pct) / 100, fteHire = sum(hires, h => h.fte);
  const costInt = sum(mem, m => m.allocation_pct / 100 * months * bandRate((People.get(m.person_id) || {}).cost_band_id));
  const costHire = sum(hires, h => hireCost(h.fte, months));
  const cost = costInt + costHire, value = j.expected_value_eur || 0, conf = j.value_confidence || 0, adj = value * conf;
  const needs = get(needsOfProject, j.id);
  const cxr = complexityOf(needs.length, months, needs.length ? sum(needs, n => n.min_level) / needs.length : 1);
  const roi = cost > 0 ? adj / cost : 0;
  return { j, months, fteInt, fteHire, fte: fteInt + fteHire, fteMonths: (fteInt + fteHire) * months, costInt, costHire, cost, value, conf, adj, roi,
    payback: adj > 0 ? cost / (adj / 12) : Infinity, nSkills: needs.length, ...cxr, verdict: verdictOf(value, roi), proposed: j.status === 'proposed' };
}

/* ============================================================ inspector (shared by layers + networks) */
const pips = n => `<span class="pips" title="${LEVEL[n]}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
const jump = (key, label, cls = 'link') => `<button class="${cls}" data-jump="${key}">${esc(label)}</button>`;
const chip = (txt, cls = '') => `<span class="chip ${cls}">${txt}</span>`;
function wireJumps(root, handler) { root.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => handler(b.dataset.jump))); }

function inspectorIntro() {
  return `<div class="hint"><h3 style="margin-bottom:8px">Select a node</h3>
    <p>Click a goal, project, person or skill to see how it connects to the rest of the organisation.</p>
    <p><b>Try:</b> ${jump('s:skl_kubernetes', 'Kubernetes')} (one expert holds it up), ${jump('p:per_01', 'Marta Lindqvist')}, or ${jump('g:gol_trust', 'Earn enterprise trust')}.</p>
    <h4>Skill levels</h4>
    <div class="list">${[1, 2, 3, 4, 5].map(i => `<div class="row"><span>${pips(i)}${LEVEL[i]}</span></div>`).join('')}</div></div>`;
}

function inspectorHTML(key, opts = {}) {
  if (!key) return inspectorIntro();
  const t = key[0], id = key.slice(2);
  let h = '';
  if (t === 'p') {
    const p = People.get(id), sk = [...get(skillsOfPerson, id)].sort((a, b) => b.level - a.level), pr = get(projectsOfPerson, id), ld = loadOf(id);
    h = `<h3>${esc(p.full_name)}</h3><p class="sub">${esc(p.title)} · ${esc(Units.get(p.org_unit_id).name)}</p>
      <div class="kv"><span>Allocated</span><span class="r">${ld}%</span></div>
      <div class="bar ${ld >= 100 ? 'bad' : ld >= 85 ? 'warn' : ''}" style="margin-top:4px"><i style="width:${Math.min(100, ld)}%"></i></div>
      <h4>Skills</h4><div class="list">${sk.map(e => `<div class="row"><span>${pips(e.level)}${jump('s:' + e.skill_id, Skills.get(e.skill_id).name)}</span><span class="note">${SRC[e.source]}</span></div>`).join('') || '<p class="note">No skills recorded yet.</p>'}</div>
      <h4>Projects</h4><div class="list">${pr.map(e => `<div class="row"><span>${jump('j:' + e.project_id, pname(e.project_id))}</span><span class="note">${esc(e.role)} · ${e.allocation_pct}%</span></div>`).join('') || '<p class="note">Not on a project yet.</p>'}</div>`;
  } else if (t === 'j') {
    const j = Projects.get(id), mem = get(membersOfProject, id), needs = get(needsOfProject, id), gl = get(goalsOfProject, id), ec = ECON.get(id);
    h = `<h3>${esc(j.name)}</h3><p class="sub">${chip(j.status, j.status === 'planned' || j.status === 'proposed' ? 'warn' : '')} ${j.start_on} → ${j.end_on}</p>
      <div class="kv"><span>Team</span><span class="r">${ec.fte.toFixed(1)} FTE · ${ec.months.toFixed(1)} months</span><span>Cost</span><span class="r">${eur(ec.cost)}</span><span>Value (risk-adj.)</span><span class="r">${eur(ec.adj)}</span><span>Verdict</span><span class="r">${chip(VERDICT[ec.verdict].label, VERDICT[ec.verdict].cls)}</span></div>
      <h4>Serves</h4>${gl.length ? `<div class="list">${gl.map(g => `<div class="row"><span>${jump('g:' + g.goal_id, Goals.get(g.goal_id).name)}</span><span class="note">${Math.round(g.contribution * 100)}%</span></div>`).join('')}</div>` : `${chip('No goal linked', 'warn')} <span class="note">Why are we doing this?</span>`}
      <h4>Needs vs. who is on the team</h4><div class="list">${needs.map(n => {
        const cov = mem.filter(m => levelOf(m.person_id, n.skill_id) >= n.min_level);
        const c = cov.length === 0 ? chip('gap', 'bad') : cov.length === 1 ? chip('1 person', 'warn') : chip(cov.length + ' people', 'ok');
        return `<div class="row"><span>${jump('s:' + n.skill_id, Skills.get(n.skill_id).name)} <span class="note">≥ ${n.min_level}</span></span>${c}</div>`;
      }).join('')}</div>
      <h4>Team (${mem.length})</h4><div class="list">${mem.map(m => `<div class="row"><span>${jump('p:' + m.person_id, People.get(m.person_id).full_name)}</span><span class="note">${esc(m.role)} · ${m.allocation_pct}%</span></div>`).join('')}</div>`;
  } else if (t === 's') {
    const s = Skills.get(id), st = SS.get(id), all = [...get(holdersOfSkill, id)].sort((a, b) => b.level - a.level);
    h = `<h3>${esc(s.name)}</h3><p class="sub">${esc(s.category)} · ${chip(STATUS[st.status].label, STATUS[st.status].cls)}</p>
      <h4>Held by (${all.length})</h4><div class="list">${all.map(e => `<div class="row"><span>${pips(e.level)}${jump('p:' + e.person_id, People.get(e.person_id).full_name)}</span><span class="note">${SRC[e.source]}</span></div>`).join('')}</div>
      <h4>Needed by live projects (${st.demand})</h4>${st.demand ? `<div class="list">${st.needing.map(n => `<div class="row"><span>${jump('j:' + n.project_id, pname(n.project_id))}</span><span class="note">≥ ${n.min_level}</span></div>`).join('')}</div>` : '<p class="note">No live project asks for this skill.</p>'}`;
  } else if (t === 'g') {
    const g = Goals.get(id), pj = get(projectsOfGoal, id), ex = goalExposure(id);
    const ppl = new Set(pj.flatMap(e => get(membersOfProject, e.project_id).map(m => m.person_id)));
    const fte = sum(pj, e => ECON.get(e.project_id).fte), val = sum(pj, e => ECON.get(e.project_id).adj * e.contribution);
    return `<h3>${esc(g.name)}</h3><p class="sub">${esc(g.level)} · ${esc(g.period)}</p>
      <div class="kv"><span>Projects</span><span class="r">${pj.length}</span><span>People involved</span><span class="r">${ppl.size}</span><span>FTE committed</span><span class="r">${fte.toFixed(1)}</span><span>Risk-adj. value</span><span class="r">${eur(val)}</span><span>Skill exposure</span><span class="r">${Math.round(ex.pct * 100)}%</span></div>
      <h4>Projects serving it</h4><div class="list">${pj.map(e => `<div class="row"><span>${jump('j:' + e.project_id, pname(e.project_id))}</span><span class="note">${Math.round(e.contribution * 100)}%</span></div>`).join('')}</div>
      ${ex.risky.length ? `<h4>Fragile skills underneath</h4><div class="list">${ex.risky.map(s => `<div class="row"><span>${jump('s:' + s, Skills.get(s).name)}</span>${chip(STATUS[SS.get(s).status].label, STATUS[SS.get(s).status].cls)}</div>`).join('')}</div>` : ''}`;
  }
  if (opts.collab) h += collabListHTML(id);
  if (typeof netPositionHTML === 'function') h += netPositionHTML(key);
  return h;
}
function collabListHTML(pid) {
  const cs = [...NET.adjOf('p:' + pid).entries()].filter(([k]) => k[0] === 'p').sort((a, b) => b[1] - a[1]);
  return cs.length ? `<h4>Works with (${cs.length})</h4><div class="list">${cs.map(([k]) => `<div class="row"><span>${jump(k, People.get(k.slice(2)).full_name)}</span><span class="note">${esc(Units.get(People.get(k.slice(2)).org_unit_id).name)}</span></div>`).join('')}</div>` : '';
}
