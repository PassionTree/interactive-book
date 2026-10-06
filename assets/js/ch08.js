/* Chapter 8 — Performance & simulator */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const { Sim, ROUTING, TRAFFIC, runPoint, channelLoad, PORT_NAMES } = NB.noc;
  const MESH_ROUTING = ['xy', 'yx', 'westfirst', 'northlast', 'negfirst', 'oddeven', 'o1turn', 'valiant', 'adaptive'];
  const TORUS_ROUTING = ['xy', 'yx'];
  const TRAFFICS = ['uniform', 'transpose', 'bitcomp', 'bitrev', 'shuffle', 'tornado', 'neighbor', 'hotspot'];
  const ring1 = (k) => { let s = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const d = Math.abs(a - b); s += Math.min(d, k - d); } return s / (k * k); };
  const line1 = (k) => (k * k - 1) / (3 * k);
  const havg = (k, torus) => 2 * (torus ? ring1(k) : line1(k)) * (k * k) / (k * k - 1);

  /* ======================================================
     8.1 Zero-load latency
     ====================================================== */
  (function () {
    const W = NB.widget('w-zll'); if (!W) return;
    const P = { torus: false, k: 8, tr: 2, tw: 1, L: 4 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '토폴로지', value: 'mesh', options: [{ value: 'mesh', label: 'Mesh' }, { value: 'torus', label: 'Torus' }], onChange: (v) => { P.torus = v === 'torus'; upd(); } });
    NB.slider(ctr, { label: '크기 k (k×k)', min: 2, max: 16, value: P.k, onInput: (v) => { P.k = v; upd(); } });
    NB.slider(ctr, { label: '라우터 지연 tᵣ', min: 1, max: 6, value: P.tr, fmt: (v) => v + ' cyc', onInput: (v) => { P.tr = v; upd(); } });
    NB.slider(ctr, { label: '링크 지연 t_w', min: 1, max: 4, value: P.tw, fmt: (v) => v + ' cyc', onInput: (v) => { P.tw = v; upd(); } });
    NB.slider(ctr, { label: '패킷 길이 L', min: 1, max: 16, value: P.L, fmt: (v) => v + ' flits', onInput: (v) => { P.L = v; upd(); } });
    const bar = el('div', { style: { margin: '6px 0 4px' } }); W.body.append(bar);
    const st = NB.stats(W.body, [{ key: 'h', label: '평균 홉 수 H' }, { key: 'r', label: '라우터 (H+1)·tᵣ' }, { key: 'w', label: '링크 H·t_w' }, { key: 's', label: '직렬화 L' }, { key: 't', label: 'T₀ 합계' }]);
    const box = el('div', { style: { marginTop: '12px' } }); W.body.append(box);
    const chart = NB.chart(box, { height: 230, xLabel: 'k (노드 수 = k²)', yLabel: '무부하 지연 (사이클)', xMin: 2, xMax: 16, yMin: 0 });
    function upd() {
      const H = havg(P.k, P.torus);
      const r = (H + 1) * P.tr, w = H * P.tw, s = P.L, T = r + w + s;
      bar.innerHTML = '';
      const row = el('div', { style: { display: 'flex', height: '34px', borderRadius: '8px', overflow: 'hidden', fontSize: '12px', fontWeight: 700, color: '#fff' } });
      [['라우터', r, '--c1'], ['링크', w, '--c2'], ['직렬화', s, '--c3']].forEach(([n, v, c]) => row.append(el('div', { style: { width: (100 * v / T) + '%', background: 'var(' + c + ')', display: 'grid', placeItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' } }, n + ' ' + v.toFixed(1))));
      bar.append(row);
      st.h.set(H.toFixed(2)); st.r.set(r.toFixed(1)); st.w.set(w.toFixed(1)); st.s.set(s); st.t.set(T.toFixed(1), 'cyc');
      const pts = (torus, tw) => Array.from({ length: 15 }, (_, i) => { const k = i + 2, h = havg(k, torus); return [k, (h + 1) * P.tr + h * tw + P.L]; });
      chart.set({ series: [
        { name: 'Mesh', color: NB.css('--c1'), points: pts(false, P.tw), marker: true },
        { name: 'Torus (링크 지연 동일)', color: NB.css('--c2'), points: pts(true, P.tw), marker: true },
        { name: 'Folded Torus (링크 지연 ×2)', color: NB.css('--c2'), points: pts(true, P.tw * 2), dash: [5, 4] }
      ], vlines: [{ x: P.k, color: NB.css('--text-mute') }] });
    }
    upd();
    NB.onTheme(upd);
  })();

  /* ======================================================
     8.2 Channel load heatmap
     ====================================================== */
  (function () {
    const W = NB.widget('w-load'); if (!W) return;
    const P = { k: 8, torus: false, routing: 'xy', traffic: 'transpose' };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '토폴로지', value: 'mesh', options: [{ value: 'mesh', label: 'Mesh' }, { value: 'torus', label: 'Torus' }], onChange: (v) => { P.torus = v === 'torus'; fillRouting(); upd(); } });
    NB.slider(ctr, { label: '크기', min: 3, max: 8, value: P.k, fmt: (v) => v + '×' + v, onInput: (v) => { P.k = v; upd(); } });
    const rs = NB.select(ctr, { label: '라우팅', value: P.routing, options: MESH_ROUTING.map((r) => ({ value: r, label: ROUTING[r].name })), onChange: (v) => { P.routing = v; upd(); } });
    NB.select(ctr, { label: '트래픽', value: P.traffic, options: TRAFFICS.map((t) => ({ value: t, label: TRAFFIC[t].name })), onChange: (v) => { P.traffic = v; upd(); } });
    function fillRouting() {
      const list = P.torus ? TORUS_ROUTING : MESH_ROUTING;
      rs.select.innerHTML = '';
      list.forEach((r) => rs.select.append(el('option', { value: r }, ROUTING[r].name)));
      if (!list.includes(P.routing)) P.routing = 'xy';
      rs.select.value = P.routing;
    }
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const cv = NB.canvas(left, { height: (w) => Math.min(480, w) });
    const st = NB.stats(right, [{ key: 'g', label: '최대 채널 부하 γ_max' }, { key: 'th', label: '이상적 처리량 1/γ_max' }, { key: 'bis', label: '이분 대역폭 상한 (Uniform)' }, { key: 'avg', label: '평균 채널 부하' }]);
    const grad = el('div', { style: { marginTop: '14px' } }); right.append(grad);
    const note = el('p', { class: 'hint', style: { marginTop: '10px' } }); right.append(note);
    let R, sim, hover = null;
    function upd() {
      R = channelLoad({ kx: P.k, ky: P.k, torus: P.torus, routing: P.routing, traffic: P.traffic, dateline: true });
      sim = new Sim({ kx: P.k, ky: P.k, torus: P.torus, rate: 0, routing: P.routing === 'valiant' || P.routing === 'o1turn' ? P.routing : 'xy', vcs: 2 });
      let sum = 0, cnt = 0;
      for (let r = 0; r < sim.geo.n; r++) for (let p = 1; p < 5; p++) if (sim.geo.nb(r, p) >= 0) { sum += R.loads[r * 5 + p]; cnt++; }
      st.g.set(R.max.toFixed(3));
      st.th.set(R.ideal.toFixed(3), 'flit/node/cyc', 'good');
      st.bis.set((P.torus ? 8 / P.k : 4 / P.k).toFixed(3));
      st.avg.set((sum / cnt).toFixed(3));
      grad.innerHTML = '<div class="small" style="margin-bottom:4px">채널 부하 (주입률 1당)</div><div style="height:12px;border-radius:6px;background:linear-gradient(90deg,' + [0, 0.25, 0.5, 0.75, 1].map((t) => NB.util(t)).join(',') + ')"></div><div class="mono small" style="display:flex;justify-content:space-between;color:var(--text-mute)"><span>0</span><span>' + (R.max / 2).toFixed(2) + '</span><span>' + R.max.toFixed(2) + '</span></div>';
      note.textContent = P.traffic === 'uniform' ? '균등 트래픽의 경우 이분 대역폭 상한과 비교해 보세요. 메시 + XY는 상한과 같은 처리량을 냅니다.' : '같은 트래픽에서 라우팅을 바꿔 γ_max가 어떻게 달라지는지 보세요.';
      draw();
    }
    function draw() {
      if (!sim) return;
      NB.noc.render(cv.ctx, sim, { w: cv.w, h: cv.h, heat: R.loads, heatMax: R.max, showQueue: false, labels: P.k <= 6 });
      if (hover) {
        const { ctx } = cv;
        ctx.fillStyle = NB.css('--text'); ctx.font = 'bold 12px ' + NB.css('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(hover, 6, 4);
      }
    }
    cv.draw = draw;
    cv.canvas.addEventListener('pointermove', (e) => {
      const p = cv.pos(e), Lt = NB.noc.layout(sim, cv.w, cv.h, {});
      let best = null, bd = 14;
      for (let r = 0; r < sim.geo.n; r++) for (let q = 1; q < 5; q++) {
        if (sim.geo.nb(r, q) < 0 || sim.geo.isWrap(r, q)) continue;
        const ln = NB.noc.lane(sim, Lt, r, q);
        const mx = (ln.pts[0] + ln.pts[2]) / 2, my = (ln.pts[1] + ln.pts[3]) / 2, d = Math.hypot(mx - p.x, my - p.y);
        if (d < bd) { bd = d; best = { r, q }; }
      }
      const g = sim.geo;
      const nh = best ? '(' + g.x(best.r) + ',' + g.y(best.r) + ')→' + PORT_NAMES[best.q] + '  γ=' + R.loads[best.r * 5 + best.q].toFixed(3) : null;
      if (nh !== hover) { hover = nh; draw(); }
    });
    cv.canvas.addEventListener('pointerleave', () => { hover = null; draw(); });
    fillRouting();
    upd();
  })();

  /* ======================================================
     8.3 Live simulator
     ====================================================== */
  (function () {
    const W = NB.widget('w-sim'); if (!W) return;
    const P = { k: 8, torus: false, routing: 'xy', traffic: 'uniform', rate: 0.15, vcs: 2, depth: 4, pktLen: 4, routerDelay: 2, speed: 30 };
    const r1 = el('div', { class: 'controls' }), r2 = el('div', { class: 'controls' }), r3 = el('div', { class: 'controls' });
    W.body.append(r1, r2, r3);
    NB.seg(r1, { label: '토폴로지', value: 'mesh', options: [{ value: 'mesh', label: 'Mesh' }, { value: 'torus', label: 'Torus' }], onChange: (v) => { P.torus = v === 'torus'; if (P.torus && P.vcs < 2) { P.vcs = 2; vcS.set(2); } fillRouting(); reset(); } });
    NB.slider(r1, { label: '크기', min: 3, max: 10, value: P.k, fmt: (v) => v + '×' + v, onChange: (v) => { P.k = v; reset(); } });
    const rs = NB.select(r1, { label: '라우팅', value: P.routing, options: MESH_ROUTING.map((r) => ({ value: r, label: ROUTING[r].name })), onChange: (v) => { P.routing = v; if ((v === 'o1turn' || v === 'valiant') && P.vcs < 2) { P.vcs = 2; vcS.set(2); } reset(); } });
    NB.select(r1, { label: '트래픽', value: P.traffic, options: TRAFFICS.map((t) => ({ value: t, label: TRAFFIC[t].name })), onChange: (v) => { P.traffic = v; reset(); } });
    const rateS = NB.slider(r2, { label: '주입률 (flit/node/cyc)', min: 0.01, max: 0.7, step: 0.01, value: P.rate, fmt: (v) => v.toFixed(2), onInput: (v) => { P.rate = v; if (sim) sim.cfg.rate = v; }, width: 200 });
    const vcS = NB.slider(r2, { label: 'VC 수', min: 1, max: 4, value: P.vcs, onChange: (v) => { P.vcs = v; reset(); } });
    NB.slider(r2, { label: 'VC 버퍼 깊이', min: 1, max: 8, value: P.depth, fmt: (v) => v + ' flits', onChange: (v) => { P.depth = v; reset(); } });
    NB.slider(r2, { label: '패킷 길이', min: 1, max: 8, value: P.pktLen, fmt: (v) => v + ' flits', onChange: (v) => { P.pktLen = v; reset(); } });
    NB.slider(r2, { label: '라우터 지연', min: 1, max: 4, value: P.routerDelay, fmt: (v) => v + ' cyc', onChange: (v) => { P.routerDelay = v; reset(); } });
    NB.slider(r3, { label: '시뮬레이션 속도', min: 0, max: 7, value: 3, fmt: (i) => [2, 5, 15, 30, 60, 200, 600, 2000][i] + ' cyc/s', onInput: (i) => { P.speed = [2, 5, 15, 30, 60, 200, 600, 2000][i]; } });
    const br = el('div', { class: 'btn-row' }); r3.append(br);
    let running = true;
    const playB = NB.button(br, '⏸ 일시정지', () => { running = !running; playB.textContent = running ? '⏸ 일시정지' : '▶ 재생'; });
    NB.button(br, '한 사이클 ▶|', () => { sim.step(); acc = 1; });
    NB.button(br, '↺ 리셋', () => reset(), 'primary');
    const warn = el('div', { class: 'hint', style: { margin: '-4px 0 8px' } }); W.body.append(warn);
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const cv = NB.canvas(left, { height: (w) => Math.min(560, w) });
    const st = NB.stats(right, [
      { key: 't', label: '사이클' }, { key: 'off', label: '주입률 (offered)' }, { key: 'acc', label: '수신 처리량 (accepted)' },
      { key: 'lat', label: '평균 패킷 지연' }, { key: 'net', label: '네트워크 내 플릿' }, { key: 'q', label: '출발지 대기 패킷' }
    ]);
    const c1 = el('div', { style: { marginTop: '10px' } }); right.append(c1);
    const latChart = NB.chart(c1, { height: 150, xLabel: '사이클', yLabel: '지연', yMin: 0 });
    const thrChart = NB.chart(c1, { height: 150, xLabel: '사이클', yLabel: 'flit/node/cyc', yMin: 0 });
    function fillRouting() {
      const list = P.torus ? TORUS_ROUTING : MESH_ROUTING;
      rs.select.innerHTML = '';
      list.forEach((r) => rs.select.append(el('option', { value: r }, ROUTING[r].name)));
      if (!list.includes(P.routing)) P.routing = 'xy';
      rs.select.value = P.routing;
    }
    let sim, acc = 0, cyc = null, seed = 1;
    function reset() {
      seed++;
      sim = new Sim({ kx: P.k, ky: P.k, torus: P.torus, dateline: true, routing: P.routing, traffic: P.traffic, rate: P.rate, vcs: P.vcs, depth: P.depth, pktLen: P.pktLen, routerDelay: P.routerDelay, record: true, seed, deadlockWindow: 400 });
      cyc = null; acc = 0;
      const ld = channelLoad({ kx: P.k, ky: P.k, torus: P.torus, routing: P.routing, traffic: P.traffic });
      const msgs = ['이 설정의 이상적 처리량(해석): <b>' + ld.ideal.toFixed(3) + '</b> flit/node/cycle'];
      if (ROUTING[P.routing].unsafe) msgs.push('<span style="color:var(--danger)">⚠ 이 라우팅은 데드락 회피 장치가 없습니다.</span>');
      if (P.torus) msgs.push('Torus: dateline VC 클래스 사용 (VC 절반씩).');
      warn.innerHTML = msgs.join(' · ');
      stats();
    }
    function stats() {
      const s = sim, last = s.series.slice(-10);
      const lats = last.filter((x) => x.lat != null);
      const lat = lats.length ? lats.reduce((a, b) => a + b.lat, 0) / lats.length : null;
      const thr = last.length ? last.reduce((a, b) => a + b.acc, 0) / last.length : 0;
      st.t.set(s.t);
      st.off.set(P.rate.toFixed(3));
      st.acc.set(thr.toFixed(3), '', s.t > 1500 && thr < P.rate * 0.9 ? 'bad' : '');
      st.lat.set(lat != null ? lat.toFixed(1) : '—', 'cyc', lat != null && lat > 150 ? 'bad' : '');
      st.net.set(s.inNet);
      const q = s.queued();
      st.q.set(q, '', q > s.geo.n * 4 ? 'bad' : '');
      if (s.deadlocked) st.t.set(s.t + ' <small style="color:var(--danger)">DEADLOCK</small>');
      latChart.set({ series: [{ name: '평균 지연 (100사이클 창)', color: NB.css('--c1'), points: s.series.map((x) => [x.t, x.lat]) }] });
      thrChart.set({ series: [
        { name: '수신 처리량', color: NB.css('--c2'), points: s.series.map((x) => [x.t, x.acc]) },
        { name: '주입률', color: NB.css('--text-mute'), points: s.series.length ? [[s.series[0].t, P.rate], [s.series[s.series.length - 1].t, P.rate]] : [], dash: [4, 4], width: 1.5 }
      ] });
    }
    let hoverR = -1;
    cv.draw = () => NB.noc.render(cv.ctx, sim, { w: cv.w, h: cv.h, frac: P.speed > 60 ? 1 : acc, cycle: cyc, labels: P.k <= 6, highlight: hoverR >= 0 ? { [hoverR]: NB.css('--accent') } : null });
    cv.canvas.addEventListener('pointermove', (e) => {
      const p = cv.pos(e), Lt = NB.noc.layout(sim, cv.w, cv.h, {});
      let best = -1, bd = Lt.cs * 0.5;
      for (let r = 0; r < sim.geo.n; r++) { const d = Math.hypot(Lt.cx(r) - p.x, Lt.cy(r) - p.y); if (d < bd) { bd = d; best = r; } }
      hoverR = best;
      if (best < 0) { NB.tip.hide(); return; }
      const g = sim.geo, V = sim.V;
      let html = '<b>라우터 (' + g.x(best) + ',' + g.y(best) + ')</b><br>';
      for (let q = 0; q < 5; q++) {
        if (q && g.nb(best, q) < 0) continue;
        const parts = [];
        for (let v = 0; v < V; v++) {
          const iv = (best * 5 + q) * V + v;
          const n = sim.buf[iv].length;
          parts.push('VC' + v + ' ' + n + '/' + sim.cfg.depth + (sim.ivPort[iv] >= 0 ? '→' + PORT_NAMES[sim.ivPort[iv]] : ''));
        }
        html += '<span style="font-family:var(--mono);font-size:12px">' + PORT_NAMES[q] + ': ' + parts.join(' · ') + '</span><br>';
      }
      html += '출발지 대기: ' + sim.srcQ[best].length + ' 패킷';
      NB.tip.show(html, e.clientX, e.clientY);
    });
    cv.canvas.addEventListener('pointerleave', () => { hoverR = -1; NB.tip.hide(); });
    fillRouting();
    reset();
    let fr = 0;
    NB.loop(W.root, (dt) => {
      if (running && !sim.deadlocked) {
        acc += dt * P.speed;
        let n = 0;
        const budget = performance.now() + 12;
        while (acc >= 1 && performance.now() < budget) { acc -= 1; sim.step(); n++; }
        if (acc > 1) acc = 0.99;
        if (sim.deadlocked && !cyc) cyc = sim.waitCycle();
      }
      cv.draw();
      if (++fr % 10 === 0) stats();
    });
  })();

  /* ======================================================
     8.4 Latency-throughput sweep
     ====================================================== */
  (function () {
    const W = NB.widget('w-sweep'); if (!W) return;
    const P = { k: 8, torus: false, routing: 'xy', traffic: 'uniform', vcs: 2, depth: 4, pktLen: 4 };
    const r1 = el('div', { class: 'controls' }); W.body.append(r1);
    NB.seg(r1, { label: '토폴로지', value: 'mesh', options: [{ value: 'mesh', label: 'Mesh' }, { value: 'torus', label: 'Torus' }], onChange: (v) => { P.torus = v === 'torus'; fillRouting(); } });
    NB.slider(r1, { label: '크기', min: 4, max: 8, value: P.k, fmt: (v) => v + '×' + v, onInput: (v) => { P.k = v; } });
    const rs = NB.select(r1, { label: '라우팅', value: P.routing, options: MESH_ROUTING.map((r) => ({ value: r, label: ROUTING[r].name })), onChange: (v) => { P.routing = v; } });
    NB.select(r1, { label: '트래픽', value: P.traffic, options: TRAFFICS.map((t) => ({ value: t, label: TRAFFIC[t].name })), onChange: (v) => { P.traffic = v; } });
    const r2 = el('div', { class: 'controls' }); W.body.append(r2);
    NB.slider(r2, { label: 'VC 수', min: 1, max: 4, value: P.vcs, onInput: (v) => { P.vcs = v; } });
    NB.slider(r2, { label: 'VC 깊이', min: 1, max: 8, value: P.depth, onInput: (v) => { P.depth = v; } });
    NB.slider(r2, { label: '패킷 길이', min: 1, max: 8, value: P.pktLen, onInput: (v) => { P.pktLen = v; } });
    const br = el('div', { class: 'btn-row' }); r2.append(br);
    NB.button(br, '＋ 곡선 추가', () => enqueue([Object.assign({}, P)]), 'primary');
    NB.button(br, '지우기', () => { queue = []; curves = []; redraw(); });
    const r3 = el('div', { class: 'btn-row', style: { margin: '0 0 12px' } }); W.body.append(r3);
    r3.append(el('span', { class: 'small muted' }, '프리셋 비교:'));
    const base = { k: 8, torus: false, vcs: 2, depth: 4, pktLen: 4, traffic: 'uniform', routing: 'xy' };
    const presets = {
      '라우팅 (Transpose)': ['xy', 'oddeven', 'o1turn', 'valiant'].map((r) => Object.assign({}, base, { traffic: 'transpose', routing: r })),
      '라우팅 (Uniform)': ['xy', 'westfirst', 'oddeven', 'valiant'].map((r) => Object.assign({}, base, { routing: r })),
      'VC 개수': [1, 2, 4].map((v) => Object.assign({}, base, { vcs: v, depth: 4 })),
      '버퍼 깊이': [1, 2, 4, 8].map((d) => Object.assign({}, base, { depth: d })),
      'Mesh vs Torus': [Object.assign({}, base), Object.assign({}, base, { torus: true })],
      '트래픽 패턴': ['uniform', 'transpose', 'bitcomp', 'tornado', 'neighbor'].map((t) => Object.assign({}, base, { traffic: t }))
    };
    Object.entries(presets).forEach(([n, list]) => NB.button(r3, n, () => { queue = []; curves = []; enqueue(list); }));
    const prog = el('div', { class: 'small', style: { minHeight: '22px', color: 'var(--text-soft)' } }); W.body.append(prog);
    const lay = el('div', { class: 'split' }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const latChart = NB.chart(a, { height: 300, xLabel: '주입률 (flit/node/cycle)', yLabel: '평균 지연 (사이클)', xMin: 0, yMin: 0, xFmt: (x) => x.toFixed(2) });
    const thrChart = NB.chart(b, { height: 300, xLabel: '주입률 (flit/node/cycle)', yLabel: '수신 처리량', xMin: 0, yMin: 0, xFmt: (x) => x.toFixed(2) });
    function fillRouting() {
      const list = P.torus ? TORUS_ROUTING : MESH_ROUTING;
      rs.select.innerHTML = '';
      list.forEach((r) => rs.select.append(el('option', { value: r }, ROUTING[r].name)));
      if (!list.includes(P.routing)) P.routing = 'xy';
      rs.select.value = P.routing;
    }
    let queue = [], curves = [], busy = false, colorIdx = 0;
    const label = (c) => (c.torus ? 'Torus' : 'Mesh') + c.k + ' ' + ROUTING[c.routing].short + ' ' + TRAFFIC[c.traffic].name.split(' ')[0] + ' VC' + c.vcs + '×' + c.depth + ' L' + c.pktLen;
    function enqueue(list) {
      list.forEach((c) => {
        const cfg = Object.assign({}, c);
        if (cfg.torus && !TORUS_ROUTING.includes(cfg.routing)) cfg.routing = 'xy';
        if ((cfg.torus || cfg.routing === 'o1turn' || cfg.routing === 'valiant') && cfg.vcs < 2) cfg.vcs = 2;
        const pal = NB.palette();
        const curve = { cfg, name: label(cfg), color: pal[colorIdx++ % pal.length], pts: [], done: false, ideal: channelLoad({ kx: cfg.k, ky: cfg.k, torus: cfg.torus, routing: cfg.routing, traffic: cfg.traffic }).ideal };
        curves.push(curve);
        queue.push(curve);
      });
      redraw();
      if (!busy) pump();
    }
    function pump() {
      const cur = queue[0];
      if (!cur) { busy = false; prog.textContent = curves.length ? '완료 ✓' : ''; return; }
      busy = true;
      const step = cur.cfg.k <= 5 ? 0.025 : 0.02;
      const rate = +(step * (cur.pts.length + 1)).toFixed(3);
      const satCount = cur.pts.filter((p) => p.saturated).length;
      if (satCount >= 2 || rate > 1) { cur.done = true; queue.shift(); setTimeout(pump, 0); redraw(); return; }
      prog.innerHTML = '측정 중: <b style="color:' + cur.color + '">' + cur.name + '</b> · 주입률 ' + rate.toFixed(3) + ' · 남은 곡선 ' + queue.length;
      setTimeout(() => {
        const c = cur.cfg;
        const r = runPoint({ kx: c.k, ky: c.k, torus: c.torus, dateline: true, routing: c.routing, traffic: c.traffic, vcs: c.vcs, depth: c.depth, pktLen: c.pktLen, rate, seed: 3 }, { warmup: 500, measure: 1500, drainMax: 4000, latCap: 600 });
        cur.pts.push(r);
        redraw();
        pump();
      }, 0);
    }
    function redraw() {
      let ymax = 20;
      curves.forEach((c) => c.pts.forEach((p) => { if (!p.saturated && p.latency) ymax = Math.max(ymax, p.latency); }));
      const xmax = Math.max(0.2, ...curves.map((c) => (c.pts.length ? c.pts[c.pts.length - 1].rate : 0.1))) * 1.05;
      latChart.set({
        xMax: xmax, yMax: Math.min(ymax * 1.1, 400),
        series: curves.map((c) => ({ name: c.name, color: c.color, marker: true, points: c.pts.filter((p) => !p.saturated).map((p) => [p.rate, p.latency]) })),
        vlines: curves.map((c) => ({ x: c.ideal, color: NB.alpha(c.color, 0.6) }))
      });
      thrChart.set({
        xMax: xmax, yMax: xmax,
        series: [{ name: '이상 (수신 = 주입)', color: NB.css('--text-mute'), points: [[0, 0], [xmax, xmax]], dash: [4, 4], width: 1.2, noLegend: true }].concat(curves.map((c) => ({ name: c.name, color: c.color, marker: true, points: c.pts.map((p) => [p.rate, p.throughput]), noLegend: true })))
      });
    }
    fillRouting();
    // start with an example so the chart is not empty
    let auto = false;
    NB.visible(W.root, (v) => { if (v && !auto) { auto = true; enqueue([Object.assign({}, base), Object.assign({}, base, { routing: 'oddeven' })]); } });
  })();
});
