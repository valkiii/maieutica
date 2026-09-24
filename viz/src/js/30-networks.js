/* ============================================================ view 2: networks (people · use cases · skills) */
const NWS = { active: new Set(['p', 'j', 's']), mode: 'sep', size: 'bet', pinned: null, hover: null, layout: new Map(), panels: [], sort: { col: 'bet', dir: -1 } };
const SIZE_FIELD = { bet: 'bet', sh: 'es', deg: 'deg' };
const SYMBOL = () => ({ p: d3.symbolCircle, j: d3.symbolSquare, s: d3.symbolDiamond });

function settleLayout(nodes, links, ovl, W, H) {
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links.map(l => ({ source: l.s, target: l.t, w: l.w, cross: l.cross }))).id(d => d.key)
      .distance(l => (l.cross ? 70 : 60) / Math.sqrt(l.w + 0.4)).strength(l => Math.min(0.5, (l.cross ? 0.05 : 0.12) + l.w * 0.15)))
    .force('charge', d3.forceManyBody().strength(ovl ? -90 : -110))
    .force('x', d3.forceX(0).strength(0.06)).force('y', d3.forceY(0).strength(0.08))
    .force('collide', d3.forceCollide(ovl ? 10 : 12)).stop();
  for (let i = 0; i < 300; i++) sim.tick();
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), pad = 34;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min(3, (W - 2 * pad) / ((x1 - x0) || 1), (H - 2 * pad) / ((y1 - y0) || 1));
  nodes.forEach(n => { n.x = W / 2 + (n.x - (x0 + x1) / 2) * s; n.y = H / 2 + (n.y - (y0 + y1) / 2) * s; });
}

/* edges are gentle quadratic curves; the bend is proportional to length and always turns the same way, so parallel links fan out instead of overlapping */
function curvePath(l) {
  const a = l.sn, b = l.tn, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, off = Math.min(46, len * 0.2);
  return `M${a.x},${a.y} Q${(a.x + b.x) / 2 - dy / len * off},${(a.y + b.y) / 2 + dx / len * off} ${b.x},${b.y}`;
}

