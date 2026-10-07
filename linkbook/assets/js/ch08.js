/* LinkBook Chapter 8 — On-chip interfaces & CDC */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const S = NB.svgEl;

  /* ======================================================
     8.1 valid/ready waveform editor
     ====================================================== */
  (function () {
    const W = NB.widget('w-vr'); if (!W) return;
    const N = 16;
    let valid = [0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0], ready = [1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
    const br = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(br);
    const presets = {
      '연속 전송': [Array(N).fill(1), Array(N).fill(1)],
      '백프레셔 (ready 50%)': [Array(N).fill(1), Array.from({ length: N }, (_, i) => (i % 2 ? 1 : 0))],
      '수신 측이 항상 준비': [[0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0], Array(N).fill(1)],
      '규칙 위반 예': [[0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0]]
    };
    Object.entries(presets).forEach(([n, [v, r]]) => NB.button(br, n, () => { valid = v.slice(); ready = r.slice(); draw(); }));
    const svg = S('svg', { class: 'vis', viewBox: '0 0 820 250', style: 'width:100%;height:auto' }); W.body.append(svg);
    const st = NB.stats(W.body, [{ key: 'n', label: '전송 횟수' }, { key: 'thr', label: '처리량' }, { key: 'v', label: '규칙 위반' }]);
    function draw() {
      svg.innerHTML = '';
      const x0 = 80, cw = (820 - x0 - 10) / N, rows = { clk: 30, valid: 80, ready: 125, data: 170, fire: 215 };
      const text = NB.css('--text'), mute = NB.css('--text-mute'), grid = NB.css('--grid'), acc = NB.css('--accent'), ok = NB.css('--accent-2'), bad = NB.css('--danger'), c4 = NB.css('--c4');
      Object.entries({ clk: 'clk', valid: 'valid', ready: 'ready', data: 'data', fire: '전송' }).forEach(([k, l]) => { const t = S('text', { x: 6, y: rows[k] + 5, 'font-size': 13, 'font-weight': 700, fill: k === 'valid' || k === 'ready' ? acc : text, 'font-family': 'var(--mono)' }, svg); t.textContent = l; });
      // compute transfers & violations
      let d = 0; const dataAt = [], fire = [], viol = [];
      for (let i = 0; i < N; i++) {
        dataAt.push(valid[i] ? d : null);
        fire.push(valid[i] && ready[i]);
        if (fire[i]) d++;
        viol.push(i > 0 && valid[i - 1] && !ready[i - 1] && !valid[i]);
      }
      for (let i = 0; i <= N; i++) S('line', { x1: x0 + i * cw, y1: 12, x2: x0 + i * cw, y2: 240, stroke: grid, 'stroke-width': 1 }, svg);
      // clock
      let p = 'M' + x0 + ' ' + (rows.clk + 10);
      for (let i = 0; i < N; i++) { const x = x0 + i * cw; p += ' L' + x + ' ' + (rows.clk - 10) + ' L' + (x + cw / 2) + ' ' + (rows.clk - 10) + ' L' + (x + cw / 2) + ' ' + (rows.clk + 10) + ' L' + (x + cw) + ' ' + (rows.clk + 10); }
      S('path', { d: p, fill: 'none', stroke: c4, 'stroke-width': 1.6 }, svg);
      const digital = (arr, y, col) => {
        let q = '';
        arr.forEach((v, i) => { const yy = v ? y - 12 : y + 12, x = x0 + i * cw; q += (i ? ' L' : 'M') + x + ' ' + yy + ' L' + (x + cw) + ' ' + yy; });
        S('path', { d: q, fill: 'none', stroke: col, 'stroke-width': 2.2 }, svg);
      };
      digital(valid, rows.valid, acc); digital(ready, rows.ready, acc);
      // data bus
      for (let i = 0; i < N; i++) {
        const x = x0 + i * cw, y = rows.data;
        if (dataAt[i] == null) { S('line', { x1: x, y1: y, x2: x + cw, y2: y, stroke: mute, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, svg); continue; }
        S('path', { d: 'M' + (x + 3) + ' ' + y + ' L' + (x + 8) + ' ' + (y - 11) + ' L' + (x + cw - 3) + ' ' + (y - 11) + ' L' + (x + cw + 2) + ' ' + y + ' L' + (x + cw - 3) + ' ' + (y + 11) + ' L' + (x + 8) + ' ' + (y + 11) + 'Z', fill: NB.alpha(viol[i + 1] ? bad : acc, 0.12), stroke: viol[i + 1] ? bad : acc, 'stroke-width': 1.3 }, svg);
        const t = S('text', { x: x + cw / 2 + 2, y: y + 4, 'text-anchor': 'middle', 'font-size': 11, fill: text, 'font-family': 'var(--mono)' }, svg); t.textContent = 'D' + dataAt[i];
      }
      for (let i = 0; i < N; i++) {
        const x = x0 + i * cw;
        if (fire[i]) { S('rect', { x: x + 3, y: rows.fire - 12, width: cw - 6, height: 24, rx: 5, fill: ok }, svg); const t = S('text', { x: x + cw / 2, y: rows.fire + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, svg); t.textContent = 'D' + dataAt[i]; }
        if (viol[i]) { S('rect', { x: x + 2, y: rows.valid - 20, width: cw - 4, height: 40, rx: 6, fill: NB.alpha(bad, 0.18), stroke: bad, 'stroke-width': 2 }, svg); const t = S('text', { x: x + cw / 2, y: rows.valid - 23, 'text-anchor': 'middle', 'font-size': 10, fill: bad, 'font-weight': 700 }, svg); t.textContent = '위반!'; }
        ['valid', 'ready'].forEach((k) => {
          const r = S('rect', { x, y: rows[k] - 18, width: cw, height: 36, fill: 'transparent', style: 'cursor:pointer' }, svg);
          r.addEventListener('click', () => { (k === 'valid' ? valid : ready)[i] ^= 1; draw(); });
        });
      }
      const nT = fire.filter(Boolean).length, nV = viol.filter(Boolean).length;
      st.n.set(nT); st.thr.set((100 * nT / N).toFixed(0) + '%'); st.v.set(nV, '', nV ? 'bad' : 'good');
    }
    NB.onTheme(draw);
    draw();
  })();

  /* ======================================================
     8.2 Pipeline backpressure
     ====================================================== */
  (function () {
    const W = NB.widget('w-pipe'); if (!W) return;
    const P = { mode: 'skid', p: 0.8, n: 4, speed: 3 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '파이프라인 방식', value: P.mode, options: [{ value: 'comb', label: '조합 ready' }, { value: 'reg', label: '레지스터 ready (단순)' }, { value: 'skid', label: '스키드 버퍼' }], onChange: (v) => { P.mode = v; reset(); } });
    NB.slider(ctr, { label: '소비자 ready 확률 p', min: 0.1, max: 1, step: 0.05, value: P.p, fmt: (v) => v.toFixed(2), onInput: (v) => { P.p = v; } });
    NB.slider(ctr, { label: '단 수', min: 2, max: 8, value: P.n, onInput: (v) => { P.n = v; reset(); } });
    NB.slider(ctr, { label: '속도', min: 1, max: 20, value: P.speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { P.speed = v; } });
    const cv = NB.canvas(W.body, { height: 190 });
    const st = NB.stats(W.body, [{ key: 'thr', label: '처리량 (최근 200 사이클)' }, { key: 'max', label: '이론 최대' }, { key: 'path', label: 'ready 조합 경로' }, { key: 'area', label: '저장 공간' }]);
    let stg, prod, hist, rnd, last;
    function reset() { stg = Array.from({ length: P.n }, () => []); prod = 0; hist = []; rnd = NB.rng(3); last = { rdy: [], moves: [] }; }
    function step() {
      const n = P.n, cap = P.mode === 'skid' ? 2 : 1;
      const cr = rnd() < P.p;
      const len0 = stg.map((s) => s.length);
      const rdyIn = new Array(n);
      if (P.mode === 'comb') {
        let down = cr;
        for (let i = n - 1; i >= 0; i--) { rdyIn[i] = len0[i] < 1 || down; down = rdyIn[i]; }
      } else for (let i = 0; i < n; i++) rdyIn[i] = len0[i] < cap;
      const moves = [];
      // consumer pops last stage
      let popped = null;
      if (len0[n - 1] > 0 && cr) popped = stg[n - 1].shift();
      for (let i = n - 2; i >= 0; i--) {
        if (len0[i] > 0 && rdyIn[i + 1]) { const v = stg[i].shift(); stg[i + 1].push(v); moves.push(i); }
      }
      if (rdyIn[0]) { stg[0].push(prod++); moves.push(-1); }
      hist.push(popped != null ? 1 : 0); if (hist.length > 200) hist.shift();
      last = { rdy: rdyIn, cr, popped };
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const n = P.n, cap = P.mode === 'skid' ? 2 : 1;
      const bw = Math.min(90, (w - 200) / n - 18), gap = (w - 200 - n * bw) / (n + 1);
      const node = NB.css('--node'), stroke = NB.css('--node-stroke'), text = NB.css('--text'), mute = NB.css('--text-mute'), acc = NB.css('--accent'), ok = NB.css('--accent-2'), bad = NB.css('--danger');
      const box = (x, y, ww, hh, t) => { ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; NB.roundRect(ctx, x, y, ww, hh, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle = text; ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + ww / 2, y + hh / 2); };
      box(8, 60, 80, 60, '생산자'); box(w - 88, 60, 80, 60, '소비자');
      const xs = (i) => 100 + gap + i * (bw + gap);
      for (let i = 0; i < n; i++) {
        const x = xs(i);
        ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.fillStyle = node;
        NB.roundRect(ctx, x, 50, bw, 80, 8); ctx.fill(); ctx.stroke();
        for (let k = 0; k < cap; k++) {
          const sy = 58 + k * (64 / cap), sh = 64 / cap - 6;
          const v = stg[i][k];
          ctx.fillStyle = v != null ? NB.palette()[v % 8] : NB.css('--surface-2');
          NB.roundRect(ctx, x + 8, sy, bw - 16, sh, 5); ctx.fill();
          if (v != null) { ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v, x + bw / 2, sy + sh / 2); }
        }
        ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('단 ' + i + (cap === 2 ? ' (2칸)' : ''), x + bw / 2, 136);
      }
      // ready arrows (backward)
      const rdy = last.rdy || [];
      for (let i = 0; i <= n; i++) {
        const xa = i === 0 ? 88 : xs(i - 1) + bw, xb = i === n ? w - 88 : xs(i);
        const r = i === n ? last.cr : rdy[i];
        ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xa + 2, 80); ctx.lineTo(xb - 8, 80); ctx.stroke();
        ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(xb - 2, 80); ctx.lineTo(xb - 10, 75); ctx.lineTo(xb - 10, 85); ctx.fill();
        ctx.fillStyle = r ? ok : bad; ctx.font = 'bold 10.5px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(r ? 'rdy' : 'stall', (xa + xb) / 2, 98);
      }
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(P.mode === 'comb' ? 'ready가 소비자에서 생산자까지 조합 회로로 한 번에 전파' : P.mode === 'reg' ? 'ready = 이전 사이클에 비어 있었는가 (레지스터)' : 'ready = 2칸 중 빈칸이 있는가 (레지스터), 넘친 데이터는 두 번째 칸에 "미끄러짐"', 8, 6);
      const thr = hist.reduce((a, b) => a + b, 0) / Math.max(1, hist.length);
      st.thr.set(thr.toFixed(2), 'item/cyc');
      st.max.set(P.mode === 'reg' ? '0.5 (최대)' : P.p.toFixed(2));
      st.path.set(P.mode === 'comb' ? n + ' 단' : '1 단', '', P.mode === 'comb' && n > 3 ? 'bad' : 'good');
      st.area.set(n * (P.mode === 'skid' ? 2 : 1), '엔트리');
    }
    reset();
    cv.draw = draw;
    let acc = 0;
    NB.loop(cv.canvas, (dt) => { acc += dt * P.speed; while (acc >= 1) { acc -= 1; step(); } draw(); });
  })();

  /* ======================================================
     8.3 Metastability
     ====================================================== */
  (function () {
    const W = NB.widget('w-meta'); if (!W) return;
    const P = { tau: 20, tw: 30, fclk: 1, fdata: 100, stages: 2 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '재생 시간 상수 τ', min: 5, max: 60, value: P.tau, fmt: (v) => v + ' ps', onInput: (v) => { P.tau = v; upd(); } });
    NB.slider(ctr, { label: '메타안정 창 T_w', min: 5, max: 100, value: P.tw, fmt: (v) => v + ' ps', onInput: (v) => { P.tw = v; upd(); } });
    NB.slider(ctr, { label: '클록 f_clk', min: 0.1, max: 4, step: 0.1, value: P.fclk, fmt: (v) => v.toFixed(1) + ' GHz', onInput: (v) => { P.fclk = v; upd(); } });
    NB.slider(ctr, { label: '데이터 변화율 f_data', min: 1, max: 1000, value: P.fdata, fmt: (v) => v + ' MHz', onInput: (v) => { P.fdata = v; upd(); } });
    NB.slider(ctr, { label: '동기화 FF 단 수', min: 1, max: 4, value: P.stages, onInput: (v) => { P.stages = v; upd(); } });
    const lay = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' } }); W.body.append(lay);
    const a = el('div'), b = el('div'), c = el('div'); lay.append(a, b, c);
    const hill = NB.canvas(a, { height: 220 });
    const hcv = NB.canvas(b, { height: 220 });
    const chart = NB.chart(c, { height: 200, logY: true, xLabel: '동기화 단 수', yLabel: 'MTBF (초)', xMin: 1, xMax: 4, yMin: 1e-9, yMax: 1e60, yFmt: (v) => v.toExponential(1), xFmt: (x) => x + '단' });
    const st = NB.stats(W.body, [{ key: 'tr', label: '해소 허용 시간 t_r' }, { key: 'mtbf', label: 'MTBF' }, { key: 'gain', label: '단 하나 추가 시' }]);
    let ball = { x0: 0.02, t: 0, side: 1 };
    const fmtS = (s) => (s < 1e-6 ? (s * 1e9).toPrecision(2) + ' ns' : s < 1 ? (s * 1e3).toPrecision(2) + ' ms' : s < 3600 ? s.toPrecision(2) + ' 초' : s < 86400 * 365 ? (s / 86400).toPrecision(2) + ' 일' : s < 1.38e10 * 3.15e7 ? (s / 3.15e7).toPrecision(2) + ' 년' : (s / 3.15e7).toExponential(1) + ' 년 (우주 나이 초과!)');
    function mtbf(stages) { const T = 1e-9 / P.fclk, tr = stages * T * 0.9; return Math.exp(tr / (P.tau * 1e-12)) / (P.tw * 1e-12 * P.fclk * 1e9 * P.fdata * 1e6); }
    function upd() {
      const T = 1000 / P.fclk;
      st.tr.set((P.stages * T * 0.9).toFixed(0), 'ps');
      const m = mtbf(P.stages);
      st.mtbf.set(fmtS(m), '', m > 3.15e7 * 100 ? 'good' : 'bad');
      st.gain.set('×e^' + (T * 0.9 / P.tau).toFixed(0));
      const pts = []; for (let s = 1; s <= 4; s += 0.05) pts.push([s, mtbf(s)]);
      chart.set({ series: [{ name: 'MTBF', color: NB.css('--accent'), points: pts }, { name: '현재', color: NB.css('--c3'), points: [[P.stages, mtbf(P.stages)]], marker: true, width: 0, noLegend: true }, { name: '100년', color: NB.css('--text-mute'), points: [[1, 3.15e9], [4, 3.15e9]], dash: [4, 4], width: 1 }] });
      drawHist();
    }
    function drawHist() {
      const { ctx, w, h } = hcv;
      ctx.clearRect(0, 0, w, h);
      const rnd = NB.rng(7), bins = 24, cnt = new Array(bins).fill(0), maxT = 12;
      for (let i = 0; i < 2000; i++) { const x0 = Math.max(1e-12, rnd()); const t = Math.log(1 / x0); const k = Math.min(bins - 1, Math.floor(t / maxT * bins)); cnt[k]++; }
      const lmax = Math.log10(Math.max(...cnt) + 1), pad = 26;
      for (let k = 0; k < bins; k++) {
        const bh = cnt[k] ? (h - pad - 20) * Math.log10(cnt[k] + 1) / lmax : 0;
        ctx.fillStyle = NB.css('--accent'); ctx.fillRect(30 + k * (w - 40) / bins, h - pad - bh, (w - 40) / bins - 1, bh);
      }
      ctx.fillStyle = NB.css('--text-mute'); ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [0, 4, 8, 12].forEach((t) => ctx.fillText(t + 'τ', 30 + t / maxT * (w - 40), h - pad + 3));
      ctx.fillText('해소 시간 (로그 빈도 → 직선 = 지수 꼬리)', w / 2, h - 13);
      ctx.textAlign = 'left'; ctx.fillText('샘플 2000개', 32, 4);
    }
    function drawHill() {
      const { ctx, w, h } = hill;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, top = 50, sx = (w - 40) / 2;
      const Yh = (x) => top + 110 * x * x;
      ctx.strokeStyle = NB.css('--node-stroke'); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = -100; i <= 100; i++) { const x = i / 100; const px = cx + x * sx, py = Yh(x); if (i === -100) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = NB.css('--text-mute'); ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('0', cx - sx + 10, Yh(1) - 22); ctx.fillText('1', cx + sx - 10, Yh(1) - 22); ctx.fillText('메타안정점', cx, top - 26);
      const x = Math.min(1, ball.x0 * Math.exp(ball.t)) * ball.side;
      const px = cx + x * sx, py = Yh(x) - 9;
      ctx.fillStyle = Math.abs(x) >= 1 ? NB.css('--accent-2') : NB.css('--c3');
      ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill();
      ctx.fillStyle = NB.css('--text'); ctx.font = '11.5px ' + NB.css('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('초기 거리 δ = ' + ball.x0.toExponential(1), 6, h - 34);
      ctx.fillText('해소 시간 ≈ τ·ln(1/δ) = ' + Math.log(1 / ball.x0).toFixed(1) + 'τ', 6, h - 18);
    }
    hill.draw = drawHill; hcv.draw = drawHist;
    upd();
    NB.loop(hill.canvas, (dt) => {
      ball.t += dt * 1.6;
      if (ball.x0 * Math.exp(ball.t) > 1.6) { const r = Math.random(); ball = { x0: Math.pow(10, -1 - r * 5), t: 0, side: Math.random() < 0.5 ? -1 : 1 }; }
      drawHill();
    });
  })();

  /* ======================================================
     8.4 Asynchronous FIFO
     ====================================================== */
  const gray = (b) => b ^ (b >> 1);
  const ungray = (g) => { let b = 0; for (; g; g >>= 1) b ^= g; return b; };
  (function () {
    const W = NB.widget('w-afifo'); if (!W) return;
    const P = { wf: 300, rf: 200, pw: 0.7, pr: 0.9, speed: 1 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '쓰기 클록', min: 50, max: 500, step: 10, value: P.wf, fmt: (v) => v + ' MHz', onInput: (v) => { P.wf = v; } });
    NB.slider(ctr, { label: '읽기 클록', min: 50, max: 500, step: 10, value: P.rf, fmt: (v) => v + ' MHz', onInput: (v) => { P.rf = v; } });
    NB.slider(ctr, { label: '쓰기 시도 확률', min: 0, max: 1, step: 0.05, value: P.pw, fmt: (v) => v.toFixed(2), onInput: (v) => { P.pw = v; } });
    NB.slider(ctr, { label: '읽기 시도 확률', min: 0, max: 1, step: 0.05, value: P.pr, fmt: (v) => v.toFixed(2), onInput: (v) => { P.pr = v; } });
    NB.slider(ctr, { label: '시뮬레이션 속도', min: 0.2, max: 3, step: 0.1, value: P.speed, fmt: (v) => v.toFixed(1) + '×', onInput: (v) => { P.speed = v; } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const cv = NB.canvas(a, { height: 340 });
    const st = NB.stats(b, [{ key: 'occ', label: '실제 점유' }, { key: 'w', label: '쓴 개수' }, { key: 'r', label: '읽은 개수' }, { key: 'full', label: 'full로 막힌 쓰기' }, { key: 'empty', label: 'empty로 막힌 읽기' }]);
    b.append(el('div', { class: 'small', style: { fontWeight: 700, margin: '14px 0 6px' } }, '전이 중 샘플링: 포인터가 v → v+1로 바뀌는 순간 비트별로 무작위 포착'));
    const vS = NB.slider(b, { label: '전이 v → v+1', min: 0, max: 14, value: 7, fmt: (v) => v + ' → ' + (v + 1), onInput: () => sampleExp() });
    const sx = NB.canvas(b, { height: 150 });
    const D = 8, M = 16;
    const F = { t: 0, nw: 0, nr: 0, wb: 0, rb: 0, w1: 0, w2: 0, r1: 0, r2: 0, mem: new Array(D).fill(null), cnt: 0, val: 0, nw2: 0, nr2: 0, fullStall: 0, emptyStall: 0, flashW: 0, flashR: 0 };
    const rnd = NB.rng(5);
    function advance(dtNs) {
      const t1 = F.t + dtNs;
      const Tw = 1000 / P.wf, Tr = 1000 / P.rf;
      while (true) {
        const nwT = (F.nw + 1) * Tw, nrT = (F.nr + 1) * Tr;
        const next = Math.min(nwT, nrT);
        if (next > t1) break;
        if (nwT <= nrT) {
          F.nw++;
          const rSync = ungray(F.w2);
          const full = ((F.wb - rSync + M) % M) === D;
          if (rnd() < P.pw) { if (!full) { F.mem[F.wb % D] = F.val++; F.wb = (F.wb + 1) % M; F.nw2++; F.flashW = 1; } else F.fullStall++; }
          F.w2 = F.w1; F.w1 = gray(F.rb);
        } else {
          F.nr++;
          const wSync = ungray(F.r2);
          const empty = F.rb === wSync;
          if (rnd() < P.pr) { if (!empty) { F.mem[F.rb % D] = null; F.rb = (F.rb + 1) % M; F.nr2++; F.flashR = 1; } else F.emptyStall++; }
          F.r2 = F.r1; F.r1 = gray(F.wb);
        }
      }
      F.t = t1;
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = 170, R = 105, r0 = 62;
      const pal = NB.palette(), acc = NB.css('--c1'), rc = NB.css('--c3'), mute = NB.css('--text-mute'), text = NB.css('--text');
      for (let i = 0; i < D; i++) {
        const a0 = -Math.PI / 2 + i * 2 * Math.PI / D, a1 = a0 + 2 * Math.PI / D;
        ctx.beginPath(); ctx.arc(cx, cy, R, a0 + 0.02, a1 - 0.02); ctx.arc(cx, cy, r0, a1 - 0.02, a0 + 0.02, true); ctx.closePath();
        const v = F.mem[i];
        ctx.fillStyle = v != null ? NB.alpha(pal[v % 8], 0.75) : NB.css('--surface-2'); ctx.fill();
        ctx.strokeStyle = NB.css('--border-strong'); ctx.lineWidth = 1; ctx.stroke();
        const am = (a0 + a1) / 2;
        if (v != null) { ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(v, cx + Math.cos(am) * (R + r0) / 2, cy + Math.sin(am) * (R + r0) / 2); }
        ctx.fillStyle = mute; ctx.font = '10px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(i, cx + Math.cos(am) * (r0 - 10), cy + Math.sin(am) * (r0 - 10));
      }
      const ptr = (idx, col, lbl, rr, dash) => {
        const am = -Math.PI / 2 + ((idx % D) + 0.5) * 2 * Math.PI / D;
        const x1 = cx + Math.cos(am) * (R + 6), y1 = cy + Math.sin(am) * (R + 6), x2 = cx + Math.cos(am) * (R + rr), y2 = cy + Math.sin(am) * (R + rr);
        ctx.strokeStyle = col; ctx.lineWidth = dash ? 1.5 : 3; ctx.setLineDash(dash ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.font = (dash ? '' : 'bold ') + '11px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx + Math.cos(am) * (R + rr + 12), cy + Math.sin(am) * (R + rr + 12));
      };
      ptr(F.wb, acc, 'wptr', 26, false); ptr(F.rb, rc, 'rptr', 26, false);
      ptr(ungray(F.r2), acc, 'wptr@rclk', 46, true); ptr(ungray(F.w2), rc, 'rptr@wclk', 46, true);
      const full = ((F.wb - ungray(F.w2) + M) % M) === D, empty = F.rb === ungray(F.r2);
      ctx.font = 'bold 12px ' + NB.css('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = acc; ctx.fillText('쓰기 도메인 ' + P.wf + 'MHz', 6, 6);
      ctx.fillText('wptr  bin ' + F.wb.toString(2).padStart(4, '0') + '  gray ' + gray(F.wb).toString(2).padStart(4, '0'), 6, 24);
      ctx.fillStyle = full ? NB.css('--danger') : mute; ctx.fillText(full ? 'FULL' : 'not full', 6, 42);
      ctx.textAlign = 'right'; ctx.fillStyle = rc; ctx.fillText('읽기 도메인 ' + P.rf + 'MHz', w - 6, 6);
      ctx.fillText('rptr  bin ' + F.rb.toString(2).padStart(4, '0') + '  gray ' + gray(F.rb).toString(2).padStart(4, '0'), w - 6, 24);
      ctx.fillStyle = empty ? NB.css('--danger') : mute; ctx.fillText(empty ? 'EMPTY' : 'not empty', w - 6, 42);
      if (F.flashW > 0) { ctx.fillStyle = NB.alpha(acc, F.flashW * 0.6); ctx.beginPath(); ctx.arc(20, 70, 6, 0, 7); ctx.fill(); }
      if (F.flashR > 0) { ctx.fillStyle = NB.alpha(rc, F.flashR * 0.6); ctx.beginPath(); ctx.arc(w - 20, 70, 6, 0, 7); ctx.fill(); }
      st.occ.set(((F.wb - F.rb + M) % M) + ' / ' + D);
      st.w.set(F.nw2); st.r.set(F.nr2); st.full.set(F.fullStall); st.empty.set(F.emptyStall);
    }
    function sampleExp() {
      const v = vS.get(), nv = v + 1, rr = NB.rng(v + 11);
      const hb = new Array(16).fill(0), hg = new Array(16).fill(0);
      for (let i = 0; i < 400; i++) {
        let sb = 0, sg = 0;
        for (let k = 0; k < 4; k++) {
          sb |= ((rr() < 0.5 ? v : nv) >> k & 1) << k;
          sg |= ((rr() < 0.5 ? gray(v) : gray(nv)) >> k & 1) << k;
        }
        hb[sb]++; hg[ungray(sg)]++;
      }
      const { ctx, w, h } = sx;
      ctx.clearRect(0, 0, w, h);
      const half = h / 2, bw = (w - 60) / 16;
      [[hb, '이진', NB.css('--c3'), 0], [hg, '그레이', NB.css('--c2'), half]].forEach(([arr, lbl, col, y0]) => {
        const mx = Math.max(...arr);
        ctx.fillStyle = col; ctx.font = 'bold 11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(lbl, 0, y0 + 4);
        for (let k = 0; k < 16; k++) {
          const bh = arr[k] / mx * (half - 26), x = 50 + k * bw;
          const good = k === v || k === nv;
          ctx.fillStyle = arr[k] ? (good ? col : NB.css('--danger')) : NB.css('--surface-2');
          ctx.fillRect(x + 1, y0 + half - 14 - Math.max(1, bh), bw - 2, Math.max(1, bh));
          ctx.fillStyle = NB.css('--text-mute'); ctx.font = '9px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.fillText(k, x + bw / 2, y0 + half - 12);
        }
      });
    }
    cv.draw = draw; sx.draw = sampleExp;
    sampleExp();
    NB.loop(cv.canvas, (dt) => { advance(dt * 60 * P.speed); F.flashW = Math.max(0, F.flashW - dt * 4); F.flashR = Math.max(0, F.flashR - dt * 4); draw(); });
  })();
});
