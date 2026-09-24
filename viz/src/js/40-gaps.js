/* ============================================================ view 3: gaps & alignment */
function renderGaps() {
  const crit = D.skills.filter(s => SS.get(s.id).status === 'critical');
  const orphans = D.projects.filter(j => live(j.id) && !get(goalsOfProject, j.id).length);
  const full = D.people.filter(p => loadOf(p.id) >= 100);
  const exposures = objectives.map(g => ({ g, ...goalExposure(g.id) })).sort((a, b) => b.pct - a.pct);

  $('#findings').innerHTML = `
    <div class="panel card"><h3>Single points of failure</h3><p class="why">Two or more live projects need each of these, and only one or two people can do them.</p>
      <div class="list">${crit.map(s => { const st = SS.get(s.id), who = st.experts[0]; return `<div class="row"><span><b>${esc(s.name)}</b> <span class="note">only ${esc(who ? People.get(who.person_id).full_name : 'nobody')}</span></span><span class="note">${st.demand} projects</span></div>`; }).join('') || '<p class="note">None.</p>'}</div></div>
    <div class="panel card"><h3>Goals resting on fragile skills</h3><p class="why">Share of required skills that are thin or single-expert.</p>
      ${exposures.map(x => `<div class="gbar"><span>${esc(x.g.name)}</span><span class="pct">${Math.round(x.pct * 100)}%</span><div class="bar ${x.pct > 0.35 ? 'bad' : x.pct > 0.2 ? 'warn' : ''}"><i style="width:${Math.round(x.pct * 100)}%"></i></div></div>`).join('')}</div>
    <div class="panel card"><h3>Work with no strategic home</h3><p class="why">Live projects that serve none of the goals.</p>
      <div class="list">${orphans.map(j => { const m = get(membersOfProject, j.id); return `<div class="row"><span><b>${esc(j.name)}</b></span><span class="note">${m.length} people · ${(sum(m, x => x.allocation_pct) / 100).toFixed(1)} FTE</span></div>`; }).join('') || '<p class="note">Everything maps to a goal.</p>'}</div></div>
    <div class="panel card"><h3>No slack</h3><p class="why">At 100% or more of their time. Any new ask lands on someone already full.</p>
      <div class="list">${full.map(p => `<div class="row"><span>${esc(p.full_name)}</span><span class="note">${loadOf(p.id)}%</span></div>`).join('') || '<p class="note">Nobody is fully booked.</p>'}</div></div>`;

  const rows = [...D.skills].sort((a, b) => STATUS[SS.get(a.id).status].rank - STATUS[SS.get(b.id).status].rank || SS.get(b.id).demand - SS.get(a.id).demand || a.name.localeCompare(b.name));
  $('#skillrows').innerHTML = rows.map(s => {
    const st = SS.get(s.id), S = STATUS[st.status];
    return `<div class="skillrow"><div class="nm">${esc(s.name)}<small>${esc(s.category)}</small></div>
      <div class="sqs">${st.holders.length ? st.holders.map(e => `<i class="sq l${e.level}" title="${esc(People.get(e.person_id).full_name)} · ${LEVEL[e.level]}"></i>`).join('') : '<span class="empty">nobody at level 3+</span>'}</div>
      <div class="note">${st.demand ? st.needing.map(n => esc(pname(n.project_id))).join(', ') : '<span class="empty">no live project</span>'}</div>
      <div><span class="chip ${S.cls}">${S.label}</span></div></div>`;
  }).join('');
}
