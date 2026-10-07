/* Chapter 1 — Why NoC */
NB.ready(function () {
  'use strict';
  const { el } = NB;

  /* ======================================================
     1.1  Bus vs Crossbar vs Mesh
     ====================================================== */
  (function () {
    const W = NB.widget('w-interconnect'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const NS = [4, 9, 16, 25, 36, 64];
    let N = 16;
    NB.slider(ctr, { label: '코어 수 N', min: 0, max: NS.length - 1, value: 2, fmt: (i) => NS[i], onInput: (i) => { N = NS[i]; reset(); } });
    let paused = false;
    NB.button(ctr, '⏯ 일시정지/재생', () => { paused = !paused; });
    const cv = NB.canvas(W.body, { height: (w) => (w < 640 ? 3 * 250 : 300) });
    const stats = el('div', { class: 'table-wrap' }); W.body.append(stats);

    let busQ = [], busCur = null, xbarAct = [], meshPk = [], tick = 0, acc = 0;
    function reset() { busQ = []; busCur = null; xbarAct = []; meshPk = []; renderTable(); }
    function renderTable() {
      const k = Math.sqrt(N);
      const rows = [
        ['총 처리량 상한 (전송/사이클, 균등 트래픽)', '1', String(N) + ' <span class="muted small">(이상적 스케줄)</span>', (N * Math.min(1, 4 / k)).toFixed(1) + ' <span class="muted small">(이분 대역폭 한계)</span>'],
        ['코어당 대역폭', (1 / N).toFixed(3), '1', Math.min(1, 4 / k).toFixed(2)],
        ['스위치 비용', N + ' 탭', '<b>' + N * N + '</b> 교차점', N + ' 라우터 (5×5)'],
        ['가장 긴 전선 (타일 단위)', '≈' + N + ' <span class="muted small">(모든 타일 경유)</span>', '≈' + (2 * k).toFixed(0) + ' <span class="muted small">(칩 횡단)</span>', '<b>1</b> <span class="muted small">(이웃 간)</span>'],
        ['평균 홉 수', '1 (방송)', '1', (2 * (k * k - 1) / (3 * k)).toFixed(2)]
      ];
      stats.innerHTML = '<table class="data"><tr><th></th><th style="color:var(--c3)">Shared Bus</th><th style="color:var(--c4)">Crossbar</th><th style="color:var(--c2)">2D Mesh NoC</th></tr>' +
        rows.map((r) => '<tr><td>' + r[0] + '</td><td class="mono">' + r[1] + '</td><td class="mono">' + r[2] + '</td><td class="mono">' + r[3] + '</td></tr>').join('') + '</table>';
    }
    renderTable();

    function stepModel() {
      tick++;
      const k = Math.sqrt(N);
      // bus: one transfer at a time, each takes 3 ticks
      if (busQ.length < N * 2) for (let i = 0; i < N; i++) if (Math.random() < 0.08) busQ.push({ s: i, d: (i + 1 + ((Math.random() * (N - 1)) | 0)) % N });
      if (busCur && --busCur.left <= 0) busCur = null;
      if (!busCur && busQ.length) { busCur = busQ.shift(); busCur.left = 3; }
      // crossbar: random requests, greedy matching per tick
      xbarAct = [];
      const usedO = new Set();
      for (let i = 0; i < N; i++) {
        if (Math.random() < 0.55) {
          const d = (Math.random() * N) | 0;
          if (d !== i && !usedO.has(d)) { usedO.add(d); xbarAct.push([i, d]); }
        }
      }
      // mesh: move packets one hop (XY), spawn new
      for (const p of meshPk) {
        p.px = p.x; p.py = p.y;
        if (p.x !== p.dx) p.x += Math.sign(p.dx - p.x);
        else if (p.y !== p.dy) p.y += Math.sign(p.dy - p.y);
        else p.done = true;
      }
      meshPk = meshPk.filter((p) => !p.done);
      for (let i = 0; i < N; i++) if (Math.random() < 0.12 && meshPk.length < N * 2) {
        const x = i % k, y = (i / k) | 0;
        let dx, dy; do { dx = (Math.random() * k) | 0; dy = (Math.random() * k) | 0; } while (dx === x && dy === y);
        meshPk.push({ x, y, px: x, py: y, dx, dy, c: i % 8 });
      }
    }

    function draw(frac) {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const vertical = w < 640;
      const pw = vertical ? w : w / 3, ph = vertical ? h / 3 : h;
      const pal = NB.palette();
      const text = NB.css('--text'), mute = NB.css('--text-mute'), link = NB.css('--link'), node = NB.css('--node'), stroke = NB.css('--node-stroke');
      const k = Math.sqrt(N);
      const panels = [
        { t: 'Shared Bus', c: NB.css('--c3') },
        { t: 'Crossbar', c: NB.css('--c4') },
        { t: '2D Mesh NoC', c: NB.css('--c2') }
      ];
      panels.forEach((P, pi) => {
        const ox = vertical ? 0 : pi * pw, oy = vertical ? pi * ph : 0;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillStyle = P.c; ctx.font = 'bold 14px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(P.t, 14, 10);
        const area = { x: 20, y: 36, w: pw - 40, h: ph - 50 };
        const cs = Math.min(area.w, area.h) / k;
        const gx = area.x + (area.w - cs * k) / 2, gy = area.y + (area.h - cs * k) / 2;
        const tile = cs * 0.5;
        const tx = (i) => gx + ((i % k) + 0.5) * cs, ty = (i) => gy + (((i / k) | 0) + 0.5) * cs;
        if (pi === 0) {
          // snake bus through all tiles
          ctx.strokeStyle = busCur ? P.c : link; ctx.lineWidth = 3;
          ctx.beginPath();
          for (let r = 0; r < k; r++) {
            const yy = gy + (r + 0.5) * cs + tile * 0.62;
            const xa = gx + 0.5 * cs - tile * 0.2, xb = gx + (k - 0.5) * cs + tile * 0.2;
            if (r === 0) ctx.moveTo(r % 2 ? xb : xa, yy);
            ctx.lineTo(r % 2 ? xa : xb, yy);
            if (r < k - 1) ctx.lineTo(r % 2 ? xa : xb, yy + cs);
          }
          ctx.stroke();
          for (let i = 0; i < N; i++) {
            const on = busCur && (busCur.s === i || busCur.d === i);
            ctx.fillStyle = on ? NB.alpha(P.c, 0.3) : node; ctx.strokeStyle = on ? P.c : stroke; ctx.lineWidth = 1.2;
            NB.roundRect(ctx, tx(i) - tile / 2, ty(i) - tile / 2, tile, tile * 0.85, 4); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = link; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(tx(i), ty(i) + tile * 0.35); ctx.lineTo(tx(i), ty(i) + tile * 0.62); ctx.stroke();
          }
          ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText('대기 중 요청: ' + busQ.length, pw - 14, 12);
        } else if (pi === 1) {
          // crossbar matrix: rows = inputs, cols = outputs
          const m = Math.min(area.w, area.h) * 0.92, s = m / N;
          const mx = area.x + (area.w - m) / 2, my = area.y + (area.h - m) / 2;
          ctx.strokeStyle = link; ctx.lineWidth = Math.max(0.4, Math.min(1.5, s * 0.12));
          for (let i = 0; i < N; i++) {
            ctx.beginPath(); ctx.moveTo(mx, my + (i + 0.5) * s); ctx.lineTo(mx + m, my + (i + 0.5) * s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(mx + (i + 0.5) * s, my); ctx.lineTo(mx + (i + 0.5) * s, my + m); ctx.stroke();
          }
          if (s > 7) {
            ctx.fillStyle = link;
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { ctx.beginPath(); ctx.arc(mx + (j + 0.5) * s, my + (i + 0.5) * s, Math.max(1, s * 0.09), 0, 7); ctx.fill(); }
          }
          xbarAct.forEach(([i, d]) => {
            ctx.strokeStyle = NB.alpha(P.c, 0.75); ctx.lineWidth = Math.max(1.2, s * 0.22);
            ctx.beginPath(); ctx.moveTo(mx, my + (i + 0.5) * s); ctx.lineTo(mx + (d + 0.5) * s, my + (i + 0.5) * s); ctx.lineTo(mx + (d + 0.5) * s, my + m); ctx.stroke();
            ctx.fillStyle = P.c; ctx.beginPath(); ctx.arc(mx + (d + 0.5) * s, my + (i + 0.5) * s, Math.max(2, s * 0.25), 0, 7); ctx.fill();
          });
          ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText('교차점 ' + N * N + '개 · 동시 ' + xbarAct.length, pw - 14, 12);
        } else {
          // mesh
          ctx.strokeStyle = link; ctx.lineWidth = 2;
          for (let i = 0; i < N; i++) {
            const x = i % k, y = (i / k) | 0;
            if (x < k - 1) { ctx.beginPath(); ctx.moveTo(tx(i), ty(i)); ctx.lineTo(tx(i + 1), ty(i)); ctx.stroke(); }
            if (y < k - 1) { ctx.beginPath(); ctx.moveTo(tx(i), ty(i)); ctx.lineTo(tx(i), ty(i + k)); ctx.stroke(); }
          }
          const rs = Math.min(16, cs * 0.34);
          for (let i = 0; i < N; i++) {
            ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
            NB.roundRect(ctx, tx(i) - rs / 2, ty(i) - rs / 2, rs, rs, 3); ctx.fill(); ctx.stroke();
          }
          const ease = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
          meshPk.forEach((p) => {
            const x = NB.lerp(p.px, p.x, ease), y = NB.lerp(p.py, p.y, ease);
            ctx.fillStyle = pal[p.c]; ctx.beginPath(); ctx.arc(gx + (x + 0.5) * cs, gy + (y + 0.5) * cs, Math.max(2.5, Math.min(5, cs * 0.12)), 0, 7); ctx.fill();
          });
          ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText('이동 중 패킷 ' + meshPk.length, pw - 14, 12);
        }
        // bus animation dot
        if (pi === 0 && busCur) {
          const p = 1 - busCur.left / 3 + frac / 3;
          const x = NB.lerp(tx(busCur.s), tx(busCur.d), p), y = NB.lerp(ty(busCur.s), ty(busCur.d), p);
          ctx.fillStyle = P.c; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
        }
        ctx.restore();
        if (pi > 0) { ctx.strokeStyle = NB.css('--border'); ctx.lineWidth = 1; ctx.beginPath(); if (vertical) { ctx.moveTo(0, oy); ctx.lineTo(w, oy); } else { ctx.moveTo(ox, 10); ctx.lineTo(ox, h - 10); } ctx.stroke(); }
      });
    }
    cv.draw = () => draw(acc);
    NB.loop(cv.canvas, (dt) => {
      if (paused) { draw(acc); return; }
      acc += dt / 0.45;
      if (acc >= 1) { acc = 0; stepModel(); }
      draw(acc);
    });
  })();

  /* ======================================================
     1.2  Shared bus contention
     ====================================================== */
  (function () {
    const W = NB.widget('w-bus'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const T = 4;
    let N = 8, p = 0.02, speed = 8;
    NB.slider(ctr, { label: '마스터 수 N', min: 2, max: 32, value: N, onInput: (v) => { N = v; reset(); } });
    NB.slider(ctr, { label: '요청 확률 p (/사이클)', min: 0.002, max: 0.08, step: 0.002, value: p, fmt: (v) => v.toFixed(3), onInput: (v) => { p = v; } });
    NB.slider(ctr, { label: '속도 (사이클/초)', min: 1, max: 60, value: speed, onInput: (v) => { speed = v; } });
    const cv = NB.canvas(W.body, { height: 230 });
    const st = NB.stats(W.body, [
      { key: 'rho', label: '오퍼드 부하 ρ = N·p·T' }, { key: 'util', label: '버스 이용률' },
      { key: 'wait', label: '평균 대기 (사이클)' }, { key: 'q', label: '대기열 길이' }, { key: 'bw', label: '마스터당 처리량' }
    ]);
    const chartBox = el('div', { style: { marginTop: '14px' } }); W.body.append(chartBox);
    const chart = NB.chart(chartBox, { height: 180, xLabel: '사이클', yLabel: '평균 대기 (사이클)' });
    let q, cur, cyc, busy, waits, waitN, served, hist, acc = 0, rr = 0;
    function reset() { q = []; cur = null; cyc = 0; busy = 0; waits = 0; waitN = 0; served = 0; hist = []; for (let i = 0; i < N; i++) q.push([]); }
    reset();
    function step() {
      cyc++;
      for (let i = 0; i < N; i++) if (Math.random() < p && q[i].length < 60) q[i].push(cyc);
      if (cur && --cur.left <= 0) { served++; cur = null; }
      if (!cur) {
        for (let k = 0; k < N; k++) {
          const i = (rr + k) % N;
          if (q[i].length) { const t0 = q[i].shift(); waits += cyc - t0; waitN++; cur = { m: i, left: T, d: (Math.random() * 4) | 0 }; rr = (i + 1) % N; break; }
        }
      }
      if (cur) busy++;
      if (cyc % 20 === 0) { hist.push([cyc, waitN ? waits / waitN : 0]); if (hist.length > 300) hist.shift(); }
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pal = NB.palette(), node = NB.css('--node'), stroke = NB.css('--node-stroke'), link = NB.css('--link'), mute = NB.css('--text-mute'), acc3 = NB.css('--c3');
      const mw = Math.min(46, (w - 40) / N - 4), gap = (w - 40 - mw * N) / Math.max(1, N - 1);
      const busY = 150;
      ctx.lineWidth = 6; ctx.strokeStyle = cur ? acc3 : link; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(20, busY); ctx.lineTo(w - 20, busY); ctx.stroke();
      ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        const x = 20 + i * (mw + gap);
        const on = cur && cur.m === i;
        ctx.strokeStyle = on ? acc3 : link; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + mw / 2, 112); ctx.lineTo(x + mw / 2, busY); ctx.stroke();
        ctx.fillStyle = on ? NB.alpha(acc3, 0.25) : node; ctx.strokeStyle = on ? acc3 : stroke; ctx.lineWidth = 1.3;
        NB.roundRect(ctx, x, 88, mw, 24, 5); ctx.fill(); ctx.stroke();
        if (mw > 22) { ctx.fillStyle = mute; ctx.fillText('M' + i, x + mw / 2, 100); }
        // queue
        const qn = q[i].length;
        for (let j = 0; j < Math.min(qn, 14); j++) { ctx.fillStyle = NB.alpha(pal[i % 8], 0.85); ctx.fillRect(x + 3, 80 - (j + 1) * 5, mw - 6, 4); }
        if (qn > 14) { ctx.fillStyle = NB.css('--danger'); ctx.fillText('+' + (qn - 14), x + mw / 2, 4 + 0); }
      }
      // slaves
      const sw = 70, sgap = (w - 40 - 4 * sw) / 3;
      for (let s = 0; s < 4; s++) {
        const x = 20 + s * (sw + sgap);
        const on = cur && cur.d === s;
        ctx.strokeStyle = on ? acc3 : link; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + sw / 2, busY); ctx.lineTo(x + sw / 2, 186); ctx.stroke();
        ctx.fillStyle = on ? NB.alpha(acc3, 0.25) : node; ctx.strokeStyle = on ? acc3 : stroke; ctx.lineWidth = 1.3;
        NB.roundRect(ctx, x, 186, sw, 28, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = mute; ctx.fillText(['DRAM', 'L3', 'SRAM', 'I/O'][s], x + sw / 2, 200);
      }
      if (cur) {
        const mx = 20 + cur.m * (mw + gap) + mw / 2, sx = 20 + cur.d * (sw + sgap) + sw / 2;
        const t = 1 - (cur.left - acc) / T;
        ctx.fillStyle = acc3; ctx.beginPath(); ctx.arc(NB.lerp(mx, sx, NB.clamp(t, 0, 1)), busY, 7, 0, 7); ctx.fill();
      }
      ctx.fillStyle = mute; ctx.textAlign = 'left'; ctx.fillText('Arbiter: Round-robin   |   사이클 ' + cyc, 20, 132 - 0 + 0);
    }
    function upd() {
      const rho = N * p * T;
      st.rho.set(rho.toFixed(2), '', rho >= 1 ? 'bad' : 'good');
      st.util.set((100 * busy / Math.max(1, cyc)).toFixed(0) + '%');
      st.wait.set(waitN ? (waits / waitN).toFixed(1) : '—', '', rho >= 1 ? 'bad' : '');
      st.q.set(q.reduce((a, b) => a + b.length, 0));
      st.bw.set((served * T / Math.max(1, cyc) / N).toFixed(3), 'cyc/cyc');
      chart.set({ series: [{ name: '평균 대기', color: NB.css('--c3'), points: hist }] });
    }
    cv.draw = draw;
    let fr = 0;
    NB.loop(cv.canvas, (dt) => {
      acc += dt * speed;
      while (acc >= 1) { acc -= 1; step(); }
      draw();
      if (++fr % 6 === 0) upd();
    });
  })();

  /* ======================================================
     1.3  Wire delay
     ====================================================== */
  (function () {
    const W = NB.widget('w-wire'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let f = 2, len = 5;
    const a = 30; // ps / mm^2 (unrepeated, example)
    const b = 60, b0 = 20; // ps / mm (repeated) + driver offset
    NB.slider(ctr, { label: '클록 주파수', min: 0.5, max: 5, step: 0.1, value: f, fmt: (v) => v.toFixed(1) + ' GHz', onInput: (v) => { f = v; upd(); } });
    NB.slider(ctr, { label: '전선 길이', min: 0.5, max: 20, step: 0.5, value: len, fmt: (v) => v.toFixed(1) + ' mm', onInput: (v) => { len = v; upd(); } });
    const box = el('div'); W.body.append(box);
    const chart = NB.chart(box, { height: 260, xLabel: '전선 길이 (mm)', yLabel: '지연 (ps)', xMin: 0, xMax: 20, yMin: 0, yMax: 2500 });
    const st = NB.stats(W.body, [{ key: 'u', label: '리피터 없음' }, { key: 'r', label: '리피터 삽입' }, { key: 'cu', label: '필요 사이클 (없음)' }, { key: 'cr', label: '필요 사이클 (삽입)' }, { key: 'reach', label: '1사이클 도달거리 (삽입)' }]);
    function upd() {
      const T = 1000 / f;
      const pu = [], pr = [];
      for (let x = 0; x <= 20.001; x += 0.25) { pu.push([x, a * x * x]); pr.push([x, b0 + b * x]); }
      const du = a * len * len, dr = b0 + b * len;
      chart.set({
        series: [
          { name: '리피터 없음 ∝ ℓ²', color: NB.css('--c3'), points: pu },
          { name: '리피터 삽입 ∝ ℓ', color: NB.css('--c1'), points: pr },
          { name: '클록 주기 ' + T.toFixed(0) + ' ps', color: NB.css('--text-mute'), points: [[0, T], [20, T]], dash: [5, 5], width: 1.5 },
          { name: '', color: NB.css('--c5'), points: [[len, 0], [len, 2500]], dash: [2, 3], width: 1, noLegend: true }
        ],
        xFmt: (x) => x.toFixed(1) + 'mm'
      });
      st.u.set(du.toFixed(0), 'ps');
      st.r.set(dr.toFixed(0), 'ps');
      st.cu.set(Math.ceil(du / T), 'cyc', Math.ceil(du / T) > 1 ? 'bad' : 'good');
      st.cr.set(Math.ceil(dr / T), 'cyc', Math.ceil(dr / T) > 1 ? 'bad' : 'good');
      st.reach.set(Math.max(0, (T - b0) / b).toFixed(1), 'mm');
    }
    upd();
  })();

  /* ======================================================
     1.4  Packet journey (SVG)
     ====================================================== */
  (function () {
    const W = NB.widget('w-journey'); if (!W) return;
    const k = 3, cs = 150, pad = 30;
    const svg = NB.svgEl('svg', { class: 'vis', viewBox: '0 0 ' + (k * cs + pad * 2) + ' ' + (k * cs + pad * 2), style: 'max-height:520px' });
    const lay = el('div', { class: 'split', style: { alignItems: 'start' } });
    const left = el('div'), right = el('div');
    lay.append(left, right); W.body.append(lay);
    left.append(svg);
    const ctr = el('div', { class: 'btn-row', style: { marginBottom: '12px' } }); right.append(ctr);
    const stepLbl = el('div', { class: 'mono small muted', style: { marginBottom: '6px' } });
    const descBox = el('div', { style: { minHeight: '180px' } });
    const pktBox = el('div', { style: { marginTop: '10px' } });
    right.append(stepLbl, descBox, pktBox);

    const tiles = [
      { x: 0, y: 0, name: 'CPU 0', kind: 'core' }, { x: 1, y: 0, name: 'CPU 1', kind: 'core' }, { x: 2, y: 0, name: 'GPU', kind: 'core' },
      { x: 0, y: 1, name: 'L3 $0', kind: 'cache' }, { x: 1, y: 1, name: 'NPU', kind: 'core' }, { x: 2, y: 1, name: 'L3 $1', kind: 'cache' },
      { x: 0, y: 2, name: 'I/O', kind: 'io' }, { x: 1, y: 2, name: 'DSP', kind: 'core' }, { x: 2, y: 2, name: 'Mem Ctrl', kind: 'mem' }
    ];
    const C = (x) => pad + x * cs + cs / 2;
    const gLinks = NB.svgEl('g', null, svg), gTiles = NB.svgEl('g', null, svg), gPkt = NB.svgEl('g', null, svg);
    const linkEls = {};
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) {
      if (x < k - 1) linkEls[x + ',' + y + '-' + (x + 1) + ',' + y] = NB.svgEl('line', { x1: C(x) + 24, y1: C(y) + 26, x2: C(x + 1) - 24, y2: C(y) + 26, 'stroke-width': 5, 'stroke-linecap': 'round' }, gLinks);
      if (y < k - 1) linkEls[x + ',' + y + '-' + x + ',' + (y + 1)] = NB.svgEl('line', { x1: C(x) + 26, y1: C(y) + 24, x2: C(x) + 26, y2: C(y + 1) - 24, 'stroke-width': 5, 'stroke-linecap': 'round' }, gLinks);
    }
    const parts = {};
    tiles.forEach((t) => {
      const g = NB.svgEl('g', { style: 'cursor:help' }, gTiles);
      const ip = NB.svgEl('rect', { x: C(t.x) - 62, y: C(t.y) - 62, width: 70, height: 50, rx: 8, 'stroke-width': 1.5 }, g);
      const ipt = NB.svgEl('text', { x: C(t.x) - 27, y: C(t.y) - 33, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 }, g); ipt.textContent = t.name;
      const ni = NB.svgEl('rect', { x: C(t.x) - 20, y: C(t.y) - 8, width: 22, height: 16, rx: 3, 'stroke-width': 1.3 }, g);
      const nit = NB.svgEl('text', { x: C(t.x) - 9, y: C(t.y) + 4, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700 }, g); nit.textContent = 'NI';
      const rt = NB.svgEl('rect', { x: C(t.x) + 8, y: C(t.y) + 8, width: 36, height: 36, rx: 7, 'stroke-width': 1.8 }, g);
      const rtt = NB.svgEl('text', { x: C(t.x) + 26, y: C(t.y) + 30, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700 }, g); rtt.textContent = 'R' + (t.y * k + t.x);
      const c1 = NB.svgEl('line', { x1: C(t.x) - 27, y1: C(t.y) - 12, x2: C(t.x) - 12, y2: C(t.y) - 8, 'stroke-width': 2 }, g);
      const c2 = NB.svgEl('line', { x1: C(t.x) + 2, y1: C(t.y) + 4, x2: C(t.x) + 8, y2: C(t.y) + 14, 'stroke-width': 2 }, g);
      parts[t.x + ',' + t.y] = { ip, ipt, ni, nit, rt, rtt, c1, c2, t };
      const tipText = { ip: '<b>' + t.name + '</b><br>IP 블록. 메모리 읽기/쓰기 같은 트랜잭션을 생성하거나 처리합니다.', ni: '<b>Network Interface</b><br>트랜잭션 ↔ 패킷 변환, 플릿 분할, 재조립, 순서 보장 등을 담당합니다.', rt: '<b>Router R' + (t.y * k + t.x) + '</b><br>5포트(N/E/S/W/Local) 라우터. 라우팅 계산, 버퍼링, 중재, 스위칭을 수행합니다.' };
      [['ip', ip], ['ni', ni], ['rt', rt]].forEach(([key, e]) => {
        e.addEventListener('pointermove', (ev) => NB.tip.show(tipText[key], ev.clientX, ev.clientY));
        e.addEventListener('pointerleave', () => NB.tip.hide());
      });
    });
    Object.values(linkEls).forEach((l) => {
      l.style.cursor = 'help';
      l.addEventListener('pointermove', (ev) => NB.tip.show('<b>Link</b><br>이웃 라우터 사이의 점대점 채널. 매 사이클 1 플릿(예: 128비트)을 전송합니다. 양방향이며 짧아서 1사이클 안에 건널 수 있습니다.', ev.clientX, ev.clientY));
      l.addEventListener('pointerleave', () => NB.tip.hide());
    });
    const pkt = NB.svgEl('g', { style: 'transition: transform .5s ease' }, gPkt);
    for (let i = 0; i < 4; i++) NB.svgEl('rect', { x: -26 + i * 13, y: -7, width: 11, height: 14, rx: 2, class: 'flit' }, pkt);

    // steps: [where, highlight, title, desc]
    const R = (x, y) => ({ x: C(x) + 26, y: C(y) + 26 });
    const steps = [
      { pos: { x: C(0) - 27, y: C(0) - 37 }, hl: ['0,0', 'ip'], t: 'CPU 0: 캐시 미스 발생', d: 'CPU 0의 L2에서 캐시 미스가 발생했습니다. 64바이트 캐시 라인을 메모리에서 읽어 와야 합니다. 코어는 <code>ReadShared(addr)</code> 트랜잭션을 만들어 NI에 넘깁니다.', pkt: 'req' },
      { pos: { x: C(0) - 9, y: C(0) }, hl: ['0,0', 'ni'], t: 'NI: 패킷화 (Packetization)', d: 'NI는 주소를 보고 목적지가 메모리 컨트롤러(R8)임을 알아냅니다. 헤더 플릿에 <b>목적지 좌표 (2,2)</b>, 메시지 클래스(요청), 트랜잭션 ID를 넣습니다. 요청은 짧아서 1~2 플릿이면 됩니다.', pkt: 'req' },
      { pos: R(0, 0), hl: ['0,0', 'rt'], t: 'R0: 라우팅 계산 → 동쪽(E)', d: 'XY 라우팅: 먼저 X 방향을 맞춥니다. 목적지 x=2 &gt; 현재 x=0 이므로 <b>E 포트</b>를 선택합니다. 이후 VC 할당 → 스위치 할당 → 크로스바 통과의 파이프라인을 거칩니다.' },
      { pos: R(1, 0), hl: ['1,0', 'rt'], link: '0,0-1,0', t: 'R1: 직진 → 동쪽(E)', d: '링크를 1사이클에 건넌 뒤 R1 입력 버퍼에 저장됩니다. 아직 x가 맞지 않으므로 계속 E. 이 라우터를 지나는 다른 패킷과 출력 포트를 두고 <b>중재</b>가 일어날 수 있습니다.' },
      { pos: R(2, 0), hl: ['2,0', 'rt'], link: '1,0-2,0', t: 'R2: X 완료 → 남쪽(S)으로 회전', d: 'x 좌표가 일치했습니다. 이제 Y 방향을 맞추기 위해 <b>S 포트</b>로 회전(turn)합니다. XY 라우팅은 Y→X 회전을 금지하기 때문에 데드락이 생기지 않습니다(3·6장).' },
      { pos: R(2, 1), hl: ['2,1', 'rt'], link: '2,0-2,1', t: 'R5: 남쪽(S)으로 직진', d: '다음 라우터에 버퍼 공간이 있는지는 <b>크레딧(credit)</b> 카운터로 압니다. 크레딧이 0이면 기다려야 합니다(4장 플로우 컨트롤).' },
      { pos: R(2, 2), hl: ['2,2', 'rt'], link: '2,1-2,2', t: 'R8: 도착 → Local 포트로 배출', d: '목적지 좌표와 일치하므로 <b>Local(L) 포트</b>로 패킷을 내보냅니다(ejection). 총 4홉, 라우터 5개를 거쳤습니다.' },
      { pos: { x: C(2) - 9, y: C(2) }, hl: ['2,2', 'ni'], t: 'NI: 재조립 (Depacketization)', d: '메모리 컨트롤러의 NI가 플릿들을 모아 원래 트랜잭션으로 복원합니다. 메모리 컨트롤러는 DRAM에서 데이터를 읽습니다.' },
      { pos: { x: C(2) - 27, y: C(2) - 37 }, hl: ['2,2', 'ip'], t: '응답: 5플릿 패킷이 돌아감', d: '응답은 64B 데이터를 실어야 하므로 헤더 1 + 데이터 4 = <b>5플릿</b>(플릿=16B 가정)입니다. XY 라우팅이면 응답은 W, W, N, N 경로로 돌아갑니다. 요청과 응답은 데드락을 피하기 위해 보통 <b>별도의 가상 네트워크</b>를 씁니다(6장).', pkt: 'resp' }
    ];
    let cur = 0, timer = null;
    const prevB = NB.button(ctr, '◀ 이전', () => go(cur - 1));
    const nextB = NB.button(ctr, '다음 단계 ▶', () => go(cur + 1), 'primary');
    const playB = NB.button(ctr, '▶ 자동 재생', () => {
      if (timer) { clearInterval(timer); timer = null; playB.textContent = '▶ 자동 재생'; return; }
      playB.textContent = '⏸ 정지';
      if (cur >= steps.length - 1) go(0);
      timer = setInterval(() => { if (cur >= steps.length - 1) { clearInterval(timer); timer = null; playB.textContent = '▶ 자동 재생'; return; } go(cur + 1); }, 2200);
    });
    function colors() {
      const node = NB.css('--node'), stroke = NB.css('--node-stroke'), link = NB.css('--link'), text = NB.css('--text'), mute = NB.css('--text-mute');
      const kindCol = { core: NB.css('--c1'), cache: NB.css('--c6'), io: NB.css('--c7'), mem: NB.css('--c4') };
      const st = steps[cur];
      Object.entries(linkEls).forEach(([key, l]) => {
        const used = steps.slice(0, cur + 1).some((s) => s.link === key);
        l.setAttribute('stroke', st.link === key ? NB.css('--accent') : used ? NB.alpha(NB.css('--accent').startsWith('#') ? NB.css('--accent') : '#3b5bdb', 0.4) : link);
      });
      Object.entries(parts).forEach(([key, p]) => {
        const kc = kindCol[p.t.kind];
        const on = (w) => st.hl[0] === key && st.hl[1] === w;
        p.ip.setAttribute('fill', on('ip') ? NB.alpha(kc, 0.3) : NB.alpha(kc, 0.1)); p.ip.setAttribute('stroke', on('ip') ? kc : NB.alpha(kc, 0.6)); p.ip.setAttribute('stroke-width', on('ip') ? 3 : 1.5);
        p.ipt.setAttribute('fill', text);
        p.ni.setAttribute('fill', on('ni') ? NB.css('--accent') : node); p.ni.setAttribute('stroke', on('ni') ? NB.css('--accent') : stroke);
        p.nit.setAttribute('fill', on('ni') ? '#fff' : mute);
        p.rt.setAttribute('fill', on('rt') ? NB.css('--accent') : node); p.rt.setAttribute('stroke', on('rt') ? NB.css('--accent') : stroke);
        p.rtt.setAttribute('fill', on('rt') ? '#fff' : text);
        p.c1.setAttribute('stroke', link); p.c2.setAttribute('stroke', link);
      });
      const resp = st.pkt === 'resp';
      pkt.querySelectorAll('.flit').forEach((f, i) => {
        f.setAttribute('fill', i === 0 ? NB.css('--c3') : resp ? NB.css('--c2') : NB.css('--c3'));
        f.setAttribute('opacity', resp ? 1 : i < 2 ? 1 : 0);
        f.setAttribute('stroke', NB.css('--surface')); f.setAttribute('stroke-width', 1);
      });
    }
    function go(i) {
      cur = NB.clamp(i, 0, steps.length - 1);
      const st = steps[cur];
      pkt.style.transform = 'translate(' + st.pos.x + 'px,' + (st.pos.y - 18) + 'px)';
      stepLbl.textContent = 'STEP ' + (cur + 1) + ' / ' + steps.length;
      descBox.innerHTML = '<h3 style="margin:0 0 8px">' + st.t + '</h3><p style="margin:0">' + st.d + '</p>';
      prevB.disabled = cur === 0; nextB.disabled = cur === steps.length - 1;
      const resp = st.pkt === 'resp';
      pktBox.innerHTML = '<div class="hint" style="margin-bottom:6px">현재 패킷 구조</div>' + (resp
        ? flitRow([['H', 'dst=(0,0) · RESP · tid=7', '--c3'], ['D', 'data[0:15]', '--c2'], ['D', 'data[16:31]', '--c2'], ['D', 'data[32:47]', '--c2'], ['T', 'data[48:63]', '--c2']])
        : flitRow([['H', 'dst=(2,2) · REQ · tid=7', '--c3'], ['T', 'addr=0x8000_1F40', '--c3']]));
      colors();
    }
    function flitRow(fs) {
      return '<div style="display:flex;gap:4px;flex-wrap:wrap">' + fs.map(([t, d, c]) => '<div style="border:1.5px solid var(' + c + ');border-radius:6px;padding:3px 8px;font-size:12px;font-family:var(--mono);background:color-mix(in srgb, var(' + c + ') 14%, transparent)"><b>' + t + '</b> ' + d + '</div>').join('') + '</div>';
    }
    NB.onTheme(colors);
    go(0);
  })();
});
