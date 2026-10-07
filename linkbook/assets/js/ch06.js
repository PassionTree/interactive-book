/* LinkBook Chapter 6 — Clocking, jitter, CDR */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const L = NB.link;
  const S = NB.svgEl;

  /* ======================================================
     6.1 Clocking architectures
     ====================================================== */
  (function () {
    const W = NB.widget('w-arch'); if (!W) return;
    let mode = 'emb';
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '방식', value: mode, options: [{ value: 'common', label: '공통 클록' }, { value: 'src', label: '소스 동기 (클록 포워딩)' }, { value: 'emb', label: '임베디드 클록 (CDR)' }], onChange: (v) => { mode = v; draw(); } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const svg = S('svg', { class: 'vis', viewBox: '0 0 560 320', style: 'width:100%;height:auto' });
    const left = el('div'); left.append(svg); lay.append(left);
    const info = el('div', { class: 'small' }); lay.append(info);
    const TXT = {
      common: { t: '공통 클록 (Common / System-synchronous)', pro: ['구조가 가장 단순', '레인 수와 무관하게 클록 하나'], con: ['클록 분배 스큐 + 비행 시간 + 셋업/홀드가 한 주기에 들어가야 함', '수백 MHz 이상에서는 사실상 불가능'], ex: '초기의 보드 버스, 저속 온칩/오프칩 인터페이스' },
      src: { t: '소스 동기 (Source-synchronous, 클록 포워딩)', pro: ['데이터와 클록이 같은 경로로 가서 비행 시간이 상쇄됨', 'CDR이 필요 없어 저전력·저지연', '클록과 데이터의 지터가 상관되어 함께 움직임'], con: ['데이터 레인과 클록 레인 사이의 스큐 정합 필요(레인별 디스큐)', '클록 레인 추가 비용, 먼 거리에서는 상관성이 깨짐'], ex: 'DDR/LPDDR(DQS 스트로브), HBM, UCIe 등 다이-투-다이 링크' },
      emb: { t: '임베디드 클록 (Embedded clock + CDR)', pro: ['클록 선이 없음 — 레인마다 독립적으로 정렬', '레인 간 스큐가 커도 됨 (상위 계층에서 디스큐)', '가장 먼 거리, 가장 높은 레인당 속도'], con: ['데이터에 충분한 전이 필요 (8b/10b, 스크램블러)', 'CDR의 면적·전력·락 시간', 'CDR 대역폭보다 빠른 지터는 추적 못 함'], ex: 'PCIe, 이더넷, USB, SATA, 대부분의 장거리 SerDes' }
    };
    function draw() {
      svg.innerHTML = '';
      const acc = NB.css('--accent'), mute = NB.css('--text-mute'), text = NB.css('--text'), node = NB.css('--surface'), stroke = NB.css('--border-strong'), clk = NB.css('--c4'), dat = NB.css('--c1');
      const defs = S('defs', null, svg);
      [['ad', dat], ['ac', clk]].forEach(([id, c]) => { const m = S('marker', { id: 'arc' + id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs); S('path', { d: 'M0 0L10 5L0 10z', fill: c }, m); });
      const box = (x, y, w, h, t) => { S('rect', { x, y, width: w, height: h, rx: 12, fill: node, stroke, 'stroke-width': 1.5 }, svg); const tt = S('text', { x: x + w / 2, y: y + 22, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: text }, svg); tt.textContent = t; };
      box(20, 70, 150, 190, '칩 A (TX)'); box(390, 70, 150, 190, '칩 B (RX)');
      const lanes = mode === 'emb' ? 4 : 4;
      for (let i = 0; i < lanes; i++) {
        const y = 125 + i * 32;
        S('rect', { x: 120, y: y - 10, width: 40, height: 20, rx: 4, fill: NB.alpha(dat, 0.15), stroke: dat }, svg);
        S('rect', { x: 400, y: y - 10, width: mode === 'emb' ? 60 : 40, height: 20, rx: 4, fill: NB.alpha(mode === 'emb' ? clk : dat, 0.15), stroke: mode === 'emb' ? clk : dat }, svg);
        if (mode === 'emb') { const t = S('text', { x: 430, y: y + 4, 'text-anchor': 'middle', 'font-size': 10, fill: clk, 'font-weight': 700 }, svg); t.textContent = 'CDR'; }
        S('path', { d: 'M160 ' + y + ' C 260 ' + (y + (i - 1.5) * 6) + ', 300 ' + (y - (i - 1.5) * 6) + ', 398 ' + y, stroke: dat, 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#arcad)' }, svg);
      }
      const lab = (x, y, s, c, sz) => { const t = S('text', { x, y, 'text-anchor': 'middle', 'font-size': sz || 12, fill: c || mute }, svg); t.textContent = s; };
      lab(280, 112, '데이터 레인 ×4', dat);
      if (mode === 'common') {
        S('rect', { x: 235, y: 12, width: 90, height: 34, rx: 8, fill: NB.alpha(clk, 0.15), stroke: clk }, svg); lab(280, 34, '클록 발생기', clk, 12);
        S('path', { d: 'M260 46 C 220 60, 160 60, 100 72', stroke: clk, 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#arcac)' }, svg);
        S('path', { d: 'M300 46 C 340 60, 400 60, 460 72', stroke: clk, 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#arcac)' }, svg);
        lab(280, 290, '타이밍 예산: T_clk ≥ t_co + t_flight + t_skew + t_setup', mute, 12);
      } else if (mode === 'src') {
        const y = 240;
        S('rect', { x: 120, y: y - 10, width: 40, height: 20, rx: 4, fill: NB.alpha(clk, 0.15), stroke: clk }, svg);
        S('path', { d: 'M160 ' + y + ' L398 ' + y, stroke: clk, 'stroke-width': 2.5, fill: 'none', 'marker-end': 'url(#arcac)', 'stroke-dasharray': '6 3' }, svg);
        lab(280, y - 8, '포워딩 클록 / 스트로브 (DQS)', clk);
        S('rect', { x: 400, y: y - 10, width: 40, height: 20, rx: 4, fill: NB.alpha(clk, 0.15), stroke: clk }, svg);
        S('path', { d: 'M420 230 V 222', stroke: clk, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, svg);
        lab(280, 290, '데이터와 클록이 같은 경로 → 비행 시간이 상쇄', mute, 12);
      } else {
        lab(280, 290, '클록 선 없음: 각 레인의 데이터 전이에서 클록을 복원', mute, 12);
        lab(280, 308, '(각 칩은 자기 기준 클록 + PLL을 가짐, 수백 ppm 차이 허용)', mute, 11.5);
        S('circle', { cx: 60, cy: 238, r: 13, fill: NB.alpha(clk, 0.15), stroke: clk }, svg); lab(60, 242, 'PLL', clk, 9.5);
        S('circle', { cx: 500, cy: 238, r: 13, fill: NB.alpha(clk, 0.15), stroke: clk }, svg); lab(500, 242, 'PLL', clk, 9.5);
      }
      const T = TXT[mode];
      info.innerHTML = '<h3 style="margin:0 0 8px;font-size:16px">' + T.t + '</h3><b style="color:var(--accent-2)">장점</b><ul style="margin:4px 0 8px">' + T.pro.map((x) => '<li>' + x + '</li>').join('') + '</ul><b style="color:var(--danger)">단점</b><ul style="margin:4px 0 8px">' + T.con.map((x) => '<li>' + x + '</li>').join('') + '</ul><b>예</b>: ' + T.ex;
    }
    NB.onTheme(draw);
    draw();
  })();

  /* ======================================================
     6.2 Jitter histogram & bathtub
     ====================================================== */
  (function () {
    const W = NB.widget('w-jit'); if (!W) return;
    const P = { rj: 0.01, dj: 0.2, ber: 12 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: 'RJ (rms)', min: 0.002, max: 0.04, step: 0.001, value: P.rj, fmt: (v) => (v * 1000).toFixed(0) + ' mUI', onInput: (v) => { P.rj = v; upd(); } });
    NB.slider(ctr, { label: 'DJ (듀얼 디랙, p-p)', min: 0, max: 0.5, step: 0.01, value: P.dj, fmt: (v) => v.toFixed(2) + ' UI', onInput: (v) => { P.dj = v; upd(); } });
    NB.slider(ctr, { label: '목표 BER', min: 6, max: 15, value: P.ber, fmt: (v) => '1e-' + v, onInput: (v) => { P.ber = v; upd(); } });
    const lay = el('div', { class: 'split' }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const hcv = NB.canvas(a, { height: 260 });
    const chart = NB.chart(b, { height: 260, xLabel: '샘플링 위치 (UI)', yLabel: 'BER', logY: true, xMin: 0, xMax: 1, yMin: 1e-16, yMax: 1, xFmt: (x) => x.toFixed(2) + ' UI', yFmt: (v) => L.fmtBER(v) });
    const st = NB.stats(W.body, [{ key: 'q', label: 'Q(BER)' }, { key: 'tj', label: '총 지터 TJ' }, { key: 'eo', label: '아이 폭 @ BER' }, { key: 'time', label: '25 Gb/s에서 오류 간격' }]);
    function qInv(ber) { let lo = 0, hi = 10; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (L.Q(m) > ber) lo = m; else hi = m; } return (lo + hi) / 2; }
    function upd() {
      const ber = Math.pow(10, -P.ber), q = qInv(ber);
      const tj = P.dj + 2 * q * P.rj;
      // bathtub
      const pts = [];
      const edge = (d) => 0.5 * (L.Q((d - P.dj / 2) / P.rj) + L.Q((d + P.dj / 2) / P.rj));
      for (let i = 0; i <= 200; i++) { const x = i / 200; pts.push([x, Math.max(1e-30, 0.5 * (edge(x) + edge(1 - x)))]); }
      chart.set({ series: [{ name: 'BER(샘플링 위치)', color: NB.css('--accent'), points: pts }, { name: '목표 BER', color: NB.css('--c3'), points: [[0, ber], [1, ber]], dash: [5, 4], width: 1.5 }] });
      // histogram
      const { ctx, w, h } = hcv;
      ctx.clearRect(0, 0, w, h);
      const rnd = NB.rng(5), bins = 120, cnt = new Array(bins).fill(0), span = 0.6;
      for (let i = 0; i < 40000; i++) { const t = (rnd() < 0.5 ? -1 : 1) * P.dj / 2 + L.gauss(rnd) * P.rj; const k = Math.floor((t + span / 2) / span * bins); if (k >= 0 && k < bins) cnt[k]++; }
      const mx = Math.max(...cnt), pad = 30;
      ctx.fillStyle = NB.css('--accent');
      for (let k = 0; k < bins; k++) { const bh = (h - pad - 20) * cnt[k] / mx; ctx.fillRect(pad / 2 + k * (w - pad) / bins, h - pad - bh, (w - pad) / bins - 0.5, bh); }
      const X = (t) => pad / 2 + (t + span / 2) / span * (w - pad);
      ctx.strokeStyle = NB.css('--c3'); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      [-tj / 2, tj / 2].forEach((t) => { ctx.beginPath(); ctx.moveTo(X(t), 10); ctx.lineTo(X(t), h - pad); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.fillStyle = NB.css('--text-mute'); ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [-0.3, -0.15, 0, 0.15, 0.3].forEach((t) => ctx.fillText(t.toFixed(2), X(t), h - pad + 4));
      ctx.fillText('에지 위치 오차 TIE (UI)', w / 2, h - 13);
      ctx.fillStyle = NB.css('--c3'); ctx.textAlign = 'left'; ctx.fillText('TJ@BER', X(tj / 2) + 3, 12);
      st.q.set(q.toFixed(2));
      st.tj.set(tj.toFixed(3), 'UI', tj > 0.7 ? 'bad' : '');
      st.eo.set(Math.max(0, 1 - tj).toFixed(3), 'UI', 1 - tj > 0.3 ? 'good' : 'bad');
      const sec = 1 / (ber * 25e9);
      st.time.set(sec < 60 ? sec.toPrecision(2) + ' 초' : sec < 3600 ? (sec / 60).toPrecision(2) + ' 분' : sec < 86400 * 2 ? (sec / 3600).toPrecision(2) + ' 시간' : (sec / 86400).toPrecision(2) + ' 일');
    }
    hcv.draw = upd;
    upd();
  })();

  /* ======================================================
     6.3 Bang-bang CDR
     ====================================================== */
  (function () {
    const W = NB.widget('w-cdr'); if (!W) return;
    const KP = [1 / 512, 1 / 256, 1 / 128, 1 / 64, 1 / 32, 1 / 16];
    const KI = [0, 1 / 65536, 1 / 16384, 1 / 4096, 1 / 1024];
    const P = { ppm: 200, kp: 2, ki: 2, sj: 0.2, sjf: 0.001, rj: 0.01, init: 0.4, seed: 1 };
    const r1 = el('div', { class: 'controls' }); W.body.append(r1);
    NB.slider(r1, { label: '주파수 오차', min: -2000, max: 2000, step: 50, value: P.ppm, fmt: (v) => v + ' ppm', onInput: (v) => { P.ppm = v; upd(); } });
    NB.slider(r1, { label: '비례 이득 Kp', min: 0, max: KP.length - 1, value: P.kp, fmt: (i) => '1/' + (1 / KP[i]) + ' UI', onInput: (i) => { P.kp = i; upd(); } });
    NB.slider(r1, { label: '적분 이득 Ki', min: 0, max: KI.length - 1, value: P.ki, fmt: (i) => (KI[i] ? '1/' + 1 / KI[i] : '0 (없음)'), onInput: (i) => { P.ki = i; upd(); } });
    const r2 = el('div', { class: 'controls' }); W.body.append(r2);
    NB.slider(r2, { label: '사인 지터 SJ 진폭', min: 0, max: 2, step: 0.05, value: P.sj, fmt: (v) => v.toFixed(2) + ' UI', onInput: (v) => { P.sj = v; upd(); } });
    NB.slider(r2, { label: 'SJ 주파수', min: 0, max: 8, value: 3, fmt: (i) => [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05][i] + ' × f_bit', onInput: (i) => { P.sjf = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05][i]; upd(); } });
    NB.slider(r2, { label: '랜덤 지터 RJ', min: 0, max: 0.05, step: 0.002, value: P.rj, fmt: (v) => v.toFixed(3) + ' UI', onInput: (v) => { P.rj = v; upd(); } });
    NB.button(r2, '🎲 다른 시드', () => { P.seed++; upd(); });
    const cv = NB.canvas(W.body, { height: 260 });
    const lay = el('div', { class: 'split', style: { marginTop: '8px' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const ecv = NB.canvas(a, { height: 170 });
    const st = NB.stats(b, [{ key: 'lock', label: '락 시간' }, { key: 'rms', label: '락 후 위상 오차 rms' }, { key: 'err', label: '비트 오류' }, { key: 'slip', label: '사이클 슬립' }]);
    function upd() {
      const N = 6000, rnd = NB.rng(P.seed * 77);
      const kp = KP[P.kp], ki = KI[P.ki];
      const th = new Float64Array(N), ph = new Float64Array(N), er = new Float64Array(N);
      let phi = 0, integ = 0, prevBit = 0, errs = 0, slips = 0, lock = -1, run = 0;
      for (let n = 0; n < N; n++) {
        const theta = P.init + n * P.ppm * 1e-6 + P.sj * Math.sin(2 * Math.PI * P.sjf * n) + L.gauss(rnd) * P.rj;
        let e = theta - phi;
        const w = e - Math.round(e);
        if (Math.abs(e) > 0.5) { slips++; phi += Math.round(e); e = theta - phi; }
        th[n] = theta; ph[n] = phi; er[n] = w;
        const bit = rnd() < 0.5 ? 1 : 0;
        const pd = bit !== prevBit ? Math.sign(w) : 0;
        prevBit = bit;
        integ += ki * pd;
        phi += kp * pd + integ;
        if (Math.abs(w) < 0.1) { run++; if (run > 200 && lock < 0) lock = n - 200; } else run = 0;
      }
      // plot phases
      const { ctx, w, h } = cv;
      let lo = Infinity, hi = -Infinity; for (let n = 0; n < N; n++) { lo = Math.min(lo, th[n], ph[n]); hi = Math.max(hi, th[n], ph[n]); }
      const padY = (hi - lo) * 0.08 + 0.05;
      L.plotWave(ctx, { w, h, x0: 0, x1: N, y0: lo - padY, y1: hi + padY, xTicks: [0, 1000, 2000, 3000, 4000, 5000, 6000], yTicks: niceTicks(lo, hi), yFmt: (v) => v.toFixed(2), series: [
        { data: Array.from(th), color: NB.alpha(NB.css('--c1'), 0.55), width: 1, xs: (i) => i },
        { data: Array.from(ph), color: NB.css('--c3'), width: 2, xs: (i) => i }
      ] });
      ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = NB.css('--c1'); ctx.fillText('● 입력 데이터 위상 θ (UI)', 48, 8);
      ctx.fillStyle = NB.css('--c3'); ctx.fillText('● CDR 샘플링 위상 φ', 220, 8);
      ctx.fillStyle = NB.css('--text-mute'); ctx.textAlign = 'right'; ctx.fillText('비트 →', w - 12, h - 34);
      // error trace
      L.plotWave(ecv.ctx, { w: ecv.w, h: ecv.h, x0: 0, x1: N, y0: -0.5, y1: 0.5, yTicks: [-0.35, 0, 0.35], xTicks: [], series: [{ data: Array.from(er), color: NB.css('--accent'), width: 1, xs: (i) => i }] });
      ecv.ctx.fillStyle = NB.css('--text-soft'); ecv.ctx.font = 'bold 12px ' + NB.css('--font'); ecv.ctx.textAlign = 'left'; ecv.ctx.textBaseline = 'top'; ecv.ctx.fillText('위상 오차 θ − φ (UI), 점선 밖 = 오류', 46, 2);
      let s2 = 0, c = 0; for (let n = Math.max(0, lock); n < N; n++) { s2 += er[n] * er[n]; c++; if (Math.abs(er[n]) > 0.35) errs++; }
      st.lock.set(lock >= 0 ? lock : '실패', lock >= 0 ? '비트' : '', lock >= 0 ? 'good' : 'bad');
      st.rms.set(lock >= 0 ? Math.sqrt(s2 / c).toFixed(3) : '—', 'UI');
      st.err.set(errs, lock >= 0 ? '(락 이후)' : '', errs ? 'bad' : 'good');
      st.slip.set(slips, '', slips ? 'bad' : 'good');
    }
    function niceTicks(lo, hi) { const span = hi - lo, st = span > 4 ? 1 : span > 2 ? 0.5 : span > 0.8 ? 0.25 : 0.1; const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(+v.toFixed(3)); return out; }
    cv.draw = upd; ecv.draw = upd;
    upd();
  })();
});