function drawPanel(host, id, layers, ovl) {
  const single = !ovl && NWS.active.size === 1;
  const W = ovl ? 900 : single ? 800 : 400, H = ovl ? 640 : single ? 520 : 400;
  const ctx = ovl ? NET.combined(layers) : NET.metrics[layers[0]];
  const nodes = layers.flatMap(l => NET.nodes[l].map(n => ({ ...n }))), byKey = new Map(nodes.map(n => [n.key, n]));
  const links = layers.flatMap(l => NET.E[l]).map(e => ({ s: e.a, t: e.b, w: e.w, cross: false }))
    .concat(ovl ? NET.X.filter(x => layers.includes(x.a[0]) && layers.includes(x.b[0])).map(x => ({ s: x.a, t: x.b, w: x.w, cross: true })) : []);
  links.forEach(l => { l.sn = byKey.get(l.s); l.tn = byKey.get(l.t); });

  const layoutId = id + ':' + W, cached = NWS.layout.get(layoutId);
  if (cached && nodes.every(n => cached[n.key])) nodes.forEach(n => { n.x = cached[n.key].x; n.y = cached[n.key].y; });
  else { settleLayout(nodes, links, ovl, W, H); NWS.layout.set(layoutId, Object.fromEntries(nodes.map(n => [n.key, { x: n.x, y: n.y }]))); }

  const box = document.createElement('div'); box.className = 'panel netpanel';
  const title = ovl ? layers.map(l => LAYER[l].name).join(' + ') : LAYER[layers[0]].name;
  const legend = ovl
    ? layers.map(l => `<span><i class="${l}" style="background:${LAYER[l].color};border-radius:${l === 'p' ? '50%' : l === 'j' ? '2px' : '0'};${l === 's' ? 'transform:rotate(45deg) scale(.85)' : ''}"></i>${LAYER[l].name}</span>`).join('') + '<span style="color:var(--ink3)">- - - links between layers</span>'
    : NET.groups[layers[0]].filter(g => nodes.some(n => n.group === g.id)).map(g => `<span><i style="background:${NET.groupColor(layers[0], g.id)}"></i>${esc(g.label)}</span>`).join('');
  box.innerHTML = `<header><h3 style="--c:${ovl ? 'var(--ink2)' : LAYER[layers[0]].color}">${ovl ? '' : `<i class="${layers[0]}"></i>`}${esc(title)}<span class="note" style="font-weight:400">${ovl ? 'overlapped' : nodes.length + ' nodes · ' + NET.E[layers[0]].length + ' links'}</span></h3>
    <span class="sub">${ovl ? 'metrics computed on the combined graph' : esc(LAYER[layers[0]].sub)}</span></header><div class="leg">${legend}</div><svg role="img" aria-label="${esc(title)} network"></svg>`;
  host.appendChild(box);

  const svg = d3.select(box.querySelector('svg')).attr('viewBox', `0 0 ${W} ${H}`);
  const field = SIZE_FIELD[NWS.size];
  const rOf = n => 5 + 13 * (ctx.m.get(n.key)[field] / ctx.max[field]);
  const gl = svg.append('g'), gn = svg.append('g');
  const defs = svg.insert('defs', ':first-child');
  defs.html(`<filter id="nsh-${id}" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#0b1220" flood-opacity=".28"/></filter>`);
  const linkSel = gl.selectAll('path').data(links).join('path').attr('class', d => 'nlink' + (d.cross ? ' cross' : ''))
    .attr('stroke-width', d => d.cross ? 0.8 : 0.5 + Math.min(d.w, 3) * 0.5).attr('stroke-opacity', d => d.cross ? 0.16 : Math.min(0.55, 0.14 + d.w * 0.14));
  const nodeSel = gn.selectAll('g').data(nodes).join('g').attr('class', 'nnode').attr('tabindex', 0).attr('role', 'button').attr('aria-label', d => d.label);
  // styled nodes: people = discs, use cases = rounded squares, skills = rounded diamonds; each with a soft shadow and a highlight
  nodeSel.each(function (d) {
    const g = d3.select(this), r = rOf(d), fill = ovl ? LAYER[d.type].color : NET.groupColor(d.type, d.group);
    if (d.type === 'p') {
      g.append('circle').attr('class', 'shape').attr('r', r).attr('fill', fill).attr('filter', `url(#nsh-${id})`);
      g.append('circle').attr('class', 'shine').attr('r', r * 0.4).attr('cx', -r * 0.3).attr('cy', -r * 0.34);
    } else if (d.type === 'j') {
      const sd = r * 1.75;
      g.append('rect').attr('class', 'shape').attr('x', -sd / 2).attr('y', -sd / 2).attr('width', sd).attr('height', sd).attr('rx', sd * 0.3).attr('fill', fill).attr('filter', `url(#nsh-${id})`);
      g.append('rect').attr('class', 'shine').attr('x', -sd * 0.34).attr('y', -sd * 0.36).attr('width', sd * 0.42).attr('height', sd * 0.22).attr('rx', sd * 0.11);
    } else {
      const sd = r * 1.5;
      g.append('rect').attr('class', 'shape').attr('x', -sd / 2).attr('y', -sd / 2).attr('width', sd).attr('height', sd).attr('rx', sd * 0.3).attr('transform', 'rotate(45)').attr('fill', fill).attr('filter', `url(#nsh-${id})`);
      g.append('circle').attr('class', 'shine').attr('r', r * 0.26).attr('cx', -r * 0.24).attr('cy', -r * 0.3);
    }
  });
  nodeSel.append('text').attr('class', 'nlabel').attr('text-anchor', 'middle');
  const top = new Set([...nodes].sort((a, b) => ctx.m.get(b.key)[field] - ctx.m.get(a.key)[field]).slice(0, ovl ? 8 : 4).map(n => n.key));
  const panel = { id, nodes, links, linkSel, nodeSel, top, rOf };

  const paint = () => {
    linkSel.attr('d', curvePath);
    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
  };
  paint();
  nodeSel.on('mouseenter', (e, d) => { NWS.hover = d.key; applyNetFocus(); renderNetInspector(); })
    .on('mouseleave', () => { NWS.hover = null; applyNetFocus(); renderNetInspector(); })
    .on('focus', (e, d) => { NWS.hover = d.key; applyNetFocus(); renderNetInspector(); })
    .on('blur', () => { NWS.hover = null; applyNetFocus(); renderNetInspector(); })
    .on('click', (e, d) => { NWS.pinned = NWS.pinned === d.key ? null : d.key; applyNetFocus(); renderNetInspector(); })
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NWS.pinned = NWS.pinned === d.key ? null : d.key; applyNetFocus(); renderNetInspector(); } });
  nodeSel.call(d3.drag()
    .on('drag', (e, d) => { d.x = Math.max(12, Math.min(W - 12, e.x)); d.y = Math.max(12, Math.min(H - 12, e.y)); paint(); })
    .on('end', () => { NWS.layout.set(layoutId, Object.fromEntries(nodes.map(n => [n.key, { x: n.x, y: n.y }]))); }));
  return panel;
}

