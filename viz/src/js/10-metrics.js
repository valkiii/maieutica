/* ============================================================ graph metrics
   Works on any weighted, undirected graph, so the same code scores people,
   use cases, skills, and the overlapped multilayer graph.

   betweenness  Brandes on weighted shortest paths, distance = 1 / weight (stronger tie = shorter),
                normalised to 0..1. "How often does this node sit on the fastest path between two others?"
   constraint   Burt (1992). Low = the node's contacts are NOT connected to each other, so it spans
                structural holes. High = boxed in by a tight, redundant clique.
   effective size  Burt's weighted measure: contacts minus the redundancy among them.
   role         a plain-language reading combining the three (see ROLE_HELP). */
const ROLE_HELP = {
  Broker: 'High betweenness and low constraint: sits between groups that are otherwise unconnected.',
  Embedded: 'Many contacts, but they all know each other. Well integrated, not a bridge.',
  Connector: 'Some brokerage, some redundancy. Neither a bridge nor boxed in.',
  Peripheral: 'Few contacts. Little influence on how information or work flows.',
  Isolated: 'No links in this network yet.',
};

function graphMetrics(keys, edges, groupOf = () => '') {
  const n = keys.length, idx = new Map(keys.map((k, i) => [k, i]));
  const W = Array.from({ length: n }, () => new Map());
  for (const e of edges) {
    const i = idx.get(e.a), j = idx.get(e.b);
    if (i === undefined || j === undefined || i === j || !(e.w > 0)) continue;
    W[i].set(j, (W[i].get(j) || 0) + e.w); W[j].set(i, (W[j].get(i) || 0) + e.w);
  }
  const str = W.map(m => sum([...m.values()], x => x));

  // --- weighted betweenness (Brandes + Dijkstra on 1/w)
  const bet = new Array(n).fill(0), EPS = 1e-9;
  for (let s = 0; s < n; s++) {
    const dist = new Array(n).fill(Infinity), sigma = new Array(n).fill(0), pred = Array.from({ length: n }, () => []), done = new Array(n).fill(false), order = [];
    dist[s] = 0; sigma[s] = 1;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true; order.push(u);
      for (const [v, w] of W[u]) {
        const nd = dist[u] + 1 / w;
        if (nd < dist[v] - EPS) { dist[v] = nd; sigma[v] = sigma[u]; pred[v] = [u]; }
        else if (Math.abs(nd - dist[v]) <= EPS) { sigma[v] += sigma[u]; pred[v].push(u); }
      }
    }
    const delta = new Array(n).fill(0);
    for (let k = order.length - 1; k >= 0; k--) {
      const w = order[k];
      for (const v of pred[w]) delta[v] += sigma[v] / sigma[w] * (1 + delta[w]);
      if (w !== s) bet[w] += delta[w];
    }
  }
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;      // each pair is counted from both ends

  // --- Burt: constraint and effective size
  const p = (i, j) => (W[i].get(j) || 0) / (str[i] || 1);
  const maxW = W.map(m => Math.max(0, ...m.values()));
  const m = new Map();
  for (let i = 0; i < n; i++) {
    const N = [...W[i].keys()];
    let constraint = NaN, es = 0;
    if (N.length) {
      constraint = 0;
      for (const j of N) {
        let c = p(i, j);
        for (const q of N) if (q !== j) c += p(i, q) * p(q, j);
        constraint += c * c;
        let red = 0;
        for (const q of N) if (q !== j) red += p(i, q) * ((W[j].get(q) || 0) / (maxW[j] || 1));
        es += 1 - red;
      }
    }
    m.set(keys[i], { key: keys[i], deg: N.length, strength: str[i], bet: bet[i] / norm, constraint, es, eff: N.length ? es / N.length : 0 });
  }

  // --- ranks and roles
  const all = [...m.values()], linked = all.filter(v => v.deg > 0);
  [...all].sort((a, b) => b.bet - a.bet).forEach((v, i) => { v.rankBet = i + 1; });
  [...all].sort((a, b) => b.es - a.es).forEach((v, i) => { v.rankEs = i + 1; });
  const q = (arr, f) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(f * (s.length - 1))] : 0; };
  const betP75 = q(linked.map(v => v.bet), 0.75), conMed = q(linked.map(v => v.constraint), 0.5), conP75 = q(linked.map(v => v.constraint), 0.75), degP25 = q(linked.map(v => v.deg), 0.25);
  for (const v of all) {
    v.role = v.deg === 0 ? 'Isolated' : (v.bet > 0 && v.bet >= betP75 && v.constraint <= conMed) ? 'Broker' : v.deg <= degP25 ? 'Peripheral' : v.constraint >= conP75 ? 'Embedded' : 'Connector';
  }

  const adj = new Map(keys.map((k, i) => [k, new Map([...W[i]].map(([j, w]) => [keys[j], w]))]));
  return {
    keys, m, adj, n,
    max: { bet: Math.max(1e-9, ...all.map(v => v.bet)), es: Math.max(1e-9, ...all.map(v => v.es)), deg: Math.max(1, ...all.map(v => v.deg)) },
    /* Structural holes a node spans: pairs of its contacts that are not connected to each other.
       Scored by how much of the node's attention each pair takes; cross-group pairs count extra. */
    holes(key, limit = 3) {
      const N = [...(adj.get(key) || new Map()).keys()], S = str[idx.get(key)] || 1, out = [];
      let total = 0;
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        if (adj.get(N[i]).has(N[j])) continue;
        total++;
        const score = (adj.get(key).get(N[i]) / S) * (adj.get(key).get(N[j]) / S) * (groupOf(N[i]) !== groupOf(N[j]) ? 1.5 : 1);
        out.push({ a: N[i], b: N[j], score });
      }
      out.sort((x, y) => y.score - x.score);
      return { total, top: out.slice(0, limit) };
    },
  };
}

