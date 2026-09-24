/* ============================================================ view 1: the four layers */
const LAY = { hover: null, pinned: null, nodes: new Map(), edges: [] };

function buildLayers() {
  const svg = $('#svg-layers'), W = 1060, ROW = 22, TOP = 54;
  svg.innerHTML = '';
  const H = TOP + D.people.length * ROW + 14, colH = D.people.length * ROW;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const X = { g: [8, 196], j: [294, 206], p: [590, 184], s: [864, 188] };
  const pIdx = new Map(D.people.map((p, i) => [p.id, i]));
  const mean = a => a.length ? sum(a, x => x) / a.length : 99;
  const wmean = es => { const w = sum(es, e => e.level); return w ? sum(es, e => pIdx.get(e.person_id) * e.level) / w : 99; };

  const projOrder = [...D.projects].sort((a, b) => mean(get(membersOfProject, a.id).map(m => pIdx.get(m.person_id))) - mean(get(membersOfProject, b.id).map(m => pIdx.get(m.person_id))));
  const jRank = new Map(projOrder.map((j, i) => [j.id, i]));
  const goalOrder = [...objectives].sort((a, b) => mean(get(projectsOfGoal, a.id).map(e => jRank.get(e.project_id))) - mean(get(projectsOfGoal, b.id).map(e => jRank.get(e.project_id))));
  const skillOrder = [...D.skills].sort((a, b) => wmean(get(holdersOfSkill, a.id)) - wmean(get(holdersOfSkill, b.id)));

  const pos = new Map(), h = new Map();
  const wrap = (txt, n) => { const out = []; let line = ''; for (const w of txt.split(' ')) { if ((line + ' ' + w).trim().length > n && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } out.push(line); return out; };
  const place = (t, list, idf, hf) => list.forEach((it, i) => { const step = colH / list.length; pos.set(t + ':' + idf(it), TOP + step * (i + 0.5)); h.set(t + ':' + idf(it), hf(it)); });
  place('g', goalOrder, g => g.id, g => wrap(g.name, 27).length * 15 + 12);
  place('j', projOrder, j => j.id, () => 34);
  place('p', D.people, p => p.id, () => 18);
  place('s', skillOrder, s => s.id, () => 20);

  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const layerColor = { g: 'var(--goal)', j: 'var(--proj)', p: 'var(--pers)', s: 'var(--skill)' };
  const heads = { g: `Goals · ${objectives.length}`, j: `Projects · ${D.projects.length}`, p: `People · ${D.people.length} (colour = unit)`, s: `Skills · ${D.skills.length}` };
  for (const t of 'gjps') { const e = mk('text', { x: X[t][0], y: 22, class: 'colhead', fill: layerColor[t] }, svg); e.textContent = heads[t]; }

  const gEdges = mk('g', {}, svg), gNodes = mk('g', {}, svg);
  LAY.edges = []; LAY.nodes = new Map();
  const curve = (a, b, x1, x2) => { const y1 = pos.get(a), y2 = pos.get(b), m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
  const addEdge = (cls, a, b, xa, xb, w) => { const el = mk('path', { class: 'edge ' + cls, d: curve(a, b, xa, xb), 'stroke-width': w }, gEdges); LAY.edges.push({ el, a, b }); };
  for (const e of JG) addEdge('e-gp', 'g:' + e.goal_id, 'j:' + e.project_id, X.g[0] + X.g[1], X.j[0], 1 + e.contribution * 2.5);
  for (const e of PP) addEdge('e-pp', 'j:' + e.project_id, 'p:' + e.person_id, X.j[0] + X.j[1], X.p[0], 0.6 + e.allocation_pct / 45);
  for (const e of PS) addEdge('e-ps', 'p:' + e.person_id, 's:' + e.skill_id, X.p[0] + X.p[1], X.s[0], 0.4 + e.level * 0.3);

  const addNode = (t, id, label, dotColor, extra = {}) => {
    const key = t + ':' + id, ht = h.get(key), w = X[t][1];
    const g = mk('g', { class: 'node' + (extra.orphan ? ' orphan' : ''), transform: `translate(${X[t][0]},${pos.get(key)})`, tabindex: 0, role: 'button', 'aria-label': label }, gNodes);
    mk('rect', { class: 'box', x: 0, y: -ht / 2, width: w, height: ht, rx: 4 }, g);
    mk('circle', { cx: 11, cy: 0, r: 4, fill: dotColor }, g);
    const lines = extra.lines || [label];
    lines.forEach((ln, i) => { const tx = mk('text', { x: 22, y: (i - (lines.length - 1) / 2) * 14 + (extra.sub ? -7 : 0), 'dominant-baseline': 'central' }, g); tx.textContent = ln; });
    if (extra.sub) { const tx = mk('text', { x: 22, y: 9, class: 'sub', 'dominant-baseline': 'central' }, g); tx.textContent = extra.sub; }
    LAY.nodes.set(key, g);
    const toggle = () => { LAY.pinned = LAY.pinned === key ? null : key; renderLayers(); };
    g.addEventListener('mouseenter', () => { LAY.hover = key; renderLayers(); });
    g.addEventListener('mouseleave', () => { LAY.hover = null; renderLayers(); });
    g.addEventListener('focus', () => { LAY.hover = key; renderLayers(); });
    g.addEventListener('blur', () => { LAY.hover = null; renderLayers(); });
    g.addEventListener('click', toggle);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  };
  for (const g of goalOrder) addNode('g', g.id, g.name, 'var(--goal)', { lines: wrap(g.name, 27) });
  for (const j of projOrder) {
    const n = get(membersOfProject, j.id).length, orphan = !get(goalsOfProject, j.id).length;
    addNode('j', j.id, j.name, 'var(--proj)', { orphan, sub: orphan ? `${n} people · no goal` : `${n} people · ${j.status}` });
  }
  for (const p of D.people) addNode('p', p.id, p.full_name, unitColor(p.org_unit_id));
  for (const s of skillOrder) addNode('s', s.id, s.name, 'var(--skill)');
  if (LAY.pinned && !LAY.nodes.has(LAY.pinned)) LAY.pinned = null;
  $('#insp-layers').dataset.k = '#';
  renderLayers();
}

function layerSets(key) {
  const t = key[0], id = key.slice(2), S = new Set([key]), need = new Set();
  if (t === 'p') {
    get(skillsOfPerson, id).forEach(e => S.add('s:' + e.skill_id));
    get(projectsOfPerson, id).forEach(e => { S.add('j:' + e.project_id); get(goalsOfProject, e.project_id).forEach(g => S.add('g:' + g.goal_id)); });
  } else if (t === 'j') {
    get(goalsOfProject, id).forEach(g => S.add('g:' + g.goal_id));
    get(membersOfProject, id).forEach(m => S.add('p:' + m.person_id));
    get(needsOfProject, id).forEach(n => { S.add('s:' + n.skill_id); need.add('s:' + n.skill_id); });
  } else if (t === 'g') {
    get(projectsOfGoal, id).forEach(e => { S.add('j:' + e.project_id); get(membersOfProject, e.project_id).forEach(m => S.add('p:' + m.person_id)); });
  } else if (t === 's') {
    get(holdersOfSkill, id).forEach(e => S.add('p:' + e.person_id));
    get(projectsNeeding, id).forEach(e => { S.add('j:' + e.project_id); need.add('j:' + e.project_id); });
  }
  return { S, need };
}

function renderLayers() {
  const svg = $('#svg-layers'), insp = $('#insp-layers'), f = LAY.hover || LAY.pinned;
  svg.classList.toggle('focusing', !!f);
  const { S, need } = f ? layerSets(f) : { S: new Set(), need: new Set() };
  LAY.nodes.forEach((el, k) => { el.classList.toggle('on', S.has(k)); el.classList.toggle('need', need.has(k)); el.classList.toggle('sel', k === LAY.pinned); });
  LAY.edges.forEach(e => e.el.classList.toggle('on', S.has(e.a) && S.has(e.b)));
  const showing = LAY.pinned || LAY.hover;
  if (insp.dataset.k !== (showing || '')) {
    insp.dataset.k = showing || ''; insp.innerHTML = inspectorHTML(showing);
    wireJumps(insp, k => { LAY.pinned = k; LAY.hover = null; renderLayers(); });
  }
}
