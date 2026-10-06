/* Chapter 3 — Routing */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const { Geo, ROUTING, N, E, S, W, L, DX, DY, OPP } = NB.noc;
  const DN = ['L', 'N', 'E', 'S', 'W'];
  const DKO = { 1: '북', 2: '동', 3: '남', 4: '서' };

  // turns: CW (right turns on screen) and CCW (left turns)
  const CW = [[E, S], [S, W], [W, N], [N, E]];
  const CCW = [[E, N], [N, W], [W, S], [S, E]];
  const PROHIBIT = {
    xy: [[N, E], [N, W], [S, E], [S, W]],
    yx: [[E, N], [E, S], [W, N], [W, S]],
    westfirst: [[N, W], [S, W]],
    northlast: [[N, E], [N, W]],
    negfirst: [[E, S], [N, W]],
    adaptive: []
  };
  const key = (a, b) => a + '-' + b;

  // SVG of the 8 turns as two abstract cycles
  function turnSVG(prohibited, opts) {
    opts = opts || {};
    const set = new Set(prohibited.map(([a, b]) => key(a, b)));
    const svg = NB.svgEl('svg', { viewBox: '0 0 230 120', width: opts.width || 230, style: 'max-width:100%;height:auto;display:block' });
    const draw = (ox, list, title) => {
      const t = NB.svgEl('text', { x: ox + 50, y: 114, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--text-mute)' }, svg); t.textContent = title;
      const a = 14, b = 86, m1 = 40, m2 = 60;
      // corner L-arrows: (from dir, to dir)
      const geo = {
        [key(E, S)]: [[ox + m1, a], [ox + b, a], [ox + b, m2]],
        [key(S, W)]: [[ox + b, m1], [ox + b, b], [ox + m2, b]],
        [key(W, N)]: [[ox + m2, b], [ox + a, b], [ox + a, m1]],
        [key(N, E)]: [[ox + a, m2], [ox + a, a], [ox + m1, a]],
        [key(E, N)]: [[ox + m1, b], [ox + b, b], [ox + b, m1]],
        [key(N, W)]: [[ox + b, m2], [ox + b, a], [ox + m2, a]],
        [key(W, S)]: [[ox + m2, a], [ox + a, a], [ox + a, m2]],
        [key(S, E)]: [[ox + a, m1], [ox + a, b], [ox + m1, b]]
      };
      list.forEach(([f, to]) => {
        const k = key(f, to), pts = geo[k], bad = set.has(k);
        const col = bad ? 'var(--danger)' : 'var(--accent-2)';
        const g = NB.svgEl('g', { style: opts.onToggle ? 'cursor:pointer' : '' }, svg);
        NB.svgEl('path', { d: 'M' + pts.map((p) => p.join(' ')).join(' L'), fill: 'none', stroke: 'transparent', 'stroke-width': 14 }, g);
        NB.svgEl('path', { d: 'M' + pts.map((p) => p.join(' ')).join(' L'), fill: 'none', stroke: col, 'stroke-width': 2.6, 'stroke-dasharray': bad ? '4 3' : null, 'stroke-linejoin': 'round' }, g);
        const [p1, p2] = [pts[1], pts[2]];
        const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
        const ah = (d) => [p2[0] - 7 * Math.cos(ang + d), p2[1] - 7 * Math.sin(ang + d)];
        NB.svgEl('path', { d: 'M' + p2.join(' ') + ' L' + ah(0.5).join(' ') + ' L' + ah(-0.5).join(' ') + 'Z', fill: col }, g);
        if (bad) {
          const cx = pts[1][0], cy = pts[1][1];
          const x = NB.svgEl('text', { x: cx, y: cy + 4.5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: 'var(--danger)' }, g); x.textContent = '✕';
        }
        if (opts.onToggle) g.addEventListener('click', () => opts.onToggle(f, to));
        const tt = NB.svgEl('title', null, g); tt.textContent = DKO[f] + '→' + DKO[to] + ' 회전' + (bad ? ' (금지)' : ' (허용)');
      });
    };
    draw(10, CW, '시계 방향 사이클');
    draw(125, CCW, '반시계 방향 사이클');
    return svg;
  }

  function fakeSim(k) { return { geo: new Geo(k, k, false), cfg: { dateline: false }, rand: Math.random }; }

  /* ======================================================
     3.1 Path explorer
     ====================================================== */
  (function () {
    const Wd = NB.widget('w-paths'); if (!Wd) return;
    const ctr = el('div', { class: 'controls' }); Wd.body.append(ctr);
    let k = 6, alg = 'xy', src = 6 * 4 + 1, dst = 6 * 1 + 4, clickNext = 0, valMid = 14;
    const algs = ['xy', 'yx', 'westfirst', 'northlast', 'negfirst', 'oddeven', 'adaptive', 'o1turn', 'valiant'];
    NB.select(ctr, { label: '라우팅 알고리즘', value: alg, options: algs.map((a) => ({ value: a, label: ROUTING[a].name })), onChange: (v) => { alg = v; calc(); } });
    NB.slider(ctr, { label: '메시 크기', min: 4, max: 8, value: k, fmt: (v) => v + '×' + v, onInput: (v) => { k = v; src = Math.min(src, k * k - 1); dst = Math.min(dst, k * k - 1); if (src === dst) dst = (src + 1) % (k * k); valMid = Math.floor(Math.random() * k * k); calc(); } });
    const bRow = el('div', { class: 'btn-row' }); ctr.append(bRow);
    NB.button(bRow, '🎲 무작위 쌍', () => { src = (Math.random() * k * k) | 0; do { dst = (Math.random() * k * k) | 0; } while (dst === src); valMid = (Math.random() * k * k) | 0; calc(); });
    NB.button(bRow, '▶ 패킷 보내기', () => sendPacket(), 'primary');
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' } });
    Wd.body.append(lay);
    const cvBox = el('div'); lay.append(cvBox);
    const side = el('div'); lay.append(side);
    const cv = NB.canvas(cvBox, { height: (w) => Math.min(520, w) });
    const st = NB.stats(side, [{ key: 'h', label: '최소 홉 수' }, { key: 'min', label: '최소 경로 총 개수' }, { key: 'used', label: '이 알고리즘의 허용 경로 수' }, { key: 'avg', label: '평균 경로 길이' }]);
    const turnBox = el('div', { style: { marginTop: '14px' } }); side.append(turnBox);
    const note = el('p', { class: 'hint', style: { marginTop: '8px' } }); side.append(note);
    let weights = null, sampleAnim = null, exPath = null;

    function trace(sim, s, d, pkt) {
      const path = [s]; let r = s, guard = 0;
      while (r !== d && guard++ < 200) { const p = ROUTING[alg].ports(sim, r, pkt)[0]; if (p === L) break; r = sim.geo.nb(r, p); path.push(r); }
      return path;
    }
    function calc() {
      const sim = fakeSim(k), g = sim.geo, R = ROUTING[alg];
      const n = g.n;
      weights = new Float64Array(n * 5);
      const [dx, dy] = g.off(src, dst);
      const H = Math.abs(dx) + Math.abs(dy);
      const binom = (a, b) => { let r = 1; for (let i = 1; i <= b; i++) r = (r * (a - b + i)) / i; return Math.round(r); };
      let used = 1, avgLen = H;
      const addPath = (path, w) => { for (let i = 0; i + 1 < path.length; i++) { const a = path[i], b = path[i + 1]; for (let p = 1; p <= 4; p++) if (g.nb(a, p) === b) weights[a * 5 + p] += w; } };
      exPath = null;
      if (alg === 'xy' || alg === 'yx') addPath(trace(sim, src, dst, { src, dst }), 1);
      else if (alg === 'o1turn') { addPath(trace(sim, src, dst, { src, dst, order: 0 }), 0.5); addPath(trace(sim, src, dst, { src, dst, order: 1 }), 0.5); used = dx && dy ? 2 : 1; }
      else if (alg === 'valiant') {
        let tot = 0;
        for (let m = 0; m < n; m++) { const pkt = { src, dst, mid: m, phase: 0 }; const p = trace(sim, src, dst, pkt); addPath(p, 1 / n); tot += p.length - 1; }
        avgLen = tot / n; used = NaN;
        exPath = trace(sim, src, dst, { src, dst, mid: valMid, phase: 0 });
      } else {
        const wt = new Float64Array(n), cnt = new Float64Array(n);
        wt[src] = 1; cnt[src] = 1;
        const order = []; for (let r = 0; r < n; r++) order.push(r);
        order.sort((a, b) => g.hops(b, dst) - g.hops(a, dst));
        for (const r of order) {
          if (!wt[r] || r === dst) continue;
          const ps = R.ports(sim, r, { src, dst }).filter((p) => p !== L);
          for (const p of ps) { const nb = g.nb(r, p); weights[r * 5 + p] += wt[r] / ps.length; wt[nb] += wt[r] / ps.length; cnt[nb] += cnt[r]; }
        }
        used = cnt[dst];
      }
      st.h.set(H); st.min.set(binom(H, Math.abs(dx)));
      st.used.set(isNaN(used) ? '≈ N·(…)' : used, '', used > 1 || isNaN(used) ? 'good' : '');
      st.avg.set(avgLen.toFixed(2), '홉', avgLen > H ? 'bad' : '');
      // turn panel
      turnBox.innerHTML = '';
      if (alg === 'oddeven') {
        turnBox.append(el('div', { class: 'hint' }, '짝수 열 (x = 0, 2, 4…)'), turnSVG([[E, N], [E, S]]));
        turnBox.append(el('div', { class: 'hint' }, '홀수 열 (x = 1, 3, 5…)'), turnSVG([[N, W], [S, W]]));
      } else if (alg === 'o1turn' || alg === 'valiant') {
        turnBox.append(el('div', { class: 'hint' }, alg === 'o1turn' ? 'VC 클래스 0: XY 규칙 / VC 클래스 1: YX 규칙' : '1단계(→중간노드) VC 클래스 0, 2단계(→목적지) VC 클래스 1, 각 단계는 XY'), turnSVG(alg === 'o1turn' ? [] : PROHIBIT.xy));
      } else turnBox.append(el('div', { class: 'hint' }, '금지된 회전 (빨간 ✕)'), turnSVG(PROHIBIT[alg]));
      const notes = {
        xy: 'X를 먼저 맞추고 Y를 맞춥니다. Y→X 회전 4개가 모두 금지됩니다.',
        yx: 'Y를 먼저 맞추고 X를 맞춥니다.',
        westfirst: '서쪽 이동은 맨 처음에. 동쪽으로 가는 패킷은 완전 적응형, 서쪽으로 가는 패킷은 결정적.',
        northlast: '북쪽 이동은 맨 마지막에. 북쪽으로 가는 패킷은 결정적, 남쪽으로 가는 패킷은 완전 적응형.',
        negfirst: '서·남(음의 방향)을 먼저, 동·북(양의 방향)을 나중에. 북동/남서로 가는 패킷이 적응적.',
        oddeven: '짝수 열에서 동→북/남 회전 금지, 홀수 열에서 북/남→서 회전 금지. 열이 음영으로 표시됩니다.',
        adaptive: '⚠️ 모든 최소 경로 허용. 가상 채널 없이 쓰면 데드락이 발생합니다(6장).',
        o1turn: '패킷마다 XY 또는 YX를 50% 확률로 선택. 두 경로가 링크 굵기 0.5로 표시됩니다.',
        valiant: '전체 링크 굵기는 모든 중간 노드에 대한 평균. 점선은 예시 경로(🎲로 중간 노드 변경), ◆가 중간 노드입니다.'
      };
      note.textContent = notes[alg];
      draw();
    }
    function P(r) { const { w, h } = cv; const s = Math.min(w, h) - 20, cs = s / k; return [(w - s) / 2 + ((r % k) + 0.5) * cs, (h - s) / 2 + (((r / k) | 0) + 0.5) * cs, cs]; }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const g = new Geo(k, k, false);
      const link = NB.css('--link'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), acc = NB.css('--accent'), mute = NB.css('--text-mute');
      const cs = P(0)[2], b = cs * 0.34, off = cs * 0.08;
      if (alg === 'oddeven') {
        for (let x = 0; x < k; x += 2) { const [px] = P(x); ctx.fillStyle = NB.alpha(NB.css('--c7'), 0.08); ctx.fillRect(px - cs / 2, P(0)[1] - cs / 2, cs, cs * k); ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.fillText('짝', px, P(0)[1] - cs / 2 + 10); }
      }
      for (let r = 0; r < g.n; r++) for (let p = 1; p <= 4; p++) {
        const nb = g.nb(r, p); if (nb < 0) continue;
        const [x1, y1] = P(r), [x2, y2] = P(nb);
        const px = -DY[p] * off, py = DX[p] * off;
        const wv = weights ? weights[r * 5 + p] : 0;
        ctx.strokeStyle = wv > 0 ? NB.alpha(acc, 0.35 + 0.65 * Math.min(1, wv)) : link;
        ctx.lineWidth = wv > 0 ? 1.5 + wv * cs * 0.18 : 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1 + DX[p] * b + px, y1 + DY[p] * b + py); ctx.lineTo(x2 - DX[p] * b + px, y2 - DY[p] * b + py); ctx.stroke();
        if (wv > 0) {
          const mx = (x1 + x2) / 2 + px, my = (y1 + y2) / 2 + py, a = Math.atan2(y2 - y1, x2 - x1), s = 4 + wv * 3;
          ctx.fillStyle = acc; ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * s, my + Math.sin(a) * s); ctx.lineTo(mx + Math.cos(a + 2.4) * s, my + Math.sin(a + 2.4) * s); ctx.lineTo(mx + Math.cos(a - 2.4) * s, my + Math.sin(a - 2.4) * s); ctx.fill();
          if (wv < 0.999 && cs > 55 && alg !== 'valiant') { ctx.fillStyle = mute; ctx.font = '10px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.fillText(wv.toFixed(2), mx - py * 2.2, my + px * 2.2 + 3); }
        }
      }
      if (exPath) {
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = NB.css('--c3'); ctx.lineWidth = 2.5;
        ctx.beginPath(); exPath.forEach((r, i) => { const [x, y] = P(r); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
      }
      for (let r = 0; r < g.n; r++) {
        const [x, y] = P(r);
        const isS = r === src, isD = r === dst;
        ctx.fillStyle = isS ? NB.css('--c2') : isD ? NB.css('--c3') : node;
        ctx.strokeStyle = isS || isD ? 'transparent' : stroke; ctx.lineWidth = 1.2;
        NB.roundRect(ctx, x - b, y - b, 2 * b, 2 * b, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isS || isD ? '#fff' : mute; ctx.font = (isS || isD ? 'bold ' : '') + Math.round(Math.min(12, b * 0.7)) + 'px ' + NB.css('--mono');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(isS ? 'S' : isD ? 'D' : (r % k) + ',' + ((r / k) | 0), x, y);
        if (alg === 'valiant' && r === valMid && !isS && !isD) { ctx.fillStyle = NB.css('--c3'); ctx.font = 'bold 16px sans-serif'; ctx.fillText('◆', x, y - b - 7); }
      }
      if (sampleAnim) {
        const { path, t } = sampleAnim;
        const i = Math.min(path.length - 2, Math.floor(t)), f = t - i;
        if (path.length > 1) {
          const [x1, y1] = P(path[i]), [x2, y2] = P(path[i + 1]);
          ctx.fillStyle = NB.css('--c5'); ctx.beginPath(); ctx.arc(NB.lerp(x1, x2, f), NB.lerp(y1, y2, f), Math.max(5, cs * 0.12), 0, 7); ctx.fill();
          ctx.strokeStyle = node; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(clickNext === 0 ? '클릭: 출발지(S) 지정' : '클릭: 목적지(D) 지정', 4, 2);
    }
    function sendPacket() {
      const sim = fakeSim(k), g = sim.geo, R = ROUTING[alg];
      const pkt = { src, dst };
      if (alg === 'valiant') { pkt.mid = valMid; pkt.phase = 0; }
      if (alg === 'o1turn') pkt.order = Math.random() < 0.5 ? 0 : 1;
      const path = [src]; let r = src, guard = 0;
      while (r !== dst && guard++ < 100) { const ps = R.ports(sim, r, pkt).filter((p) => p !== L); if (!ps.length) break; const p = ps[(Math.random() * ps.length) | 0]; r = g.nb(r, p); path.push(r); }
      const t0 = performance.now();
      const f = (now) => { const t = (now - t0) / 260; sampleAnim = { path, t: Math.min(t, path.length - 1.001) }; draw(); if (t < path.length - 1) requestAnimationFrame(f); else setTimeout(() => { sampleAnim = null; draw(); }, 600); };
      requestAnimationFrame(f);
    }
    cv.canvas.style.cursor = 'pointer';
    cv.canvas.addEventListener('click', (e) => {
      const p = cv.pos(e); const cs = P(0)[2];
      let best = -1, bd = 1e9;
      for (let r = 0; r < k * k; r++) { const [x, y] = P(r); const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = r; } }
      if (bd > cs * 0.6) return;
      if (clickNext === 0) { if (best !== dst) src = best; clickNext = 1; }
      else { if (best !== src) dst = best; clickNext = 0; }
      if (alg === 'valiant') valMid = (Math.random() * k * k) | 0;
      calc();
    });
    cv.draw = draw;
    calc();
  })();

  /* ======================================================
     3.2 Turn model checker
     ====================================================== */
  (function () {
    const Wd = NB.widget('w-turn'); if (!Wd) return;
    const proh = new Set([key(N, W), key(S, W)]);
    const ctr = el('div', { class: 'btn-row', style: { marginBottom: '12px' } }); Wd.body.append(ctr);
    const presets = { '제약 없음': [], 'XY': PROHIBIT.xy, 'West-First': PROHIBIT.westfirst, 'North-Last': PROHIBIT.northlast, 'Negative-First': PROHIBIT.negfirst, '⚠ 나쁜 조합': [[N, E], [E, N]] };
    Object.entries(presets).forEach(([nm, arr]) => NB.button(ctr, nm, () => { proh.clear(); arr.forEach(([a, b]) => proh.add(key(a, b))); upd(); }));
    const lay = el('div', { class: 'split', style: { alignItems: 'start' } }); Wd.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const turnBox = el('div'); left.append(el('div', { class: 'hint' }, '회전 화살표를 클릭해 금지/허용을 바꾸세요'), turnBox);
    const result = el('div', { style: { margin: '12px 0', fontSize: '15px' } }); left.append(result);
    left.append(el('div', { class: 'hint', style: { marginTop: '6px' } }, '2개 금지 조합 16가지 (행: 금지할 시계방향 회전, 열: 금지할 반시계방향 회전)'));
    const matrix = el('div', { style: { display: 'grid', gridTemplateColumns: '64px repeat(4, 1fr)', gap: '4px', marginTop: '6px', fontSize: '12px' } }); left.append(matrix);
    const cv = NB.canvas(right, { height: (w) => Math.min(380, w) });
    let cycle = null;
    const tname = (a, b) => DKO[a] + '→' + DKO[b];
    // precompute matrix
    const safeMap = {};
    CW.forEach((a) => CCW.forEach((b) => { safeMap[key(...a) + '|' + key(...b)] = !NB.noc.turnCycle(6, (f, t) => !(key(f, t) === key(...a) || key(f, t) === key(...b))); }));
    function buildMatrix() {
      matrix.innerHTML = '';
      matrix.append(el('div'));
      CCW.forEach((b) => matrix.append(el('div', { class: 'mono', style: { textAlign: 'center', color: 'var(--text-mute)' } }, tname(...b))));
      CW.forEach((a) => {
        matrix.append(el('div', { class: 'mono', style: { color: 'var(--text-mute)', alignSelf: 'center' } }, tname(...a)));
        CCW.forEach((b) => {
          const safe = safeMap[key(...a) + '|' + key(...b)];
          const on = proh.size === 2 && proh.has(key(...a)) && proh.has(key(...b));
          const c = el('button', { type: 'button', class: 'mono', title: tname(...a) + ' + ' + tname(...b) + (safe ? ' : 데드락 없음' : ' : 사이클 존재'), style: { padding: '6px 0', borderRadius: '6px', cursor: 'pointer', border: on ? '2px solid var(--text)' : '1px solid var(--border)', background: safe ? 'var(--accent-2-soft)' : 'var(--danger-soft)', color: safe ? 'var(--accent-2)' : 'var(--danger)', fontWeight: 700 } }, safe ? '✓' : '✗');
          c.addEventListener('click', () => { proh.clear(); proh.add(key(...a)); proh.add(key(...b)); upd(); });
          matrix.append(c);
        });
      });
    }
    function upd() {
      turnBox.innerHTML = '';
      turnBox.append(turnSVG([...proh].map((s) => s.split('-').map(Number)), { width: 300, onToggle: (a, b) => { const kk = key(a, b); if (proh.has(kk)) proh.delete(kk); else proh.add(kk); upd(); } }));
      cycle = NB.noc.turnCycle(6, (f, t) => !proh.has(key(f, t)));
      result.innerHTML = cycle
        ? '<span class="badge bad">✗ 사이클 발견</span> 길이 ' + cycle.length + '의 채널 의존성 사이클이 있습니다 → 데드락 가능.'
        : '<span class="badge ok">✓ 데드락 없음</span> 채널 의존성 그래프에 사이클이 없습니다' + (proh.size ? ' (금지 회전 ' + proh.size + '개).' : '.');
      buildMatrix();
      draw();
    }
    function draw() {
      const { ctx, w, h } = cv, k = 6;
      ctx.clearRect(0, 0, w, h);
      const s = Math.min(w, h) - 20, cs = s / k, ox = (w - s) / 2, oy = (h - s) / 2;
      const X = (r) => ox + ((r % k) + 0.5) * cs, Y = (r) => oy + (((r / k) | 0) + 0.5) * cs;
      const link = NB.css('--link'), node = NB.css('--node'), stroke = NB.css('--node-stroke'), dng = NB.css('--danger');
      ctx.strokeStyle = link; ctx.lineWidth = 1.2;
      for (let r = 0; r < k * k; r++) {
        if (r % k < k - 1) { ctx.beginPath(); ctx.moveTo(X(r), Y(r)); ctx.lineTo(X(r + 1), Y(r)); ctx.stroke(); }
        if (r < k * (k - 1)) { ctx.beginPath(); ctx.moveTo(X(r), Y(r)); ctx.lineTo(X(r), Y(r + k)); ctx.stroke(); }
      }
      const b = cs * 0.16;
      for (let r = 0; r < k * k; r++) { ctx.fillStyle = node; ctx.strokeStyle = stroke; NB.roundRect(ctx, X(r) - b, Y(r) - b, 2 * b, 2 * b, 3); ctx.fill(); ctx.stroke(); }
      if (cycle) {
        const g = new Geo(k, k, false);
        ctx.strokeStyle = dng; ctx.fillStyle = dng; ctx.lineWidth = 3.2; ctx.lineJoin = 'round';
        cycle.forEach((c) => {
          const nb = g.nb(c.r, c.p), off = cs * 0.1;
          const px = -DY[c.p] * off, py = DX[c.p] * off;
          NB.arrow(ctx, X(c.r) + px, Y(c.r) + py, X(nb) + px - DX[c.p] * b, Y(nb) + py - DY[c.p] * b, 8);
        });
        ctx.font = 'bold 13px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('발견된 의존성 사이클', 4, 2);
      } else {
        ctx.fillStyle = NB.css('--accent-2'); ctx.font = 'bold 13px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('사이클 없음 ✓', 4, 2);
      }
    }
    cv.draw = draw;
    NB.onTheme(upd);
    upd();
  })();

  /* ======================================================
     3.3 Side-by-side race
     ====================================================== */
  (function () {
    const Wd = NB.widget('w-race'); if (!Wd) return;
    const ctr = el('div', { class: 'controls' }); Wd.body.append(ctr);
    let traffic = 'transpose', rate = 0.15, speed = 40, algs = ['xy', 'oddeven'];
    const trafficSel = NB.select(ctr, { label: '트래픽 패턴', value: traffic, options: ['transpose', 'bitcomp', 'tornado', 'uniform', 'hotspot', 'shuffle'].map((t) => ({ value: t, label: NB.noc.TRAFFIC[t].name })), onChange: (v) => { traffic = v; reset(); } });
    NB.slider(ctr, { label: '주입률 (flit/node/cycle)', min: 0.02, max: 0.4, step: 0.01, value: rate, fmt: (v) => v.toFixed(2), onChange: (v) => { rate = v; reset(); }, onInput: () => {} });
    NB.slider(ctr, { label: '속도 (사이클/초)', min: 2, max: 120, value: speed, onInput: (v) => { speed = v; } });
    NB.button(ctr, '↺ 다시 시작', () => reset());
    const lay = el('div', { class: 'split' }); Wd.body.append(lay);
    const panes = [0, 1].map((i) => {
      const box = el('div');
      lay.append(box);
      const c2 = el('div', { class: 'controls', style: { marginBottom: '6px' } }); box.append(c2);
      NB.select(c2, { label: '라우팅 ' + (i ? 'B' : 'A'), value: algs[i], options: ['xy', 'yx', 'westfirst', 'northlast', 'negfirst', 'oddeven', 'o1turn', 'valiant'].map((a) => ({ value: a, label: ROUTING[a].name })), onChange: (v) => { algs[i] = v; reset(); } });
      const cv = NB.canvas(box, { height: (w) => Math.min(420, w) });
      const st = NB.stats(box, [{ key: 'lat', label: '평균 지연 (최근)' }, { key: 'thr', label: '수신 처리량' }, { key: 'q', label: '출발지 대기 패킷' }]);
      return { cv, st, sim: null };
    });
    let acc = 0;
    function reset() {
      panes.forEach((p, i) => {
        p.sim = new NB.noc.Sim({ kx: 8, ky: 8, vcs: 2, depth: 4, pktLen: 4, rate, traffic, routing: algs[i], record: true, seed: 7 });
        p.lat = []; p.ej0 = 0; p.t0 = 0;
      });
    }
    reset();
    function stats() {
      panes.forEach((p) => {
        const s = p.sim;
        const last = s.series.slice(-5).filter((x) => x.lat != null);
        const lat = last.length ? last.reduce((a, b) => a + b.lat, 0) / last.length : null;
        const thr = s.series.length ? s.series.slice(-5).reduce((a, b) => a + b.acc, 0) / Math.min(5, s.series.length) : 0;
        const q = s.queued();
        p.st.lat.set(lat != null ? lat.toFixed(1) : '—', 'cyc', lat != null && lat > 80 ? 'bad' : '');
        p.st.thr.set(thr.toFixed(3), '/ ' + rate.toFixed(2));
        p.st.q.set(q, '', q > 64 ? 'bad' : '');
      });
    }
    let fr = 0;
    panes.forEach((p) => { p.cv.draw = () => NB.noc.render(p.cv.ctx, p.sim, { w: p.cv.w, h: p.cv.h, frac: acc }); });
    NB.loop(Wd.root, (dt) => {
      acc += dt * speed;
      let steps = 0;
      while (acc >= 1 && steps < 40) { acc -= 1; steps++; panes.forEach((p) => p.sim.step()); }
      if (acc > 1) acc = 0.99;
      panes.forEach((p) => p.cv.draw());
      if (++fr % 10 === 0) stats();
    });
  })();
});
