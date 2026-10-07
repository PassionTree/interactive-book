/* LinkBook Chapter 3 — Channel loss, ISI, eye */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const L = NB.link;
  const OS = 32, TAUS = 96;
  const tauCache = {};
  function chFor(loss, beta) {
    const k = loss.toFixed(2) + '|' + beta.toFixed(2);
    if (!(k in tauCache)) tauCache[k] = L.tauForLoss(loss, beta, TAUS, OS);
    return { tau: tauCache[k], beta, tauS: TAUS };
  }
  function pulseOf(ch) {
    const pin = new Array(24).fill(0); pin[4] = 1;
    const p = L.channel(L.synth(pin, OS, null), ch);
    let pk = 0; for (let i = 0; i < p.length; i++) if (p[i] > p[pk]) pk = i;
    return { p, pk, start: 4 * OS };
  }

  /* ======================================================
     3.1 Frequency response
     ====================================================== */
  (function () {
    const W = NB.widget('w-freq'); if (!W) return;
    const P = { loss: 10, beta: 0.1 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '나이퀴스트 손실', min: 1, max: 25, value: P.loss, fmt: (v) => v + ' dB', onInput: (v) => { P.loss = v; upd(); } });
    NB.slider(ctr, { label: '긴 꼬리 비율 β', min: 0, max: 0.4, step: 0.05, value: P.beta, fmt: (v) => v.toFixed(2), onInput: (v) => { P.beta = v; upd(); } });
    const box = el('div'); W.body.append(box);
    const chart = NB.chart(box, { height: 280, xLabel: '주파수 / 심볼 레이트 (f / f_baud)', yLabel: '크기 (dB)', xMin: 0, xMax: 1, yMin: -40, yMax: 3, xFmt: (x) => x.toFixed(2) + '·f_b' });
    function upd() {
      const ch = chFor(P.loss, P.beta);
      const imp = new Float64Array(2048); imp[0] = 1;
      const h = L.channel(imp, ch);
      const pts = [], psd = [];
      for (let i = 1; i <= 100; i++) {
        const f = i / 100;
        pts.push([f, Math.max(-60, L.respDB(h, f / OS))]);
        const s = Math.sin(Math.PI * f) / (Math.PI * f);
        psd.push([f, Math.max(-40, 10 * Math.log10(s * s + 1e-9))]);
      }
      chart.set({
        series: [
          { name: 'NRZ 데이터 스펙트럼 (sinc²)', color: NB.css('--border-strong'), points: psd, width: 1.5, dash: [4, 3] },
          { name: '채널 |H(f)|', color: NB.css('--accent'), points: pts, width: 2.6 }
        ],
        vlines: [{ x: 0.5, label: '나이퀴스트 (−' + P.loss + ' dB)', color: NB.css('--c3') }]
      });
    }
    upd();
    NB.onTheme(upd);
  })();

  /* ======================================================
     3.2 Pulse response & ISI superposition
     ====================================================== */
  (function () {
    const W = NB.widget('w-pulse'); if (!W) return;
    const P = { loss: 10, beta: 0.15 };
    let bits = [0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1];
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '나이퀴스트 손실', min: 0, max: 20, value: P.loss, fmt: (v) => v + ' dB', onInput: (v) => { P.loss = v; draw(); } });
    NB.slider(ctr, { label: '긴 꼬리 비율 β', min: 0, max: 0.4, step: 0.05, value: P.beta, fmt: (v) => v.toFixed(2), onInput: (v) => { P.beta = v; draw(); } });
    NB.button(ctr, '🎲 무작위 비트', () => { bits = bits.map(() => (Math.random() < 0.5 ? 1 : 0)); draw(); });
    NB.button(ctr, '외톨이 1 (0001000…)', () => { bits = bits.map((b, i) => (i === 6 ? 1 : 0)); draw(); });
    NB.button(ctr, '외톨이 0 (1110111…)', () => { bits = bits.map((b, i) => (i === 6 ? 0 : 1)); draw(); });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const pcv = NB.canvas(a, { height: 260 });
    const bitRow = el('div', { style: { display: 'flex', gap: '3px', margin: '0 0 6px 40px', flexWrap: 'wrap' } }); b.append(bitRow);
    const scv = NB.canvas(b, { height: 226 });
    const st = NB.stats(W.body, [{ key: 'h0', label: '메인 커서 h₀' }, { key: 'pre', label: '프리커서 h₋₁' }, { key: 'post', label: '포스트커서 합 Σh₁…' }, { key: 'pk', label: '최악 아이 높이 (피크 왜곡)' }, { key: 'err', label: '이 비트열의 오류' }]);
    function draw() {
      const ch = chFor(P.loss, P.beta);
      const { p, pk, start } = pulseOf(ch);
      // centre of flat top for ideal channel
      let a0 = pk, a1 = pk; while (a0 > 0 && p[a0 - 1] >= p[pk] * 0.995) a0--; while (a1 < p.length - 1 && p[a1 + 1] >= p[pk] * 0.995) a1++;
      const c = Math.round((a0 + a1) / 2);
      const cur = []; for (let k = -2; k <= 8; k++) { const i = c + k * OS; cur.push([k, i >= 0 && i < p.length ? p[i] : 0]); }
      // pulse plot
      {
        const { ctx, w, h } = pcv;
        const inp = new Array(p.length).fill(0); for (let i = start; i < start + OS; i++) inp[i] = 1;
        const x0 = (start - OS) / OS, x1 = (start + 9 * OS) / OS;
        const r = L.plotWave(ctx, { w, h, x0, x1, y0: -0.15, y1: 1.15, yTicks: [0, 0.5, 1], xTicks: [], series: [
          { data: inp, color: NB.css('--border-strong'), width: 1.5, dash: [4, 3], os: OS },
          { data: Array.from(p), color: NB.css('--accent'), width: 2.6, os: OS }
        ] });
        cur.forEach(([k, v]) => {
          const x = r.X((c + k * OS) / OS);
          if (x < r.pad.l || x > w - 10) return;
          ctx.strokeStyle = k === 0 ? NB.css('--c2') : NB.css('--c3'); ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x, r.Y(0)); ctx.lineTo(x, r.Y(v)); ctx.stroke();
          ctx.fillStyle = NB.css('--text-mute'); ctx.font = '10px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText('h' + (k < 0 ? '₋' + -k : k), x, h - 18);
          if (Math.abs(v) > 0.015) { ctx.textBaseline = 'bottom'; ctx.fillStyle = NB.css('--text'); ctx.fillText(v.toFixed(2), x, r.Y(Math.max(0, v)) - 3); }
        });
      }
      // bits row
      bitRow.innerHTML = '';
      bits.forEach((bt, i) => { const bb = el('button', { type: 'button', class: 'cell-btn' + (bt ? ' on' : '') }, String(bt)); bb.addEventListener('click', () => { bits[i] ^= 1; draw(); }); bitRow.append(bb); });
      // superposition
      const n = bits.length, len = (n + 3) * OS;
      const contrib = bits.map((bt, k) => { const arr = new Float64Array(len); const sgn = bt ? 1 : -1; for (let i = 0; i < len; i++) { const j = i - k * OS + start - OS; if (j >= 0 && j < p.length) arr[i] = sgn * p[j] + 0; else if (j >= p.length) arr[i] = sgn * p[p.length - 1]; } return arr; });
      // baseline: pulses of ±1 relative to 0 need offset for symbols before the window: approximate with -1 history
      const sum = new Float64Array(len);
      contrib.forEach((arr) => { for (let i = 0; i < len; i++) sum[i] += arr[i]; });
      const { ctx, w, h } = scv;
      const pal = NB.palette();
      const r = L.plotWave(ctx, { w, h, x0: 0, x1: n + 2, y0: -1.6, y1: 1.6, yTicks: [-1, 0, 1], xTicks: [], series: contrib.map((arr, k) => ({ data: Array.from(arr), color: NB.alpha(pal[k % 8], 0.35), width: 1.2, os: OS })).concat([{ data: Array.from(sum), color: NB.css('--text'), width: 2.4, os: OS }]) });
      let errs = 0;
      bits.forEach((bt, k) => {
        const i = k * OS - start + OS + c;
        if (i < 0 || i >= len) return;
        const v = sum[i], ok = (v > 0) === !!bt;
        if (!ok) errs++;
        const x = r.X(i / OS);
        ctx.strokeStyle = NB.css('--text-mute'); ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, r.pad.t); ctx.lineTo(x, h - r.pad.b); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ok ? NB.css('--c2') : NB.css('--danger'); ctx.beginPath(); ctx.arc(x, r.Y(v), 4.5, 0, 7); ctx.fill();
      });
      const h0 = cur.find((x) => x[0] === 0)[1], pre = cur.find((x) => x[0] === -1)[1];
      const post = cur.filter((x) => x[0] > 0).reduce((s, x) => s + Math.abs(x[1]), 0);
      const isi = cur.filter((x) => x[0] !== 0).reduce((s, x) => s + Math.abs(x[1]), 0);
      st.h0.set(h0.toFixed(3)); st.pre.set(pre.toFixed(3)); st.post.set(post.toFixed(3));
      const eh = 2 * (h0 - isi);
      st.pk.set(eh.toFixed(3), '', eh <= 0 ? 'bad' : 'good');
      st.err.set(errs, '', errs ? 'bad' : 'good');
    }
    pcv.draw = draw; scv.draw = draw;
    draw();
  })();

  /* ======================================================
     3.3 Eye diagram generator
     ====================================================== */
  (function () {
    const W = NB.widget('w-eye'); if (!W) return;
    const P = { loss: 8, beta: 0.1, noise: 0.03, rj: 0.01, dj: 0 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '나이퀴스트 손실', min: 0, max: 20, step: 0.5, value: P.loss, fmt: (v) => v + ' dB', onInput: (v) => { P.loss = v; sched(); } });
    NB.slider(ctr, { label: '긴 꼬리 β', min: 0, max: 0.4, step: 0.05, value: P.beta, fmt: (v) => v.toFixed(2), onInput: (v) => { P.beta = v; sched(); } });
    NB.slider(ctr, { label: '전압 노이즈 σ', min: 0, max: 0.2, step: 0.005, value: P.noise, fmt: (v) => v.toFixed(3), onInput: (v) => { P.noise = v; sched(); } });
    NB.slider(ctr, { label: '랜덤 지터 RJ σ', min: 0, max: 0.06, step: 0.002, value: P.rj, fmt: (v) => v.toFixed(3) + ' UI', onInput: (v) => { P.rj = v; sched(); } });
    NB.slider(ctr, { label: '결정적 지터 DJ p-p', min: 0, max: 0.4, step: 0.02, value: P.dj, fmt: (v) => v.toFixed(2) + ' UI', onInput: (v) => { P.dj = v; sched(); } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const cv = NB.canvas(a, { height: (w) => Math.min(380, w * 0.7) });
    const st = NB.stats(b, [{ key: 'h', label: '아이 높이' }, { key: 'w', label: '아이 폭' }, { key: 'nl', label: '나이퀴스트 손실' }, { key: 'h0', label: '메인 커서 h₀' }]);
    const cb = el('div', { style: { marginTop: '10px' } }); b.append(cb);
    const chart = NB.chart(cb, { height: 190, xLabel: '샘플링 위치 (UI)', yLabel: '아이 높이', xMin: -0.5, xMax: 0.5 });
    let R, M, timer = 0;
    function sched() { clearTimeout(timer); timer = setTimeout(compute, 30); }
    function compute() {
      R = L.run({ os: OS, nbits: 1000, ch: chFor(P.loss, P.beta), noise: P.noise, jit: { rj: P.rj, dj: P.dj }, seed: 11 });
      M = L.eyeMetrics(R);
      st.h.set(M.height.toFixed(3), '', M.height > 0.05 ? 'good' : 'bad');
      st.w.set(M.width.toFixed(2), 'UI', M.width > 0.2 ? 'good' : 'bad');
      st.nl.set(L.nyqLoss(chFor(P.loss, P.beta), OS).toFixed(1), 'dB');
      st.h0.set(R.pulse[R.peak].toFixed(3));
      chart.set({ series: [{ name: '아이 높이', color: NB.css('--accent'), points: M.heights }], yMin: Math.min(-0.2, ...M.heights.map((x) => x[1])), yMax: Math.max(0.5, ...M.heights.map((x) => x[1])) * 1.1 });
      draw();
    }
    function draw() { if (R) L.drawEye(cv.ctx, R, { w: cv.w, h: cv.h, metrics: M, yRange: 1.4 }); }
    cv.draw = draw;
    compute();
  })();
});
