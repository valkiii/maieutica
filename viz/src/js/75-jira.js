/* ============================================================ view 8: Jira / Kanban
   Tickets arrive already normalised as work_item rows (integrations/boards.py does the mapping).
   Here they become a board with Maieutica's signals, and three derived views: planned vs observed
   allocation, concentration of open work, and skill evidence. Evidence never adds a skill by itself. */
const JR = { project: 'prj_cloud_migration', signals: true, selected: null, syncing: false, syncedAt: 'demo fixture', applied: null };
const JR_CUTOFF = '2026-08-25';                 // "today" (2026-09-24) minus the 30-day window
const PTS_PER_FTE_MONTH = 20;
const COLS = ['To Do', 'In Progress', 'In Review', 'Done'];
const initials = n => n.split(' ').map(x => x[0]).slice(0, 2).join('');
let WI = [], wiSkills = new Map();

function indexWork() {
  WI = D.work_item || [];
  wiSkills = new Map();
  (D.work_item_skill || []).forEach(r => { if (!wiSkills.has(r.work_item_id)) wiSkills.set(r.work_item_id, []); wiSkills.get(r.work_item_id).push(r.skill_id); });
}

/* ---- derived analyses (same rules as integrations/boards.py; parity-tested against jira_summary.json) */
const wiCounts = w => w.item_type !== 'Epic' && w.assignee_id && w.story_points &&
  (w.status_category === 'indeterminate' || (w.status_category === 'done' && w.resolved_on && w.resolved_on >= JR_CUTOFF));
function observedMap() {
  const m = new Map();
  WI.filter(wiCounts).forEach(w => { const k = w.assignee_id + '|' + w.project_id; m.set(k, (m.get(k) || 0) + w.story_points); });
  return new Map([...m].map(([k, v]) => [k, Math.round(v / PTS_PER_FTE_MONTH * 100)]));
}
function concentration() {
  const by = new Map();
  for (const w of WI) {
    if (w.item_type === 'Epic' || !w.assignee_id || w.status_category === 'done') continue;
    for (const sid of wiSkills.get(w.id) || []) { const k = w.project_id + '|' + sid; if (!by.has(k)) by.set(k, new Map()); const m = by.get(k); m.set(w.assignee_id, (m.get(w.assignee_id) || 0) + 1); }
  }
  const out = [];
  for (const [k, m] of by) {
    const n = sum([...m.values()], x => x), [person, c] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n >= 3 && c / n >= 0.75) { const [pid, sid] = k.split('|'); out.push({ pid, sid, person, c, n, noSkill: levelOf(person, sid) === 0 }); }
  }
  return out.sort((a, b) => b.n - a.n);
}
function evidenceProps() {
  const seen = new Map();
  for (const w of WI) {
    if (w.item_type === 'Epic' || !w.assignee_id || w.status_category === 'new') continue;
    for (const sid of wiSkills.get(w.id) || []) { const k = w.assignee_id + '|' + sid; if (!seen.has(k)) seen.set(k, { keys: [], points: 0, titles: [] }); const e = seen.get(k); e.keys.push(w.external_ref); e.points += w.story_points || 0; e.titles.push(w.title); }
  }
  const claims = new Map(D.person_skill.filter(e => !e.valid_to).map(e => [e.person_id + '|' + e.skill_id, e]));
  const out = [];
  for (const [k, e] of [...seen].sort()) {
    const [pid, sid] = k.split('|'), claim = claims.get(k);
    if (claim && claim.confidence < 0.85) out.push({ pid, sid, kind: 'raise', ...e, from: claim.confidence, to: 0.85 });
    else if (!claim) out.push({ pid, sid, kind: 'new', ...e, level: e.points >= 8 ? 3 : 2 });
  }
  return out;
}

