/* ============================================================ wiring */
const TABS = ['layers', 'net', 'gaps', 'econ', 'leaver', 'onboard', 'usecase', 'jira'];
const PRISTINE = JSON.stringify(RAW0);
const STARTED = {};

function showTab(name) {
  TABS.forEach(t => { $('#v-' + t).hidden = t !== name; $('#t-' + t).setAttribute('aria-selected', t === name); });
  if (name === 'onboard' && !STARTED.ob) { STARTED.ob = true; obStart(); }
  if (name === 'usecase' && !STARTED.uc) { STARTED.uc = true; ucStart(); }
}

function updateDemoNote() {
  const modified = D.person.length !== 36 || D.project.length !== 12 || JR.applied;
  $('#demo-note').innerHTML = `Synthetic demo · ${esc(D.tenant[0].name.replace(' (synthetic demo)', ''))} · ${D.people.length} people · ${D.projects.length} projects · ${D.skills.length} skills${modified ? ' · <button class="link" id="reset-demo" type="button">Reset demo data</button>' : ''}`;
  const r = $('#reset-demo'); if (r) r.addEventListener('click', () => { resetData(); if (STARTED.ob) obStart(); if (STARTED.uc) ucStart(); });
}

/* every derived view is rebuilt from D, so a saved onboarding or an added use case shows up everywhere */
function refreshAll() {
  buildIndexes(); NET = buildNet(); NWS.layout.clear();
  buildLayers(); renderNetworks(); renderGaps(); renderEcon(); fillLeaverPicker(); renderJira(); updateDemoNote();
}
function resetData() { setData(JSON.parse(PRISTINE)); JR.applied = null; JR.selected = null; JR.project = 'prj_cloud_migration'; UC.jira = null; refreshAll(); }

/* look: Studio (default) or Modern. The attribute is set before first paint by an inline script; this wires the switch. */
function applySkin(s, save) {
  document.documentElement.dataset.skin = s;
  $$('.skin button').forEach(b => b.setAttribute('aria-pressed', b.dataset.skin === s));
  if (save) { try { localStorage.setItem('maieutica-skin', s); } catch (e) { /* storage blocked */ } }
}
function wireSkin() {
  $$('.skin button').forEach(b => b.addEventListener('click', () => applySkin(b.dataset.skin, true)));
  applySkin(document.documentElement.dataset.skin || 'studio', false);
}

function init() {
  setData(JSON.parse(PRISTINE)); NET = buildNet();
  wireNetControls(); wireEconControls(); wireJiraControls(); wireSkin();
  $('#leaver-pick').addEventListener('change', e => renderLeaver(e.target.value));
  $('#uc-form').addEventListener('submit', e => { e.preventDefault(); const t = $('#uc-text'), v = t.value; t.value = ''; ucHandle(v); });
  TABS.forEach(t => $('#t-' + t).addEventListener('click', () => { showTab(t); try { history.replaceState(null, '', '#' + t); } catch (e) { /* sandboxed */ } }));
  buildLayers(); renderNetworks(); renderGaps(); renderEcon(); fillLeaverPicker(); renderJira(); updateDemoNote();
  const h = (location.hash || '').slice(1); if (TABS.includes(h)) showTab(h);
}
init();