function applyNetFocus() {
  const f = NWS.hover || NWS.pinned;
  const rel = new Set(); if (f) { rel.add(f); (NET.allAdj.get(f) || []).forEach(k => rel.add(k)); }
  NWS.panels.forEach(p => {
    const svg = p.nodeSel.node().ownerSVGElement;
    svg.classList.toggle('nfocus', !!f);
    p.nodeSel.classed('on', d => rel.has(d.key)).classed('sel', d => d.key === NWS.pinned);
    p.linkSel.classed('on', d => !!f && (d.s === f || d.t === f));
    p.nodeSel.select('text').attr('y', d => -p.rOf(d) - 4)
      .text(d => (p.top.has(d.key) || d.key === NWS.hover || d.key === NWS.pinned || (f && rel.has(f) && rel.has(d.key) && d.key !== f && (NET.adjOf(f).has(d.key)))) ? clip(d.label, 22) : '');
  });
}

function netIntro() {
  return `<div class="hint"><h3 style="margin-bottom:8px">Read the network</h3>
    <p>Bigger nodes score higher on the measure chosen above. Click any node to see its <b>network position</b>. In separate mode, selecting a node also lights up its linked nodes in the other panels.</p>
    <dl class="metric-help">
      <dt>Betweenness</dt><dd>How often a node sits on the fastest path between two others. High = if it disappears, groups lose contact.</dd>
      <dt>Structural holes</dt><dd>Gaps between a node's contacts who do not know each other. A node that spans many holes is a bridge. <b>Effective size</b> counts its non-redundant contacts; <b>constraint</b> is low when it spans holes and high when it is boxed into a clique.</dd>
      <dt>Roles</dt><dd>${Object.entries(ROLE_HELP).slice(0, 4).map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br>')}</dd>
    </dl></div>`;
}

function renderNetInspector() {
  const key = NWS.pinned || NWS.hover, insp = $('#insp-net');
  if (insp.dataset.k === (key || '') + '|' + NWS.mode + [...NWS.active].join('')) return;
  insp.dataset.k = (key || '') + '|' + NWS.mode + [...NWS.active].join('');
  insp.innerHTML = key ? inspectorHTML(key) : netIntro();
  wireJumps(insp, k => {
    if (k[0] === 'g') { showTab('layers'); LAY.pinned = k; renderLayers(); return; }
    NWS.active.add(k[0]); NWS.pinned = k; NWS.hover = null; renderNetworks();
  });
}

