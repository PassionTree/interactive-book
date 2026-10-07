/* Chapter 6 — Virtual channels & deadlock */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const { Sim, ROUTING, PORT_NAMES } = NB.noc;

  /* ======================================================
     6.1 HoL blocking
     ====================================================== */
  function holModel(V, q, lA, lB, seed) {
    const D = 8 / V, rnd = NB.rng(seed || 5);
    const M = { V, D, q, vcs: Array.from({ length: V }, () => []), Q: [], cur: null, rr: 0, t: 0, dA: 0, dB: 0, latA: 0, nA: 0, hist: [], bReady: false, last: null };
    M.step = function () {
      const t = M.t++;
      if (rnd() < lA / 2) M.Q.push({ dst: 'A', t0: t });
      if (rnd() < lB / 2) M.Q.push({ dst: 'B', t0: t });
      // upstream link: one flit per cycle; a new packet needs an empty VC
      if (!M.cur && M.Q.length) {
        const vi = M.vcs.findIndex((qq) => qq.length === 0);
        if (vi >= 0) M.cur = { p: M.Q.shift(), vc: vi, left: 2 };
      }
      if (M.cur) {
        const qv = M.vcs[M.cur.vc];
        if (qv.length < M.D) { qv.push({ dst: M.cur.p.dst, t0: M.cur.p.t0, tail: M.cur.left === 1 }); if (--M.cur.left === 0) M.cur = null; }
      }
      M.bReady = rnd() < M.q;
      M.last = null;
      for (let k = 0; k < V; k++) {
        const vi = (M.rr + k) % V, qv = M.vcs[vi];
        if (!qv.length) continue;
        const f = qv[0];
        if (f.dst === 'A' || M.bReady) {
          qv.shift();
          if (f.dst === 'A') { M.dA++; if (f.tail) { M.latA += t - f.t0; M.nA++; } } else M.dB++;
          M.rr = (vi + 1) % V; M.last = { f, vi }; break;
        }
      }
      M.hist.push(M.last ? (M.last.f.dst === 'A' ? 1 : 2) : 0);
      if (M.hist.length > 200) M.hist.shift();
    };
    return M;
  }
  (function () {
    const W = NB.widget('w-hol'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let V = 1, q = 0.12, lA = 0.5, lB = 0.1, speed = 12;
    const mk = () => holModel(V, q, lA, lB);
    let M = mk();
    NB.seg(ctr, { label: 'VC 개수 (총 버퍼 8플릿)', value: V, options: [{ value: 1, label: '1 VC × 8' }, { value: 2, label: '2 VC × 4' }, { value: 4, label: '4 VC × 2' }], onChange: (v) => { V = v; M = mk(); } });
    NB.slider(ctr, { label: 'A행 부하 (flit/cyc)', min: 0.1, max: 0.8, step: 0.05, value: lA, fmt: (v) => v.toFixed(2), onInput: (v) => { lA = v; M = mk(); bench(); } });
    NB.slider(ctr, { label: '출력 B 수락 확률 q', min: 0.05, max: 1, step: 0.01, value: q, fmt: (v) => v.toFixed(2), onInput: (v) => { q = v; M = mk(); bench(); } });
    NB.slider(ctr, { label: '속도', min: 1, max: 60, value: speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { speed = v; } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const cv = NB.canvas(left, { height: 250 });
    const st = NB.stats(left, [{ key: 'a', label: 'A 처리량 (최근)' }, { key: 'b', label: 'B 처리량 (최근)' }, { key: 'q', label: '상류 대기 패킷' }]);
    right.append(el('div', { class: 'small', style: { fontWeight: 700, marginBottom: '6px' } }, 'VC 개수별 A행 처리량 / 평균 지연 (20k 사이클)'));
    const barBox = el('div'); right.append(barBox);
    function bench() {
      const res = [1, 2, 4].map((v) => { const m = holModel(v, q, lA, lB, 11); for (let i = 0; i < 20000; i++) m.step(); return [m.dA / m.t, m.nA ? m.latA / m.nA : 0]; });
      barBox.innerHTML = '';
      res.forEach(([r, lat], i) => {
        const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' } });
        row.append(el('span', { class: 'mono small', style: { width: '44px' } }, [1, 2, 4][i] + ' VC'));
        const bar = el('div', { style: { flex: 1, height: '22px', background: 'var(--surface-2)', borderRadius: '5px', overflow: 'hidden', position: 'relative' } });
        bar.append(el('div', { style: { width: (100 * r / Math.max(lA, 0.01)) + '%', maxWidth: '100%', height: '100%', background: 'var(--c' + (i + 1) + ')', transition: 'width .3s' } }));
        row.append(bar, el('span', { class: 'mono small', style: { width: '92px', textAlign: 'right' } }, r.toFixed(2) + ' · ' + (lat > 999 ? '999+' : lat.toFixed(0)) + 'cyc'));
        barBox.append(row);
      });
      barBox.append(el('div', { class: 'hint' }, '막대 길이 = A행 처리량 / A행 부하 (' + lA.toFixed(2) + '). B행 부하는 0.10입니다. VC가 1개면 B행 패킷이 맨 앞에서 막힐 때마다 A행도 함께 멈춥니다.'));
    }
    bench();
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const node = NB.css('--node'), stroke = NB.css('--node-stroke'), mute = NB.css('--text-mute'), text = NB.css('--text'), link = NB.css('--link');
      const cA = NB.css('--c2'), cB = NB.css('--c3');
      const bx = 100, bw = Math.max(150, Math.min(260, w - 300)), by = 20, bh = 170;
      ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4;
      NB.roundRect(ctx, 6, by + 40, 70, 90, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = text; ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('상류', 41, by + 56);
      // upstream queue preview
      for (let i = 0; i < Math.min(8, M.Q.length); i++) { ctx.fillStyle = M.Q[i].dst === 'A' ? cA : cB; ctx.fillRect(14 + (i % 4) * 14, by + 72 + Math.floor(i / 4) * 16, 11, 12); }
      if (M.Q.length > 8) { ctx.fillStyle = NB.css('--danger'); ctx.font = '11px ' + NB.css('--mono'); ctx.fillText('+' + (M.Q.length - 8), 41, by + 118); }
      ctx.strokeStyle = link; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(76, by + 85); ctx.lineTo(bx, by + 85); ctx.stroke();
      ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.4;
      NB.roundRect(ctx, bx, by, bw, bh, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('입력 포트 버퍼', bx + 8, by + 6);
      const rowH = Math.min(32, (bh - 36) / M.V - 6), slotW = (bw - 60) / M.D;
      M.vcs.forEach((qv, vi) => {
        const y = by + 30 + vi * (rowH + 6);
        ctx.fillStyle = mute; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '12px ' + NB.css('--font'); ctx.fillText('VC' + vi, bx + 40, y + rowH / 2);
        for (let s2 = 0; s2 < M.D; s2++) {
          const x = bx + bw - 14 - (s2 + 1) * slotW;
          const f = qv[s2];
          ctx.strokeStyle = link; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y, slotW - 2, rowH);
          if (f) {
            ctx.fillStyle = f.dst === 'A' ? cA : cB; ctx.fillRect(x + 2, y + 1, slotW - 4, rowH - 2);
            if (slotW > 18) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.fillText(f.dst, x + slotW / 2, y + rowH / 2); }
          }
        }
        if (qv.length && qv[0].dst === 'B' && !M.bReady) { ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('⛔', bx + bw - 13, y + rowH / 2); }
      });
      const ox = bx + bw + 46;
      [['A', cA, 'out A (여유)', by + 18], ['B', cB, 'out B (혼잡)', by + 106]].forEach(([k, c, lab, y]) => {
        const lit = M.last && M.last.f.dst === k;
        ctx.strokeStyle = lit ? c : link; ctx.lineWidth = lit ? 4 : 2;
        ctx.beginPath(); ctx.moveTo(bx + bw, by + 85); ctx.bezierCurveTo(bx + bw + 26, by + 85, ox - 26, y + 25, ox, y + 25); ctx.stroke();
        ctx.fillStyle = NB.alpha(c, lit ? 0.3 : 0.1); ctx.strokeStyle = c; ctx.lineWidth = 1.6;
        NB.roundRect(ctx, ox, y, 116, 50, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.font = 'bold 13px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, ox + 58, y + 18);
        ctx.font = '11px ' + NB.css('--font'); ctx.fillStyle = mute;
        ctx.fillText(k === 'A' ? '항상 수락' : (M.bReady ? '● 이번 사이클 수락' : '○ 대기'), ox + 58, y + 36);
      });
      const ty = by + bh + 16, tw = w - 20;
      for (let i = 0; i < M.hist.length; i++) {
        const v = M.hist[i];
        ctx.fillStyle = v === 1 ? cA : v === 2 ? cB : NB.css('--grid');
        ctx.fillRect(10 + (i / 200) * tw, ty, tw / 200 - 0.5, 10);
      }
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('최근 200사이클의 출력 활동 (회색 = 아무것도 못 보냄)', 10, ty + 14);
    }
    cv.draw = draw;
    let acc = 0, fr = 0;
    NB.loop(cv.canvas, (dt) => {
      acc += dt * speed;
      while (acc >= 1) { acc -= 1; M.step(); }
      draw();
      if (++fr % 8 === 0) {
        const n = Math.max(1, M.hist.length);
        st.a.set((M.hist.filter((x) => x === 1).length / n).toFixed(2), '/ ' + lA.toFixed(2));
        st.b.set((M.hist.filter((x) => x === 2).length / n).toFixed(2), '/ ' + lB.toFixed(2));
        st.q.set(M.Q.length, '', M.Q.length > 20 ? 'bad' : '');
      }
    });
  })();

  /* ======================================================
     shared sim panel helper
     ====================================================== */
  function simPanel(W, opts) {
    const cv = NB.canvas(W.body, { height: opts.height });
    const st = NB.stats(W.body, [{ key: 't', label: '사이클' }, { key: 'd', label: '도착한 패킷' }, { key: 'f', label: '네트워크 내 플릿' }, { key: 's', label: '상태' }]);
    const info = el('div', { class: 'small', style: { marginTop: '10px', color: 'var(--text-soft)' } }); W.body.append(info);
    return { cv, st, info };
  }
  function describeCycle(sim, cyc) {
    if (!cyc) return '';
    const V = sim.V, names = [];
    const pal = NB.palette();
    const lines = cyc.map((iv) => {
      const pv = (iv / V) | 0, p = pv % 5, r = (pv / 5) | 0;
      const f = sim.buf[iv][0];
      const who = f ? '<b style="color:' + pal[f.pkt.color % 8] + '">패킷 ' + f.pkt.src + '→' + f.pkt.dst + '</b>' : '(비어 있음)';
      return who + '가 R' + r + '의 ' + PORT_NAMES[p] + ' 입력 VC' + (iv % V) + '를 점유';
    });
    return '<b style="color:var(--danger)">순환 대기 (' + cyc.length + '개 VC):</b><br>' + lines.join(' → <br>') + ' → (처음으로)';
  }

  /* ======================================================
     6.2 2×2 deadlock
     ====================================================== */
  (function () {
    const W = NB.widget('w-dl2'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let mode = 'cw', speed = 4, running = true;
    NB.seg(ctr, { label: '라우팅', value: mode, options: [{ value: 'cw', label: '시계 방향 우선 (적응형)' }, { value: 'xy', label: 'XY 라우팅' }], onChange: (v) => { mode = v; reset(); } });
    NB.slider(ctr, { label: '속도', min: 1, max: 15, value: speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { speed = v; } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    const playB = NB.button(br, '⏸ 일시정지', () => { running = !running; playB.textContent = running ? '⏸ 일시정지' : '▶ 재생'; });
    NB.button(br, '한 사이클 ▶|', () => { sim.step(); after(); });
    NB.button(br, '↺ 다시', () => reset(), 'primary');
    const P = simPanel(W, { height: (w) => Math.min(460, w * 0.62) });
    let sim, cyc = null, delivered = 0, acc = 0;
    function reset() {
      sim = new Sim({ kx: 2, ky: 2, vcs: 1, depth: 2, pktLen: 6, rate: 0, routing: mode === 'xy' ? 'xy' : 'adaptive', record: true, deadlockWindow: 12 });
      if (mode === 'cw') {
        const base = ROUTING.adaptive;
        sim.route = { ports: (s, r, pkt) => (pkt.first != null && r === pkt.src ? [pkt.first] : base.ports(s, r, pkt)) };
      }
      const { E, S, W: Wd, N } = NB.noc;
      [[0, 3, E, 0], [1, 2, S, 1], [3, 0, Wd, 2], [2, 1, N, 3]].forEach(([s, d, f, c]) => sim.inject(s, d, { first: f, color: c }));
      delivered = 0; cyc = null;
      sim.onDeliver = () => { delivered++; };
      after();
    }
    function after() {
      if (sim.deadlocked && !cyc) cyc = sim.waitCycle();
      P.st.t.set(sim.t); P.st.d.set(delivered + ' / 4', '', delivered === 4 ? 'good' : '');
      P.st.f.set(sim.inNet);
      P.st.s.set(sim.deadlocked ? 'DEADLOCK' : delivered === 4 ? '완료 ✓' : '진행 중', '', sim.deadlocked ? 'bad' : delivered === 4 ? 'good' : '');
      P.info.innerHTML = cyc ? describeCycle(sim, cyc) : mode === 'cw' ? '네 패킷이 모두 시계 방향으로 첫 홉을 갑니다: R0→E, R1→S, R3→W, R2→N.' : 'XY 라우팅: R1→R2와 R3→R0 패킷은 W로, R0→R3과 R2→R1 패킷은 E로 먼저 갑니다. Y→X 회전이 없어 순환이 생기지 않습니다.';
    }
    reset();
    P.cv.draw = () => NB.noc.render(P.cv.ctx, sim, { w: P.cv.w, h: P.cv.h, frac: acc, detail: true, cycle: cyc, showQueue: false, deadlockBanner: true });
    NB.loop(P.cv.canvas, (dt) => {
      if (running && !sim.deadlocked && delivered < 4) {
        acc += dt * speed;
        while (acc >= 1) { acc -= 1; sim.step(); after(); }
      }
      P.cv.draw();
    });
  })();

  /* ======================================================
     6.3 CDG figure
     ====================================================== */
  (function () {
    const svg = document.getElementById('fig-cdg'); if (!svg) return;
    const S = NB.svgEl;
    function draw() {
      svg.innerHTML = '';
      const dng = NB.css('--danger'), ok = NB.css('--accent-2'), text = NB.css('--text'), mute = NB.css('--text-mute'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), c1 = NB.css('--c1'), c4 = NB.css('--c4');
      const defs = S('defs', null, svg);
      [['mr', dng], ['mg', ok], ['mm', mute]].forEach(([id, c]) => { const m = S('marker', { id: 'cdg' + id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs); S('path', { d: 'M0 0L10 5L0 10z', fill: c }, m); });
      // left: ring nodes and channel nodes
      const cx = 170, cy = 150, R = 95;
      S('text', { x: 20, y: 24, 'font-size': 14, 'font-weight': 700, fill: text }, svg).textContent = '단방향 링 (VC 1개)';
      const pos = (i, r) => [cx + r * Math.cos(-Math.PI / 2 + i * Math.PI / 2 + Math.PI / 4), cy + r * Math.sin(-Math.PI / 2 + i * Math.PI / 2 + Math.PI / 4)];
      for (let i = 0; i < 4; i++) {
        const [x, y] = pos(i - 0.5, R);
        S('rect', { x: x - 16, y: y - 16, width: 32, height: 32, rx: 7, fill: node, stroke, 'stroke-width': 1.4 }, svg);
        S('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: text }, svg).textContent = 'N' + i;
      }
      for (let i = 0; i < 4; i++) {
        const [x, y] = pos(i, R * 0.62);
        S('circle', { cx: x, cy: y, r: 17, fill: NB.alpha(dng, 0.12), stroke: dng, 'stroke-width': 1.6 }, svg);
        S('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: dng }, svg).textContent = 'c' + i;
        const [x2, y2] = pos(i + 1, R * 0.62);
        const a = Math.atan2(y2 - y, x2 - x);
        S('line', { x1: x + 19 * Math.cos(a), y1: y + 19 * Math.sin(a), x2: x2 - 21 * Math.cos(a), y2: y2 - 21 * Math.sin(a), stroke: dng, 'stroke-width': 2, 'marker-end': 'url(#cdgmr)' }, svg);
      }
      S('text', { x: cx, y: 278, 'text-anchor': 'middle', 'font-size': 12.5, fill: dng }, svg).textContent = '사이클 c0→c1→c2→c3→c0 ⇒ 데드락 가능';
      // right: dateline
      const x0 = 380, cw = 92, yA = 95, yB = 205;
      S('text', { x: x0, y: 24, 'font-size': 14, 'font-weight': 700, fill: text }, svg).textContent = 'Dateline (c3 = N3→N0 를 건너면 VC1)';
      S('text', { x: x0 - 8, y: yA + 5, 'text-anchor': 'end', 'font-size': 12, fill: c1 }, svg).textContent = 'VC0';
      S('text', { x: x0 - 8, y: yB + 5, 'text-anchor': 'end', 'font-size': 12, fill: c4 }, svg).textContent = 'VC1';
      const used = { '0.0': 1, '1.0': 1, '2.0': 1, '3.1': 1, '0.1': 1, '1.1': 1 };
      const P = (c, v) => [x0 + 20 + c * cw, v ? yB : yA];
      for (let c = 0; c < 4; c++) for (let v = 0; v < 2; v++) {
        const [x, y] = P(c, v), u = used[c + '.' + v];
        S('circle', { cx: x, cy: y, r: 19, fill: u ? NB.alpha(v ? c4 : c1, 0.14) : 'none', stroke: u ? (v ? c4 : c1) : mute, 'stroke-width': 1.6, 'stroke-dasharray': u ? null : '3 3' }, svg);
        S('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: u ? text : mute }, svg).textContent = 'c' + c + '.' + v;
      }
      const edge = (a, b) => {
        const [x1, y1] = P(...a), [x2, y2] = P(...b);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        S('line', { x1: x1 + 21 * Math.cos(ang), y1: y1 + 21 * Math.sin(ang), x2: x2 - 23 * Math.cos(ang), y2: y2 - 23 * Math.sin(ang), stroke: ok, 'stroke-width': 2, 'marker-end': 'url(#cdgmg)' }, svg);
      };
      edge([0, 0], [1, 0]); edge([1, 0], [2, 0]); edge([2, 0], [3, 1]); edge([3, 1], [0, 1]);
      // c0.1 -> c1.1 drawn on lower row (wrap from c3.1 at right to c0.1 at left via curve)
      const [xa, ya] = P(3, 1), [xb, yb] = P(0, 1);
      S('path', { d: 'M' + (xa - 6) + ' ' + (ya + 19) + ' C ' + (xa - 40) + ' ' + (ya + 60) + ', ' + (xb + 40) + ' ' + (yb + 60) + ', ' + (xb + 8) + ' ' + (yb + 21), fill: 'none', stroke: ok, 'stroke-width': 2, 'marker-end': 'url(#cdgmg)' }, svg);
      edge([0, 1], [1, 1]);
      S('line', { x1: x0 + 20 + 3 * cw - 46, y1: 50, x2: x0 + 20 + 3 * cw - 46, y2: 245, stroke: NB.css('--warn'), 'stroke-width': 2, 'stroke-dasharray': '6 4' }, svg);
      S('text', { x: x0 + 20 + 3 * cw - 46, y: 46, 'text-anchor': 'middle', 'font-size': 11.5, fill: NB.css('--warn'), 'font-weight': 700 }, svg).textContent = 'dateline';
      S('text', { x: x0 + 160, y: 285, 'text-anchor': 'middle', 'font-size': 12.5, fill: ok }, svg).textContent = '사이클 없음: 의존성이 VC0 → VC1 방향으로만 흐름';
    }
    NB.onTheme(draw);
    draw();
  })();

  /* ======================================================
     6.4 Deadlock lab
     ====================================================== */
  (function () {
    const W = NB.widget('w-lab'); if (!W) return;
    const PRE = {
      ringNoDL: { label: '링 8 · VC1 · dateline 없음', cfg: { kx: 8, ky: 1, torus: true, dateline: false, vcs: 1, routing: 'xy' } },
      ringDL: { label: '링 8 · VC2 · dateline', cfg: { kx: 8, ky: 1, torus: true, dateline: true, vcs: 2, routing: 'xy' } },
      torusNoDL: { label: '4×4 Torus · VC1', cfg: { kx: 4, ky: 4, torus: true, dateline: false, vcs: 1, routing: 'xy' } },
      torusDL: { label: '4×4 Torus · VC2 · dateline', cfg: { kx: 4, ky: 4, torus: true, dateline: true, vcs: 2, routing: 'xy' } },
      meshAd: { label: '4×4 Mesh · 완전 적응형 · VC1', cfg: { kx: 4, ky: 4, vcs: 1, routing: 'adaptive' } },
      meshWF: { label: '4×4 Mesh · West-First · VC1', cfg: { kx: 4, ky: 4, vcs: 1, routing: 'westfirst' } },
      meshOE: { label: '4×4 Mesh · Odd-Even · VC1', cfg: { kx: 4, ky: 4, vcs: 1, routing: 'oddeven' } }
    };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let pre = 'ringNoDL', speed = 20, rate = 0.5, seed = 1;
    NB.select(ctr, { label: '프리셋', value: pre, options: Object.keys(PRE).map((k) => ({ value: k, label: PRE[k].label })), onChange: (v) => { pre = v; reset(); } });
    NB.slider(ctr, { label: '주입률', min: 0.1, max: 0.8, step: 0.05, value: rate, fmt: (v) => v.toFixed(2), onChange: (v) => { rate = v; reset(); } });
    NB.slider(ctr, { label: '속도', min: 2, max: 120, value: speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { speed = v; } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    NB.button(br, '⏩ 500 사이클', () => { for (let i = 0; i < 500 && !sim.deadlocked; i++) sim.step(); after(); });
    NB.button(br, '↺ 다른 시드', () => { seed++; reset(); }, 'primary');
    const P = simPanel(W, { height: (w) => Math.min(520, w * 0.66) });
    let sim, cyc = null, delivered = 0, acc = 0;
    function reset() {
      sim = new Sim(Object.assign({ depth: 2, pktLen: 6, rate, traffic: 'uniform', record: true, seed, deadlockWindow: 300 }, PRE[pre].cfg));
      cyc = null; delivered = 0;
      sim.onDeliver = () => { delivered++; };
      after();
    }
    function after() {
      if (sim.deadlocked && !cyc) cyc = sim.waitCycle();
      P.st.t.set(sim.t); P.st.d.set(delivered); P.st.f.set(sim.inNet);
      P.st.s.set(sim.deadlocked ? 'DEADLOCK' : '정상', '', sim.deadlocked ? 'bad' : 'good');
      P.info.innerHTML = cyc ? describeCycle(sim, cyc) : '라우터 안의 작은 칸은 입력 VC 버퍼 슬롯입니다(가장자리 쪽이 입력 측). ' + (sim.cfg.dateline && sim.geo.torus ? 'Dateline 모드: 각 입력 포트의 위쪽/왼쪽 줄이 VC0, 아래쪽/오른쪽 줄이 VC1입니다.' : '');
    }
    reset();
    P.cv.draw = () => NB.noc.render(P.cv.ctx, sim, { w: P.cv.w, h: P.cv.h, frac: acc, detail: true, cycle: cyc, showQueue: true });
    NB.loop(P.cv.canvas, (dt) => {
      if (!sim.deadlocked) {
        acc += dt * speed;
        let n = 0;
        while (acc >= 1 && n++ < 40) { acc -= 1; sim.step(); }
        if (acc > 1) acc = 0.99;
        after();
      }
      P.cv.draw();
    });
  })();
});