/* ============================================================ the three networks (+ links between them) */
let NET;
const LAYER = {
  p: { name: 'People', sub: 'linked when they share a project', color: 'var(--pers)' },
  j: { name: 'Use cases', sub: 'linked by shared people (1) and shared skills (½)', color: 'var(--proj)' },
  s: { name: 'Skills', sub: 'linked when the same person holds both (level 3+)', color: 'var(--skill)' },
};
const primaryGoal = jid => { const g = [...get(goalsOfProject, jid)].sort((a, b) => b.contribution - a.contribution)[0]; return g ? g.goal_id : 'none'; };
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function buildNet() {
  const nodes = { p: [], j: [], s: [] }, info = new Map();
  const add = (type, id, label, group) => { const n = { key: type + ':' + id, id, type, label, group }; nodes[type].push(n); info.set(n.key, n); };
  D.people.forEach(p => add('p', p.id, p.full_name, p.org_unit_id));
  D.projects.forEach(j => add('j', j.id, j.name, primaryGoal(j.id)));
  D.skills.forEach(s => add('s', s.id, s.name, s.category));
  const groups = {
    p: D.org_units.map(u => ({ id: u.id, label: u.name })),
    j: [...objectives.map(g => ({ id: g.id, label: clip(g.name, 30) })), { id: 'none', label: 'No goal' }],
    s: [...new Set(D.skills.map(s => s.category))].map(c => ({ id: c, label: c })),
  };
  const groupOf = k => (info.get(k) || {}).group;

  const E = { p: [], j: [], s: [] }, X = [];
  // people <-> people: shared (non-proposed) projects, weight = overlapping allocation
  const pp = new Map();
  for (const [jid, mem] of membersOfProject) {
    if (Projects.get(jid).status === 'proposed') continue;
    for (let i = 0; i < mem.length; i++) for (let k = i + 1; k < mem.length; k++) {
      const [a, b] = mem[i].person_id < mem[k].person_id ? [mem[i], mem[k]] : [mem[k], mem[i]];
      const id = a.person_id + '|' + b.person_id, c = pp.get(id) || { a: 'p:' + a.person_id, b: 'p:' + b.person_id, w: 0, projects: [] };
      c.w += Math.min(a.allocation_pct, b.allocation_pct) / 100; c.projects.push(jid); pp.set(id, c);
    }
  }
  E.p = [...pp.values()];
  // use cases <-> use cases: shared people count 1, shared required skills count 0.5
  for (let i = 0; i < D.projects.length; i++) for (let k = i + 1; k < D.projects.length; k++) {
    const a = D.projects[i].id, b = D.projects[k].id;
    const ma = new Set(get(membersOfProject, a).map(m => m.person_id)), sp = get(membersOfProject, b).map(m => m.person_id).filter(x => ma.has(x));
    const sa = new Set(get(needsOfProject, a).map(n => n.skill_id)), ss = get(needsOfProject, b).map(n => n.skill_id).filter(x => sa.has(x));
    const w = sp.length + 0.5 * ss.length;
    if (w > 0) E.j.push({ a: 'j:' + a, b: 'j:' + b, w, people: sp, skills: ss });
  }
  // skills <-> skills: co-held at working level
  const co = new Map();
  for (const [pid, es] of groupBy(PS.filter(e => e.level >= 3), e => e.person_id)) {
    for (let i = 0; i < es.length; i++) for (let k = i + 1; k < es.length; k++) {
      const [a, b] = es[i].skill_id < es[k].skill_id ? [es[i].skill_id, es[k].skill_id] : [es[k].skill_id, es[i].skill_id], id = a + '|' + b;
      const c = co.get(id) || { a: 's:' + a, b: 's:' + b, w: 0, people: [] }; c.w += 1; c.people.push(pid); co.set(id, c);
    }
  }
  E.s = [...co.values()];
  // links BETWEEN layers (shown only when layers overlap)
  PP.forEach(e => X.push({ a: 'p:' + e.person_id, b: 'j:' + e.project_id, w: Math.max(0.1, e.allocation_pct / 100), cross: true }));
  PS.filter(e => e.level >= 3).forEach(e => X.push({ a: 'p:' + e.person_id, b: 's:' + e.skill_id, w: e.level / 5, cross: true }));
  JS.forEach(e => X.push({ a: 'j:' + e.project_id, b: 's:' + e.skill_id, w: e.min_level / 5, cross: true }));

  const metrics = {};
  for (const l of 'pjs') metrics[l] = graphMetrics(nodes[l].map(n => n.key), E[l], groupOf);
  const allAdj = new Map([...info.keys()].map(k => [k, new Set()]));
  [...E.p, ...E.j, ...E.s, ...X].forEach(e => { allAdj.get(e.a).add(e.b); allAdj.get(e.b).add(e.a); });
  const cache = new Map();
  return {
    nodes, info, groups, E, X, metrics, allAdj, groupOf,
    combined(act) {
      const id = act.join('');
      if (!cache.has(id)) cache.set(id, graphMetrics(act.flatMap(l => nodes[l].map(n => n.key)), act.flatMap(l => E[l]).concat(X.filter(x => act.includes(x.a[0]) && act.includes(x.b[0]))), groupOf));
      return cache.get(id);
    },
    adjOf: key => metrics[key[0]].adj.get(key) || new Map(),
    groupLabel(type, gid) { const g = groups[type].find(x => x.id === gid); return g ? g.label : gid; },
    groupColor(type, gid) { if (gid === 'none') return 'var(--ink3)'; const i = groups[type].findIndex(x => x.id === gid); return `var(--d${(i % 7) + 1})`; },
  };
}