/* ------------------------------------------------------------ cards and table under the graphs */
function renderNetCards(act) {
  const cards = [];
  const nm = k => NET.info.get(k).label;
  for (const l of act) {
    const ctx = NET.metrics[l], all = [...ctx.m.values()].filter(v => v.deg > 0);
    const brokers = [...all].sort((a, b) => b.bet - a.bet).slice(0, 5);
    cards.push(`<div class="panel card"><h3>Top brokers · ${LAYER[l].name}</h3><p class="why">Highest betweenness: the nodes the network leans on most.</p>
      <div class="list">${brokers.map(v => `<div class="row"><span>${jump(v.key, nm(v.key))} <span class="note">${v.role}</span></span><span class="note">${Math.round(v.bet / ctx.max.bet * 100)}</span></div>`).join('')}</div></div>`);

    const seen = new Set(), holes = [];
    for (const v of [...all].sort((a, b) => b.bet - a.bet).slice(0, 8)) {
      for (const h of ctx.holes(v.key, 2).top) { const id = [h.a, h.b].sort().join('|'); if (!seen.has(id)) { seen.add(id); holes.push({ broker: v.key, ...h }); } }
    }
    holes.sort((a, b) => b.score - a.score);
    cards.push(`<div class="panel card"><h3>Structural holes · ${LAYER[l].name}</h3><p class="why">Unconnected pairs that only a broker links.</p>
      <div class="list">${holes.slice(0, 4).map(h => `<div class="row" style="display:block">${jump(h.broker, nm(h.broker))} <span class="note">bridges</span><br>${jump(h.a, nm(h.a))} <span class="arrow">↔</span> ${jump(h.b, nm(h.b))}</div>`).join('') || '<p class="note">No open holes.</p>'}</div></div>`);

    if (l === 'p') {
      const cross = NET.E.p.filter(e => People.get(e.a.slice(2)).org_unit_id !== People.get(e.b.slice(2)).org_unit_id);
      const never = [];
      for (let i = 0; i < D.org_units.length; i++) for (let k = i + 1; k < D.org_units.length; k++) {
        const a = D.org_units[i].id, b = D.org_units[k].id;
        if (!NET.E.p.some(e => { const x = People.get(e.a.slice(2)).org_unit_id, y = People.get(e.b.slice(2)).org_unit_id; return (x === a && y === b) || (x === b && y === a); })) never.push([a, b]);
      }
      cards.push(`<div class="panel card"><h3>Silo check · People</h3><p class="why">${never.length} of ${D.org_units.length * (D.org_units.length - 1) / 2} unit pairs share no project.</p>
        <div class="list">${never.slice(0, 5).map(([a, b]) => `<div class="row"><span>${esc(Units.get(a).name)} ↔ ${esc(Units.get(b).name)}</span></div>`).join('') || '<p class="note">Every unit pair collaborates.</p>'}</div>
        <div class="kv" style="margin-top:8px"><span>Cross-unit links</span><span class="r">${cross.length} of ${NET.E.p.length}</span></div><div class="bar" style="margin-top:6px"><i style="width:${Math.round(cross.length / Math.max(1, NET.E.p.length) * 100)}%"></i></div></div>`);
    } else if (l === 'j') {
      const shared = [...NET.E.j].filter(e => e.people.length).sort((a, b) => b.people.length - a.people.length).slice(0, 3);
      const iso = [...ctx.m.values()].filter(v => v.deg === 0);
      cards.push(`<div class="panel card"><h3>Hidden dependencies · Use cases</h3><p class="why">Projects competing for the same people.</p>
        <div class="list">${shared.map(e => `<div class="row" style="display:block">${jump(e.a, nm(e.a))} <span class="arrow">↔</span> ${jump(e.b, nm(e.b))}<br><span class="note">${e.people.length} shared: ${e.people.map(p => short(People.get(p).full_name)).join(', ')}</span></div>`).join('')}</div>
        ${iso.length ? `<p class="note" style="margin-top:8px">Isolated: ${iso.map(v => esc(nm(v.key))).join(', ')}</p>` : ''}</div>`);
    } else {
      const bridge = [...all].sort((a, b) => b.bet - a.bet).slice(0, 2), islands = all.filter(v => v.deg <= 2);
      cards.push(`<div class="panel card"><h3>Bridge skills · Skills</h3><p class="why">Skills that connect otherwise separate skill clusters.</p>
        <div class="list">${bridge.map(v => `<div class="row"><span>${jump(v.key, nm(v.key))}</span><span class="note">links ${v.deg} skills</span></div>`).join('')}</div>
        ${islands.length ? `<p class="note" style="margin-top:8px">Rare combinations (≤ 2 links): ${islands.map(v => esc(nm(v.key))).join(', ')}</p>` : ''}</div>`);
    }
  }
  if (act.length > 1) {
    const cctx = NET.combined(act), br = [...cctx.m.values()].sort((a, b) => b.bet - a.bet).slice(0, 6);
    cards.push(`<div class="panel card"><h3>Bridges across layers</h3><p class="why">Betweenness on the combined graph of ${act.map(l => LAYER[l].name).join(' + ')}.</p>
      <div class="list">${br.map(v => `<div class="row"><span>${jump(v.key, nm(v.key))} <span class="note">${LAYER[v.key[0]].name}</span></span><span class="note">${Math.round(v.bet / cctx.max.bet * 100)}</span></div>`).join('')}</div></div>`);
  }
  $('#net-cards').innerHTML = cards.join('');
  wireJumps($('#net-cards'), k => { NWS.active.add(k[0]); NWS.pinned = k; NWS.hover = null; renderNetworks(); });
}

