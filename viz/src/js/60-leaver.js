/* ============================================================ view 5: if someone leaves */
function leaverModel(L) {
  const me = People.get(L), key = 'p:' + L;
  const lsk = get(skillsOfPerson, L).filter(e => e.level >= 3).sort((a, b) => b.level - a.level);
  const lproj = get(projectsOfPerson, L).filter(e => Projects.get(e.project_id).status !== 'proposed');
  const w = new Map(lsk.map(e => [e.skill_id, e.level * (1 + lproj.filter(pp => get(needsOfProject, pp.project_id).some(n => n.skill_id === e.skill_id)).length)]));
  const totalW = sum([...w.values()], x => x);
  const nbrs = k => new Set([...NET.adjOf(k).keys()].map(x => x.slice(2)));
  const collabs = nbrs(key);
  const cands = D.people.filter(p => p.id !== L).map(p => {
    let got = 0; const missing = [];
    for (const e of lsk) {
      const c = levelOf(p.id, e.skill_id);
      got += w.get(e.skill_id) * Math.min(c, e.level) / e.level;
      if (c < e.level) missing.push({ sid: e.skill_id, need: e.level, have: c });
    }
    const nb = nbrs('p:' + p.id), known = [...collabs].filter(x => x === p.id || nb.has(x)).length;
    const skillFit = totalW ? got / totalW : 0, netFit = collabs.size ? known / collabs.size : 0;
    return { p, skillFit, netFit, score: 0.7 * skillFit + 0.3 * netFit, free: Math.max(0, 100 - loadOf(p.id)), missing };
  }).sort((a, b) => b.score - a.score);
  const lastExpert = lsk.map(e => {
    const others = get(holdersOfSkill, e.skill_id).filter(x => x.person_id !== L).sort((a, b) => b.level - a.level);
    return { e, others, remainingExperts: others.filter(x => x.level >= 4).length, next: others[0] };
  }).filter(x => x.e.level >= 4 && x.remainingExperts === 0);
  return { me, lsk, lproj, cands, lastExpert, collabs };
}

