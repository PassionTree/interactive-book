/* LinkBook Chapter 2 — Transmission lines */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const L = NB.link;
  const INF = Infinity;

  /* ---------------- lossless line model (time unit = one-way delay Td) ---------------- */
  function gamma(R, Z0) { return R === INF ? 1 : (R - Z0) / (R + Z0); }
  function waves(Rs, Z0, RL, Vs, nmax) {
    const gs = gamma(Rs, Z0), gl = gamma(RL, Z0);
    const a0 = Rs === INF ? 0 : Vs * Z0 / (Rs + Z0);
    const out = [];
    let a = a0;
    for (let k = 0; k < (nmax || 40); k++) {
      const b = a * gl;
      out.push({ k, a, b });
      a = b * gs;
      if (Math.abs(a) < 1e-5 && Math.abs(b) < 1e-5) break;
    }
    return { list: out, gs, gl, a0 };
  }
  const ramp = (u, tr) => (u <= 0 ? 0 : tr <= 1e-6 || u >= tr ? 1 : u / tr);
  // voltage at position z (0 = source, 1 = load) and time t
  function V(Wv, z, t, tr) {
    let v = 0;
    for (const w of Wv.list) {
      v += w.a * ramp(t - 2 * w.k - z, tr);
      v += w.b * ramp(t - (2 * w.k + 1) - (1 - z), tr);
    }
    return v;
  }

  /* ======================================================
     2.1 Reflection simulator
     ====================================================== */
  (function () {
    const Wd = NB.widget('w-tline'); if (!Wd) return;
    const RV = [0, 5, 10, 15, 20, 25, 33, 40, 50, 60, 75, 100, 150, 200, 300, 500, 1000, INF];
    const fmtR = (r) => (r === INF ? '∞ (개방)' : r === 0 ? '0 (단락)' : r + ' Ω');
    const P = { Rs: 10, Z0: 50, RL: INF, tr: 0.1, t: 0, play: true, speed: 1 };
    const c1 = el('div', { class: 'controls' }); Wd.body.append(c1);
    const rsS = NB.slider(c1, { label: '드라이버 저항 R_S', min: 0, max: RV.length - 2, value: RV.indexOf(10), fmt: (i) => fmtR(RV[i]), onInput: (i) => { P.Rs = RV[i]; recompute(); } });
    const z0S = NB.slider(c1, { label: '선로 Z₀', min: 25, max: 100, step: 5, value: 50, fmt: (v) => v + ' Ω', onInput: (v) => { P.Z0 = v; recompute(); } });
    const rlS = NB.slider(c1, { label: '수신단 R_L', min: 0, max: RV.length - 1, value: RV.length - 1, fmt: (i) => fmtR(RV[i]), onInput: (i) => { P.RL = RV[i]; recompute(); } });
    const trS = NB.slider(c1, { label: '상승 시간 t_r', min: 0, max: 30, value: 2, fmt: (i) => (i * 0.05).toFixed(2) + ' T_d', onInput: (i) => { P.tr = i * 0.05; recompute(); } });
    const c2 = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); Wd.body.append(c2);
    const presets = { '정합 종단': [10, 50, 50], '개방 끝': [10, 50, INF], '단락 끝': [10, 50, 0], '직렬 종단': [50, 50, INF], '양단 종단': [50, 50, 50], '부정합 (R_L=150)': [50, 50, 150] };
    Object.entries(presets).forEach(([n, [rs, z, rl]]) => NB.button(c2, n, () => { P.Rs = rs; P.Z0 = z; P.RL = rl; rsS.set(RV.indexOf(rs)); z0S.set(z); rlS.set(RV.indexOf(rl)); P.t = 0; recompute(); }));
    const playB = NB.button(c2, '⏸', () => { P.play = !P.play; playB.textContent = P.play ? '⏸' : '▶'; });
    NB.button(c2, '↺ 처음부터', () => { P.t = 0; P.play = true; playB.textContent = '⏸'; });
    const tS = NB.slider(c2, { label: '시간', min: 0, max: 1000, value: 0, fmt: (v) => (v / 100).toFixed(2) + ' T_d', onInput: (v) => { P.t = v / 100; P.play = false; playB.textContent = '▶'; drawAll(); }, width: 200 });
    const lineCv = NB.canvas(Wd.body, { height: 190 });
    const lay = el('div', { class: 'split', style: { marginTop: '10px' } }); Wd.body.append(lay);
    const wb = el('div'), bb = el('div'); lay.append(wb, bb);
    const waveCv = NB.canvas(wb, { height: 260 });
    const bounceCv = NB.canvas(bb, { height: 260 });
    const st = NB.stats(Wd.body, [{ key: 'gs', label: 'Γ_S (근단)' }, { key: 'gl', label: 'Γ_L (원단)' }, { key: 'v1', label: '첫 진행파 V₁' }, { key: 'fin', label: '최종 DC 전압' }, { key: 'ov', label: '원단 최대 전압' }]);
    let Wv;
    function recompute() {
      Wv = waves(P.Rs, P.Z0, P.RL, 1);
      st.gs.set(Wv.gs.toFixed(3)); st.gl.set(Wv.gl.toFixed(3));
      st.v1.set(Wv.a0.toFixed(3), 'V');
      const fin = P.RL === INF ? 1 : P.RL / (P.Rs + P.RL);
      st.fin.set(fin.toFixed(3), 'V');
      let mx = 0; for (let t = 0; t <= 20; t += 0.02) mx = Math.max(mx, V(Wv, 1, t, P.tr));
      st.ov.set(mx.toFixed(3), 'V', mx > fin * 1.15 ? 'bad' : 'good');
      drawAll();
    }
    function drawLine() {
      const { ctx, w, h } = lineCv;
      ctx.clearRect(0, 0, w, h);
      const x0 = 120, x1 = w - 90, yb = 150, ys = 52; // ys px per volt
      const node = NB.css('--node'), stroke = NB.css('--node-stroke'), text = NB.css('--text'), mute = NB.css('--text-mute'), acc = NB.css('--accent'), c3 = NB.css('--c3');
      // source
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.fillStyle = node;
      ctx.beginPath(); ctx.arc(30, yb - 25, 16, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = text; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('V_S', 30, yb - 25);
      ctx.strokeStyle = stroke; ctx.beginPath(); ctx.moveTo(46, yb - 25); ctx.lineTo(60, yb - 25); ctx.stroke();
      NB.roundRect(ctx, 60, yb - 33, 44, 16, 3); ctx.fillStyle = node; ctx.fill(); ctx.stroke();
      ctx.fillStyle = text; ctx.font = '10px ' + NB.css('--mono'); ctx.fillText(P.Rs === INF ? '∞' : P.Rs + 'Ω', 82, yb - 25);
      ctx.beginPath(); ctx.moveTo(104, yb - 25); ctx.lineTo(x0, yb - 25); ctx.lineTo(x0, yb); ctx.stroke();
      // line (two conductors)
      ctx.strokeStyle = NB.css('--link'); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, yb + 14); ctx.lineTo(x1, yb + 14); ctx.stroke();
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.fillText('Z₀ = ' + P.Z0 + ' Ω,  지연 T_d', (x0 + x1) / 2, yb + 28);
      // load
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
      if (P.RL !== INF) {
        ctx.beginPath(); ctx.moveTo(x1, yb); ctx.lineTo(x1 + 30, yb); ctx.lineTo(x1 + 30, yb + 2); ctx.stroke();
        NB.roundRect(ctx, x1 + 22, yb + 2, 16, 12, 2); ctx.fillStyle = node; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1 + 30, yb + 14); ctx.lineTo(x1, yb + 14); ctx.stroke();
      }
      ctx.fillStyle = text; ctx.font = '10px ' + NB.css('--mono'); ctx.textAlign = 'left';
      ctx.fillText('R_L ' + (P.RL === INF ? '∞' : P.RL + 'Ω'), x1 + 8, yb - 12);
      // grid for voltage
      ctx.strokeStyle = NB.css('--grid'); ctx.lineWidth = 1;
      [0.5, 1, 1.5, 2].forEach((v) => { ctx.beginPath(); ctx.moveTo(x0, yb - v * ys); ctx.lineTo(x1, yb - v * ys); ctx.stroke(); });
      ctx.fillStyle = mute; ctx.textAlign = 'right';
      [1, 2].forEach((v) => ctx.fillText(v + 'V', x0 - 4, yb - v * ys));
      // voltage profile
      ctx.beginPath(); ctx.moveTo(x0, yb);
      for (let i = 0; i <= 200; i++) { const z = i / 200; ctx.lineTo(x0 + z * (x1 - x0), yb - NB.clamp(V(Wv, z, P.t, P.tr), -0.6, 2.4) * ys); }
      ctx.lineTo(x1, yb); ctx.closePath();
      ctx.fillStyle = NB.alpha(acc, 0.22); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const z = i / 200, y = yb - NB.clamp(V(Wv, z, P.t, P.tr), -0.6, 2.4) * ys; if (i) ctx.lineTo(x0 + z * (x1 - x0), y); else ctx.moveTo(x0, y); }
      ctx.stroke();
      // wavefront markers
      ctx.fillStyle = c3;
      for (const wv of Wv.list) {
        [[wv.a, P.t - 2 * wv.k, 1], [wv.b, P.t - (2 * wv.k + 1), -1]].forEach(([amp, dt, dir]) => {
          if (Math.abs(amp) < 0.01 || dt < 0 || dt > 1) return;
          const z = dir > 0 ? dt : 1 - dt, x = x0 + z * (x1 - x0);
          ctx.beginPath(); ctx.moveTo(x + dir * 9, yb - 8); ctx.lineTo(x - dir * 3, yb - 14); ctx.lineTo(x - dir * 3, yb - 2); ctx.fill();
        });
      }
      ctx.fillStyle = text; ctx.font = 'bold 13px ' + NB.css('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('t = ' + P.t.toFixed(2) + ' T_d', 8, 6);
    }
    function drawWave() {
      const { ctx, w, h } = waveCv;
      const n = 500, near = [], far = [];
      for (let i = 0; i <= n; i++) { const t = i / n * 10; near.push(V(Wv, 0, t, P.tr)); far.push(V(Wv, 1, t, P.tr)); }
      const r = L.plotWave(ctx, { w, h, x0: 0, x1: 10, y0: -0.6, y1: 2.2, xTicks: [0, 2, 4, 6, 8, 10], yTicks: [-0.5, 0, 0.5, 1, 1.5, 2], xFmt: (v) => v + 'T', series: [
        { data: near, color: NB.css('--c1'), xs: (i) => i / n * 10 },
        { data: far, color: NB.css('--c3'), xs: (i) => i / n * 10 }
      ] });
      ctx.strokeStyle = NB.css('--text-mute'); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(r.X(P.t), r.pad.t); ctx.lineTo(r.X(P.t), h - r.pad.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = NB.css('--c1'); ctx.fillText('● 근단 (드라이버)', r.pad.l + 6, 8);
      ctx.fillStyle = NB.css('--c3'); ctx.fillText('● 원단 (수신기)', r.pad.l + 120, 8);
    }
    function drawBounce() {
      const { ctx, w, h } = bounceCv;
      ctx.clearRect(0, 0, w, h);
      const xL = 60, xR = w - 60, y0 = 26, y1 = h - 10, tmax = 7;
      const Y = (t) => y0 + t / tmax * (y1 - y0);
      const mute = NB.css('--text-mute'), text = NB.css('--text'), acc = NB.css('--accent');
      ctx.strokeStyle = NB.css('--node-stroke'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xL, y0); ctx.lineTo(xL, y1); ctx.moveTo(xR, y0); ctx.lineTo(xR, y1); ctx.stroke();
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'center';
      ctx.fillText('근단 (Γ_S=' + Wv.gs.toFixed(2) + ')', xL, 12); ctx.fillText('원단 (Γ_L=' + Wv.gl.toFixed(2) + ')', xR, 12);
      ctx.textAlign = 'right'; for (let t = 0; t <= tmax; t++) ctx.fillText(t + 'T', xL - 6, Y(t) + 4);
      ctx.font = '11px ' + NB.css('--mono');
      for (const wv of Wv.list) {
        [[wv.a, 2 * wv.k, xL, xR], [wv.b, 2 * wv.k + 1, xR, xL]].forEach(([amp, t, xa, xb]) => {
          if (t >= tmax || Math.abs(amp) < 1e-4) return;
          const passed = P.t >= t;
          ctx.strokeStyle = passed ? acc : NB.alpha(acc.startsWith('#') ? acc : '#0c8599', 0.35); ctx.lineWidth = passed ? 2 : 1.2;
          const tEnd = Math.min(t + 1, tmax);
          ctx.beginPath(); ctx.moveTo(xa, Y(t)); ctx.lineTo(xa + (xb - xa) * (tEnd - t), Y(tEnd)); ctx.stroke();
          const mx = (xa + xb) / 2, my = Y(t + 0.5);
          ctx.fillStyle = text; ctx.textAlign = 'center';
          ctx.fillText((amp >= 0 ? '+' : '') + amp.toFixed(3), mx, my - 6);
        });
      }
      if (P.t <= tmax) { ctx.strokeStyle = NB.css('--c3'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xL, Y(P.t)); ctx.lineTo(xR, Y(P.t)); ctx.stroke(); ctx.setLineDash([]); }
    }
    function drawAll() { drawLine(); drawWave(); drawBounce(); }
    lineCv.draw = drawLine; waveCv.draw = drawWave; bounceCv.draw = drawBounce;
    recompute();
    NB.loop(Wd.root, (dt) => {
      if (P.play) { P.t += dt * 1.2; if (P.t > 10) P.t = 0; tS.set(Math.round(P.t * 100)); drawAll(); }
    });
  })();

  /* ======================================================
     2.2 Termination comparison with data pattern
     ====================================================== */
  (function () {
    const Wd = NB.widget('w-term'); if (!Wd) return;
    const P = { tb: 1.5, tr: 0.2, seed: 3 };
    const ctr = el('div', { class: 'controls' }); Wd.body.append(ctr);
    NB.slider(ctr, { label: '비트 시간 (T_d 단위)', min: 0.5, max: 8, step: 0.1, value: P.tb, fmt: (v) => v.toFixed(1) + ' T_d', onInput: (v) => { P.tb = v; draw(); } });
    NB.slider(ctr, { label: '상승 시간', min: 0, max: 1, step: 0.05, value: P.tr, fmt: (v) => v.toFixed(2) + ' T_d', onInput: (v) => { P.tr = v; draw(); } });
    NB.button(ctr, '🎲 다른 비트열', () => { P.seed++; draw(); });
    const S = [
      { n: '무종단 (R_S=10, R_L=∞)', Rs: 10, RL: INF, c: '--c3' },
      { n: '직렬 종단 (R_S=50, R_L=∞)', Rs: 50, RL: INF, c: '--c1' },
      { n: '병렬 종단 (R_S=10, R_L=50)', Rs: 10, RL: 50, c: '--c2' },
      { n: '양단 종단 (R_S=50, R_L=50)', Rs: 50, RL: 50, c: '--c4' }
    ];
    const cv = NB.canvas(Wd.body, { height: 4 * 92 + 10 });
    const tbl = el('div', { class: 'table-wrap' }); Wd.body.append(tbl);
    function draw() {
      const rnd = NB.rng(P.seed * 7 + 1);
      const nb = 14, bits = []; for (let i = 0; i < nb; i++) bits.push(rnd() < 0.5 ? 1 : 0);
      bits[0] = 0; bits[1] = 1;
      const T = nb * P.tb + 3, n = 700;
      const { ctx, w } = cv;
      ctx.clearRect(0, 0, w, cv.h);
      const rows = [];
      S.forEach((s, si) => {
        const Wv = waves(s.Rs, 50, s.RL, 1);
        const fin = s.RL === INF ? 1 : s.RL / (s.Rs + s.RL);
        const step = (t) => { let v = 0; for (const x of Wv.list) v += (x.a + x.b) * ramp(t - (2 * x.k + 1), P.tr); return v; };
        const ys = [];
        let mx = -9, mn = 9;
        for (let i = 0; i <= n; i++) {
          const t = i / n * T;
          let v = 0;
          for (let j = 0; j < nb; j++) { const d = bits[j] - (j ? bits[j - 1] : 0); if (d) v += d * step(t - j * P.tb); }
          ys.push(v / fin);
          if (t > 1.5) { mx = Math.max(mx, v / fin); mn = Math.min(mn, v / fin); }
        }
        const y0 = si * 92;
        ctx.save(); ctx.translate(0, y0);
        const ideal = []; for (let i = 0; i <= n; i++) { const t = i / n * T - 1; const j = Math.floor(t / P.tb); ideal.push(t < 0 ? 0 : bits[Math.min(nb - 1, j)]); }
        L.plotWave(ctx, { w, h: 90, x0: 0, x1: T, y0: Math.min(-0.3, Math.min(...ys) - 0.1), y1: Math.max(1.4, Math.max(...ys) + 0.1), padL: 40, yTicks: [0, 1], keep: true, series: [
          { data: ideal, color: NB.css('--border-strong'), width: 1, dash: [3, 3], xs: (i) => i / n * T },
          { data: ys, color: NB.css(s.c), width: 2, xs: (i) => i / n * T }
        ] });
        ctx.fillStyle = NB.css(s.c); ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(s.n, 46, 2);
        ctx.restore();
        const pw = s.RL === INF ? 0 : 0.5 * 1000 / (s.Rs + s.RL); // mW at 1 V
        rows.push([s, ((mx - 1) * 100).toFixed(0), (mn * 100).toFixed(0), (fin).toFixed(2), pw.toFixed(1)]);
      });
      tbl.innerHTML = '<table class="data" style="font-size:14px"><tr><th>방식</th><th>오버슈트</th><th>언더슈트 최저</th><th>DC 레벨 (V)</th><th>DC 전력 (mW)</th></tr>' +
        rows.map(([s, o, u, f, p]) => '<tr><td style="color:var(' + s.c + ')">' + s.n + '</td><td class="mono">' + o + '%</td><td class="mono">' + u + '%</td><td class="mono">' + f + '</td><td class="mono">' + p + '</td></tr>').join('') + '</table>';
    }
    cv.draw = draw;
    draw();
  })();

  /* ======================================================
     2.3 Lumped vs distributed
     ====================================================== */
  (function () {
    const Wd = NB.widget('w-crit'); if (!Wd) return;
    const LEN = [0.5, 1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500];
    const TR = [10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000];
    const P = { len: 50, tr: 100, er: 4 };
    const ctr = el('div', { class: 'controls' }); Wd.body.append(ctr);
    NB.slider(ctr, { label: '선로 길이', min: 0, max: LEN.length - 1, value: LEN.indexOf(50), fmt: (i) => LEN[i] + ' mm', onInput: (i) => { P.len = LEN[i]; draw(); } });
    NB.slider(ctr, { label: '상승 시간 t_r', min: 0, max: TR.length - 1, value: TR.indexOf(100), fmt: (i) => TR[i] + ' ps', onInput: (i) => { P.tr = TR[i]; draw(); } });
    NB.slider(ctr, { label: '유전율 ε_r,eff', min: 1, max: 10, step: 0.1, value: P.er, fmt: (v) => v.toFixed(1), onInput: (v) => { P.er = v; draw(); } });
    const verdict = el('div', { style: { margin: '4px 0 8px', fontSize: '15px' } }); Wd.body.append(verdict);
    const cv = NB.canvas(Wd.body, { height: 220 });
    const st = NB.stats(Wd.body, [{ key: 'td', label: '선로 지연 T_d' }, { key: 'r', label: 'T_d / t_r' }, { key: 'ov', label: '원단 오버슈트' }, { key: 'lc', label: '임계 길이 (t_r/6)' }]);
    function draw() {
      const psmm = Math.sqrt(P.er) / 0.29979; // ps per mm
      const td = P.len * psmm;
      const Wv = waves(10, 50, INF, 1);
      const trn = P.tr / td;
      const Tmax = Math.max(8, 4 * trn + 4), n = 600;
      const ys = [], xs = [];
      let mx = 0;
      for (let i = 0; i <= n; i++) { const t = i / n * Tmax; const v = V(Wv, 1, t, trn); ys.push(v); mx = Math.max(mx, v); }
      const { ctx, w, h } = cv;
      const tps = Tmax * td;
      const tk = []; const stp = Math.pow(10, Math.floor(Math.log10(tps / 4))); for (let t = 0; t <= tps; t += stp * (tps / stp > 20 ? 5 : tps / stp > 8 ? 2 : 1)) tk.push(t);
      L.plotWave(ctx, { w, h, x0: 0, x1: tps, y0: -0.2, y1: 2.1, yTicks: [0, 0.5, 1, 1.5, 2], xTicks: tk, xFmt: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'ns' : v.toFixed(0) + 'ps'), series: [
        { data: ys, color: NB.css('--c3'), xs: (i) => i / n * tps }
      ] });
      const ratio = td / P.tr;
      st.td.set(td.toFixed(0), 'ps');
      st.r.set(ratio.toFixed(2), '', ratio > 1 / 6 ? 'bad' : 'good');
      st.ov.set(((mx - 1) * 100).toFixed(0) + '%', '', mx > 1.15 ? 'bad' : 'good');
      st.lc.set((P.tr / 6 / psmm).toFixed(1), 'mm');
      verdict.innerHTML = ratio > 1 / 6
        ? '<span class="badge bad">전송선로 영역</span> 선로 지연이 상승 시간의 1/6보다 깁니다. 종단과 임피던스 정합이 필요합니다.'
        : '<span class="badge ok">집중 소자 영역</span> 반사가 상승 구간 안에 섞여 거의 보이지 않습니다. 선로를 하나의 커패시턴스로 근사할 수 있습니다.';
    }
    cv.draw = draw;
    draw();
  })();
});
