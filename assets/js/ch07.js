/* Chapter 7 — Arbitration & allocation */
NB.ready(function () {
  'use strict';
  const { el } = NB;

  /* ---------------- arbiters ---------------- */
  function makeArb(type, n) {
    const A = { type, n, ptr: 0, W: [] };
    for (let i = 0; i < n; i++) { A.W.push([]); for (let j = 0; j < n; j++) A.W[i][j] = i < j ? 1 : 0; }
    A.grant = function (req) {
      let g = -1;
      if (type === 'fixed') { g = req.indexOf(true); }
      else if (type === 'rr') {
        for (let k = 0; k < n; k++) { const i = (A.ptr + k) % n; if (req[i]) { g = i; break; } }
        if (g >= 0) A.ptr = (g + 1) % n;
      } else {
        for (let i = 0; i < n && g < 0; i++) {
          if (!req[i]) continue;
          let beaten = false;
          for (let j = 0; j < n; j++) if (j !== i && req[j] && A.W[j][i]) { beaten = true; break; }
          if (!beaten) g = i;
        }
        if (g >= 0) for (let j = 0; j < n; j++) if (j !== g) { A.W[g][j] = 0; A.W[j][g] = 1; }
      }
      return g;
    };
    return A;
  }
  const jain = (x) => { const s = x.reduce((a, b) => a + b, 0), s2 = x.reduce((a, b) => a + b * b, 0); return s2 ? (s * s) / (x.length * s2) : 1; };

  (function () {
    const W = NB.widget('w-arb'); if (!W) return;
    const n = 4;
    let type = 'fixed', probs = [0.9, 0.5, 0.5, 0.5], speed = 6, running = true;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '중재 방식', value: type, options: [{ value: 'fixed', label: '고정 우선순위' }, { value: 'rr', label: '라운드 로빈' }, { value: 'matrix', label: '매트릭스' }], onChange: (v) => { type = v; reset(); } });
    NB.slider(ctr, { label: '속도', min: 1, max: 30, value: speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { speed = v; } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    const pb = NB.button(br, '⏸', () => { running = !running; pb.textContent = running ? '⏸' : '▶'; });
    NB.button(br, '한 사이클', () => { step(); draw(); });
    const c2 = el('div', { class: 'controls' }); W.body.append(c2);
    probs.forEach((p, i) => NB.slider(c2, { label: 'R' + i + ' 요청 확률', min: 0, max: 1, step: 0.05, value: p, fmt: (v) => v.toFixed(2), onInput: (v) => { probs[i] = v; bench(); } }));
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const cv = NB.canvas(left, { height: 200 });
    const stateBox = el('div', { style: { marginTop: '8px' } }); left.append(stateBox);
    right.append(el('div', { class: 'small', style: { fontWeight: 700, marginBottom: '6px' } }, '같은 요청 패턴, 20,000사이클: 요청당 승인률'));
    const tbl = el('div'); right.append(tbl);
    let A, hist, req, cnt, rnd;
    function reset() { A = makeArb(type, n); hist = []; cnt = { r: [0, 0, 0, 0], g: [0, 0, 0, 0] }; rnd = NB.rng(9); req = [false, false, false, false]; }
    function step() {
      req = probs.map((p) => rnd() < p);
      const g = A.grant(req);
      req.forEach((r, i) => { if (r) cnt.r[i]++; });
      if (g >= 0) cnt.g[g]++;
      hist.push({ req: req.slice(), g });
      if (hist.length > 60) hist.shift();
    }
    function bench() {
      const out = ['fixed', 'rr', 'matrix'].map((t) => {
        const a = makeArb(t, n), r = NB.rng(21), R = [0, 0, 0, 0], G = [0, 0, 0, 0];
        for (let k = 0; k < 20000; k++) { const q = probs.map((p) => r() < p); q.forEach((x, i) => { if (x) R[i]++; }); const g = a.grant(q); if (g >= 0) G[g]++; }
        const ratio = R.map((x, i) => (x ? G[i] / x : 1));
        return { t, ratio, j: jain(ratio) };
      });
      const names = { fixed: '고정', rr: '라운드 로빈', matrix: '매트릭스' };
      tbl.innerHTML = '<table class="data" style="font-size:13px;margin:0"><tr><th></th>' + [0, 1, 2, 3].map((i) => '<th class="mono">R' + i + '</th>').join('') + '<th>공정성</th></tr>' +
        out.map((o) => '<tr><td>' + names[o.t] + '</td>' + o.ratio.map((r) => '<td class="mono" style="color:' + (r < 0.3 ? 'var(--danger)' : 'inherit') + '">' + (100 * r).toFixed(0) + '%</td>').join('') + '<td class="mono"><b>' + o.j.toFixed(3) + '</b></td></tr>').join('') + '</table>';
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pal = NB.palette(), mute = NB.css('--text-mute'), grid = NB.css('--grid');
      const labW = 34, cols = 60, cw = (w - labW - 4) / cols, rh = 30;
      for (let i = 0; i < n; i++) {
        const y = 10 + i * (rh + 8);
        ctx.fillStyle = mute; ctx.font = 'bold 13px ' + NB.css('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('R' + i, 2, y + rh / 2);
        for (let c = 0; c < cols; c++) {
          const x = labW + c * cw, e = hist[hist.length - cols + c];
          ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, rh - 1);
          if (!e) continue;
          if (e.g === i) { ctx.fillStyle = pal[i]; ctx.fillRect(x + 1, y + 1, cw - 2, rh - 2); }
          else if (e.req[i]) { ctx.strokeStyle = pal[i]; ctx.lineWidth = 1.6; ctx.strokeRect(x + 2, y + 2, cw - 4, rh - 4); }
        }
      }
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('← 과거   현재 →', w - 4, 10 + n * (rh + 8) - 4);
      // state
      if (type === 'rr') stateBox.innerHTML = '<span class="small muted">라운드 로빈 포인터: </span>' + [0, 1, 2, 3].map((i) => '<span class="mono" style="padding:2px 8px;margin-right:4px;border-radius:5px;' + (i === A.ptr ? 'background:var(--accent);color:#fff' : 'background:var(--surface-2)') + '">R' + i + '</span>').join('') + '<span class="small muted"> (다음 우선)</span>';
      else if (type === 'matrix') stateBox.innerHTML = '<span class="small muted">우선순위 행렬 W (w<sub>ij</sub>=1: i가 j보다 우선)</span><table class="mono" style="border-collapse:collapse;margin-top:4px;font-size:13px">' + A.W.map((row, i) => '<tr><td style="padding:2px 8px;color:var(--text-mute)">R' + i + '</td>' + row.map((v, j) => '<td style="width:26px;text-align:center;border:1px solid var(--border);background:' + (i === j ? 'var(--surface-2)' : v ? 'var(--accent-soft)' : 'transparent') + '">' + (i === j ? '·' : v) + '</td>').join('') + '</tr>').join('') + '</table>';
      else stateBox.innerHTML = '<span class="small muted">고정 우선순위: R0 &gt; R1 &gt; R2 &gt; R3 (우선순위 인코더)</span>';
    }
    reset(); bench();
    cv.draw = draw;
    let acc = 0;
    NB.loop(cv.canvas, (dt) => { if (running) { acc += dt * speed; while (acc >= 1) { acc -= 1; step(); } } draw(); });
  })();

  /* ---------------- allocators ---------------- */
  const ALG = {
    inf: { name: '분리형 (입력 우선)' },
    outf: { name: '분리형 (출력 우선)' },
    inf2: { name: '분리형 ×2 반복' },
    wave: { name: '웨이브프론트' },
    max: { name: '최대 매칭' }
  };
  // returns {grant: n×n bool, stage: n×n marks}
  function allocate(alg, R, ip, op, wp) {
    const n = R.length;
    const G = R.map((r) => r.map(() => false)), S1 = R.map((r) => r.map(() => false));
    const rowFree = new Array(n).fill(true), colFree = new Array(n).fill(true);
    const sepInputFirst = () => {
      const choice = new Array(n).fill(-1);
      for (let i = 0; i < n; i++) {
        if (!rowFree[i]) continue;
        for (let k = 0; k < n; k++) { const j = (ip[i] + k) % n; if (R[i][j] && colFree[j]) { choice[i] = j; S1[i][j] = true; break; } }
      }
      for (let j = 0; j < n; j++) {
        if (!colFree[j]) continue;
        for (let k = 0; k < n; k++) { const i = (op[j] + k) % n; if (choice[i] === j) { G[i][j] = true; rowFree[i] = false; colFree[j] = false; break; } }
      }
    };
    if (alg === 'inf') sepInputFirst();
    else if (alg === 'inf2') { sepInputFirst(); sepInputFirst(); }
    else if (alg === 'outf') {
      const choice = new Array(n).fill(-1);
      for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) { const i = (op[j] + k) % n; if (R[i][j]) { choice[j] = i; S1[i][j] = true; break; } }
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const j = (ip[i] + k) % n; if (choice[j] === i) { G[i][j] = true; break; } }
    } else if (alg === 'wave') {
      for (let d = 0; d < n; d++) {
        const diag = (wp + d) % n;
        for (let i = 0; i < n; i++) {
          const j = (diag - i + n) % n;
          S1[i][j] = d; // order
          if (R[i][j] && rowFree[i] && colFree[j]) { G[i][j] = true; rowFree[i] = false; colFree[j] = false; }
        }
      }
    } else {
      const matchCol = new Array(n).fill(-1);
      const tryK = (i, seen) => { for (let j = 0; j < n; j++) if (R[i][j] && !seen[j]) { seen[j] = true; if (matchCol[j] < 0 || tryK(matchCol[j], seen)) { matchCol[j] = i; return true; } } return false; };
      for (let i = 0; i < n; i++) tryK(i, new Array(n).fill(false));
      matchCol.forEach((i, j) => { if (i >= 0) G[i][j] = true; });
    }
    return { G, S1 };
  }
  const msize = (G) => G.reduce((a, r) => a + r.filter(Boolean).length, 0);

  (function () {
    const W = NB.widget('w-alloc'); if (!W) return;
    const n = 5, P = ['N', 'E', 'S', 'W', 'L'];
    let alg = 'inf';
    let R = [[1, 1, 0, 0, 0], [1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 0, 1], [1, 0, 0, 1, 0]].map((r) => r.map(Boolean));
    let ip = [0, 0, 1, 3, 0], op = [0, 0, 0, 0, 0], wp = 0;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '알고리즘', value: alg, options: Object.keys(ALG).map((k) => ({ value: k, label: ALG[k].name })), onChange: (v) => { alg = v; draw(); } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    let dens = 0.4;
    NB.button(br, '🎲 무작위 요청', () => { R = R.map((r) => r.map(() => Math.random() < dens)); draw(); });
    NB.button(br, '🎯 포인터 섞기', () => { ip = ip.map(() => (Math.random() * n) | 0); op = op.map(() => (Math.random() * n) | 0); wp = (Math.random() * n) | 0; draw(); });
    NB.slider(ctr, { label: '무작위 요청 밀도', min: 0.1, max: 1, step: 0.05, value: dens, fmt: (v) => v.toFixed(2), onInput: (v) => { dens = v; } });
    const mats = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px', margin: '8px 0' } });
    W.body.append(mats);
    const st = NB.stats(W.body, [{ key: 'm', label: '이 알고리즘의 매칭' }, { key: 'x', label: '최대 매칭' }, { key: 'e', label: '효율' }]);
    const chBox = el('div', { style: { marginTop: '16px' } }); W.body.append(chBox);
    const chart = NB.chart(chBox, { height: 250, xLabel: '요청 밀도 (각 칸이 요청될 확률)', yLabel: '최대 매칭 대비 평균 크기', xMin: 0.05, xMax: 1, yMin: 0.5, yMax: 1.02 });
    function matrix(title, cell, sub) {
      const box = el('div');
      box.append(el('div', { class: 'small', style: { fontWeight: 700, marginBottom: '4px' } }, title));
      const g = el('div', { style: { display: 'grid', gridTemplateColumns: '30px repeat(' + n + ', 1fr)', gap: '3px', maxWidth: '260px' } });
      g.append(el('div'));
      P.forEach((p, j) => g.append(el('div', { class: 'mono small', style: { textAlign: 'center', color: 'var(--text-mute)' } }, p)));
      for (let i = 0; i < n; i++) {
        g.append(el('div', { class: 'mono small', style: { color: 'var(--text-mute)', alignSelf: 'center' } }, P[i]));
        for (let j = 0; j < n; j++) g.append(cell(i, j));
      }
      box.append(g);
      if (sub) box.append(el('div', { class: 'hint', style: { marginTop: '4px' } }, sub));
      return box;
    }
    const cellStyle = (bg, fg, bd) => ({ aspectRatio: '1', borderRadius: '6px', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 700, background: bg, color: fg || 'inherit', border: '1px solid ' + (bd || 'var(--border)'), cursor: 'default', fontFamily: 'var(--mono)' });
    function draw() {
      const { G, S1 } = allocate(alg, R, ip, op, wp);
      const M = allocate('max', R, ip, op, wp).G;
      mats.innerHTML = '';
      mats.append(matrix('① 요청 (클릭해서 편집)', (i, j) => {
        const c = el('button', { type: 'button', style: Object.assign(cellStyle(R[i][j] ? 'var(--accent-soft)' : 'var(--surface)', 'var(--accent)'), { cursor: 'pointer' }) }, R[i][j] ? 'R' : '');
        c.addEventListener('click', () => { R[i][j] = !R[i][j]; draw(); });
        return c;
      }, '행 = 입력 포트, 열 = 출력 포트'));
      let t2 = '② 1단계', sub2 = '';
      if (alg === 'inf' || alg === 'inf2') { t2 = '② 1단계: 각 입력이 출력 하나 선택'; sub2 = '입력 포인터: ' + ip.map((p, i) => P[i] + '→' + P[p]).join(' '); }
      else if (alg === 'outf') { t2 = '② 1단계: 각 출력이 입력 하나 선택'; sub2 = '출력 포인터: ' + op.map((p, j) => P[j] + '→' + P[p]).join(' '); }
      else if (alg === 'wave') { t2 = '② 파면 순서 (작을수록 먼저)'; sub2 = '우선순위 대각선 시작: ' + wp; }
      else { t2 = '② (증가 경로 탐색)'; sub2 = '하드웨어 1사이클 구현은 비현실적'; }
      mats.append(matrix(t2, (i, j) => {
        if (alg === 'wave') { const d = S1[i][j]; return el('div', { style: cellStyle(R[i][j] ? NB.alpha(NB.css('--c4'), 0.12 + 0.5 * (1 - d / n)) : 'var(--surface)', R[i][j] ? 'var(--c4)' : 'var(--text-mute)') }, String(d)); }
        if (alg === 'max') return el('div', { style: cellStyle(R[i][j] ? 'var(--surface-2)' : 'var(--surface)', 'var(--text-mute)') }, R[i][j] ? '·' : '');
        const on = S1[i][j];
        return el('div', { style: cellStyle(on ? 'var(--c7)' : R[i][j] ? 'var(--surface-2)' : 'var(--surface)', on ? '#fff' : 'var(--text-mute)') }, on ? '✓' : R[i][j] ? '·' : '');
      }, sub2));
      mats.append(matrix('③ 최종 승인', (i, j) => {
        const g = G[i][j], m = M[i][j];
        return el('div', { style: cellStyle(g ? 'var(--accent-2)' : R[i][j] ? 'var(--surface-2)' : 'var(--surface)', g ? '#fff' : 'var(--text-mute)', !g && m ? 'var(--accent-2)' : null) }, g ? 'G' : R[i][j] ? '·' : '');
      }, '초록 테두리 = 최대 매칭에는 있지만 놓친 칸'));
      const a = msize(G), b = msize(M);
      st.m.set(a); st.x.set(b); st.e.set(b ? (100 * a / b).toFixed(0) + '%' : '—', '', a < b ? 'bad' : 'good');
    }
    function mc() {
      const pal = NB.palette(), rnd = NB.rng(4);
      const series = ['inf', 'outf', 'inf2', 'wave'].map((a, k) => ({ name: ALG[a].name, color: pal[[0, 2, 3, 1][k]], marker: true, points: [] }));
      for (let d = 0.1; d <= 1.001; d += 0.1) {
        const sums = [0, 0, 0, 0]; let mx = 0;
        for (let t = 0; t < 4000; t++) {
          const RR = Array.from({ length: n }, () => Array.from({ length: n }, () => rnd() < d));
          const ipp = ip.map(() => (rnd() * n) | 0), opp = op.map(() => (rnd() * n) | 0), w = (rnd() * n) | 0;
          mx += msize(allocate('max', RR, ipp, opp, w).G);
          ['inf', 'outf', 'inf2', 'wave'].forEach((a, k) => { sums[k] += msize(allocate(a, RR, ipp, opp, w).G); });
        }
        series.forEach((s, k) => s.points.push([+d.toFixed(2), mx ? sums[k] / mx : 1]));
      }
      chart.set({ series });
    }
    draw();
    mc();
    NB.onTheme(() => { draw(); mc(); });
  })();
});
