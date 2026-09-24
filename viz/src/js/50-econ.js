/* ============================================================ view 4: portfolio economics */
const EC = { axis: 'eur', hl: null };
const VCOL = { under: 'var(--bad)', watch: 'var(--warn)', healthy: 'var(--ok)', novalue: 'var(--ink3)' };
const cxBars = cx => `<span class="cx" title="Complexity ${cx}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(cx) ? 'f' : ''}"></i>`).join('')}</span>`;
const cxCell = (cx, label) => `<span class="cxcell">${cxBars(cx)}<span class="cxl">${label}</span></span>`;

function econSuggestion(r) {
  if (r.verdict === 'novalue') return 'Stop it, or attach it to a goal and write a value case.';
  if (r.conf < 0.5) return `Validate the value case before spending more (confidence ${pct(r.conf)}).`;
  if (r.cx >= 3.5) return `Cut scope: complexity ${r.cx} for ${eur(r.adj)} of value.`;
  return `Shrink the team or stretch the timeline: ${r.fte.toFixed(1)} FTE for ${eur(r.adj)}/yr.`;
}

function renderEcon() {
  const all = [...ECON.values()], base = all.filter(r => !r.proposed);
  const totalFte = sum(base, r => r.fte), underFte = sum(base.filter(r => ['under', 'novalue'].includes(r.verdict)), r => r.fte);
  $('#econ-kpis').innerHTML = `
    <div class="panel kpi"><div class="n">${totalFte.toFixed(1)}</div><div class="l">FTE committed across ${base.length} projects</div></div>
    <div class="panel kpi"><div class="n">${eur(sum(base, r => r.cost))}</div><div class="l">total project cost (people × time × band rate)</div></div>
    <div class="panel kpi"><div class="n">${eur(sum(base, r => r.adj))}</div><div class="l">risk-adjusted annual value</div></div>
    <div class="panel kpi warn"><div class="n">${pct(underFte / totalFte)}</div><div class="l">of FTE sits on under-optimised or unvalued work (${underFte.toFixed(1)} FTE)</div></div>`;

  $('#ax-eur').setAttribute('aria-pressed', EC.axis === 'eur'); $('#ax-fte').setAttribute('aria-pressed', EC.axis === 'fte');
  const cnt = v => all.filter(r => r.verdict === v).length;
  $('#econ-legend').innerHTML = ['under', 'watch', 'healthy', 'novalue'].map(v => `<span style="display:inline-flex;gap:5px;align-items:center;color:var(--ink2)"><i style="width:10px;height:10px;border-radius:50%;background:${VCOL[v]};display:inline-block"></i>${VERDICT[v].label} ${cnt(v)}</span>`).join('') +
    `<span class="note">size = complexity · dashed = proposed</span>`;
  drawEconChart(all);

  const under = base.filter(r => ['under', 'novalue'].includes(r.verdict)).sort((a, b) => b.fte - a.fte);
  const share = v => sum(base.filter(r => r.verdict === v), r => r.fte) / totalFte;
  const best = [...base].filter(r => r.adj > 0).sort((a, b) => b.adj / b.fteMonths - a.adj / a.fteMonths).slice(0, 3);
  $('#econ-side').innerHTML = `
    <div class="panel card"><h3>Where the FTE go</h3><p class="why">Share of committed FTE by verdict.</p>
      <div class="stackbar">${['healthy', 'watch', 'under', 'novalue'].map(v => `<i class="sb-${v}" style="width:${share(v) * 100}%" title="${VERDICT[v].label}"></i>`).join('')}</div>
      <div class="list">${['healthy', 'watch', 'under', 'novalue'].map(v => `<div class="row"><span>${chip(VERDICT[v].label, VERDICT[v].cls)}</span><span class="note">${sum(base.filter(r => r.verdict === v), r => r.fte).toFixed(1)} FTE · ${pct(share(v))}</span></div>`).join('')}</div></div>
    <div class="panel card"><h3>Under-optimised: what to do</h3><p class="why">${under.length ? `${sum(under, r => r.fte).toFixed(1)} FTE could be redeployed to healthier work.` : 'Nothing to fix.'}</p>
      <div class="list">${under.map(r => `<div class="row" style="display:block">${jump('j:' + r.j.id, r.j.name)} <span class="note">${r.fte.toFixed(1)} FTE · ROI ${r.roi.toFixed(1)}×</span><br><span class="note">${esc(econSuggestion(r))}</span></div>`).join('')}</div></div>
    <div class="panel card"><h3>Best value per FTE-month</h3><p class="why">Where an extra person-month returns the most.</p>
      <div class="list">${best.map(r => `<div class="row"><span>${jump('j:' + r.j.id, r.j.name)}</span><span class="note">${eur(r.adj / r.fteMonths)} / FTE-month</span></div>`).join('')}</div></div>`;
  wireJumps($('#econ-side'), k => { showTab('layers'); LAY.pinned = k; renderLayers(); });

  const sorted = [...all].sort((a, b) => VERDICT[a.verdict].rank - VERDICT[b.verdict].rank || a.roi - b.roi);
  $('#econ-table').innerHTML = `<table class="etable"><thead><tr><th>Use case</th><th>FTE</th><th>Months</th><th>Skill sets</th><th class="cxtd">Complexity</th><th>Cost</th><th>Value / yr (risk-adj.)</th><th>ROI</th><th>Payback</th><th>Verdict</th></tr></thead><tbody>
    ${sorted.map(r => `<tr data-id="${r.j.id}" class="${EC.hl === r.j.id ? 'hl' : ''}"><td>${jump('j:' + r.j.id, r.j.name)}${r.proposed ? ' ' + chip('proposed', 'warn') : ''}<small>${r.fteHire ? `${r.fteInt.toFixed(1)} internal + ${r.fteHire.toFixed(1)} hire` : `${get(membersOfProject, r.j.id).length} people`}${r.j.value_basis ? ' · ' + esc(clip(r.j.value_basis, 46)) : ''}</small></td>
      <td>${r.fte.toFixed(1)}</td><td>${r.months.toFixed(1)}</td><td>${r.nSkills}</td><td class="cxtd">${cxCell(r.cx, r.label)}</td><td>${eur(r.cost)}</td><td>${r.value ? `${eur(r.adj)} <span class="note">of ${eur(r.value)}</span>` : '–'}</td>
      <td>${r.value ? r.roi.toFixed(1) + '×' : '–'}</td><td>${Number.isFinite(r.payback) ? r.payback.toFixed(0) + ' mo' : '–'}</td><td>${chip(VERDICT[r.verdict].label, VERDICT[r.verdict].cls)}</td></tr>`).join('')}</tbody></table>`;
  wireJumps($('#econ-table'), k => { showTab('layers'); LAY.pinned = k; renderLayers(); });
  $$('#econ-table tbody tr').forEach(tr => {
    tr.addEventListener('mouseenter', () => setEconHl(tr.dataset.id)); tr.addEventListener('mouseleave', () => setEconHl(null));
  });
  $('#econ-note').innerHTML = `Cost uses blended rates per seniority band (${D.cost_band.map(b => `${esc(b.name)} ${eur(b.eur_per_fte_month)}`).join(' · ')} per FTE-month, illustrative). <b>Complexity</b> = mean of three 1–5 scores: <i>breadth</i> (number of skill sets), <i>duration</i> and <i>depth</i> (average required level). <b>ROI</b> = risk-adjusted annual value ÷ cost. Under ${ROI_UNDER}× is under-optimised; ${ROI_UNDER}–${ROI_HEALTHY}× is a watch; above is healthy. All values are synthetic.`;
}

function setEconHl(id) {
  EC.hl = id;
  $$('#svg-econ .bub').forEach(c => c.classList.toggle('hl', c.dataset.id === id));
  $$('#econ-table tbody tr').forEach(tr => tr.classList.toggle('hl', tr.dataset.id === id));
}

function drawEconChart(all) {
  const svg = $('#svg-econ'), W = 640, H = 470, M = { l: 58, r: 18, t: 16, b: 48 };
  const fx = r => EC.axis === 'eur' ? r.cost / 1e3 : r.fteMonths, fy = r => r.adj / 1e3;
  const x = d3.scaleLinear().domain([0, d3.max(all, fx) * 1.08]).nice().range([M.l, W - M.r]);
  const y = d3.scaleLinear().domain([0, d3.max(all, fy) * 1.1]).nice().range([H - M.b, M.t]);
  const [xm, ym] = [x.domain()[1], y.domain()[1]];
  let s = `<defs><clipPath id="plotclip"><rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/></clipPath></defs>`;
  if (EC.axis === 'eur') {
    const X = xm * 10, P = (a, b) => `${x(a)},${y(b)}`;
    s += `<g clip-path="url(#plotclip)"><polygon class="zone-watch" points="${P(0, 0)} ${P(X, ROI_UNDER * X)} ${P(X, ROI_HEALTHY * X)}"/><polygon class="zone-under" points="${P(0, 0)} ${P(X, 0)} ${P(X, ROI_UNDER * X)}"/>
      <line class="refline" x1="${x(0)}" y1="${y(0)}" x2="${x(X)}" y2="${y(ROI_UNDER * X)}"/><line class="refline" x1="${x(0)}" y1="${y(0)}" x2="${x(X)}" y2="${y(ROI_HEALTHY * X)}"/></g>`;
    const lx = xm * 0.97; // labels along the lines, inside the plot
    for (const [k, t] of [[ROI_UNDER, `ROI ${ROI_UNDER}×`], [ROI_HEALTHY, `ROI ${ROI_HEALTHY}×`]]) {
      const yy = Math.min(ym * 0.97, k * lx), xx = yy / k;
      s += `<text class="reflbl" x="${x(xx) - 4}" y="${y(yy) - 5}" text-anchor="end">${t}</text>`;
    }
  }
  s += `<g class="axis">${x.ticks(6).map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${M.t}" y2="${H - M.b}" opacity=".35"/><text x="${x(t)}" y="${H - M.b + 16}" text-anchor="middle">${t}</text>`).join('')}
    ${y.ticks(6).map(t => `<line y1="${y(t)}" y2="${y(t)}" x1="${M.l}" x2="${W - M.r}" opacity=".35"/><text x="${M.l - 8}" y="${y(t) + 3}" text-anchor="end">${t}</text>`).join('')}
    <text x="${(M.l + W - M.r) / 2}" y="${H - 8}" text-anchor="middle">${EC.axis === 'eur' ? 'Cost (€k, people × time × band rate)' : 'Effort (FTE-months)'}</text>
    <text transform="translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">Risk-adjusted annual value (€k)</text></g>`;
  const rad = r => 5 + r.cx * 3;
  const pts = all.map(r => ({ r, px: x(fx(r)), py: y(fy(r)), rad: rad(r) }));
  s += pts.map(p => `<circle class="bub ${p.r.proposed ? 'proposed' : ''}" data-id="${p.r.j.id}" cx="${p.px}" cy="${p.py}" r="${p.rad}" fill="${VCOL[p.r.verdict]}"><title>${esc(p.r.j.name)}: ${p.r.fte.toFixed(1)} FTE, ${p.r.months.toFixed(1)} months, ${p.r.nSkills} skill sets, complexity ${p.r.cx}, cost ${eur(p.r.cost)}, value ${eur(p.r.adj)}</title></circle>`).join('');
  // labels with simple collision avoidance
  const boxes = [], hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const circles = pts.map(p => ({ x0: p.px - p.rad, x1: p.px + p.rad, y0: p.py - p.rad, y1: p.py + p.rad }));
  for (const p of [...pts].sort((a, b) => a.py - b.py)) {
    const txt = clip(p.r.j.name, 24), w = txt.length * 5.7 + 4, h = 12, o = p.rad + 4;
    const opts = [[p.px + o, p.py + 4, 'start', p.px + o, p.px + o + w], [p.px - o, p.py + 4, 'end', p.px - o - w, p.px - o], [p.px - w / 2, p.py - o - 2, 'middle', p.px - w / 2, p.px + w / 2], [p.px - w / 2, p.py + o + 11, 'middle', p.px - w / 2, p.px + w / 2]];
    let pick = opts.find(([tx, ty, , a, b]) => { const bx = { x0: a, x1: b, y0: ty - h + 2, y1: ty + 3 }; return a > M.l && b < W - 4 && ty > M.t + 8 && ty < H - M.b - 2 && !boxes.some(q => hit(bx, q)) && !circles.some(q => hit(bx, q)); }) || opts[0];
    boxes.push({ x0: pick[3], x1: pick[4], y0: pick[1] - h + 2, y1: pick[1] + 3 });
    s += `<text class="blabel" x="${pick[0]}" y="${pick[1]}" text-anchor="${pick[2]}">${esc(txt)}</text>`;
  }
  svg.innerHTML = s;
  $$('#svg-econ .bub').forEach(c => {
    c.addEventListener('mouseenter', () => setEconHl(c.dataset.id)); c.addEventListener('mouseleave', () => setEconHl(null));
    c.addEventListener('click', () => { showTab('layers'); LAY.pinned = 'j:' + c.dataset.id; renderLayers(); });
  });
}

function wireEconControls() {
  $('#ax-eur').addEventListener('click', () => { EC.axis = 'eur'; renderEcon(); });
  $('#ax-fte').addEventListener('click', () => { EC.axis = 'fte'; renderEcon(); });
}