function renderNetTable(act) {
  const rows = act.flatMap(l => { const ctx = NET.metrics[l]; return NET.nodes[l].map(n => { const m = ctx.m.get(n.key); return { key: n.key, name: n.label, layer: LAYER[l].name, bet: m.bet / ctx.max.bet * 100, es: m.es, constraint: m.constraint, deg: m.deg, holes: ctx.holes(n.key, 0).total, role: m.role }; }); });
  const { col, dir } = NWS.sort;
  rows.sort((a, b) => { const x = a[col], y = b[col]; return (typeof x === 'string' ? x.localeCompare(y) : (Number.isFinite(x) ? x : Infinity) - (Number.isFinite(y) ? y : Infinity)) * dir; });
  const cols = [['name', 'Node'], ['layer', 'Layer'], ['bet', 'Betweenness'], ['es', 'Eff. size'], ['constraint', 'Constraint'], ['deg', 'Contacts'], ['holes', 'Holes spanned'], ['role', 'Role']];
  $('#net-table').innerHTML = `<table class="mtable"><thead><tr>${cols.map(([c, l]) => `<th data-c="${c}" ${c === col ? `aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${c === col ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr><td>${jump(r.key, r.name)}</td><td>${r.layer}</td><td>${Math.round(r.bet)}</td><td>${r.es.toFixed(1)}</td><td>${fmt2(r.constraint)}</td><td>${r.deg}</td><td>${r.holes}</td><td>${r.role}</td></tr>`).join('')}</tbody></table>`;
  $$('#net-table th').forEach(th => th.addEventListener('click', () => { const c = th.dataset.c; NWS.sort = { col: c, dir: NWS.sort.col === c ? -NWS.sort.dir : (c === 'name' || c === 'layer' || c === 'role' || c === 'constraint' ? 1 : -1) }; renderNetTable(act); }));
  wireJumps($('#net-table'), k => { NWS.pinned = k; NWS.hover = null; applyNetFocus(); renderNetInspector(); window.scrollTo({ top: $('#net-panels').getBoundingClientRect().top + scrollY - 20, behavior: 'smooth' }); });
}

function renderNetworks() {
  const act = [...'pjs'].filter(l => NWS.active.has(l)), ovl = NWS.mode === 'ovl' && act.length > 1;
  for (const l of 'pjs') { $('#nl-' + l).setAttribute('aria-pressed', NWS.active.has(l)); $('#nc-' + l).textContent = NET.nodes[l].length; }
  $('#nm-sep').setAttribute('aria-pressed', !ovl); $('#nm-ovl').setAttribute('aria-pressed', ovl);
  for (const s of ['bet', 'sh', 'deg']) $('#sz-' + s).setAttribute('aria-pressed', NWS.size === s);
  const host = $('#net-panels'); host.innerHTML = '';
  host.className = 'net-panels ' + (ovl ? 'one' : 'n' + act.length);
  NWS.panels = ovl ? [drawPanel(host, 'ovl' + act.join(''), act, true)] : act.map(l => drawPanel(host, l, [l], false));
  $('#insp-net').dataset.k = '#';
  applyNetFocus(); renderNetInspector(); renderNetCards(act); renderNetTable(act);
}

function wireNetControls() {
  for (const l of 'pjs') $('#nl-' + l).addEventListener('click', () => {
    if (NWS.active.has(l)) { if (NWS.active.size > 1) NWS.active.delete(l); } else NWS.active.add(l);
    if (NWS.pinned && !NWS.active.has(NWS.pinned[0])) NWS.pinned = null;
    renderNetworks();
  });
  $('#nm-sep').addEventListener('click', () => { NWS.mode = 'sep'; renderNetworks(); });
  $('#nm-ovl').addEventListener('click', () => { NWS.mode = 'ovl'; renderNetworks(); });
  for (const s of ['bet', 'sh', 'deg']) $('#sz-' + s).addEventListener('click', () => { NWS.size = s; renderNetworks(); });
}
