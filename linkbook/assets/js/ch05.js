/* LinkBook Chapter 5 — Signaling & line coding */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const L = NB.link, C = NB.codes;
  const TAUS = 96;
  const tauCache = {};
  function chFor(loss, beta, os) {
    os = os || 32;
    const k = loss.toFixed(2) + '|' + beta.toFixed(2) + '|' + os;
    if (!(k in tauCache)) tauCache[k] = L.tauForLoss(loss, beta, TAUS, os);
    return { tau: tauCache[k], beta, tauS: TAUS };
  }

  /* ======================================================
     5.1 Differential vs single-ended
     ====================================================== */
  (function () {
    const W = NB.widget('w-diff'); if (!W) return;
    const P = { cm: 0.3, f: 0.06, rn: 0.02, skew: 0, seed: 2 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '공통 모드 노이즈 진폭', min: 0, max: 0.6, step: 0.02, value: P.cm, fmt: (v) => v.toFixed(2) + ' V', onInput: (v) => { P.cm = v; draw(); } });
    NB.slider(ctr, { label: '노이즈 주파수', min: 0.01, max: 0.5, step: 0.01, value: P.f, fmt: (v) => v.toFixed(2) + ' × f_bit', onInput: (v) => { P.f = v; draw(); } });
    NB.slider(ctr, { label: '짝선 간 스큐', min: 0, max: 0.5, step: 0.02, value: P.skew, fmt: (v) => v.toFixed(2) + ' UI', onInput: (v) => { P.skew = v; draw(); } });
    NB.button(ctr, '🎲 다른 데이터', () => { P.seed++; draw(); });
    const cv = NB.canvas(W.body, { height: 420 });
    const st = NB.stats(W.body, [{ key: 'se', label: '단일 종단 오류' }, { key: 'df', label: '차동 오류' }, { key: 'cmr', label: '차동 출력의 잔여 노이즈 (최대)' }]);
    function draw() {
      const OS = 24, nb = 40, n = nb * OS, rnd = NB.rng(P.seed * 13);
      const bits = []; for (let i = 0; i < nb; i++) bits.push(rnd() < 0.5 ? 1 : 0);
      const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = bits[Math.floor(i / OS)] ? 1 : -1;
      const df = L.lp(d, 2.5);
      const sk = Math.round(P.skew * OS);
      const cmAt = (i) => P.cm * Math.sin(2 * Math.PI * P.f * i / OS + 0.7) + P.cm * 0.35 * Math.sin(2 * Math.PI * P.f * 2.7 * i / OS);
      const Pw = [], Nw = [], SE = [], DF = [];
      const noiseP = [], noiseN = [];
      for (let i = 0; i < n; i++) { noiseP.push(L.gauss(rnd) * P.rn); noiseN.push(L.gauss(rnd) * P.rn); }
      for (let i = 0; i < n; i++) {
        const vp = 0.5 + 0.25 * df[i] + cmAt(i) + noiseP[i];
        const j = Math.max(0, i - sk);
        const vn = 0.5 - 0.25 * df[j] + cmAt(j) + noiseN[i];
        Pw.push(vp); Nw.push(vn); DF.push(vp - vn); SE.push(vp - 0.5);
      }
      let eSE = 0, eDF = 0;
      const sampleIdx = []; for (let k = 2; k < nb; k++) sampleIdx.push(k * OS + Math.round(OS * 0.55));
      sampleIdx.forEach((i, k) => {
        const b = bits[k + 2];
        if ((SE[i] > 0) !== !!b) eSE++;
        if ((DF[i] > 0) !== !!b) eDF++;
      });
      const { ctx, w } = cv;
      ctx.clearRect(0, 0, w, cv.h);
      const rows = [
        { y: 0, h: 150, s: [[Pw, '--c1'], [Nw, '--c3']], y0: -0.4, y1: 1.4, ticks: [0, 0.5, 1], lbl: 'P · N 선 전압 (V)' },
        { y: 152, h: 130, s: [[SE, '--c5']], y0: -1.1, y1: 1.1, ticks: [-0.5, 0, 0.5], lbl: '단일 종단: V_P − 0.5 V', samp: SE },
        { y: 284, h: 130, s: [[DF, '--c2']], y0: -1.1, y1: 1.1, ticks: [-0.5, 0, 0.5], lbl: '차동: V_P − V_N', samp: DF }
      ];
      rows.forEach((r) => {
        ctx.save(); ctx.translate(0, r.y);
        const pl = L.plotWave(ctx, { w, h: r.h, x0: 0, x1: nb, y0: r.y0, y1: r.y1, yTicks: r.ticks, xTicks: [], keep: true, series: r.s.map(([arr, c]) => ({ data: arr, color: NB.css(c), width: 1.8, os: OS })) });
        ctx.fillStyle = NB.css('--text-soft'); ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(r.lbl, 46, 2);
        if (r.samp) {
          ctx.strokeStyle = NB.css('--text-mute'); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pl.X(0), pl.Y(0)); ctx.lineTo(pl.X(nb), pl.Y(0)); ctx.stroke(); ctx.setLineDash([]);
          sampleIdx.forEach((i, k) => {
            const ok = (r.samp[i] > 0) === !!bits[k + 2];
            ctx.fillStyle = ok ? NB.css('--c2') : NB.css('--danger');
            ctx.beginPath(); ctx.arc(pl.X(i / OS), pl.Y(Math.max(r.y0, Math.min(r.y1, r.samp[i]))), ok ? 2.5 : 4.5, 0, 7); ctx.fill();
          });
        }
        ctx.restore();
      });
      st.se.set(eSE + ' / ' + sampleIdx.length, '', eSE ? 'bad' : 'good');
      st.df.set(eDF + ' / ' + sampleIdx.length, '', eDF ? 'bad' : 'good');
      let rr = 0; for (let i = sk + 1; i < n; i++) rr = Math.max(rr, Math.abs(cmAt(i) - cmAt(i - sk)));
      st.cmr.set(rr.toFixed(3), 'V', rr > 0.1 ? 'bad' : '');
    }
    cv.draw = draw;
    draw();
  })();

  /* ======================================================
     5.2 NRZ vs PAM4
     ====================================================== */
  (function () {
    const W = NB.widget('w-pam4'); if (!W) return;
    const P = { loss: 16, noise: 0.01, beta: 0.1 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '채널 손실 (NRZ 나이퀴스트 기준)', min: 2, max: 26, step: 1, value: P.loss, fmt: (v) => v + ' dB', onInput: (v) => { P.loss = v; sched(); } });
    NB.slider(ctr, { label: '노이즈 σ', min: 0, max: 0.05, step: 0.002, value: P.noise, fmt: (v) => v.toFixed(3), onInput: (v) => { P.noise = v; sched(); } });
    const lay = el('div', { class: 'split' }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    a.append(el('div', { class: 'small', style: { fontWeight: 700, color: 'var(--c1)' } }, 'NRZ (PAM2)'));
    const cvN = NB.canvas(a, { height: 250 });
    const stN = NB.stats(a, [{ key: 'l', label: '나이퀴스트 손실' }, { key: 'h', label: '아이 높이' }]);
    b.append(el('div', { class: 'small', style: { fontWeight: 700, color: 'var(--c3)' } }, 'PAM4 (심볼 레이트 절반)'));
    const cvP = NB.canvas(b, { height: 250 });
    const stP = NB.stats(b, [{ key: 'l', label: '나이퀴스트 손실' }, { key: 'h', label: '아이 높이 (최소)' }]);
    const cbox = el('div', { style: { marginTop: '12px' } }); W.body.append(cbox);
    const chart = NB.chart(cbox, { height: 220, xLabel: '채널 손실 @ NRZ 나이퀴스트 (dB)', yLabel: '아이 높이', xMin: 2, xMax: 26, yMin: 0 });
    let timer = 0, RN, RP, MN, MP;
    const sched = () => { clearTimeout(timer); timer = setTimeout(compute, 30); };
    function pair(loss, noise, nb) {
      const ch = chFor(loss, P.beta, 32);
      const rn = L.run({ os: 32, nbits: nb, ch, noise, seed: 4 });
      const rp = L.run({ os: 64, nbits: Math.round(nb / 2), pam: 4, ch, noise, seed: 4 });
      return [rn, rp, ch];
    }
    function compute() {
      let ch;
      [RN, RP, ch] = pair(P.loss, P.noise, 900);
      MN = L.eyeMetrics(RN); MP = L.eyeMetrics(RP);
      stN.l.set(L.nyqLoss(ch, 32).toFixed(1), 'dB'); stN.h.set(MN.height.toFixed(3), '', MN.height >= MP.height ? 'good' : '');
      stP.l.set(L.nyqLoss(ch, 64).toFixed(1), 'dB'); stP.h.set(MP.height.toFixed(3), '', MP.height > MN.height ? 'good' : '');
      const sN = [], sP = [];
      for (let l = 2; l <= 26; l += 2) { const [rn, rp] = pair(l, P.noise, 400); sN.push([l, L.eyeMetrics(rn).height]); sP.push([l, L.eyeMetrics(rp).height]); }
      chart.set({ series: [{ name: 'NRZ', color: NB.css('--c1'), points: sN, marker: true }, { name: 'PAM4', color: NB.css('--c3'), points: sP, marker: true }], vlines: [{ x: P.loss, color: NB.css('--text-mute') }] });
      draw();
    }
    function draw() {
      if (!RN) return;
      L.drawEye(cvN.ctx, RN, { w: cvN.w, h: cvN.h, metrics: MN, color: NB.css('--c1'), yRange: 1.3 });
      L.drawEye(cvP.ctx, RP, { w: cvP.w, h: cvP.h, metrics: MP, color: NB.css('--c3'), yRange: 1.3 });
    }
    cvN.draw = draw; cvP.draw = draw;
    compute();
  })();

  /* ======================================================
     5.3 8b/10b encoder
     ====================================================== */
  (function () {
    const W = NB.widget('w-8b10b'); if (!W) return;
    const P = { mode: 'text', text: 'Hi NoC!', hex: '00 00 00 FF FF 00 B5', comma: true };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.seg(ctr, { label: '입력 형식', value: P.mode, options: [{ value: 'text', label: 'ASCII 문자' }, { value: 'hex', label: '16진 바이트' }], onChange: (v) => { P.mode = v; inp.value = v === 'text' ? P.text : P.hex; upd(); } });
    const inp = el('input', { class: 'inp', value: P.text, maxlength: 24, style: { maxWidth: '320px' } });
    const wrap = el('div', { class: 'ctrl', style: { minWidth: '240px' } }, el('label', null, '입력 (최대 24바이트)'), inp);
    ctr.append(wrap);
    inp.addEventListener('input', () => { if (P.mode === 'text') P.text = inp.value; else P.hex = inp.value; upd(); });
    NB.checkbox(ctr, { label: 'K28.5 쉼표 먼저 보내기', value: P.comma, onChange: (v) => { P.comma = v; upd(); } });
    const pr = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(pr);
    pr.append(el('span', { class: 'small muted' }, '예시:'));
    [['0이 가득 (00×8)', '00 00 00 00 00 00 00 00'], ['1이 가득 (FF×8)', 'FF FF FF FF FF FF FF FF'], ['D21.5 (B5)', 'B5 B5 B5 B5'], ['혼합', '00 FF 0F F0 AA 55']].forEach(([n, h]) => NB.button(pr, n, () => { P.mode = 'hex'; P.hex = h; inp.value = h; upd(); }));
    const syms = el('div', { class: 'sym-row' }); W.body.append(syms);
    const cv = NB.canvas(W.body, { height: 150 });
    const cbox = el('div', { style: { marginTop: '8px' } }); W.body.append(cbox);
    const chart = NB.chart(cbox, { height: 180, xLabel: '비트', yLabel: '누적 (1의 수 − 0의 수)' });
    const st = NB.stats(W.body, [{ key: 'rr', label: '최대 런 (원본)' }, { key: 'er', label: '최대 런 (8b/10b)' }, { key: 'rd', label: '누적 불균형 범위 (원본)' }, { key: 'ed', label: '누적 불균형 범위 (8b/10b)' }, { key: 'eff', label: '효율' }]);
    function bytesIn() {
      if (P.mode === 'text') return Array.from(new TextEncoder().encode(P.text)).slice(0, 24);
      return P.hex.split(/[^0-9a-fA-F]+/).filter(Boolean).map((h) => parseInt(h, 16) & 255).slice(0, 24);
    }
    function upd() {
      const bytes = bytesIn();
      let rd = -1;
      const out = [];
      if (P.comma) { const r = C.enc8b10b(0, rd, true); out.push({ b: null, ...r, rdIn: rd }); rd = r.rdOut; }
      bytes.forEach((b) => { const r = C.enc8b10b(b, rd); out.push({ b, ...r, rdIn: rd }); rd = r.rdOut; });
      syms.innerHTML = '';
      out.forEach((o) => {
        const ch = o.b == null ? 'comma' : (o.b >= 32 && o.b < 127 ? "'" + String.fromCharCode(o.b) + "'" : '');
        const bits = o.code.split('').map((c, i) => '<span class="' + (c === '1' ? 'b1' : 'b0') + '">' + c + '</span>' + (i === 5 ? ' ' : '')).join('');
        syms.append(el('div', { class: 'sym', html: '<b>' + (o.b == null ? 'K28.5' : '0x' + o.b.toString(16).toUpperCase().padStart(2, '0')) + '</b> <span class="muted">' + ch + '</span><br>' + (o.b == null ? '' : o.name + '<br>') + '<span class="bits">' + bits + '</span><br><span class="muted">RD ' + (o.rdIn < 0 ? '−' : '+') + ' → ' + (o.rdOut < 0 ? '−' : '+') + '</span>' }));
      });
      const raw = []; bytes.forEach((b) => { for (let i = 0; i < 8; i++) raw.push((b >> i) & 1); });
      const enc = []; out.forEach((o) => o.code.split('').forEach((c) => enc.push(c === '1' ? 1 : 0)));
      // waveforms
      const { ctx, w } = cv;
      ctx.clearRect(0, 0, w, cv.h);
      const drawBits = (arr, y0, label, col) => {
        const n = Math.max(arr.length, 1), x0 = 90, cw = (w - x0 - 8) / Math.max(enc.length, raw.length, 1);
        ctx.fillStyle = NB.css('--text-soft'); ctx.font = 'bold 12px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, y0 + 20);
        // run highlighting
        let start = 0;
        for (let i = 1; i <= arr.length; i++) {
          if (i === arr.length || arr[i] !== arr[start]) {
            const len = i - start;
            if (len >= 6) { ctx.fillStyle = NB.alpha(NB.css('--danger'), 0.15); ctx.fillRect(x0 + start * cw, y0, len * cw, 40); }
            start = i;
          }
        }
        ctx.strokeStyle = NB.css(col); ctx.lineWidth = 2; ctx.beginPath();
        arr.forEach((b, i) => { const y = b ? y0 + 6 : y0 + 34; if (i === 0) ctx.moveTo(x0, y); else ctx.lineTo(x0 + i * cw, y); ctx.lineTo(x0 + (i + 1) * cw, y); });
        ctx.stroke();
      };
      drawBits(raw, 10, '원본 (8b)', '--c3');
      drawBits(enc, 90, '8b/10b', '--accent');
      ctx.fillStyle = NB.css('--danger'); ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('빨간 배경: 같은 비트 6개 이상 연속', w - 8, 56);
      const cum = (arr) => { let s = 0; return arr.map((b, i) => [i, (s += b ? 1 : -1)]); };
      const cr = cum(raw), ce = cum(enc);
      chart.set({ series: [{ name: '원본', color: NB.css('--c3'), points: cr }, { name: '8b/10b', color: NB.css('--accent'), points: ce }] });
      const range = (c) => { const v = c.map((x) => x[1]); return v.length ? Math.min(0, ...v) + ' ~ ' + Math.max(0, ...v) : '—'; };
      st.rr.set(C.maxRun(raw), '', C.maxRun(raw) > 5 ? 'bad' : '');
      st.er.set(C.maxRun(enc), '', 'good');
      st.rd.set(range(cr)); st.ed.set(range(ce));
      st.eff.set('80%');
    }
    cv.draw = upd;
    upd();
  })();

  /* ======================================================
     5.4 Scrambler
     ====================================================== */
  (function () {
    const W = NB.widget('w-scr'); if (!W) return;
    const PAT = {
      zeros: ['모두 0', () => 0], ones: ['모두 1', () => 1], alt: ['1010…', (i) => i & 1],
      blk: ['11110000…', (i) => ((i >> 2) & 1) ^ 1], byte: ['바이트 0x47 반복', (i) => (0x47 >> (i % 8)) & 1],
      idle: ['짧은 프레임 + 유휴(0)', (i) => (i % 128 < 24 ? (0xA5 >> (i % 8)) & 1 : 0)]
    };
    const P = { pat: 'zeros', on: true };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.select(ctr, { label: '입력 데이터', value: P.pat, options: Object.keys(PAT).map((k) => ({ value: k, label: PAT[k][0] })), onChange: (v) => { P.pat = v; upd(); } });
    NB.checkbox(ctr, { label: '스크램블러 켜기 (PRBS7)', value: P.on, onChange: (v) => { P.on = v; upd(); } });
    const lay = el('div', { class: 'split', style: { alignItems: 'start' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const bm = NB.canvas(a, { height: (w) => Math.min(300, w * 0.5 + 20) });
    const st = NB.stats(a, [{ key: 'run', label: '최대 런 길이' }, { key: 'tr', label: '전이 비율' }, { key: 'one', label: '1의 비율' }]);
    const spec = NB.chart(b, { height: 190, xLabel: '주파수 / 비트레이트', yLabel: 'dB', xMin: 0, xMax: 0.5, yMin: -40, yMax: 10, xFmt: (x) => x.toFixed(2) });
    const hist = NB.canvas(b, { height: 120 });
    let bits = [];
    function upd() {
      const N = 512, f = PAT[P.pat][1];
      const raw = []; for (let i = 0; i < N; i++) raw.push(f(i));
      bits = P.on ? C.scramble(raw, 7, 0x5d) : raw;
      drawBM();
      // spectrum (averaged periodogram over 4 segments)
      const pts = [];
      for (let k = 1; k <= 64; k++) {
        const fr = k / 128; let pw = 0;
        for (let s = 0; s < 4; s++) { let re = 0, im = 0; for (let i = 0; i < 128; i++) { const v = bits[s * 128 + i] ? 1 : -1; re += v * Math.cos(2 * Math.PI * fr * i); im -= v * Math.sin(2 * Math.PI * fr * i); } pw += (re * re + im * im) / 128; }
        pts.push([fr, 10 * Math.log10(pw / 4 + 1e-4)]);
      }
      spec.set({ series: [{ name: '전력 스펙트럼', color: NB.css('--accent'), points: pts }] });
      drawHist();
      st.run.set(C.maxRun(bits), '', C.maxRun(bits) > 10 ? 'bad' : 'good');
      let tr = 0; for (let i = 1; i < N; i++) if (bits[i] !== bits[i - 1]) tr++;
      st.tr.set((100 * tr / (N - 1)).toFixed(0) + '%', '', tr / N < 0.2 ? 'bad' : 'good');
      st.one.set((100 * bits.filter(Boolean).length / N).toFixed(0) + '%');
    }
    function drawBM() {
      const { ctx, w, h } = bm;
      ctx.clearRect(0, 0, w, h);
      const cols = 32, rows = 16, cs = Math.min((w - 4) / cols, (h - 4) / rows);
      const ox = (w - cs * cols) / 2;
      for (let i = 0; i < bits.length; i++) {
        const x = ox + (i % cols) * cs, y = 2 + Math.floor(i / cols) * cs;
        ctx.fillStyle = bits[i] ? NB.css('--accent') : NB.css('--surface-2');
        ctx.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      }
    }
    function drawHist() {
      const { ctx, w, h } = hist;
      ctx.clearRect(0, 0, w, h);
      const runs = new Array(13).fill(0);
      let r = 1; for (let i = 1; i <= bits.length; i++) { if (i < bits.length && bits[i] === bits[i - 1]) r++; else { runs[Math.min(12, r)]++; r = 1; } }
      const mx = Math.max(1, ...runs), bw = (w - 50) / 12;
      ctx.fillStyle = NB.css('--text-mute'); ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let k = 1; k <= 12; k++) {
        const x = 40 + (k - 1) * bw, bh = (h - 34) * runs[k] / mx;
        ctx.fillStyle = k >= 6 ? NB.css('--c3') : NB.css('--accent');
        ctx.fillRect(x + 2, h - 18 - bh, bw - 4, bh);
        ctx.fillStyle = NB.css('--text-mute'); ctx.fillText(k === 12 ? '12+' : k, x + bw / 2, h - 15);
      }
      ctx.textAlign = 'left'; ctx.fillText('런 길이 분포', 4, 2);
    }
    bm.draw = drawBM; hist.draw = drawHist;
    upd();
  })();
});