/* ============================================================ inspector section: network position */
const fmt2 = x => Number.isFinite(x) ? x.toFixed(2) : '–';
function netPositionHTML(key) {
  const t = key[0];
  if (!NET || !NET.metrics[t]) return '';
  const ctx = NET.metrics[t], m = ctx.m.get(key);
  if (!m) return '';
  const holes = ctx.holes(key, 3), lay = LAYER[t];
  const nm = k => NET.info.get(k).label;
  let h = `<h4>Network position · ${lay.name}</h4>
    <div class="kv"><span>Betweenness</span><span class="r">${Math.round(m.bet / ctx.max.bet * 100)} <span class="note">#${m.rankBet} of ${ctx.n}</span></span>
    <span>Effective size</span><span class="r">${m.es.toFixed(1)} <span class="note">of ${m.deg} contacts</span></span>
    <span>Constraint</span><span class="r">${fmt2(m.constraint)} <span class="note">lower = more brokerage</span></span>
    <span>Role</span><span class="r">${chip(m.role, m.role === 'Broker' ? 'ok' : '')}</span></div>
    <p class="note" style="margin-top:6px">${ROLE_HELP[m.role]}</p>`;
  if (holes.total) {
    h += `<h4>Structural holes it spans (${holes.total})</h4><div class="list">${holes.top.map(x => `<div class="row"><span>${jump(x.a, nm(x.a))} <span class="arrow">↔</span> ${jump(x.b, nm(x.b))}</span></div>`).join('')}</div><p class="note" style="margin-top:4px">These pairs are both in its network but not linked to each other. It is the bridge.</p>`;
  }
  if (NWS && NWS.mode === 'ovl' && [...NWS.active].length > 1) {
    const cctx = NET.combined([...'pjs'].filter(l => NWS.active.has(l))), c = cctx.m.get(key);
    if (c) h += `<h4>In the overlapped graph</h4><div class="kv"><span>Betweenness</span><span class="r">${Math.round(c.bet / cctx.max.bet * 100)} <span class="note">#${c.rankBet} of ${cctx.n}</span></span><span>Effective size</span><span class="r">${c.es.toFixed(1)} <span class="note">of ${c.deg}</span></span></div>`;
  }
  return h;
}
