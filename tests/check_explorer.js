// Drives the built explorer in headless Chrome: opens every tab, exercises the main flows, fails on any JS error.
// Run: node tests/check_explorer.js
const { launch, sleep } = require('../scripts/cdp.js');
const ROOT = require('path').resolve(__dirname, '..');
const URL = 'file://' + ROOT + '/viz/maieutica-explorer.html';
const fail = [];
const expect = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fail.push(name); };

(async () => {
  const b = await launch({ width: 1440, height: 1000, url: URL + '?fast#layers' });
  await b.waitFor('document.querySelectorAll("#svg-layers .node").length > 50');
  expect('layers: nodes and edges drawn', await b.eval('document.querySelectorAll("#svg-layers .node").length') === 79 && await b.eval('document.querySelectorAll("#svg-layers .edge").length') > 150);

  // networks
  await b.click('#t-net');
  expect('networks: three separate panels', await b.eval('document.querySelectorAll("#net-panels .netpanel").length') === 3);
  expect('networks: nodes per panel 36/12/27', JSON.stringify(await b.eval('[...document.querySelectorAll("#net-panels .netpanel")].map(p => p.querySelectorAll(".nnode").length)')) === '[36,12,27]');
  await b.click('#nm-ovl');
  expect('networks: overlap gives one panel with 75 nodes', await b.eval('document.querySelectorAll("#net-panels .netpanel").length') === 1 && await b.eval('document.querySelectorAll("#net-panels .nnode").length') === 75);
  expect('networks: cross-layer links drawn when overlapped', await b.eval('document.querySelectorAll("#net-panels .nlink.cross").length') > 100);
  await b.click('#nl-s'); await b.click('#nl-j');
  expect('networks: toggling layers leaves people only', await b.eval('document.querySelectorAll("#net-panels .nnode").length') === 36);
  await b.click('#nl-j'); await b.click('#nl-s'); await b.click('#nm-sep');
  await b.click('#net-panels .nnode:nth-child(1)');
  const insp = await b.eval('document.querySelector("#insp-net").innerText');
  expect('networks: inspector shows betweenness + structural holes', /Betweenness/.test(insp) && /Effective size/.test(insp) && /Constraint/.test(insp));
  const metrics = await b.eval('(() => { const m = NET.metrics.p.m; const top = [...m.values()].sort((a,b) => b.bet - a.bet)[0]; return { top: top.key, bet: top.bet, es: top.es, c: top.constraint, ok: [...m.values()].every(v => v.bet >= 0 && v.bet <= 1 && (v.deg === 0 || (v.constraint > 0 && v.es > 0))) }; })()');
  expect('metrics: values in range', metrics.ok, JSON.stringify(metrics));
  // sanity on a known small graph: path a-b-c => b has betweenness 1 (normalised), constraint 0.5
  const tiny = await b.eval('(() => { const g = graphMetrics(["a","b","c"], [{a:"a",b:"b",w:1},{a:"b",b:"c",w:1}]); const m = g.m.get("b"); return { bet: m.bet, es: m.es, c: m.constraint, holes: g.holes("b").total }; })()');
  expect('metrics: path graph centre = full betweenness, 1 hole, effective size 2', Math.abs(tiny.bet - 1) < 1e-9 && tiny.es === 2 && tiny.holes === 1 && Math.abs(tiny.c - 0.5) < 1e-9, JSON.stringify(tiny));
  const tri = await b.eval('(() => { const g = graphMetrics(["a","b","c"], [{a:"a",b:"b",w:1},{a:"b",b:"c",w:1},{a:"a",b:"c",w:1}]); const m = g.m.get("a"); return { bet: m.bet, es: m.es, holes: g.holes("a").total }; })()');
  expect('metrics: triangle has no brokerage (0 betweenness, no holes, effective size 1)', tri.bet === 0 && tri.es === 1 && tri.holes === 0, JSON.stringify(tri));

  // gaps + economics
  await b.click('#t-gaps');
  expect('gaps: exactly 3 single points of failure', (await b.eval('document.querySelectorAll("#skillrows .chip.bad").length')) === 3);
  await b.click('#t-econ');
  expect('econ: 12 bubbles and 12 table rows', await b.eval('document.querySelectorAll("#svg-econ .bub").length') === 12 && await b.eval('document.querySelectorAll("#econ-table tbody tr").length') === 12);
  const verdicts = await b.eval('JSON.stringify([...ECON.values()].filter(r => r.verdict === "under" || r.verdict === "novalue").map(r => r.j.name).sort())');
  expect('econ: under-optimised = Finance Close, Hackathon, Mobile App, Warehouse', verdicts === JSON.stringify(['Finance Close Automation', 'Hackathon Tooling', 'Mobile Driver App', 'Warehouse Automation Pilot']), verdicts);
  await b.click('#ax-fte'); expect('econ: axis toggle redraws', await b.eval('document.querySelectorAll("#svg-econ .bub").length') === 12);

  // leaver
  await b.click('#t-leaver');
  expect('leaver: default is Marta with a successor list', await b.eval('document.querySelectorAll("#leaver-out .cand").length') === 5);

  // onboarding
  await b.click('#t-onboard');
  await b.waitFor('document.querySelector("#ob-sample")');
  const before = await b.eval('D.person.length + "/" + SS.get("skl_gdpr_compliance").status');
  await b.click('#ob-sample');
  await b.waitFor('document.querySelector("#ob-continue")');
  const claims = await b.eval('JSON.stringify(OB.claims.map(c => [Skills.get(c.sid).name, c.level]))');
  expect('onboarding: CV read into >= 6 claims incl. GDPR + Cybersecurity at Advanced', JSON.parse(claims).length >= 6 && /GDPR & Compliance",4/.test(claims) && /Cybersecurity",4/.test(claims), claims);
  expect('onboarding: AWS "basics" capped at Basic', /AWS",2/.test(claims), claims);
  await b.click('#ob-continue');
  await b.waitFor('document.querySelector("#ob-q1a")'); await b.click('#ob-q1a');
  await b.waitFor('document.querySelector("#ob-done")'); await b.click('#ob-done');
  await b.waitFor('document.querySelector("#ob-done")'); await b.click('#ob-done');
  await b.waitFor('document.querySelector("#ob-save")'); await b.click('#ob-save');
  await b.waitFor('OB.saved === true');
  const after = await b.eval('D.person.length + "/" + SS.get("skl_gdpr_compliance").status');
  expect('onboarding: person added and GDPR risk improves', before === '36/critical' && after.startsWith('37/') && after !== '37/critical', before + ' -> ' + after);
  expect('onboarding: evidence rows recorded', await b.eval('D.evidence.length') >= 6);
  expect('onboarding: new person is in the network view', await b.eval('NET.nodes.p.length') === 37);

  // use-case advisor
  await b.click('#t-usecase');
  await b.waitFor('document.querySelectorAll("#uc-quick .qbtn").length >= 5');
  await b.eval('ucHandle("Zero-downtime multi-region platform")');
  await b.waitFor('UC.tpl && !UC.busy');
  const uc = await b.eval('JSON.stringify({ team: UC.team.length, hires: UC.hires.map(h => h.role), n: (({roi, cost}) => ({roi, cost}))(ucNumbers()) })');
  expect('advisor: multi-region needs an SRE hire (Kubernetes 5 is unavailable)', /Site Reliability Engineer/.test(uc), uc);
  await b.eval('ucHandle("Predict churn for our top accounts")'); await b.waitFor('UC.tpl && UC.tpl.id === "churn" && !UC.busy');
  const churn = await b.eval('JSON.stringify({ team: UC.team.map(m => m.pid + ":" + m.alloc), hires: UC.hires.length, fte: ucNumbers().fte })');
  expect('advisor: churn team is built', JSON.parse(churn).team.length >= 3, churn);
  await b.click('#uc-add');
  await b.waitFor('UC.added');
  expect('advisor: added use case appears in economics as proposed', await b.eval('D.projects.some(p => p.status === "proposed") && ECON.size === 13 && document.querySelectorAll("#svg-econ .bub.proposed").length === 1'));
  expect('advisor: proposals do not consume capacity', await b.eval('loadOf("per_11") === 40'));
  await b.eval('ucHandle("something about gardening")'); await b.waitFor('!UC.busy');
  expect('advisor: unknown idea is handled gracefully', await b.eval('!UC.tpl'));

  // Jira / Kanban (start from pristine data: earlier tests onboarded a person and added a use case)
  await b.eval('resetData()');
  const summary = JSON.parse(require('fs').readFileSync(ROOT + '/data/sample/jira_summary.json', 'utf8'));
  await b.click('#t-jira');
  const boardN = await b.eval('document.querySelectorAll("#jr-board .tk").length'), expectN = await b.eval('WI.filter(w => w.item_type !== "Epic" && w.project_id === "prj_cloud_migration").length');
  expect('jira: board renders every Cloud Migration ticket in four columns', boardN === expectN && boardN > 10 && await b.eval('document.querySelectorAll("#jr-board .col").length') === 4, boardN + ' cards');
  expect('jira: JS and Python agree on observed allocation (parity)', await b.eval('[...observedMap().values()].reduce((a, b) => a + b, 0)') === summary.observed_sum_pct && await b.eval('observedMap().size') === summary.observed_pairs);
  const props = await b.eval('(() => { const p = evidenceProps(); return { raise: p.filter(x => x.kind === "raise").length, nw: p.filter(x => x.kind === "new").length }; })()');
  expect('jira: JS and Python agree on evidence proposals (parity)', props.raise === summary.evidence.raise && props.nw === summary.evidence.new, JSON.stringify(props));
  expect('jira: Marta\'s Kubernetes tickets carry Key-person + Concentrated signals', await b.eval('WI.filter(w => w.project_id === "prj_cloud_migration" && w.assignee_id === "per_01" && (wiSkills.get(w.id) || []).includes("skl_kubernetes") && w.status_category !== "done").every(w => { const s = signalsOf(w).map(x => x.text); return s.includes("Key-person") && s.includes("Concentrated"); })'));
  expect('jira: concentration finds Cloud Migration Kubernetes on Marta', await b.eval('concentration().some(c => c.pid === "prj_cloud_migration" && c.sid === "skl_kubernetes" && c.person === "per_01")'));
  await b.select('#jr-project', 'prj_iso_27001_certification');
  const gdpr = await b.eval('(() => { const w = WI.find(w => w.project_id === "prj_iso_27001_certification" && !w.assignee_id && (wiSkills.get(w.id) || []).includes("skl_gdpr_compliance")); return { key: w.external_ref, top: suggestFor(w)[0].p.full_name }; })()');
  expect('jira: unassigned GDPR ticket suggests the real expert', gdpr.top === 'Henrik Solberg', JSON.stringify(gdpr));
  expect('jira: blocked ticket is flagged', await b.eval('WI.some(w => w.blocked && signalsOf(w).some(s => s.text === "Blocked"))'));
  await b.click('#jr-sync'); await b.waitFor('/tickets · /.test(document.querySelector("#jr-steps").textContent) || document.querySelector("#jr-sync").textContent.length');
  expect('jira: sync reports what it read', await b.eval('/synced just now/.test(document.querySelector("#jr-conn").textContent)'));
  const evBefore = await b.eval('D.evidence.length'); await b.click('#jr-apply');
  expect('jira: apply writes evidence, strengthens claims and proposes new ones without adding skills', await b.eval('D.evidence.length') === evBefore + props.raise + props.nw && await b.eval('D.evidence.filter(e => e.status === "proposed" && e.source_type === "jira").length') === props.nw);
  expect('jira: applying does not create a skill claim on its own', await b.eval('levelOf("per_10", "skl_aws") === 0'));

  // advisor -> Jira
  await b.click('#t-usecase'); await b.eval('ucHandle("Zero-downtime multi-region platform")'); await b.waitFor('UC.tpl && !UC.busy');
  await b.click('#uc-jira-btn');
  const plan = await b.eval('JSON.stringify(ucJiraPlan())'), pl = JSON.parse(plan);
  expect('advisor: Jira plan has one story per skill (hire collapsed) with owners from the team', pl.stories.length >= 4 && pl.stories.some(s => s.hiring && !s.assignee_person_id) && pl.stories.some(s => s.assignee_person_id), pl.key + ' ' + pl.stories.length);
  const pay = await b.eval('JSON.stringify(jiraPayloads(ucJiraPlan()))'), pj = JSON.parse(pay);
  expect('advisor: payloads match the Jira REST shape', pj.epic.fields.issuetype.name === 'Epic' && pj.epic.fields.description.type === 'doc' && pj.stories.every(s => s.fields.parent.key === '{epic-key}' && s.fields.customfield_10016 > 0 && s.fields.labels.includes('maieutica')) && pj.stories.some(s => s.fields.assignee && /^712020:/.test(s.fields.assignee.accountId)));
  const wiBefore = await b.eval('D.work_item.length'); await b.click('#uc-jira-create'); await b.waitFor('UC.jira && UC.jira.created');
  expect('advisor: creating adds the epic + stories to the board and the portfolio', await b.eval('D.work_item.length') === wiBefore + pl.stories.length + 1 && await b.eval('D.projects.some(p => p.status === "proposed" && p.external_ref === UC.jira.created.epic.split("-")[0])'));
  await b.click('#uc-open-board');
  expect('advisor: the new tickets show up on the Jira board', await b.eval('document.querySelectorAll("#jr-board .tk").length') === pl.stories.length && await b.eval('document.querySelector("#jr-project").value === UC.projectId'));

  // reset
  await b.click('#reset-demo');
  expect('reset restores the demo', await b.eval('D.person.length === 36 && D.project.length === 12'));

  expect('no JavaScript errors', b.errors.length === 0, b.errors.slice(0, 3).join(' | '));
  await b.close();
  console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASSED');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
