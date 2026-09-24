// Minimal Chrome DevTools Protocol driver (no dependencies; Node >= 22 for the global WebSocket).
// Used to test the explorer and to record the demo clips for the pitch deck.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch({ width = 1440, height = 900, url = 'about:blank' } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maieutica-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch (e) { /* not up yet */ }
    await sleep(150);
  }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = []; const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(m.params.type)) errors.push('console.' + m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    listeners.forEach(l => l(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const b = {
    send, errors, width, height,
    async goto(u) { await send('Page.navigate', { url: u }); await sleep(600); await b.waitFor('document.readyState === "complete"'); },
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    async waitFor(expr, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await b.eval(expr)) return true; } catch (e) { /* retry */ } await sleep(80); } throw new Error('timeout waiting for: ' + expr); },
    async rect(sel) { return b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'nearest',inline:'nearest'}); const r = e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}; })()`); },
    cursor: { x: 700, y: 400 },
    async moveTo(x, y, steps = 14, delay = 16) {
      const { x: x0, y: y0 } = b.cursor;
      for (let i = 1; i <= steps; i++) { const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x - x0) * e, y: y0 + (y - y0) * e }); await sleep(delay); }
      b.cursor = { x, y };
    },
    async click(sel, { pause = 250 } = {}) {
      const r = await b.rect(sel); if (!r) throw new Error('no element ' + sel);
      await b.moveTo(r.x, r.y); await sleep(120);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(pause);
    },
    async scrollTo(y, ms = 700) {
      const y0 = await b.eval('window.scrollY'), n = Math.max(1, Math.round(ms / 33));
      for (let i = 1; i <= n; i++) { const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await b.eval(`window.scrollTo(0, ${y0 + (y - y0) * e})`); await sleep(30); }
    },
    async select(sel, value) { await b.eval(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); },
    /* drag a range input's thumb to a fraction (0..1) of its track */
    async dragRange(sel, frac) {
      const r = await b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const q = e.getBoundingClientRect(); const f = (e.value - e.min) / (e.max - e.min); return { left: q.left, w: q.width, y: q.top + q.height / 2, f }; })()`);
      const th = 16, hx = r.left + th / 2 + r.f * (r.w - th), tx = r.left + th / 2 + frac * (r.w - th);
      await b.moveTo(hx, r.y); await sleep(150);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hx, y: r.y, button: 'left', clickCount: 1 });
      const steps = 16; for (let i = 1; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hx + (tx - hx) * i / steps, y: r.y, buttons: 1 }); await sleep(30); }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: r.y, button: 'left', clickCount: 1 });
      b.cursor = { x: tx, y: r.y }; await sleep(300);
    },
    async hover(sel, pause = 500) { const r = await b.rect(sel); if (!r) throw new Error('no element ' + sel); await b.moveTo(r.x, r.y); await sleep(pause); },
    async type(sel, text, delay = 55) {
      await b.click(sel, { pause: 100 });
      for (const ch of text) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(delay); }
    },
    async key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Enter' ? 13 : 0, text: key === 'Enter' ? '\r' : undefined }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); },
    async shot(file, { quality = 85 } = {}) { const r = await send('Page.captureScreenshot', { format: file.endsWith('.png') ? 'png' : 'jpeg', quality }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    async cursorOverlay() {
      await b.eval(`(() => { if (document.getElementById('__cur')) return; const c = document.createElement('div'); c.id='__cur';
        c.style.cssText='position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))';
        c.innerHTML='<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 17 L7.2 13.3 L10 19.5 L12.6 18.3 L9.9 12.3 L15.5 12 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'; document.body.appendChild(c);
        addEventListener('mousemove', e => { c.style.transform='translate('+(e.clientX-3)+'px,'+(e.clientY-2)+'px)'; }, true);
        addEventListener('mousedown', e => { const r=document.createElement('div'); r.style.cssText='position:fixed;left:'+(e.clientX-16)+'px;top:'+(e.clientY-16)+'px;width:32px;height:32px;border-radius:50%;border:2px solid #2F6DB5;z-index:2147483646;pointer-events:none;opacity:.9;transition:transform .35s ease-out,opacity .35s ease-out'; document.body.appendChild(r); requestAnimationFrame(()=>{ r.style.transform='scale(1.9)'; r.style.opacity='0'; }); setTimeout(()=>r.remove(),450); }, true); })()`);
    },
    /* record frames while `fn` runs; encode to mp4 */
    async record(outFile, fn, { fps = 10, out = 1280 } = {}) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maieutica-frames-'));
      let running = true, n = 0; const stamps = [];
      const loop = (async () => {
        while (running) {
          const t = Date.now();
          try { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); const f = path.join(dir, `f${String(n).padStart(5, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); stamps.push([f, Date.now()]); n++; } catch (e) { /* page busy */ }
          const wait = 1000 / fps - (Date.now() - t); if (wait > 0) await sleep(wait);
        }
      })();
      await fn();
      running = false; await loop;
      const lines = [];
      stamps.forEach(([f, t], i) => { const d = i < stamps.length - 1 ? (stamps[i + 1][1] - t) / 1000 : 0.8; lines.push(`file '${f}'`, `duration ${d.toFixed(3)}`); });
      lines.push(`file '${stamps[stamps.length - 1][0]}'`);
      const list = path.join(dir, 'list.txt'); fs.writeFileSync(list, lines.join('\n'));
      await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=24,scale=${out}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', '-an', outFile], { stdio: 'inherit' }).on('exit', c => c ? rej(new Error('ffmpeg ' + c)) : res()));
      fs.rmSync(dir, { recursive: true, force: true });
      return { frames: n, file: outFile, kb: Math.round(fs.statSync(outFile).size / 1024) };
    },
    async close() { try { ws.close(); } catch (e) { /* closed */ } proc.kill(); await sleep(200); fs.rmSync(dir, { recursive: true, force: true }); },
  };
  if (url !== 'about:blank') await b.goto(url);
  return b;
}
module.exports = { launch, sleep };
