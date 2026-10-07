/* LinkBook Chapter 4 — Equalization */
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
  const gOf = (db) => Math.pow(10, db / 20) - 1;

  /* ======================================================
     4.1 TX FFE
     ====================================================== */
  (function () {
    const W = NB.widget('w-ffe'); if (!W) return;
    const P = { loss: 12, beta: 0.1, pre: 0, post: -0.15 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '나이퀴스트 손실', min: 0, max: 20, step: 0.5, value: P.loss, fmt: (v) => v + ' dB', onInput: (v) => { P.loss = v; sched(); } });
    const preS = NB.slider(ctr, { label: '프리커서 탭 c₋₁', min: -0.3, max: 0, step: 0.01, value: P.pre, fmt: (v) => v.toFixed(2), onInput: (v) => { P.pre = v; sched(); } });
    const postS = NB.slider(ctr, { label: '포스트커서 탭 c₁', min: -0.45, max: 0, step: 0.01, value: P.post, fmt: (v) => v.toFixed(2), onInput: (v) => { P.post = v; sched(); } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    NB.button(br, '⚡ 제로 포싱', () => zf(), 'primary');
    NB.button(br, '끄기', () => { P.pre = 0; P.post = 0; preS.set(0); postS.set(0); sched(); });
    const tapInfo = el('div', { class: 'mono small', style: { margin: '-4px 0 10px', color: 'var(--text-soft)' } }); W.body.append(tapInfo);
    const lay = el('div', { class: 'split' }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    a.append(el('div', { class: 'small', style: { fontWeight: 700 } }, '송신 파형 (점선: FFE 없음)'));
    const txCv = NB.canvas(a, { height: 210 });
    b.append(el('div', { class: 'small', style: { fontWeight: 700 } }, '수신 펄스 응답 (점선: FFE 없음)'));
    const pCv = NB.canvas(b, { height: 210 });
    const st = NB.stats(W.body, [{ key: 'hm1', label: 'h₋₁' }, { key: 'h0', label: 'h₀ (신호 크기)' }, { key: 'h1', label: 'h₁' }, { key: 'h2', label: 'h₂' }, { key: 'e0', label: '아이 높이 (FFE 전)' }, { key: 'e1', label: '아이 높이 (FFE 후)' }]);
    let timer = 0;
    const sched = () => { clearTimeout(timer); timer = setTimeout(draw, 20); };
    const main = () => 1 - Math.abs(P.pre) - Math.abs(P.post);
    function zf() {
      const R0 = L.run({ os: OS, nbits: 60, ch: chFor(P.loss, P.beta) });
      const h = {}; L.cursors(R0, -2, 2).forEach(([k, v]) => { h[k] = v; });
      // with c0 = 1: [h0 h-2; h2 h0] [cpre; cpost] = [-h-1; -h1]
      const a11 = h[0], a12 = h[-2], a21 = h[2], a22 = h[0];
      const det = a11 * a22 - a12 * a21;
      let cp = (-h[-1] * a22 - a12 * -h[1]) / det, cq = (a11 * -h[1] - -h[-1] * a21) / det;
      const s = 1 + Math.abs(cp) + Math.abs(cq);
      P.pre = Math.max(-0.3, Math.min(0, cp / s)); P.post = Math.max(-0.45, Math.min(0, cq / s));
      preS.set(+P.pre.toFixed(2)); postS.set(+P.post.toFixed(2));
      sched();
    }
    function draw() {
      const ch = chFor(P.loss, P.beta);
      const ffe = { pre: P.pre, main: main(), post: P.post };
      tapInfo.textContent = 'c₋₁ = ' + P.pre.toFixed(3) + '   c₀ = ' + ffe.main.toFixed(3) + '   c₁ = ' + P.post.toFixed(3) + '   (|c|의 합 = 1)';
      // TX waveform for a pattern
      const pat = [0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1].map((b) => (b ? 1 : -1));
      const txE = L.ffe(pat, ffe);
      const sq = (arr) => { const out = []; arr.forEach((v) => { for (let i = 0; i < 16; i++) out.push(v); }); return out; };
      L.plotWave(txCv.ctx, { w: txCv.w, h: txCv.h, x0: 0, x1: pat.length, y0: -1.15, y1: 1.15, yTicks: [-1, 0, 1], xTicks: [], series: [
        { data: sq(pat), color: NB.css('--border-strong'), width: 1.4, dash: [4, 3], os: 16 },
        { data: sq(txE), color: NB.css('--c1'), width: 2.4, os: 16 }
      ] });
      // pulse responses
      const R0 = L.run({ os: OS, nbits: 600, ch, seed: 5 });
      const R1 = L.run({ os: OS, nbits: 600, ch, ffe, seed: 5 });
      const x0 = (R1.peak - 2 * OS) / OS, x1 = (R1.peak + 6 * OS) / OS;
      const r = L.plotWave(pCv.ctx, { w: pCv.w, h: pCv.h, x0, x1, y0: -0.25, y1: 1, yTicks: [0, 0.5, 1], xTicks: [], series: [
        { data: Array.from(R0.pulse), color: NB.css('--border-strong'), width: 1.5, dash: [4, 3], os: OS },
        { data: Array.from(R1.pulse), color: NB.css('--accent'), width: 2.6, os: OS }
      ] });
      const cur = L.cursors(R1, -2, 5);
      const ctx = pCv.ctx;
      cur.forEach(([k, v]) => {
        const x = r.X((R1.peak + k * OS) / OS);
        ctx.strokeStyle = k === 0 ? NB.css('--c2') : NB.css('--c3'); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, r.Y(0)); ctx.lineTo(x, r.Y(v)); ctx.stroke();
        if (Math.abs(v) > 0.012) { ctx.fillStyle = NB.css('--text'); ctx.font = '10px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = v >= 0 ? 'bottom' : 'top'; ctx.fillText(v.toFixed(2), x, r.Y(v) + (v >= 0 ? -3 : 3)); }
      });
      const c = {}; cur.forEach(([k, v]) => { c[k] = v; });
      st.hm1.set(c[-1].toFixed(3), '', Math.abs(c[-1]) < 0.02 ? 'good' : '');
      st.h0.set(c[0].toFixed(3));
      st.h1.set(c[1].toFixed(3), '', Math.abs(c[1]) < 0.02 ? 'good' : '');
      st.h2.set(c[2].toFixed(3));
      const e0 = L.eyeMetrics(R0).height, e1 = L.eyeMetrics(R1).height;
      st.e0.set(e0.toFixed(3), '', e0 > 0 ? '' : 'bad');
      st.e1.set(e1.toFixed(3), '', e1 > e0 ? 'good' : 'bad');
    }
    txCv.draw = sched; pCv.draw = sched;
    draw();
  })();

  /* ======================================================
     4.2 Equalization lab
     ====================================================== */
  (function () {
    const W = NB.widget('w-lab'); if (!W) return;
    const P = { loss: 18, beta: 0.15, noise: 0.015, pre: 0, post: 0, ctle: 0, dfeMode: 'off', dfeN: 1, d1: 0, d2: 0 };
    const r1 = el('div', { class: 'controls' }); W.body.append(r1);
    NB.slider(r1, { label: '채널 손실', min: 6, max: 26, step: 0.5, value: P.loss, fmt: (v) => v + ' dB', onInput: (v) => { P.loss = v; sched(); } });
    NB.slider(r1, { label: '노이즈 σ (채널 출력)', min: 0, max: 0.06, step: 0.002, value: P.noise, fmt: (v) => v.toFixed(3), onInput: (v) => { P.noise = v; sched(); } });
    const r2 = el('div', { class: 'controls' }); W.body.append(r2);
    const preS = NB.slider(r2, { label: 'FFE c₋₁', min: -0.25, max: 0, step: 0.01, value: 0, fmt: (v) => v.toFixed(2), onInput: (v) => { P.pre = v; sched(); } });
    const postS = NB.slider(r2, { label: 'FFE c₁', min: -0.4, max: 0, step: 0.01, value: 0, fmt: (v) => v.toFixed(2), onInput: (v) => { P.post = v; sched(); } });
    const ctS = NB.slider(r2, { label: 'CTLE 피킹', min: 0, max: 16, step: 0.5, value: 0, fmt: (v) => v + ' dB', onInput: (v) => { P.ctle = v; sched(); } });
    const r3 = el('div', { class: 'controls' }); W.body.append(r3);
    const dm = NB.seg(r3, { label: 'DFE', value: P.dfeMode, options: [{ value: 'off', label: '끄기' }, { value: 'auto', label: '자동' }, { value: 'man', label: '수동' }], onChange: (v) => { P.dfeMode = v; sched(); } });
    const dnS = NB.slider(r3, { label: 'DFE 탭 수 (자동)', min: 1, max: 4, value: P.dfeN, onInput: (v) => { P.dfeN = v; sched(); } });
    NB.slider(r3, { label: '수동 b₁', min: 0, max: 0.5, step: 0.01, value: 0, fmt: (v) => v.toFixed(2), onInput: (v) => { P.d1 = v; sched(); } });
    NB.slider(r3, { label: '수동 b₂', min: 0, max: 0.3, step: 0.01, value: 0, fmt: (v) => v.toFixed(2), onInput: (v) => { P.d2 = v; sched(); } });
    const br = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(br);
    NB.button(br, '↺ 등화 모두 끄기', () => { P.pre = 0; P.post = 0; P.ctle = 0; P.dfeMode = 'off'; preS.set(0); postS.set(0); ctS.set(0); dm.set('off'); sched(); });
    NB.button(br, '✨ 예시 해답', () => { P.pre = 0; P.post = 0; P.ctle = 6; P.dfeMode = 'auto'; P.dfeN = 2; preS.set(0); postS.set(0); ctS.set(6); dnS.set(2); dm.set('auto'); sched(); }, 'primary');
    const goal = el('div', { style: { margin: '0 0 10px' } }); W.body.append(goal);
    const fbox = el('div'); W.body.append(fbox);
    const fchart = NB.chart(fbox, { height: 200, xLabel: 'f / f_baud', yLabel: 'dB', xMin: 0, xMax: 1, yMin: -40, yMax: 6, xFmt: (x) => x.toFixed(2) });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', marginTop: '10px', alignItems: 'start' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    a.append(el('div', { class: 'small', style: { fontWeight: 700 } }, '등화 전'));
    const cv0 = NB.canvas(a, { height: 230 });
    const st0 = NB.stats(a, [{ key: 'h', label: '높이' }, { key: 'w', label: '폭' }]);
    b.append(el('div', { class: 'small', style: { fontWeight: 700 } }, '등화 후'));
    const cv1 = NB.canvas(b, { height: 300 });
    const st1 = NB.stats(b, [{ key: 'h', label: '아이 높이' }, { key: 'w', label: '아이 폭' }, { key: 'h0', label: 'h₀ (신호 크기)' }, { key: 'isi', label: '잔여 ISI Σ|h_k|' }, { key: 'dfe', label: 'DFE 탭' }]);
    let timer = 0, R0, M0, R1, M1;
    const sched = () => { clearTimeout(timer); timer = setTimeout(compute, 30); };
    function compute() {
      const ch = chFor(P.loss, P.beta);
      const base = { os: OS, nbits: 800, ch, noise: P.noise, noiseAt: 'channel', seed: 9 };
      R0 = L.run(base); M0 = L.eyeMetrics(R0);
      const ffe = P.pre || P.post ? { pre: P.pre, main: 1 - Math.abs(P.pre) - Math.abs(P.post), post: P.post } : null;
      const ctle = P.ctle ? { g: gOf(P.ctle), tau: OS * 0.6 } : null;
      let dfe = null;
      if (P.dfeMode === 'auto') {
        const Rp = L.run(Object.assign({}, base, { noise: 0, ffe, ctle, nbits: 60 }));
        dfe = L.cursors(Rp, 1, P.dfeN).map((c) => c[1]);
      } else if (P.dfeMode === 'man') dfe = [P.d1, P.d2];
      R1 = L.run(Object.assign({}, base, { ffe, ctle, dfe }));
      M1 = L.eyeMetrics(R1);
      st0.h.set(M0.height.toFixed(3), '', M0.height > 0 ? '' : 'bad'); st0.w.set(M0.width.toFixed(2), 'UI');
      st1.h.set(M1.height.toFixed(3), '', M1.height >= 0.1 ? 'good' : 'bad'); st1.w.set(M1.width.toFixed(2), 'UI', M1.width >= 0.3 ? 'good' : 'bad');
      // effective cursors after DFE: subtract dfe taps
      const cur = L.cursors(L.run(Object.assign({}, base, { noise: 0, ffe, ctle, nbits: 60 })), -2, 8);
      const h0 = cur.find((c) => c[0] === 0)[1];
      const isi = cur.filter((c) => c[0] !== 0).reduce((s, c) => s + Math.abs(c[1] - (dfe && c[0] > 0 && c[0] <= dfe.length ? dfe[c[0] - 1] : 0)), 0);
      st1.h0.set(h0.toFixed(3)); st1.isi.set(isi.toFixed(3), '', isi < h0 ? 'good' : 'bad');
      st1.dfe.set(dfe ? '<span style="font-size:13px">' + dfe.map((d) => d.toFixed(2)).join(', ') + '</span>' : '—');
      const ok = M1.height >= 0.1 && M1.width >= 0.3;
      goal.innerHTML = ok ? '<span class="badge ok">🎉 목표 달성</span> 아이가 열렸습니다!' : '<span class="badge bad">목표</span> 아이 높이 ≥ 0.10, 폭 ≥ 0.30 UI';
      // frequency responses
      const imp = new Float64Array(2048); imp[0] = 1;
      const hc = L.channel(imp, ch), he = ctle ? L.ctle(imp, ctle.g, ctle.tau) : imp, hce = ctle ? L.ctle(hc, ctle.g, ctle.tau) : hc;
      const ptsC = [], ptsE = [], ptsT = [];
      for (let i = 1; i <= 80; i++) {
        const f = i / 80;
        ptsC.push([f, Math.max(-60, L.respDB(hc, f / OS))]);
        ptsE.push([f, L.respDB(he, f / OS) - (ctle ? L.respDB(he, 1e-6) : 0)]);
        ptsT.push([f, Math.max(-60, L.respDB(hce, f / OS) - (ctle ? L.respDB(he, 1e-6) : 0))]);
      }
      fchart.set({ series: [
        { name: '채널', color: NB.css('--c3'), points: ptsC },
        { name: 'CTLE (DC 기준 정규화)', color: NB.css('--c2'), points: ptsE },
        { name: '채널 × CTLE', color: NB.css('--accent'), points: ptsT, width: 2.8 }
      ], vlines: [{ x: 0.5, label: '나이퀴스트', color: NB.css('--text-mute') }] });
      draw();
    }
    function draw() {
      if (!R1) return;
      L.drawEye(cv0.ctx, R0, { w: cv0.w, h: cv0.h, metrics: M0, yRange: 1.3, color: NB.css('--c3') });
      const amp = Math.max(0.3, Math.min(1.3, Math.max(...Array.from(R1.wave).slice(2000, 6000).map(Math.abs)) * 1.05));
      L.drawEye(cv1.ctx, R1, { w: cv1.w, h: cv1.h, metrics: M1, yRange: amp });
    }
    cv0.draw = draw; cv1.draw = draw;
    compute();
    NB.onTheme(compute);
  })();
});
