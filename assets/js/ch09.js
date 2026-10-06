/* Chapter 9 — Advanced topics */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const DX = [0, 0, 1, 0, -1], DY = [0, -1, 0, 1, 0], OPP = [0, 3, 4, 1, 2];

  /* ---------------- BLESS deflection model ---------------- */
  function Bless(k, rate, seed) {
    const n = k * k, rnd = NB.rng(seed || 1);
    const B = { k, n, rate, t: 0, arriving: Array.from({ length: n }, () => []), q: Array.from({ length: n }, () => []), moves: [], st: { del: 0, lat: 0, defl: 0, hops: 0, mDel: 0, mLat: 0, mDefl: 0 }, measure: [0, Infinity], hist: [] };
    const nb = (r, p) => { const x = (r % k) + DX[p], y = ((r / k) | 0) + DY[p]; return x < 0 || y < 0 || x >= k || y >= k ? -1 : y * k + x; };
    B.nb = nb;
    B.step = function () {
      const t = B.t, next = Array.from({ length: n }, () => []);
      B.moves = [];
      let ejCycle = 0, deflCycle = 0;
      const inM = t >= B.measure[0] && t < B.measure[1];
      for (let r = 0; r < n; r++) {
        if (rnd() < B.rate) { let d; do { d = (rnd() * n) | 0; } while (d === r); B.q[r].push({ src: r, dst: d, t0: t, defl: 0, hops: 0, m: inM }); }
        const fl = B.arriving[r];
        fl.sort((a, b) => a.t0 - b.t0);
        const used = [false, false, false, false, false];
        // ejection (one per cycle, oldest first)
        const ei = fl.findIndex((f) => f.dst === r);
        if (ei >= 0) {
          const f = fl.splice(ei, 1)[0];
          B.st.del++; B.st.lat += t - f.t0; B.st.defl += f.defl; B.st.hops += f.hops;
          if (f.m) { B.st.mDel++; B.st.mLat += t - f.t0; B.st.mDefl += f.defl; }
          ejCycle++;
          B.moves.push({ r, p: 0, f });
        }
        const ports = [1, 2, 3, 4].filter((p) => nb(r, p) >= 0);
        // injection if a free output remains for it
        if (B.q[r].length && fl.length < ports.length) fl.push(B.q[r].shift());
        fl.sort((a, b) => a.t0 - b.t0);
        for (const f of fl) {
          const x = r % k, y = (r / k) | 0, dx = (f.dst % k) - x, dy = ((f.dst / k) | 0) - y;
          const prod = [];
          if (dx > 0) prod.push(2); if (dx < 0) prod.push(4); if (dy > 0) prod.push(3); if (dy < 0) prod.push(1);
          if (prod.length === 2 && rnd() < 0.5) prod.reverse();
          let p = prod.find((pp) => !used[pp] && nb(r, pp) >= 0);
          let defl = false;
          if (p == null) {
            const free = ports.filter((pp) => !used[pp]);
            p = free[(rnd() * free.length) | 0];
            defl = true;
          }
          if (p == null) { next[r].push(f); continue; } // should not happen
          used[p] = true;
          if (defl) { f.defl++; deflCycle++; }
          f.hops++;
          next[nb(r, p)].push(f);
          B.moves.push({ r, p, f, defl });
        }
      }
      B.arriving = next;
      B.t++;
      B.hist.push([ejCycle, deflCycle]);
      if (B.hist.length > 300) B.hist.shift();
    };
    return B;
  }
  function blessPoint(k, rate) {
    const B = Bless(k, rate, 7);
    B.measure = [500, 2000];
    for (let i = 0; i < 2000; i++) B.step();
    let guard = 0;
    while (guard++ < 3000) { let left = 0; B.arriving.forEach((a) => a.forEach((f) => { if (f.m) left++; })); B.q.forEach((q) => q.forEach((f) => { if (f.m) left++; })); if (!left) break; B.rate = 0; B.step(); }
    const lat = B.st.mDel ? B.st.mLat / B.st.mDel : null;
    const queued = B.q.reduce((a, q) => a + q.length, 0);
    return { rate, latency: lat, defl: B.st.mDel ? B.st.mDefl / B.st.mDel : 0, saturated: guard >= 3000 || (lat != null && lat > 300) || queued > B.n * 20 };
  }

  (function () {
    const W = NB.widget('w-bless'); if (!W) return;
    const P = { k: 8, rate: 0.15, speed: 8 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '주입률 (flit/node/cyc)', min: 0.02, max: 0.6, step: 0.01, value: P.rate, fmt: (v) => v.toFixed(2), onInput: (v) => { P.rate = v; B.rate = v; } });
    NB.slider(ctr, { label: '속도', min: 1, max: 60, value: P.speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { P.speed = v; } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    NB.button(br, '↺ 리셋', () => { B = Bless(P.k, P.rate, 2); });
    const cmpB = NB.button(br, '📈 버퍼 라우터와 비교 곡선', () => compare(), 'primary');
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const cv = NB.canvas(left, { height: (w) => Math.min(460, w) });
    const st = NB.stats(right, [{ key: 'lat', label: '평균 지연' }, { key: 'defl', label: '플릿당 디플렉션' }, { key: 'thr', label: '수신 처리량' }, { key: 'q', label: '주입 대기' }]);
    const cbox = el('div', { style: { marginTop: '10px' } }); right.append(cbox);
    const chart = NB.chart(cbox, { height: 220, xLabel: '주입률', yLabel: '평균 지연 (사이클)', xMin: 0, yMin: 0, xFmt: (x) => x.toFixed(2) });
    const prog = el('div', { class: 'hint' }); right.append(prog);
    let B = Bless(P.k, P.rate, 2), acc = 0;
    function compare() {
      cmpB.disabled = true;
      const rates = []; for (let r = 0.04; r <= 0.6; r += 0.04) rates.push(+r.toFixed(2));
      const sB = { name: 'Bufferless (BLESS)', color: NB.css('--c3'), marker: true, points: [] };
      const sV = { name: '버퍼 VC 라우터', color: NB.css('--c1'), marker: true, points: [] };
      let i = 0, doneB = false, doneV = false;
      const tick = () => {
        if (i >= rates.length || (doneB && doneV)) { prog.textContent = '완료 ✓'; cmpB.disabled = false; return; }
        const r = rates[i++];
        prog.textContent = '측정 중… 주입률 ' + r.toFixed(2);
        if (!doneB) { const a = blessPoint(P.k, r); if (a.saturated) doneB = true; else sB.points.push([r, a.latency]); }
        if (!doneV) { const b = NB.noc.runPoint({ kx: P.k, ky: P.k, vcs: 2, depth: 4, pktLen: 1, rate: r, routing: 'xy', routerDelay: 1, seed: 2 }, { warmup: 500, measure: 1500 }); if (b.saturated) doneV = true; else sV.points.push([r, b.latency]); }
        chart.set({ series: [sB, sV] });
        setTimeout(tick, 0);
      };
      tick();
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const k = P.k, s = Math.min(w, h) - 30, cs = s / k, ox = (w - s) / 2, oy = (h - s) / 2;
      const X = (r) => ox + ((r % k) + 0.5) * cs, Y = (r) => oy + (((r / k) | 0) + 0.5) * cs;
      const link = NB.css('--link'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), dng = NB.css('--danger'), acc1 = NB.css('--c1'), c2 = NB.css('--c2');
      ctx.strokeStyle = link; ctx.lineWidth = 2;
      for (let r = 0; r < k * k; r++) {
        if (r % k < k - 1) { ctx.beginPath(); ctx.moveTo(X(r), Y(r)); ctx.lineTo(X(r + 1), Y(r)); ctx.stroke(); }
        if (r < k * (k - 1)) { ctx.beginPath(); ctx.moveTo(X(r), Y(r)); ctx.lineTo(X(r), Y(r + k)); ctx.stroke(); }
      }
      const b = cs * 0.3;
      for (let r = 0; r < k * k; r++) {
        ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
        NB.roundRect(ctx, X(r) - b / 2, Y(r) - b / 2, b, b, 4); ctx.fill(); ctx.stroke();
        const q = B.q[r].length;
        if (q) { ctx.fillStyle = q > 4 ? dng : acc1; ctx.fillRect(X(r) + b / 2 + 1, Y(r) + b / 2 - Math.min(cs * 0.3, q * 2), 3, Math.min(cs * 0.3, q * 2)); }
      }
      const f = NB.clamp(acc, 0, 1);
      for (const m of B.moves) {
        if (m.p === 0) { if (f < 0.5) { ctx.fillStyle = c2; ctx.globalAlpha = 1 - f * 2; ctx.beginPath(); ctx.arc(X(m.r), Y(m.r), cs * 0.12, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } continue; }
        const nr = B.nb(m.r, m.p);
        const px = NB.lerp(X(m.r), X(nr), f), py = NB.lerp(Y(m.r), Y(nr), f);
        ctx.fillStyle = m.defl ? dng : acc1;
        ctx.beginPath(); ctx.arc(px, py, Math.max(2.5, cs * 0.08), 0, 7); ctx.fill();
      }
    }
    cv.draw = draw;
    let fr = 0;
    NB.loop(cv.canvas, (dt) => {
      acc += dt * P.speed;
      let n = 0;
      while (acc >= 1 && n++ < 30) { acc -= 1; B.step(); }
      if (acc > 1) acc = 0.99;
      draw();
      if (++fr % 10 === 0) {
        const hh = B.hist, ej = hh.reduce((a, x) => a + x[0], 0), df = hh.reduce((a, x) => a + x[1], 0);
        st.lat.set(B.st.del ? (B.st.lat / B.st.del).toFixed(1) : '—', 'cyc');
        st.defl.set(ej ? (df / ej).toFixed(2) : '—', '', ej && df / ej > 1 ? 'bad' : '');
        st.thr.set(hh.length ? (ej / hh.length / B.n).toFixed(3) : '—');
        const q = B.q.reduce((a, x) => a + x.length, 0);
        st.q.set(q, '', q > B.n * 2 ? 'bad' : '');
      }
    });
  })();

  /* ---------------- energy model ---------------- */
  (function () {
    const W = NB.widget('w-energy'); if (!W) return;
    const P = { k: 8, er: 10, ew: 3, tile: 1.5, L: 4 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '메시 크기 k', min: 4, max: 16, step: 2, value: P.k, fmt: (v) => v + '×' + v, onInput: (v) => { P.k = v; upd(); } });
    NB.slider(ctr, { label: '5포트 라우터 에너지', min: 2, max: 30, value: P.er, fmt: (v) => v + ' pJ/flit', onInput: (v) => { P.er = v; upd(); } });
    NB.slider(ctr, { label: '전선 에너지', min: 0.5, max: 10, step: 0.5, value: P.ew, fmt: (v) => v + ' pJ/flit/mm', onInput: (v) => { P.ew = v; upd(); } });
    NB.slider(ctr, { label: '타일 크기', min: 0.5, max: 4, step: 0.25, value: P.tile, fmt: (v) => v + ' mm', onInput: (v) => { P.tile = v; upd(); } });
    const out = el('div'); W.body.append(out);
    const line1 = (k) => (k * k - 1) / (3 * k);
    const ring1 = (k) => { let s = 0; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const d = Math.abs(a - b); s += Math.min(d, k - d); } return s / (k * k); };
    const scaleR = (p) => 0.6 + 0.4 * Math.pow(p / 5, 2);
    function upd() {
      const k = P.k, N = k * k, corr = N / (N - 1);
      const manh = 2 * line1(k) * corr; // tiles travelled
      const topo = [
        { n: '2D Mesh', H: manh, p: 5, wire: manh },
        { n: 'Folded Torus', H: 2 * ring1(k) * corr, p: 5, wire: 2 * 2 * ring1(k) * corr },
        { n: 'Concentrated Mesh (c=4)', H: 2 * line1(k / 2) * corr, p: 8, wire: 2 * 2 * line1(k / 2) * corr + 0.5 },
        { n: 'Flattened Butterfly', H: 2 * (k - 1) / k * corr, p: 2 * (k - 1) + 1, wire: manh }
      ];
      const rows = topo.map((t) => { const er = (t.H + 1) * P.er * scaleR(t.p), ew = t.wire * P.tile * P.ew; return Object.assign(t, { er, ew, tot: er + ew }); });
      const mx = Math.max(...rows.map((r) => r.tot));
      out.innerHTML = '';
      rows.forEach((r) => {
        const row = el('div', { style: { margin: '10px 0' } });
        row.append(el('div', { class: 'small', style: { display: 'flex', justifyContent: 'space-between', marginBottom: '3px' } }, el('b', null, r.n), el('span', { class: 'mono muted' }, 'H=' + r.H.toFixed(2) + ' · 포트 ' + r.p + ' · ' + r.tot.toFixed(0) + ' pJ/flit')));
        const bar = el('div', { style: { display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface-2)' } });
        bar.append(el('div', { title: '라우터 ' + r.er.toFixed(1) + ' pJ', style: { width: (100 * r.er / mx) + '%', background: 'var(--c1)', transition: 'width .3s' } }));
        bar.append(el('div', { title: '링크 ' + r.ew.toFixed(1) + ' pJ', style: { width: (100 * r.ew / mx) + '%', background: 'var(--c2)', transition: 'width .3s' } }));
        row.append(bar);
        out.append(row);
      });
      out.append(el('div', { class: 'legend' }, el('span', null, el('i', { style: { background: 'var(--c1)' } }), '라우터 통과 에너지'), el('span', null, el('i', { style: { background: 'var(--c2)' } }), '링크(전선) 에너지')));
    }
    upd();
  })();

  /* ---------------- 3D mesh ---------------- */
  (function () {
    const W = NB.widget('w-3d'); if (!W) return;
    const CFG = { 1: [8, 8, 1], 2: [8, 4, 2], 4: [4, 4, 4] };
    let layers = 4, yaw = 0.7, pitch = 0.5, auto = true, anim = null;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '64개 노드를 몇 층으로?', value: layers, options: [{ value: 1, label: '1층 (8×8)' }, { value: 2, label: '2층 (8×4×2)' }, { value: 4, label: '4층 (4×4×4)' }], onChange: (v) => { layers = v; anim = null; upd(); } });
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    NB.button(br, '▶ 패킷 보내기 (XYZ)', () => { anim = { t: 0 }; }, 'primary');
    NB.checkbox(br, { label: '자동 회전', value: true, onChange: (v) => { auto = v; } });
    const cv = NB.canvas(W.body, { height: (w) => Math.min(460, w * 0.7) });
    const st = NB.stats(W.body, [{ key: 'dims', label: '차원' }, { key: 'h', label: '평균 홉 수' }, { key: 'd', label: '직경' }, { key: 'v', label: '수직 링크(TSV) 수' }]);
    const line1 = (k) => (k * k - 1) / (3 * k);
    function upd() {
      const [a, b, c] = CFG[layers], N = a * b * c;
      st.dims.set(a + '×' + b + '×' + c);
      st.h.set(((line1(a) + line1(b) + line1(c)) * N / (N - 1)).toFixed(2));
      st.d.set((a - 1) + (b - 1) + (c - 1));
      st.v.set(a * b * (c - 1));
    }
    function path() {
      const [a, b, c] = CFG[layers];
      const p = [[0, 0, 0]];
      let [x, y, z] = [0, 0, 0];
      while (x < a - 1) p.push([++x, y, z]);
      while (y < b - 1) p.push([x, ++y, z]);
      while (z < c - 1) p.push([x, y, ++z]);
      return p;
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const [a, b, c] = CFG[layers];
      const zs = 1.0; // layer spacing
      const cx = (a - 1) / 2, cy = (b - 1) / 2, cz = ((c - 1) * zs) / 2;
      const scale = Math.min(w / (Math.max(a, b) * 1.55), h / (Math.max(a, b) * 0.9 + c * zs * 0.9 + 1));
      const proj = (x, y, z) => {
        // world: x right, y depth, z up
        let X = x - cx, Y = y - cy, Z = z * zs - cz;
        const cosy = Math.cos(yaw), siny = Math.sin(yaw);
        const x1 = X * cosy - Y * siny, y1 = X * siny + Y * cosy;
        const cosp = Math.cos(pitch), sinp = Math.sin(pitch);
        const y2 = y1 * cosp - Z * sinp, z2 = y1 * sinp + Z * cosp;
        const persp = 1 / (1 + y2 * 0.04);
        return [w / 2 + x1 * scale * persp, h / 2 - z2 * scale * persp, y2];
      };
      const link = NB.css('--link'), tsv = NB.css('--c4'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), pk = NB.css('--c3');
      const segs = [];
      for (let z = 0; z < c; z++) for (let y = 0; y < b; y++) for (let x = 0; x < a; x++) {
        if (x < a - 1) segs.push([[x, y, z], [x + 1, y, z], 0]);
        if (y < b - 1) segs.push([[x, y, z], [x, y + 1, z], 0]);
        if (z < c - 1) segs.push([[x, y, z], [x, y, z + 1], 1]);
      }
      // translucent layer planes
      for (let z = 0; z < c; z++) {
        const q = [proj(-0.4, -0.4, z), proj(a - 0.6, -0.4, z), proj(a - 0.6, b - 0.6, z), proj(-0.4, b - 0.6, z)];
        ctx.fillStyle = NB.alpha(NB.css('--c1'), 0.06); ctx.strokeStyle = NB.alpha(NB.css('--c1'), 0.25); ctx.lineWidth = 1;
        ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      const P2 = segs.map(([p, q, v]) => { const A = proj(...p), Bp = proj(...q); return { A, B: Bp, v, d: (A[2] + Bp[2]) / 2 }; });
      P2.sort((u, v) => v.d - u.d);
      P2.forEach((s) => { ctx.strokeStyle = s.v ? tsv : link; ctx.lineWidth = s.v ? 2.2 : 1.4; ctx.globalAlpha = 0.5 + 0.5 * NB.clamp(1 - (s.d + 4) / 10, 0, 1); ctx.beginPath(); ctx.moveTo(s.A[0], s.A[1]); ctx.lineTo(s.B[0], s.B[1]); ctx.stroke(); });
      ctx.globalAlpha = 1;
      const nodes = [];
      for (let z = 0; z < c; z++) for (let y = 0; y < b; y++) for (let x = 0; x < a; x++) nodes.push(proj(x, y, z));
      nodes.sort((u, v) => v[2] - u[2]);
      nodes.forEach((p) => { ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; const r = Math.max(3, scale * 0.13 / (1 + p[2] * 0.04)); ctx.beginPath(); ctx.rect(p[0] - r, p[1] - r, 2 * r, 2 * r); ctx.fill(); ctx.stroke(); });
      if (anim) {
        const pth = path();
        const seg = Math.min(pth.length - 1, Math.floor(anim.t)), f = anim.t - seg;
        ctx.strokeStyle = pk; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= seg; i++) { const q = proj(...pth[i]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
        if (seg < pth.length - 1) { const A = proj(...pth[seg]), Bq = proj(...pth[seg + 1]); ctx.lineTo(NB.lerp(A[0], Bq[0], f), NB.lerp(A[1], Bq[1], f)); }
        ctx.stroke();
        const A = proj(...pth[seg]), Bq = seg < pth.length - 1 ? proj(...pth[seg + 1]) : A;
        ctx.fillStyle = pk; ctx.beginPath(); ctx.arc(NB.lerp(A[0], Bq[0], f), NB.lerp(A[1], Bq[1], f), 6, 0, 7); ctx.fill();
        ctx.fillStyle = NB.css('--text-mute'); ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('(0,0,0) → (' + (a - 1) + ',' + (b - 1) + ',' + (c - 1) + ') : ' + (pth.length - 1) + '홉', 8, 6);
      }
      ctx.fillStyle = tsv; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      if (c > 1) ctx.fillText('보라색 = 층간 수직 링크 (TSV)', w - 8, 6);
    }
    let drag = null;
    cv.canvas.style.cursor = 'grab';
    cv.canvas.style.touchAction = 'none';
    cv.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; cv.canvas.setPointerCapture(e.pointerId); });
    cv.canvas.addEventListener('pointermove', (e) => { if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * 0.01; pitch = NB.clamp(drag.pitch + (e.clientY - drag.y) * 0.01, -0.2, 1.4); draw(); });
    cv.canvas.addEventListener('pointerup', () => { drag = null; });
    cv.draw = draw;
    upd();
    NB.loop(cv.canvas, (dt) => {
      if (auto && !drag) yaw += dt * 0.25;
      if (anim) { anim.t += dt * 3; if (anim.t > path().length + 1.5) anim = null; }
      draw();
    });
  })();
});
