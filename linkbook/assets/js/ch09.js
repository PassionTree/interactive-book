/* LinkBook Chapter 9 — Real interfaces */
NB.ready(function () {
  'use strict';
  const { el } = NB;

  /* ======================================================
     9.1 PCIe generations
     ====================================================== */
  (function () {
    const W = NB.widget('w-pcie'); if (!W) return;
    const G = [
      { g: 1, y: 2003, r: 2.5, enc: '8b/10b', eff: 0.8, pam: 2 },
      { g: 2, y: 2007, r: 5, enc: '8b/10b', eff: 0.8, pam: 2 },
      { g: 3, y: 2010, r: 8, enc: '128b/130b', eff: 128 / 130, pam: 2 },
      { g: 4, y: 2017, r: 16, enc: '128b/130b', eff: 128 / 130, pam: 2 },
      { g: 5, y: 2019, r: 32, enc: '128b/130b', eff: 128 / 130, pam: 2 },
      { g: 6, y: 2022, r: 64, enc: 'FLIT (FEC+CRC 포함)', eff: 1, pam: 4 },
      { g: 7, y: 2025, r: 128, enc: 'FLIT (FEC+CRC 포함)', eff: 1, pam: 4 }
    ];
    const P = { metric: 'bw', lanes: 16, log: false, sel: 5 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '지표', value: P.metric, options: [{ value: 'bw', label: '대역폭 (GB/s)' }, { value: 'nyq', label: '나이퀴스트 (GHz)' }], onChange: (v) => { P.metric = v; draw(); } });
    NB.seg(ctr, { label: '레인', value: P.lanes, options: [1, 4, 8, 16].map((v) => ({ value: v, label: 'x' + v })), onChange: (v) => { P.lanes = v; draw(); } });
    NB.checkbox(ctr, { label: '로그 스케일', value: false, onChange: (v) => { P.log = v; draw(); } });
    const cv = NB.canvas(W.body, { height: 300 });
    const info = el('div', { style: { minHeight: '48px', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: '10px', fontSize: '15px', marginTop: '8px' } }); W.body.append(info);
    let rects = [];
    const val = (d) => (P.metric === 'bw' ? d.r * d.eff * P.lanes / 8 : d.r / (d.pam === 4 ? 2 : 1) / 2);
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 60, r: 10, t: 16, b: 42 };
      const vals = G.map(val), mx = Math.max(...vals);
      const Y = (v) => P.log ? h - pad.b - (Math.log10(v) - Math.log10(Math.min(...vals) / 2)) / (Math.log10(mx * 1.2) - Math.log10(Math.min(...vals) / 2)) * (h - pad.t - pad.b) : h - pad.b - v / (mx * 1.12) * (h - pad.t - pad.b);
      const bw = (w - pad.l - pad.r) / G.length;
      ctx.strokeStyle = NB.css('--grid'); ctx.fillStyle = NB.css('--text-mute'); ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const ticks = P.log ? [0.25, 1, 4, 16, 64, 256].filter((t) => t >= Math.min(...vals) / 2 && t <= mx * 1.2) : (() => { const st = mx > 150 ? 50 : mx > 60 ? 20 : mx > 20 ? 5 : 2; const o = []; for (let t = 0; t <= mx * 1.1; t += st) o.push(t); return o; })();
      ticks.forEach((t) => { const y = Y(Math.max(t, 1e-9)); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(t, pad.l - 6, y); });
      rects = [];
      G.forEach((d, i) => {
        const v = vals[i], x = pad.l + i * bw + bw * 0.18, ww = bw * 0.64, y = Y(v), yb = h - pad.b;
        const col = d.pam === 4 ? NB.css('--c3') : d.eff === 0.8 ? NB.css('--c6') : NB.css('--accent');
        ctx.fillStyle = NB.alpha(col, i === P.sel ? 1 : 0.75);
        NB.roundRect(ctx, x, y, ww, yb - y, 5); ctx.fill();
        if (i === P.sel) { ctx.strokeStyle = NB.css('--text'); ctx.lineWidth = 2; ctx.stroke(); }
        ctx.fillStyle = NB.css('--text'); ctx.font = 'bold 12px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(v >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/0$/, ''), x + ww / 2, y - 3);
        ctx.fillStyle = NB.css('--text-soft'); ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textBaseline = 'top';
        ctx.fillText('Gen' + d.g, x + ww / 2, yb + 5);
        ctx.fillStyle = NB.css('--text-mute'); ctx.font = '10.5px ' + NB.css('--mono'); ctx.fillText(d.y, x + ww / 2, yb + 21);
        rects.push([x, y, x + ww, yb]);
      });
      ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      [['8b/10b', '--c6'], ['128b/130b', '--accent'], ['PAM4 + FLIT', '--c3']].forEach(([t, c], i) => { ctx.fillStyle = NB.css(c); ctx.fillRect(pad.l + 8 + i * 110, 6, 10, 10); ctx.fillStyle = NB.css('--text-soft'); ctx.fillText(t, pad.l + 22 + i * 110, 5); });
      const d = G[P.sel];
      const baud = d.r / (d.pam === 4 ? 2 : 1);
      info.innerHTML = '<b>PCIe ' + d.g + '.0</b> (' + d.y + '년경) — ' + d.r + ' GT/s, ' + (d.pam === 4 ? 'PAM4' : 'NRZ') + ', ' + d.enc +
        ' · 심볼 레이트 ' + baud + ' GBd · 나이퀴스트 ' + (baud / 2) + ' GHz · UI ' + (1000 / baud).toFixed(1) + ' ps · x' + P.lanes + ' 단방향 ' + (d.r * d.eff * P.lanes / 8).toFixed(1) + ' GB/s';
    }
    cv.canvas.style.cursor = 'pointer';
    cv.canvas.addEventListener('click', (e) => { const p = cv.pos(e); rects.forEach(([a, b, c, d], i) => { if (p.x >= a && p.x <= c && p.y >= b - 20 && p.y <= d) P.sel = i; }); draw(); });
    cv.draw = draw;
    draw();
  })();

  /* ======================================================
     9.2 Memory interfaces: width × rate
     ====================================================== */
  (function () {
    const W = NB.widget('w-mem'); if (!W) return;
    const M = [
      { n: 'DDR4-3200 (DIMM)', bits: 64, r: 3.2, c: '--c6', note: '64비트 DIMM, 단일 종단 DQ + 차동 DQS 스트로브' },
      { n: 'DDR5-6400 (DIMM)', bits: 64, r: 6.4, c: '--c1', note: 'DIMM당 독립적인 32비트 서브채널 2개, DFE 등 수신 등화 도입' },
      { n: 'LPDDR5X-8533 (x64)', bits: 64, r: 8.533, c: '--c2', note: '모바일용 저전력 DRAM. 짧은 배선과 낮은 전압 스윙' },
      { n: 'GDDR6 (칩 1개)', bits: 32, r: 16, c: '--c7', note: '그래픽 메모리. 칩당 x32, 높은 핀당 속도' },
      { n: 'GDDR7 (칩 1개)', bits: 32, r: 32, c: '--c3', note: 'PAM3 변조(심볼당 1.5비트)로 핀당 32 Gb/s급' },
      { n: 'HBM2E (스택)', bits: 1024, r: 3.6, c: '--c4', note: '실리콘 인터포저 위 1024비트. 낮은 핀당 속도, 매우 넓은 폭' },
      { n: 'HBM3 (스택)', bits: 1024, r: 6.4, c: '--c5', note: '스택당 약 819 GB/s' },
      { n: 'HBM3E (스택)', bits: 1024, r: 9.6, c: '--c5', note: '핀당 약 9.6 Gb/s급, 스택당 1 TB/s 이상' }
    ];
    const cv = NB.canvas(W.body, { height: 470 });
    const calc = el('div', { class: 'controls', style: { marginTop: '10px' } }); W.body.append(calc);
    let sel = 6, cnt = 6;
    NB.select(calc, { label: '시스템 구성: 메모리 종류', value: String(sel), options: M.map((m, i) => ({ value: String(i), label: m.n })), onChange: (v) => { sel = +v; upd(); } });
    NB.slider(calc, { label: '개수 (DIMM/칩/스택)', min: 1, max: 16, value: cnt, onInput: (v) => { cnt = v; upd(); } });
    const st = NB.stats(W.body, [{ key: 'one', label: '하나당 대역폭' }, { key: 'tot', label: '시스템 총 대역폭' }, { key: 'pins', label: '총 데이터 핀' }]);
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const lab = 150, maxW = w - lab - 20, sx = maxW / 1024, sy = 4.2;
      let y = 8;
      ctx.strokeStyle = NB.css('--grid'); ctx.lineWidth = 1;
      [64, 256, 512, 1024].forEach((b) => { const x = lab + b * sx; ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, h - 22); ctx.stroke(); ctx.fillStyle = NB.css('--text-mute'); ctx.font = '10.5px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(b + 'b', x, h - 18); });
      M.forEach((m, i) => {
        const hh = Math.max(10, m.r * sy), ww = Math.max(3, m.bits * sx);
        ctx.fillStyle = NB.alpha(NB.css(m.c), i === sel ? 0.95 : 0.65);
        NB.roundRect(ctx, lab, y, ww, hh, 3); ctx.fill();
        if (i === sel) { ctx.strokeStyle = NB.css('--text'); ctx.lineWidth = 2; ctx.stroke(); }
        ctx.fillStyle = NB.css('--text'); ctx.font = (i === sel ? 'bold ' : '') + '12px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(m.n, lab - 8, y + hh / 2);
        const bw = m.bits * m.r / 8;
        ctx.textAlign = 'left'; ctx.font = '11.5px ' + NB.css('--mono'); ctx.fillStyle = NB.css('--text-soft');
        ctx.fillText(m.bits + 'b × ' + m.r + ' Gb/s = ' + (bw >= 100 ? bw.toFixed(0) : bw.toFixed(1)) + ' GB/s', lab + ww + 8 > w - 200 ? lab + 8 : lab + ww + 8, y + hh / 2);
        y += hh + 9;
      });
    }
    function upd() {
      const m = M[sel], one = m.bits * m.r / 8;
      st.one.set(one >= 100 ? one.toFixed(0) : one.toFixed(1), 'GB/s');
      const tot = one * cnt;
      st.tot.set(tot >= 1000 ? (tot / 1000).toFixed(2) : tot.toFixed(0), tot >= 1000 ? 'TB/s' : 'GB/s', 'good');
      st.pins.set(m.bits * cnt);
      draw();
    }
    cv.draw = draw;
    upd();
  })();

  /* ======================================================
     9.3 Die-to-die shoreline bandwidth & power
     ====================================================== */
  (function () {
    const W = NB.widget('w-d2d'); if (!W) return;
    const PITCH = [5, 9, 15, 25, 36, 45, 55, 75, 100, 110, 130, 150];
    const P = { pitch: 45, rows: 10, frac: 0.5, rate: 16, edge: 10, need: 4, pj: 0.5 };
    const r1 = el('div', { class: 'controls' }); W.body.append(r1);
    const pS = NB.slider(r1, { label: '범프 피치', min: 0, max: PITCH.length - 1, value: PITCH.indexOf(45), fmt: (i) => PITCH[i] + ' µm', onInput: (i) => { P.pitch = PITCH[i]; upd(); } });
    const rS = NB.slider(r1, { label: '범프 열 수 (가장자리 깊이)', min: 1, max: 40, value: P.rows, onInput: (v) => { P.rows = v; upd(); } });
    const fS = NB.slider(r1, { label: '데이터 신호 비율', min: 0.2, max: 0.8, step: 0.05, value: P.frac, fmt: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { P.frac = v; upd(); } });
    const tS = NB.slider(r1, { label: '레인당 속도', min: 2, max: 64, value: P.rate, fmt: (v) => v + ' Gb/s', onInput: (v) => { P.rate = v; upd(); } });
    const pr = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(pr);
    pr.append(el('span', { class: 'small muted' }, '예시 시나리오:'));
    const presets = { '유기 기판': [110, 4, 0.5, 16], '실리콘 인터포저/브리지': [45, 10, 0.5, 16], '하이브리드 본딩 (3D)': [9, 30, 0.5, 4] };
    Object.entries(presets).forEach(([n, [p, r, f, t]]) => NB.button(pr, n, () => { P.pitch = p; P.rows = r; P.frac = f; P.rate = t; pS.set(PITCH.indexOf(p)); rS.set(r); fS.set(f); tS.set(t); upd(); }));
    const lay = el('div', { class: 'split', style: { alignItems: 'start' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    a.append(el('div', { class: 'small', style: { fontWeight: 700 } }, '다이 가장자리 1 mm의 범프 배치'));
    const cv = NB.canvas(a, { height: 230 });
    const st = NB.stats(b, [{ key: 'lanes', label: '데이터 레인 / mm' }, { key: 'den', label: '대역폭 밀도' }, { key: 'edge', label: '가장자리 10 mm 합계' }]);
    const r2 = el('div', { class: 'controls', style: { marginTop: '14px' } }); b.append(r2);
    NB.slider(r2, { label: '필요한 총 대역폭', min: 0.5, max: 20, step: 0.5, value: P.need, fmt: (v) => v + ' TB/s', onInput: (v) => { P.need = v; upd(); } });
    NB.slider(r2, { label: '비트당 에너지', min: 0.1, max: 10, step: 0.1, value: P.pj, fmt: (v) => v.toFixed(1) + ' pJ/bit', onInput: (v) => { P.pj = v; upd(); } });
    const st2 = NB.stats(b, [{ key: 'pw', label: 'I/O 전력' }, { key: 'mm', label: '필요한 가장자리 길이' }]);
    function upd() {
      const lanes = (1000 / P.pitch) * P.rows * P.frac;
      const den = lanes * P.rate / 8; // GB/s per mm
      st.lanes.set(lanes.toFixed(0));
      st.den.set(den >= 1000 ? (den / 1000).toFixed(2) : den.toFixed(0), den >= 1000 ? 'TB/s/mm' : 'GB/s/mm');
      const e10 = den * 10;
      st.edge.set(e10 >= 1000 ? (e10 / 1000).toFixed(1) : e10.toFixed(0), e10 >= 1000 ? 'TB/s' : 'GB/s');
      const pw = P.need * 1e12 * 8 * P.pj * 1e-12;
      st2.pw.set(pw.toFixed(0), 'W', pw > 100 ? 'bad' : 'good');
      const mm = P.need * 1000 / den;
      st2.mm.set(mm >= 100 ? mm.toFixed(0) : mm.toFixed(1), 'mm', mm > 40 ? 'bad' : 'good');
      draw();
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const L = w - 20, sc = L / 1000; // px per µm over 1 mm
      const depth = P.rows * P.pitch * sc;
      ctx.fillStyle = NB.css('--surface-2'); ctx.fillRect(10, 20, L, Math.min(h - 50, Math.max(depth + 10, 30)));
      ctx.strokeStyle = NB.css('--node-stroke'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(10 + L, 20); ctx.stroke();
      ctx.fillStyle = NB.css('--text-mute'); ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('← 다이 가장자리 (1 mm) →', 10, 16);
      const perRow = Math.floor(1000 / P.pitch);
      const r = Math.max(0.7, Math.min(6, P.pitch * sc * 0.32));
      const maxRowsDraw = Math.min(P.rows, Math.floor((h - 60) / Math.max(1, P.pitch * sc)));
      let k = 0;
      for (let row = 0; row < maxRowsDraw; row++) {
        for (let c = 0; c < perRow; c++) {
          const x = 10 + (c + 0.5) * P.pitch * sc, y = 20 + (row + 0.5) * P.pitch * sc + 4;
          const isData = ((c * 7 + row * 3) % 100) / 100 < P.frac;
          ctx.fillStyle = isData ? NB.css('--accent') : NB.css('--border-strong');
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          k++;
        }
      }
      if (maxRowsDraw < P.rows) { ctx.fillStyle = NB.css('--text-mute'); ctx.textBaseline = 'top'; ctx.fillText('… 총 ' + P.rows + '열 중 ' + maxRowsDraw + '열 표시', 10, h - 22); }
      ctx.textBaseline = 'top'; ctx.fillStyle = NB.css('--accent'); ctx.textAlign = 'right'; ctx.fillText('● 데이터', w - 128, h - 22); ctx.fillStyle = NB.css('--text-mute'); ctx.fillText('● 클록·전원·접지 등', w - 8, h - 22);
    }
    cv.draw = draw;
    upd();
  })();
});