/* ---- ticket signals and suggestions */
function signalsOf(w) {
  const out = [], conc = concentration(), skills = wiSkills.get(w.id) || [], who = w.assignee_id ? People.get(w.assignee_id) : null;
  if (w.blocked && w.status_category !== 'done') out.push({ cls: 'bad', text: 'Blocked', tip: 'Flagged as an impediment in Jira.' });
  if (!who && w.status_category !== 'done' && w.item_type !== 'Epic') out.push({ cls: 'warn', text: 'Unassigned', tip: 'Nobody owns this ticket yet.' });
  for (const sid of skills) {
    const st = SS.get(sid);
    if (who && w.status_category !== 'done' && st.status === 'critical' && st.experts.length === 1 && st.experts[0].person_id === who.id)
      out.push({ cls: 'bad', text: 'Key-person', tip: `${who.full_name} is the only expert on ${Skills.get(sid).name}, a single point of failure.` });
    const c = conc.find(x => x.pid === w.project_id && x.sid === sid && x.person === w.assignee_id);
    if (c && w.status_category !== 'done') out.push({ cls: 'warn', text: 'Concentrated', tip: `${c.c} of ${c.n} open ${Skills.get(sid).name} tickets in this project sit with ${who.full_name}.` });
    if (who && levelOf(who.id, sid) === 0) out.push({ cls: '', text: 'Skill not on file', tip: `${who.full_name} works on ${Skills.get(sid).name} but has no such skill recorded. Evidence to confirm.` });
  }
  return out.filter((s, i, a) => a.findIndex(t => t.text === s.text) === i);
}
function suggestFor(w) {
  const skills = wiSkills.get(w.id) || [], needs = new Map(get(needsOfProject, w.project_id).map(n => [n.skill_id, n.min_level]));
  const onProj = new Set(get(membersOfProject, w.project_id).map(m => m.person_id));
  return D.people.filter(p => p.status === 'active' && p.id !== w.assignee_id).map(p => {
    const parts = skills.map(s => { const min = needs.get(s) || 3, lv = levelOf(p.id, s); return { s, lv, min, v: lv >= min ? 1 : lv === min - 1 ? 0.4 : 0 }; });
    const fit = skills.length ? sum(parts, x => x.v) / skills.length : 0, free = Math.max(0, 100 - loadOf(p.id));
    return { p, fit, free, parts, score: fit * (0.5 + Math.min(free, 60) / 120) + (onProj.has(p.id) ? 0.08 : 0) };
  }).filter(x => x.fit > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ---- rendering */
function ticketHTML(w) {
  const who = w.assignee_id ? People.get(w.assignee_id) : null, sk = (wiSkills.get(w.id) || []).map(s => chip(esc(Skills.get(s).name))).join(' ');
  const sig = JR.signals ? signalsOf(w).map(s => `<span class="sig ${s.cls}" title="${esc(s.tip)}">${esc(s.text)}</span>`).join('') : '';
  return `<div class="tk ${JR.selected === w.external_ref ? 'sel' : ''}" data-k="${esc(w.external_ref)}" tabindex="0" role="button" aria-label="${esc(w.external_ref + ' ' + w.title)}">
    <div class="tk-h"><i class="tdot ${esc(w.item_type.toLowerCase())}" title="${esc(w.item_type)}"></i>${esc(w.external_ref)}${w.story_points != null ? `<span class="tk-pts" title="Story points">${w.story_points}</span>` : ''}</div>
    <p class="tk-t">${esc(w.title)}</p><div class="tk-skills">${sk}</div>
    <div class="tk-f">${who ? `<span class="avt" style="--c:${unitColor(who.org_unit_id)}">${esc(initials(who.full_name))}</span><span>${esc(short(who.full_name))}</span>` : '<span class="avt empty">?</span><span class="note">Unassigned</span>'}${sig}</div></div>`;
}

function renderJiraInspector() {
  const el = $('#insp-jira'), w = JR.selected && WI.find(x => x.external_ref === JR.selected);
  if (!w) {
    const obs = observedMap(), props = evidenceProps(), items = WI.filter(x => x.item_type !== 'Epic');
    el.innerHTML = `<div class="hint"><h3 style="margin-bottom:8px">What a board tells Maieutica</h3>
      <p>Click a ticket. Each one carries <b>who</b> is working, <b>how much</b>, and <b>which skills</b> it exercises. From that Maieutica derives:</p>
      <div class="kv" style="margin-top:10px"><span>Tickets read</span><span class="r">${items.length}</span><span>Assignees matched</span><span class="r">${items.filter(x => x.assignee_id).length}</span><span>Skill links found</span><span class="r">${(D.work_item_skill || []).length}</span><span>Observed allocations</span><span class="r">${obs.size}</span><span>Skill evidence</span><span class="r">${props.length}</span></div>
      <h4>Signals on cards</h4><div class="list"><div class="row"><span><span class="sig bad">Key-person</span></span><span class="note">only expert on a fragile skill</span></div><div class="row"><span><span class="sig warn">Concentrated</span></span><span class="note">most open work on one person</span></div><div class="row"><span><span class="sig warn">Unassigned</span></span><span class="note">Maieutica suggests who</span></div><div class="row"><span><span class="sig">Skill not on file</span></span><span class="note">evidence to confirm</span></div></div></div>`;
    return;
  }
  const proj = Projects.get(w.project_id), who = w.assignee_id ? People.get(w.assignee_id) : null, sigs = signalsOf(w), needs = new Map(get(needsOfProject, w.project_id).map(n => [n.skill_id, n.min_level]));
  const sug = (!who || sigs.some(s => ['Key-person', 'Concentrated', 'Blocked'].includes(s.text))) && w.status_category !== 'done' ? suggestFor(w) : [];
  el.innerHTML = `<h3>${esc(w.external_ref)}</h3><p class="sub">${esc(w.title)}</p>
    <div class="kv"><span>Project</span><span class="r">${jump('j:' + proj.id, proj.name)}</span><span>Type · status</span><span class="r">${esc(w.item_type)} · ${esc(w.status)}</span><span>Story points</span><span class="r">${w.story_points ?? '–'}</span><span>Assignee</span><span class="r">${who ? jump('p:' + who.id, who.full_name) : '<span class="note">nobody</span>'}</span><span>Created</span><span class="r">${esc(w.created_on || '–')}</span>${w.resolved_on ? `<span>Resolved</span><span class="r">${esc(w.resolved_on)}</span>` : ''}</div>
    <h4>Skills this ticket exercises</h4><div class="list">${(wiSkills.get(w.id) || []).map(s => { const lv = who ? levelOf(who.id, s) : 0, min = needs.get(s); return `<div class="row"><span>${jump('s:' + s, Skills.get(s).name)}${min ? ` <span class="note">needs ≥ ${min}</span>` : ''}</span>${who ? (lv ? chip(`${who.full_name.split(' ')[0]}: ${lv}/5`, min && lv < min ? 'warn' : 'ok') : chip('not on file', 'warn')) : ''}</div>`; }).join('') || '<p class="note">No skill detected.</p>'}</div>
    ${sigs.length ? `<h4>Maieutica signals</h4><div class="list">${sigs.map(s => `<div class="row" style="display:block"><span class="sig ${s.cls}">${esc(s.text)}</span> <span class="note">${esc(s.tip)}</span></div>`).join('')}</div>` : ''}
    ${sug.length ? `<h4>Suggested ${who ? 'alternatives' : 'assignees'}</h4><div class="list">${sug.map(x => `<div class="row" style="display:block">${jump('p:' + x.p.id, x.p.full_name)} <span class="note">${esc(x.p.title)}</span><br><span class="chip">skills ${Math.round(x.fit * 100)}%</span> <span class="chip ${x.free < 20 ? 'bad' : x.free < 40 ? 'warn' : 'ok'}">${x.free}% free</span> <span class="note">${x.parts.map(z => `${esc(Skills.get(z.s).name)} ${z.lv}/${z.min}`).join(', ')}</span></div>`).join('')}</div><p class="note" style="margin-top:6px">A suggestion for the team lead. It never reassigns anything in Jira.</p>` : ''}`;
  wireJumps(el, k => { showTab('layers'); LAY.pinned = k; renderLayers(); });
}

function renderJira() {
  const keyed = D.projects.filter(j => WI.some(w => w.project_id === j.id)), sel = $('#jr-project');
  sel.innerHTML = '<option value="all">All projects</option>' + keyed.map(j => `<option value="${j.id}">${esc(j.external_ref || '')} · ${esc(j.name)}${j.status === 'proposed' ? ' (proposed)' : ''}</option>`).join('');
  if (JR.project !== 'all' && !keyed.some(j => j.id === JR.project)) JR.project = 'all';
  sel.value = JR.project; $('#jr-signals').checked = JR.signals;
  const items = WI.filter(w => w.item_type !== 'Epic' && (JR.project === 'all' || w.project_id === JR.project));
  $('#jr-conn').innerHTML = `<span class="dot"></span><b>Jira Cloud</b><span class="mono">aldermoor.atlassian.net</span>${chip(JR.syncedAt === 'demo fixture' ? 'demo fixture' : 'synced ' + JR.syncedAt, 'ok')}
    <span class="note">${keyed.length} projects · ${WI.filter(w => w.item_type !== 'Epic').length} issues · story points from customfield_10016</span><span id="jr-steps" class="steps" style="margin:0"></span><button class="btn" id="jr-sync" ${JR.syncing ? 'disabled' : ''}>Sync from Jira</button>`;
  $('#jr-sync').addEventListener('click', jiraSync);
  $('#jr-counts').textContent = `${items.length} tickets · ${sum(items, w => w.story_points || 0)} points`;
  $('#jr-board').innerHTML = COLS.map(c => {
    const col = items.filter(w => w.status === c);
    return `<div class="col"><h3><span>${c}</span><span>${col.length}</span></h3><div class="col-in">${col.map(ticketHTML).join('') || '<p class="note" style="padding:6px 4px">Nothing here.</p>'}</div></div>`;
  }).join('');
  $$('#jr-board .tk').forEach(t => {
    const pick = () => { JR.selected = JR.selected === t.dataset.k ? null : t.dataset.k; renderJira(); };
    t.addEventListener('click', pick); t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  renderJiraInspector(); renderJiraCards();
}

function renderJiraCards() {
  const obs = observedMap(), live_ = new Set(D.projects.filter(j => j.status === 'active').map(j => j.id));
  const rows = D.person_project.filter(r => !r.valid_to && live_.has(r.project_id)).map(r => ({ r, planned: r.allocation_pct, observed: obs.get(r.person_id + '|' + r.project_id) || 0 }))
    .map(x => ({ ...x, delta: x.observed - x.planned })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);
  const conc = concentration(), props = evidenceProps(), nRaise = props.filter(p => p.kind === 'raise').length, nNew = props.filter(p => p.kind === 'new').length;
  $('#jr-cards').innerHTML = `
    <div class="panel card"><h3>Planned vs observed</h3><p class="why">Planned allocation against the points actually moving in Jira over 30 days (about ${PTS_PER_FTE_MONTH} points = 1 FTE-month).</p>
      <div class="list">${rows.map(x => `<div class="row" style="display:block"><span>${jump('p:' + x.r.person_id, People.get(x.r.person_id).full_name)}</span> <span class="note">${esc(pname(x.r.project_id))}</span><br>
        <span class="mono">${x.planned}% → ${x.observed}%</span> ${x.observed === 0 ? chip('not visible in Jira', 'bad') : x.delta >= 20 ? chip('over-committed', 'warn') : x.delta <= -20 ? chip('below plan', 'warn') : chip('on plan', 'ok')}</div>`).join('')}</div></div>
    <div class="panel card"><h3>Concentrated work</h3><p class="why">Three or more open tickets on one skill, at least 75% with one person.</p>
      <div class="list">${conc.map(c => `<div class="row" style="display:block"><b>${esc(Skills.get(c.sid).name)}</b> <span class="note">in ${esc(pname(c.pid))}</span><br>${c.c} of ${c.n} open tickets on ${jump('p:' + c.person, People.get(c.person).full_name)} ${c.noSkill ? chip('no such skill on file', 'warn') : ''}</div>`).join('') || '<p class="note">No concentration found.</p>'}</div></div>
    <div class="panel card"><h3>Evidence from tickets</h3><p class="why">Seen in work: ${nRaise} claims to strengthen, ${nNew} new skills to propose. New skills wait for the person to confirm.</p>
      <div class="list">${props.slice(0, 5).map(p => `<div class="row" style="display:block">${jump('p:' + p.pid, People.get(p.pid).full_name)} · <b>${esc(Skills.get(p.sid).name)}</b><br><span class="note">${p.keys.length} ticket${p.keys.length > 1 ? 's' : ''}, ${p.points} pt${p.points === 1 ? '' : 's'} · ${p.kind === 'raise' ? `confidence ${p.from.toFixed(2)} → ${p.to.toFixed(2)}` : `propose level ${p.level}, needs confirmation`}</span></div>`).join('')}</div>
      <div style="margin-top:10px">${JR.applied ? `<p class="note">${chip('applied', 'ok')} ${JR.applied.raised} claims strengthened, ${JR.applied.proposed} proposals sent to the people concerned.</p>` : `<button class="btn" id="jr-apply">Apply to the graph</button>`}</div></div>`;
  wireJumps($('#jr-cards'), k => { showTab('layers'); LAY.pinned = k; renderLayers(); });
  const ap = $('#jr-apply'); if (ap) ap.addEventListener('click', jiraApply);
}

async function jiraSync() {
  if (JR.syncing) return;
  JR.syncing = true; $('#jr-sync').disabled = true;
  const steps = ['Fetching issues', 'Matching assignees', 'Detecting skills', 'Comparing plan and reality'], el = $('#jr-steps');
  for (let i = 0; i <= steps.length; i++) {
    el.innerHTML = steps.map((s, k) => `<span class="st ${k < i ? 'done' : k === i ? 'now' : ''}">${s}</span>`).join('');
    if (i < steps.length) await sleep(430 * PACE);
  }
  JR.syncing = false; JR.syncedAt = 'just now'; renderJira();
  const items = WI.filter(w => w.item_type !== 'Epic');
  $('#jr-steps').innerHTML = `<span class="st done">${items.length} tickets · ${items.filter(w => w.assignee_id).length} assignees matched · ${(D.work_item_skill || []).length} skill links</span>`;
}

function jiraApply() {
  const props = evidenceProps(), T = D.tenant[0].id, today = '2026-09-24';
  let raised = 0, proposed = 0;
  props.forEach((p, i) => {
    D.evidence.push({ id: `ev_jira_${i}`, tenant_id: T, person_id: p.pid, skill_id: p.sid, source_type: 'jira', source_ref: p.keys.join(','), excerpt: `${p.keys.length} ticket(s), ${p.points} pts: ${p.titles[0]}`,
      proposed_level: p.kind === 'new' ? p.level : null, extracted_by: 'maieutica-board-sync/0.1', status: p.kind === 'raise' ? 'confirmed' : 'proposed', created_at: today });
    if (p.kind === 'raise') {
      const c = D.person_skill.find(e => !e.valid_to && e.person_id === p.pid && e.skill_id === p.sid);
      c.confidence = p.to; c.source = 'project_inferred'; c.last_used_on = today; raised++;
    } else proposed++;
  });
  JR.applied = { raised, proposed }; refreshAll();
}

function wireJiraControls() {
  $('#jr-project').addEventListener('change', e => { JR.project = e.target.value; JR.selected = null; renderJira(); });
  $('#jr-signals').addEventListener('change', e => { JR.signals = e.target.checked; renderJira(); });
}
