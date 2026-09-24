// Records short, real screen clips of the explorer for the pitch deck (headless Chrome + ffmpeg).
// Run:  node scripts/record_clips.js [clip ...]      clips: layers networks gaps econ leaver onboard usecase jira
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'deck', 'clips');
const URL = 'file://' + ROOT + '/viz/maieutica-explorer.html';
fs.mkdirSync(OUT, { recursive: true });

async function open(tab, scroll = 0, pace = 0.55) {
  const b = await launch({ width: 1280, height: 800 });
  await b.goto(`${URL}?pace=${pace}#${tab}`);
  await b.waitFor('document.querySelectorAll("#svg-layers .node").length > 50');
  await b.cursorOverlay(); await sleep(400);
  await b.eval(`window.scrollTo(0, ${scroll})`); await sleep(500);
  b.cursor = { x: 1000, y: 120 };
  await b.eval('document.dispatchEvent(new MouseEvent("mousemove", {clientX: 1000, clientY: 120}))');
  return b;
}
const file = n => path.join(OUT, n);

const CLIPS = {
  async layers() {
    const b = await open('layers', 205);
    const r = await b.record(file('layers.mp4'), async () => {
      await sleep(900);
      await b.hover('#svg-layers .node[aria-label="Cloud Migration"]', 1400);
      await b.click('#svg-layers .node[aria-label="Marta Lindqvist"]', { pause: 1900 });
      await b.shot(file('layers.jpg'));
      await b.click('#svg-layers .node[aria-label="Kubernetes"]', { pause: 2000 });
      await b.click('#svg-layers .node[aria-label="Earn enterprise trust (security and compliance)"]', { pause: 2000 });
      await b.click('#svg-layers .node[aria-label="Hackathon Tooling"]', { pause: 1600 });
    });
    return [r, b];
  },
  async networks() {
    const b = await open('net', 215);
    const r = await b.record(file('networks.mp4'), async () => {
      await sleep(1000);
      await b.click('#net-panels .netpanel:nth-child(1) .nnode[aria-label="Diego Ortiz"]', { pause: 2200 });
      await b.shot(file('networks.jpg'));
      await b.click('#sz-sh', { pause: 1500 });
      await b.click('#net-panels .netpanel:nth-child(1) .nnode[aria-label="Diego Ortiz"]', { pause: 300 });   // unpin
      await b.click('#nm-ovl', { pause: 2300 });
      await b.click('#nl-s', { pause: 1600 });
      await b.click('#nl-s', { pause: 1200 });
      await b.scrollTo(720, 1200); await sleep(2200);
    });
    return [r, b];
  },
  async gaps() {
    const b = await open('gaps', 190);
    const r = await b.record(file('gaps.mp4'), async () => {
      await sleep(1000);
      await b.hover('#findings .card:nth-child(1) .row:nth-child(1)', 1200);
      await b.hover('#findings .card:nth-child(2) .gbar:nth-child(3)', 1300);
      await b.shot(file('gaps.jpg'));
      await b.scrollTo(560, 1300); await sleep(600);
      await b.hover('.skillrow:nth-child(3) .sq', 1000);
      await b.scrollTo(1000, 1500); await sleep(1200);
    });
    return [r, b];
  },
  async econ() {
    const b = await open('econ', 120);
    const r = await b.record(file('economics.mp4'), async () => {
      await sleep(1000);
      await b.hover('#svg-econ .bub[data-id="prj_warehouse_automation_pilot"]', 1500);
      await b.shot(file('economics.jpg'));
      await b.hover('#svg-econ .bub[data-id="prj_iso_27001_certification"]', 1300);
      await b.click('#ax-fte', { pause: 1700 });
      await b.click('#ax-eur', { pause: 900 });
      await b.scrollTo(600, 1200); await sleep(500);
      await b.hover('#econ-table tbody tr:nth-child(1)', 1400);
      await b.hover('#econ-table tbody tr:nth-child(4)', 1400);
    });
    return [r, b];
  },
  async leaver() {
    const b = await open('leaver', 190);
    const r = await b.record(file('leaver.mp4'), async () => {
      await sleep(1600);
      await b.shot(file('leaver.jpg'));
      await b.scrollTo(470, 1200); await sleep(1700);
      await b.select('#leaver-pick', 'per_11'); await b.scrollTo(190, 800); await sleep(2000);
      await b.select('#leaver-pick', 'per_01'); await sleep(1600);
    });
    return [r, b];
  },
  async onboard() {
    const b = await open('onboard', 195, 0.5);
    const r = await b.record(file('onboarding.mp4'), async () => {
      await b.waitFor('document.querySelector("#ob-sample")'); await sleep(900);
      await b.click('#ob-sample', { pause: 300 });
      await b.waitFor('document.querySelector("#ob-continue")'); await sleep(1700);
      await b.shot(file('onboarding.jpg'));
      await b.click('[aria-label="Remove Negotiation"]', { pause: 1100 });
      await b.click('#ob-continue', { pause: 300 });
      await b.waitFor('document.querySelector("#ob-q1a")'); await sleep(500); await b.click('#ob-q1a', { pause: 300 });
      await b.waitFor('document.querySelector("#ob-done")'); await sleep(400);
      await b.click('#ob-quick .qbtn:nth-child(1)', { pause: 300 }); await b.click('#ob-quick .qbtn:nth-child(2)', { pause: 400 }); await b.click('#ob-done', { pause: 300 });
      await sleep(500); await b.waitFor('document.querySelector("#ob-done")'); await sleep(400);
      await b.click('#ob-quick .qbtn:nth-child(1)', { pause: 400 }); await b.click('#ob-done', { pause: 300 });
      await b.waitFor('document.querySelector("#ob-save")'); await sleep(700);
      await b.click('#ob-save', { pause: 300 });
      await b.waitFor('OB.saved === true'); await sleep(1600);
      await b.scrollTo(640, 1600); await sleep(2600);
    });
    return [r, b];
  },
  async jira() {
    const b = await open('jira', 185, 0.5);
    const r = await b.record(file('jira.mp4'), async () => {
      await sleep(1000);
      await b.click('#jr-board .tk[data-k="CLOUD-2"]', { pause: 2000 });
      await b.shot(file('jira.jpg'));
      await b.click('#jr-board .tk[data-k="CLOUD-18"]', { pause: 2200 });
      await b.select('#jr-project', 'prj_iso_27001_certification'); await sleep(900);
      const gdpr = await b.eval('WI.find(w => w.project_id === "prj_iso_27001_certification" && !w.assignee_id && (wiSkills.get(w.id) || []).includes("skl_gdpr_compliance")).external_ref');
      await b.click(`#jr-board .tk[data-k="${gdpr}"]`, { pause: 2200 });
      await b.click('#jr-sync', { pause: 300 });
      await b.waitFor('/tickets · /.test(document.querySelector("#jr-steps").textContent)'); await sleep(900);
      await b.scrollTo(700, 1200); await sleep(1500);
      await b.click('#jr-apply', { pause: 1800 });
      await b.scrollTo(0, 700); await sleep(300);
      await b.click('#t-usecase', { pause: 300 });
      await b.waitFor('document.querySelector("#uc-quick .qbtn")'); await sleep(500);
      await b.click('#uc-quick .qbtn:nth-child(3)', { pause: 300 });
      await b.waitFor('UC.tpl && !UC.busy'); await sleep(1200);
      await b.click('#uc-jira-btn', { pause: 1300 });
      await b.scrollTo(1500, 1200); await sleep(1400);
      await b.click('#uc-jira-create', { pause: 1600 });
      await b.click('#uc-open-board', { pause: 2600 });
    });
    return [r, b];
  },
  async usecase() {
    const b = await open('usecase', 195, 0.5);
    const r = await b.record(file('usecase.mp4'), async () => {
      await b.waitFor('document.querySelector("#uc-quick .qbtn")'); await sleep(1000);
      await b.click('#uc-quick .qbtn:nth-child(3)', { pause: 300 });
      await b.waitFor('UC.tpl && !UC.busy'); await sleep(1900);
      await b.shot(file('usecase.jpg'));
      await b.dragRange('#ai-arr', 0.8); await sleep(1400);
      await b.scrollTo(800, 1500); await sleep(2200);
      await b.click('#uc-add', { pause: 1500 });
      await b.click('#uc-see', { pause: 900 });
      await b.scrollTo(120, 500); await sleep(500);
      await b.hover('#svg-econ .bub.proposed', 2300);
    });
    return [r, b];
  },
};

(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
  for (const name of want) {
    const t0 = Date.now();
    const [r, b] = await CLIPS[name]();
    console.log(`${name}: ${r.frames} frames -> ${r.kb} KB (${((Date.now() - t0) / 1000).toFixed(0)}s)  errors: ${b.errors.length ? b.errors.join(' | ') : 'none'}`);
    await b.close();
  }
})().catch(e => { console.error('CRASH', e); process.exit(1); });