function renderLeaver(L) {
  const m = leaverModel(L), me = m.me, unit = Units.get(me.org_unit_id).name;
  const leads = m.lproj.filter(e => /lead/i.test(e.role)), others = m.lproj.filter(e => !/lead/i.test(e.role));
  const top = m.cands[0], key = 'p:' + L, pm = NET.metrics.p.m.get(key), holes = NET.metrics.p.holes(key, 2);
  const collabsSorted = [...m.collabs].sort((a, b) => NET.adjOf(key).get('p:' + b) - NET.adjOf(key).get('p:' + a));
  const units = new Set([...m.collabs].map(c => People.get(c).org_unit_id));
  const alloc = loadOf(L), nm = k => NET.info.get(k).label;
  const goalsHit = [...new Set(m.lproj.flatMap(e => get(goalsOfProject, e.project_id).map(g => g.goal_id)))];
  const must = m.lsk.filter(e => e.level >= 4), nice = m.lsk.filter(e => e.level === 3);
  const usedOn = sid => m.lproj.filter(pp => get(needsOfProject, pp.project_id).some(n => n.skill_id === sid)).map(pp => pname(pp.project_id));
  const sh = s => `<h4 style="font-family:var(--font-mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);font-weight:500;margin:16px 0 6px">${s}</h4>`;

  const verdict = top.skillFit >= 0.75
    ? `<b>An internal move is realistic.</b> ${esc(top.p.full_name)} already covers ${Math.round(top.skillFit * 100)}% of what ${esc(short(me.full_name))} does${top.missing.length ? `; plan upskilling on ${top.missing.slice(0, 3).map(x => esc(Skills.get(x.sid).name)).join(', ')}` : ''}.${top.free < 30 ? ` But they have only ${top.free}% free time, so the real problem is who backfills <i>their</i> work.` : ''}`
    : `<b>Plan an external hire.</b> The best internal match, ${esc(top.p.full_name)}, covers ${Math.round(top.skillFit * 100)}% of the role. The gap is mostly ${top.missing.slice(0, 3).map(x => esc(Skills.get(x.sid).name)).join(', ')}.`;

  $('#leaver-out').innerHTML = `
  <div class="stack">
    <div class="panel block"><h3>What breaks</h3><p class="why">${esc(me.full_name)} · ${esc(me.title)} · ${esc(unit)}</p>
      <div class="kv" style="margin-bottom:12px"><span>Projects touched</span><span class="r">${m.lproj.length}</span><span>Time allocated</span><span class="r">${alloc}%</span><span>Direct collaborators</span><span class="r">${m.collabs.size} in ${units.size} units</span><span>Broker rank</span><span class="r">#${pm.rankBet} of ${D.people.length} · ${pm.role}</span><span>Structural holes bridged</span><span class="r">${holes.total}</span></div>
      <table class="tbl"><thead><tr><th>Project</th><th>Role</th><th>Share</th></tr></thead><tbody>
      ${m.lproj.map(e => `<tr><td>${esc(pname(e.project_id))}</td><td>${esc(e.role)}</td><td>${e.allocation_pct}%</td></tr>`).join('')}</tbody></table>
      ${m.lastExpert.length ? `${sh('Last expert standing')}<table class="tbl"><thead><tr><th>Skill</th><th>Their level</th><th>Best remaining</th></tr></thead><tbody>
      ${m.lastExpert.map(x => `<tr><td>${esc(Skills.get(x.e.skill_id).name)}</td><td>${LEVEL[x.e.level]}</td><td>${x.next ? `${esc(People.get(x.next.person_id).full_name)} <span class="note">(${LEVEL[x.next.level]})</span>` : chip('nobody', 'bad')}</td></tr>`).join('')}</tbody></table>` : '<p class="note" style="margin-top:12px">Every skill they hold at level 4+ has another expert. Low knowledge risk.</p>'}
      ${holes.total ? `${sh('Collaboration gaps that open')}<p class="note" style="margin-bottom:6px">They are the only link between these pairs:</p><div class="list">${holes.top.map(h => `<div class="row"><span>${esc(nm(h.a))} <span class="arrow">↔</span> ${esc(nm(h.b))}</span></div>`).join('')}</div>` : ''}
    </div>
    <div class="panel block"><h3>Internal successors</h3><p class="why">Ranked by skill fit (70%) and how many of their collaborators the candidate already works with (30%). Free capacity is shown, not scored.</p>
      ${m.cands.slice(0, 5).map(c => `<div class="cand"><div class="who">${esc(c.p.full_name)}<small>${esc(c.p.title)}</small></div><div class="score">${Math.round(c.score * 100)}</div>
        <div class="meta"><span class="chip">skills ${Math.round(c.skillFit * 100)}%</span><span class="chip">network ${Math.round(c.netFit * 100)}%</span><span class="chip ${c.free < 20 ? 'bad' : c.free < 40 ? 'warn' : 'ok'}">${c.free}% free</span>
        ${c.missing.slice(0, 3).map(x => `<span class="chip warn">${esc(Skills.get(x.sid).name)} ${x.have}→${x.need}</span>`).join('')}</div></div>`).join('')}
    </div>
  </div>
  <div class="stack">
    <div class="panel jd"><div class="eyebrow">Draft role profile · generated from what they actually do</div>
      <h3>${esc(me.title)}</h3><p style="color:var(--ink2)">${esc(unit)}${me.manager_id ? ' · reports to ' + esc(People.get(me.manager_id).full_name) : ''}</p>
      <h4>Why this role exists</h4>
      <p>${leads.length ? `Leads ${leads.map(e => `<b>${esc(pname(e.project_id))}</b>`).join(' and ')}` : 'Contributes across live projects'}${others.length ? `${leads.length ? ', and contributes to ' : ': '}${others.map(e => `${esc(pname(e.project_id))} (${esc(e.role.toLowerCase())})`).join(', ')}` : ''}. ${goalsHit.length ? `This work supports ${goalsHit.map(g => `“${esc(Goals.get(g).name)}”`).join(' and ')}.` : ''}</p>
      <h4>Must have</h4><ul>${must.map(e => `<li><b>${esc(Skills.get(e.skill_id).name)}</b>, ${LEVEL[e.level].toLowerCase()} level${usedOn(e.skill_id).length ? `; used on ${usedOn(e.skill_id).map(esc).join(', ')}` : ''}</li>`).join('') || '<li>No skill above working level was recorded.</li>'}</ul>
      ${nice.length ? `<h4>Nice to have</h4><ul>${nice.map(e => `<li>${esc(Skills.get(e.skill_id).name)}, working level</li>`).join('')}</ul>` : ''}
      <h4>Works closely with</h4><ul>${collabsSorted.slice(0, 5).map(c => `<li>${esc(People.get(c).full_name)}, ${esc(People.get(c).title)}</li>`).join('') || '<li>No collaborators yet.</li>'}</ul>
      <h4>Typical time split</h4><p>${m.lproj.map(e => `${esc(pname(e.project_id))} ${e.allocation_pct}%`).join(' · ') || 'Not allocated to a project.'}${alloc < 100 ? ` · other duties ${100 - alloc}%` : ''}</p>
      <p class="note" style="margin-top:16px">In the product, Claude turns this structured profile into prose and asks the manager to confirm before anything is posted.</p>
    </div>
    <div class="verdict">${verdict}</div>
  </div>`;
}

function fillLeaverPicker() {
  const sel = $('#leaver-pick'), cur = sel.value || 'per_01';
  sel.innerHTML = [...D.people].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(p => `<option value="${p.id}">${esc(p.full_name)} · ${esc(p.title)}</option>`).join('');
  sel.value = People.has(cur) ? cur : 'per_01';
  renderLeaver(sel.value);
}
