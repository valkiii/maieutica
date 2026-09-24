/* ============================================================ chat helpers (onboarding + use-case advisor) */
const CHAT = { ob: { log: '#ob-log', quick: '#ob-quick' }, uc: { log: '#uc-log', quick: '#uc-quick' } };

async function botSay(which, html, opts = {}) {
  const log = $(CHAT[which].log), m = document.createElement('div');
  m.className = 'msg bot'; m.innerHTML = '<span class="typing" aria-label="typing"><i></i><i></i><i></i></span>';
  log.appendChild(m); log.scrollTop = log.scrollHeight;
  await sleep((opts.delay ?? Math.min(1300, 420 + html.length * 4)) * PACE);
  m.innerHTML = html; log.scrollTop = log.scrollHeight;
  return m;
}
function userSay(which, html) {
  const log = $(CHAT[which].log), m = document.createElement('div');
  m.className = 'msg user'; m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight;
}
const toBottom = which => { const log = $(CHAT[which].log); log.scrollTop = log.scrollHeight; };   // quick replies shrink the log: keep the last line visible
function clearChat(which) { $(CHAT[which].log).innerHTML = ''; $(CHAT[which].quick).innerHTML = ''; }
function setQuick(which, items) {
  const el = $(CHAT[which].quick); el.innerHTML = '';
  items.forEach(it => {
    const b = document.createElement('button'); b.className = 'qbtn' + (it.ghost ? ' ghost' : ''); b.type = 'button'; b.textContent = it.label;
    if (it.id) b.id = it.id;
    b.addEventListener('click', () => { el.innerHTML = ''; it.fn(); });
    el.appendChild(b);
  });
  toBottom(which);
}
/* multi-select chips + a Done button */
function setChoices(which, options, doneLabel, onDone) {
  const el = $(CHAT[which].quick); el.innerHTML = '';
  const picked = new Set();
  options.forEach(o => {
    const b = document.createElement('button'); b.className = 'qbtn ghost'; b.type = 'button'; b.textContent = o.label;
    b.addEventListener('click', () => { picked.has(o.value) ? picked.delete(o.value) : picked.add(o.value); b.classList.toggle('on', picked.has(o.value)); b.classList.toggle('ghost', !picked.has(o.value)); });
    el.appendChild(b);
  });
  const done = document.createElement('button'); done.className = 'qbtn'; done.type = 'button'; done.id = which + '-done'; done.textContent = doneLabel;
  done.addEventListener('click', () => { el.innerHTML = ''; onDone([...picked]); });
  el.appendChild(done);
  toBottom(which);
}
