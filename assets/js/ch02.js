/* Chapter 2 — Topology */
NB.ready(function () {
  'use strict';
  const { el } = NB;

  /* ---------------- topology generators ----------------
     returns {nodes:[{x,y,router,label}], edges:[[a,b,curve]], directed, terms:[], srcTerms, dstTerms, side(i)?, bis, desc} */
  const TOPO = {
    ring: {
      name: 'Ring', sizes: [4, 6, 8, 12, 16, 24, 32], def: 3, label: (s) => 'N=' + s,
      gen(N) {
        const nodes = [], edges = [];
        for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + (2 * Math.PI * i) / N; nodes.push({ x: 0.5 + 0.42 * Math.cos(a), y: 0.5 + 0.42 * Math.sin(a), router: true, label: i }); }
        for (let i = 0; i < N; i++) edges.push([i, (i + 1) % N]);
        return { nodes, edges, side: (i) => (i < N / 2 ? 0 : 1), cutLine: [[0.5, 0], [0.5, 1]] };
      }
    },
    mesh: {
      name: '2D Mesh', sizes: [2, 3, 4, 5, 6, 8], def: 2, label: (k) => k + '×' + k,
      gen(k) {
        const nodes = [], edges = [];
        for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) nodes.push({ x: (x + 0.5) / k, y: (y + 0.5) / k, router: true, label: '' + x + ',' + y });
        for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) { const i = y * k + x; if (x < k - 1) edges.push([i, i + 1]); if (y < k - 1) edges.push([i, i + k]); }
        return { nodes, edges, side: (i) => ((i % k) < k / 2 ? 0 : 1), cutLine: [[0.5, 0], [0.5, 1]] };
      }
    },
    torus: {
      name: '2D Torus', sizes: [3, 4, 5, 6, 8], def: 1, label: (k) => k + '×' + k,
      gen(k) {
        const g = TOPO.mesh.gen(k);
        const s = 0.86;
        g.nodes.forEach((n) => { n.x = 0.5 + (n.x - 0.5) * s; n.y = 0.5 + (n.y - 0.5) * s; });
        for (let y = 0; y < k; y++) g.edges.push([y * k + k - 1, y * k, 'wrapx']);
        for (let x = 0; x < k; x++) g.edges.push([(k - 1) * k + x, x, 'wrapy']);
        return g;
      }
    },
    hypercube: {
      name: 'Hypercube', sizes: [2, 3, 4, 5, 6], def: 2, label: (n) => n + '-cube (N=' + (1 << n) + ')',
      gen(n) {
        const N = 1 << n, bx = Math.ceil(n / 2), by = n - bx, cx = 1 << bx, cy = 1 << by;
        const gray = (v) => v ^ (v >> 1), inv = (g) => { let v = 0; for (; g; g >>= 1) v ^= g; return v; };
        const nodes = [], edges = [];
        for (let i = 0; i < N; i++) {
          const lx = i & (cx - 1), ly = i >> bx;
          nodes.push({ x: (inv(lx) + 0.5) / cx, y: (inv(ly) + 0.5) / cy * (cy / Math.max(cx, cy)) + (1 - cy / Math.max(cx, cy)) / 2, router: true, label: i.toString(2).padStart(n, '0') });
        }
        for (let i = 0; i < N; i++) for (let b = 0; b < n; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j, 'arc']); }
        return { nodes, edges, side: (i) => (i >> (n - 1)) & 1 ? 1 : 0, cutLine: null };
      }
    },
    fbfly: {
      name: 'Flattened Butterfly', sizes: [2, 3, 4, 5, 6], def: 2, label: (k) => k + '×' + k,
      gen(k) {
        const g = TOPO.mesh.gen(k);
        g.edges = [];
        for (let y = 0; y < k; y++) for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) g.edges.push([y * k + a, y * k + b, b - a > 1 ? 'arc' : null]);
        for (let x = 0; x < k; x++) for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) g.edges.push([a * k + x, b * k + x, b - a > 1 ? 'arc' : null]);
        return g;
      }
    },
    cmesh: {
      name: 'Concentrated Mesh (c=4)', sizes: [2, 3, 4], def: 1, label: (k) => k + '×' + k + ' 라우터, ' + 4 * k * k + ' 코어',
      gen(k) {
        const nodes = [], edges = [];
        for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) nodes.push({ x: (x + 0.5) / k, y: (y + 0.5) / k, router: true, label: '' });
        for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) { const i = y * k + x; if (x < k - 1) edges.push([i, i + 1]); if (y < k - 1) edges.push([i, i + k]); }
        const R = k * k, d = 0.22 / k;
        for (let r = 0; r < R; r++) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
          const id = nodes.length;
          nodes.push({ x: nodes[r].x + sx * d, y: nodes[r].y + sy * d, router: false, term: true, label: '' });
          edges.push([r, id, 'term']);
        });
        return { nodes, edges, indirect: true, side: (i) => (i < R ? ((i % k) < k / 2 ? 0 : 1) : null), cutLine: [[0.5, 0], [0.5, 1]] };
      }
    },
    fattree: {
      name: 'Fat-tree (2진 n-tree)', sizes: [2, 3, 4, 5], def: 2, label: (n) => 'n=' + n + ' (단말 ' + (1 << n) + ')',
      gen(n) {
        const N = 1 << n, S = N / 2, nodes = [], edges = [];
        const lv = (l, w) => l * S + w; // switch id
        for (let l = 0; l < n; l++) for (let w = 0; w < S; w++) nodes.push({ x: (w + 0.5) / S, y: 0.78 - (l / Math.max(1, n - 1)) * 0.68, router: true, label: '' });
        for (let l = 0; l < n - 1; l++) for (let w = 0; w < S; w++) for (let w2 = 0; w2 < S; w2++) {
          if ((w ^ w2) === 0 || (w ^ w2) === (1 << l)) edges.push([lv(l, w), lv(l + 1, w2)]);
        }
        for (let t = 0; t < N; t++) { const id = nodes.length; nodes.push({ x: (t + 0.5) / N, y: 0.93, router: false, term: true, label: t }); edges.push([lv(0, t >> 1), id, 'term']); }
        return { nodes, edges, indirect: true, bis: N / 2 };
      }
    },
    butterfly: {
      name: 'Butterfly (2-ary n-fly)', sizes: [2, 3, 4, 5], def: 1, label: (n) => n + '단 (단말 ' + (1 << n) + ')',
      gen(n) {
        const N = 1 << n, S = N / 2, nodes = [], edges = [];
        const sw = (s, i) => N + s * S + i;
        for (let t = 0; t < N; t++) nodes.push({ x: 0.04, y: (t + 0.5) / N, router: false, term: true, src: true, label: t });
        for (let s = 0; s < n; s++) for (let i = 0; i < S; i++) nodes.push({ x: 0.16 + (s / Math.max(1, n - 1)) * 0.68, y: (i + 0.5) / S, router: true, label: '' });
        for (let t = 0; t < N; t++) nodes.push({ x: 0.96, y: (t + 0.5) / N, router: false, term: true, dst: true, label: t });
        const out0 = N + n * S;
        for (let t = 0; t < N; t++) edges.push([t, sw(0, t >> 1), 'term']);
        for (let s = 0; s < n - 1; s++) for (let i = 0; i < S; i++) {
          const bit = 1 << (n - 2 - s);
          edges.push([sw(s, i), sw(s + 1, i)]);
          edges.push([sw(s, i), sw(s + 1, i ^ bit)]);
        }
        for (let i = 0; i < S; i++) { edges.push([sw(n - 1, i), out0 + 2 * i, 'term']); edges.push([sw(n - 1, i), out0 + 2 * i + 1, 'term']); }
        return { nodes, edges, indirect: true, directed: true, bis: N / 2 };
      }
    }
  };

  function analyse(g) {
    const n = g.nodes.length;
    const adj = Array.from({ length: n }, () => []);
    g.edges.forEach(([a, b]) => { adj[a].push(b); if (!g.directed) adj[b].push(a); });
    const isTerm = (i) => (g.indirect ? !!g.nodes[i].term : true);
    let srcs = [], dsts = [];
    g.nodes.forEach((nd, i) => {
      if (!isTerm(i)) return;
      if (g.directed) { if (nd.src) srcs.push(i); if (nd.dst) dsts.push(i); }
      else { srcs.push(i); dsts.push(i); }
    });
    const bfs = (s) => {
      const d = new Array(n).fill(-1); d[s] = 0; const q = [s];
      while (q.length) { const u = q.shift(); for (const v of adj[u]) if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } }
      return d;
    };
    const adjust = g.indirect ? 2 : 0; // remove terminal links
    let sum = 0, cnt = 0, diam = 0;
    srcs.forEach((s) => {
      const d = bfs(s);
      dsts.forEach((t) => { if (t === s || d[t] < 0) return; const h = d[t] - adjust; sum += h; cnt++; diam = Math.max(diam, h); });
    });
    let rtrs = 0, links = 0, maxDeg = 0;
    const deg = new Array(n).fill(0);
    g.edges.forEach(([a, b, c]) => { deg[a]++; deg[b]++; if (c !== 'term') links++; });
    g.nodes.forEach((nd, i) => { if (nd.router) { rtrs++; maxDeg = Math.max(maxDeg, deg[i] + (g.indirect ? 0 : 1)); } });
    let bis = g.bis, cut = null;
    if (bis == null && g.side) {
      cut = new Set();
      g.edges.forEach((e, ei) => { const sa = g.side(e[0]), sb = g.side(e[1]); if (sa != null && sb != null && sa !== sb) cut.add(ei); });
      bis = cut.size;
    }
    return { adj, bfs, avg: cnt ? sum / cnt : 0, diam, rtrs, terms: g.directed ? srcs.length : srcs.length, links, maxDeg, bis, cut, adjust, srcs, dsts };
  }

  /* ======================================================
     2.1 Topology explorer
     ====================================================== */
  (function () {
    const W = NB.widget('w-topo'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let type = 'mesh', sizeIdx = TOPO.mesh.def, showCut = false, sel = null, hover = null;
    const typeSel = NB.select(ctr, { label: '토폴로지', value: type, options: Object.keys(TOPO).map((k) => ({ value: k, label: TOPO[k].name })), onChange: (v) => { type = v; sizeIdx = TOPO[v].def; sizeS.input.max = TOPO[v].sizes.length - 1; sizeS.set(sizeIdx); sel = null; build(); } });
    const sizeS = NB.slider(ctr, { label: '규모', min: 0, max: TOPO.mesh.sizes.length - 1, value: sizeIdx, fmt: (i) => TOPO[type].label(TOPO[type].sizes[i]), onInput: (i) => { sizeIdx = i; sel = null; build(); } });
    NB.checkbox(ctr, { label: '이분 절단(bisection) 표시', value: false, onChange: (v) => { showCut = v; draw(); } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', alignItems: 'start' } });
    W.body.append(lay);
    const cvBox = el('div'); lay.append(cvBox);
    const side = el('div'); lay.append(side);
    const cv = NB.canvas(cvBox, { height: (w) => Math.min(520, w * 0.85) });
    const st = NB.stats(side, [
      { key: 'n', label: '단말(코어) 수' }, { key: 'r', label: '라우터 수' }, { key: 'l', label: '링크 수 (라우터 간)' },
      { key: 'deg', label: '최대 라우터 차수' }, { key: 'diam', label: '직경 (홉)' }, { key: 'avg', label: '평균 홉 수' },
      { key: 'bis', label: '이분 링크 수' }, { key: 'thr', label: '균등 트래픽 처리량 상한' }
    ]);
    const info = el('p', { class: 'hint', style: { marginTop: '12px' } }, '노드를 클릭하면 해당 노드에서의 홉 거리가 색으로 표시됩니다.');
    side.append(info);
    let G, A, dist = null;
    function build() {
      const T = TOPO[type];
      G = T.gen(T.sizes[sizeIdx]);
      A = analyse(G);
      dist = sel != null ? A.bfs(sel) : null;
      st.n.set(A.terms); st.r.set(A.rtrs); st.l.set(A.links); st.deg.set(A.maxDeg);
      st.diam.set(A.diam); st.avg.set(A.avg.toFixed(2));
      st.bis.set(A.bis != null ? A.bis : '—');
      st.thr.set(A.bis != null ? Math.min(1, (4 * A.bis) / A.terms).toFixed(3) : '—', 'flit/node/cyc');
      draw();
    }
    function P(n) { const { w, h } = cv; const s = Math.min(w, h) - 30; return [(w - s) / 2 + n.x * s, (h - s) / 2 + n.y * s]; }
    function draw() {
      if (!G) return;
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const link = NB.css('--link'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), mute = NB.css('--text-mute'), danger = NB.css('--danger'), accent = NB.css('--accent');
      const maxD = dist ? Math.max(1, ...A.dsts.map((t) => dist[t] - (G.indirect ? 0 : 0))) : 1;
      const s = Math.min(w, h) - 30;
      const nr = Math.max(4, Math.min(16, s / Math.sqrt(G.nodes.length) * 0.22));
      // edges
      G.edges.forEach((e, ei) => {
        const [a, b, kind] = e;
        const pa = P(G.nodes[a]), pb = P(G.nodes[b]);
        const isCut = showCut && A.cut && A.cut.has(ei);
        ctx.strokeStyle = isCut ? danger : link;
        ctx.lineWidth = isCut ? 3 : kind === 'term' ? 1 : 1.8;
        ctx.beginPath();
        if (kind === 'wrapx' || kind === 'wrapy') {
          const off = 0.07 * s;
          if (kind === 'wrapx') { ctx.moveTo(pa[0], pa[1]); ctx.bezierCurveTo(pa[0] + off, pa[1] - off * 0.6, pb[0] - off, pb[1] - off * 0.6, pb[0], pb[1]); }
          else { ctx.moveTo(pa[0], pa[1]); ctx.bezierCurveTo(pa[0] + off * 0.6, pa[1] + off, pb[0] + off * 0.6, pb[1] - off, pb[0], pb[1]); }
        } else if (kind === 'arc') {
          const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy);
          const bend = 0.18 * L;
          ctx.moveTo(pa[0], pa[1]); ctx.quadraticCurveTo(mx - (dy / L) * bend, my + (dx / L) * bend, pb[0], pb[1]);
        } else { ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); }
        ctx.stroke();
      });
      if (showCut && G.cutLine) {
        ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = danger; ctx.lineWidth = 1.5;
        const p0 = P({ x: G.cutLine[0][0], y: G.cutLine[0][1] }), p1 = P({ x: G.cutLine[1][0], y: G.cutLine[1][1] });
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1] - 10); ctx.lineTo(p1[0], p1[1] + 10); ctx.stroke(); ctx.restore();
      }
      // nodes
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      G.nodes.forEach((n, i) => {
        const [x, y] = P(n);
        let fill = node;
        if (dist && dist[i] >= 0) {
          const hop = Math.max(0, dist[i] - (G.indirect && n.term ? G.indirect ? 2 : 0 : 0));
          fill = i === sel ? accent : NB.heat(hop / Math.max(1, A.diam + (G.indirect ? 0 : 0)) * 0.95 + 0.05);
        }
        if (showCut && G.side && !dist) { const sd = G.side(i); if (sd != null) fill = NB.alpha(sd ? NB.css('--c3') : NB.css('--c1'), 0.25); }
        ctx.fillStyle = fill; ctx.strokeStyle = i === hover ? accent : stroke; ctx.lineWidth = i === hover ? 2.5 : 1.3;
        if (n.router) { NB.roundRect(ctx, x - nr, y - nr, nr * 2, nr * 2, nr * 0.35); }
        else { ctx.beginPath(); ctx.arc(x, y, nr * 0.55, 0, 7); }
        ctx.fill(); ctx.stroke();
        if (dist && dist[i] >= 0 && nr >= 8 && (n.router ? !G.indirect : true)) {
          ctx.fillStyle = i === sel ? '#fff' : NB.isDark() ? '#111' : '#fff';
          ctx.font = 'bold ' + Math.round(nr * (n.router ? 0.9 : 0.8)) + 'px ' + NB.css('--mono');
          const hop = dist[i] - (G.indirect ? 2 : 0);
          if (!(G.indirect && !n.term)) ctx.fillText(i === sel ? '●' : hop, x, y + 0.5);
        } else if (!dist && nr >= 11 && type === 'hypercube') {
          ctx.fillStyle = mute; ctx.font = Math.round(nr * 0.5) + 'px ' + NB.css('--mono'); ctx.fillText(n.label, x, y);
        }
      });
      if (!dist) { ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.fillText(G.indirect ? '단말(○)을 클릭하세요' : '노드를 클릭하세요', 8, 14); }
    }
    function pick(e) {
      const p = cv.pos(e);
      let best = -1, bd = 1e9;
      G.nodes.forEach((n, i) => { const [x, y] = P(n); const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = i; } });
      return bd < 26 ? best : -1;
    }
    cv.canvas.addEventListener('click', (e) => {
      const i = pick(e);
      if (i < 0) { sel = null; dist = null; draw(); return; }
      const n = G.nodes[i];
      if (G.indirect && !n.term) return;
      if (G.directed && !n.src) return;
      sel = i; dist = A.bfs(i);
      const hops = A.dsts.filter((t) => t !== i).map((t) => dist[t] - A.adjust);
      const hist = {};
      hops.forEach((x) => { hist[x] = (hist[x] || 0) + 1; });
      info.innerHTML = '<b>선택한 노드에서의 홉 분포</b><br>' + Object.keys(hist).sort((a, b) => a - b).map((k) => '<span class="mono">' + k + '홉: ' + hist[k] + '개</span>').join(' · ') +
        '<br>평균 ' + (hops.reduce((a, b) => a + b, 0) / Math.max(1, hops.length)).toFixed(2) + '홉';
      draw();
    });
    cv.canvas.addEventListener('pointermove', (e) => {
      const i = pick(e);
      if (i !== hover) { hover = i; draw(); }
      if (i >= 0 && dist && dist[i] >= 0) NB.tip.show((G.nodes[i].router ? '라우터' : '단말') + ' · 홉 ' + Math.max(0, dist[i] - (G.indirect && G.nodes[i].term ? 2 : G.indirect ? 1 : 0)), e.clientX, e.clientY);
      else NB.tip.hide();
    });
    cv.canvas.addEventListener('pointerleave', () => { hover = null; NB.tip.hide(); draw(); });
    cv.canvas.style.cursor = 'pointer';
    cv.draw = draw;
    build();
  })();

  /* ======================================================
     2.2 Folded torus
     ====================================================== */
  (function () {
    const W = NB.widget('w-fold'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let k = 8, t = 0, anim = null;
    NB.slider(ctr, { label: '노드 수 k', min: 4, max: 12, value: k, onInput: (v) => { k = v; draw(); } });
    const tS = NB.slider(ctr, { label: '접기 정도', min: 0, max: 100, value: 0, fmt: (v) => v + '%', onInput: (v) => { t = v / 100; draw(); } });
    NB.button(ctr, '▶ 접기 애니메이션', () => {
      const from = t, to = t > 0.5 ? 0 : 1, t0 = performance.now();
      cancelAnimationFrame(anim);
      const f = (now) => { const u = Math.min(1, (now - t0) / 1400); const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; t = from + (to - from) * e; tS.set(Math.round(t * 100)); draw(); if (u < 1) anim = requestAnimationFrame(f); };
      anim = requestAnimationFrame(f);
    }, 'primary');
    const cv = NB.canvas(W.body, { height: 230 });
    const st = NB.stats(W.body, [{ key: 'max', label: '최장 링크 (타일)' }, { key: 'avg', label: '평균 링크 길이 (타일)' }, { key: 'order', label: '물리적 배치 순서' }]);
    function foldedPos(i) { // folded slot index
      return i < Math.ceil(k / 2) ? 2 * i : 2 * (k - 1 - i) + 1;
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pal = NB.palette(), link = NB.css('--link'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), mute = NB.css('--text-mute'), text = NB.css('--text');
      const pad = 40, cs = (w - 2 * pad) / k, y0 = 110;
      const X = (i) => pad + (NB.lerp(i, foldedPos(i), t) + 0.5) * cs;
      // links i -> i+1 (mod k)
      let maxL = 0, sumL = 0;
      for (let i = 0; i < k; i++) {
        const j = (i + 1) % k;
        const xa = X(i), xb = X(j);
        const len = Math.abs(xb - xa) / cs;
        maxL = Math.max(maxL, len); sumL += len;
        const hgt = 14 + len * 9;
        const up = i % 2 === 0;
        const col = j === 0 ? NB.css('--c3') : pal[0];
        ctx.strokeStyle = col; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(xa, y0); ctx.bezierCurveTo(xa, y0 + (up ? -hgt : hgt), xb, y0 + (up ? -hgt : hgt), xb, y0); ctx.stroke();
      }
      for (let i = 0; i < k; i++) {
        const x = X(i);
        ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
        NB.roundRect(ctx, x - 15, y0 - 15, 30, 30, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.font = 'bold 13px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(i, x, y0);
      }
      // tile grid
      ctx.strokeStyle = NB.css('--grid'); ctx.lineWidth = 1;
      for (let s = 0; s <= k; s++) { const x = pad + s * cs; ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x, 214); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(pad, 207); ctx.lineTo(w - pad, 207); ctx.stroke();
      ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'left';
      ctx.fillText('칩 위의 물리적 타일 위치 →', pad, 225);
      ctx.fillStyle = NB.css('--c3'); ctx.fillText('주황: 랩어라운드 링크 (k−1 → 0)', pad, 18);
      st.max.set(maxL.toFixed(1), '', maxL > 2.01 ? 'bad' : 'good');
      st.avg.set((sumL / k).toFixed(2));
      const order = new Array(k); for (let i = 0; i < k; i++) order[t > 0.5 ? foldedPos(i) : i] = i;
      st.order.set('<span style="font-size:14px">' + order.join(' ') + '</span>');
    }
    cv.draw = draw;
  })();

  /* ======================================================
     2.3 Scaling comparison
     ====================================================== */
  (function () {
    const W = NB.widget('w-scale'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let metric = 'avg';
    NB.seg(ctr, { label: '지표', value: metric, options: [{ value: 'avg', label: '평균 홉' }, { value: 'diam', label: '직경' }, { value: 'bisn', label: '처리량 상한' }, { value: 'radix', label: '라우터 차수' }, { value: 'links', label: '링크 수' }], onChange: (v) => { metric = v; upd(); } });
    const box = el('div'); W.body.append(box);
    const chart = NB.chart(box, { height: 300, logX: true, xLabel: '노드 수 N', yLabel: '' });
    const Ns = [4, 16, 64, 256, 1024];
    const line1 = (k) => { let s = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) s += Math.abs(a - b); return s / (k * k); };
    const ring1 = (k) => { let s = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const d = Math.abs(a - b); s += Math.min(d, k - d); } return s / (k * k); };
    const T = {
      ring: { name: 'Ring', color: '--c3', f: (N) => ({ avg: ring1(N) * N / (N - 1), diam: Math.floor(N / 2), bis: 2, radix: 3, links: N }) },
      mesh: { name: '2D Mesh', color: '--c1', f: (N) => { const k = Math.sqrt(N); return { avg: 2 * line1(k) * N / (N - 1), diam: 2 * (k - 1), bis: k, radix: 5, links: 2 * k * (k - 1) }; } },
      torus: { name: '2D Torus', color: '--c2', f: (N) => { const k = Math.sqrt(N); return { avg: 2 * ring1(k) * N / (N - 1), diam: 2 * Math.floor(k / 2), bis: k > 2 ? 2 * k : k, radix: 5, links: k > 2 ? 2 * N : 2 * k * (k - 1) }; } },
      hyper: { name: 'Hypercube', color: '--c4', f: (N) => { const n = Math.log2(N); return { avg: (n / 2) * N / (N - 1), diam: n, bis: N / 2, radix: n + 1, links: (n * N) / 2 }; } },
      fbfly: { name: 'Flattened Butterfly', color: '--c5', f: (N) => { const k = Math.sqrt(N); return { avg: (2 * (k - 1) / k) * N / (N - 1), diam: 2, bis: (k * k * k) / 4, radix: 2 * (k - 1) + 1, links: k * k * (k - 1) }; } },
      fat: { name: 'Fat-tree', color: '--c6', f: (N) => { const n = Math.log2(N); let s = 0; for (let l = 1; l <= n; l++) s += Math.pow(2, l - 1) * (2 * l - 2); return { avg: s / (N - 1), diam: 2 * (n - 1), bis: N / 2, radix: 4, links: (n - 1) * N }; } }
    };
    function upd() {
      const lab = { avg: '평균 홉 수', diam: '직경 (홉)', bisn: '노드당 처리량 상한 (flit/cyc)', radix: '라우터 차수 (포트)', links: '라우터 간 링크 수' }[metric];
      chart.set({
        yLabel: lab + ' (로그)', logY: true, yMin: metric === 'bisn' ? 0.005 : 0.8, yMax: metric === 'bisn' ? 1.5 : undefined,
        xFmt: (x) => 'N=' + x,
        series: Object.values(T).map((t) => ({
          name: t.name, color: NB.css(t.color), marker: true,
          points: Ns.map((N) => { const r = t.f(N); const v = metric === 'bisn' ? Math.min(1, (4 * r.bis) / N) : r[metric]; return [N, v]; })
        }))
      });
    }
    upd();
    NB.onTheme(upd);
  })();
});
