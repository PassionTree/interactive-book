/* LinkBook Chapter 7 — Link layer */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const L = NB.link;
  const S = NB.svgEl;

  /* ======================================================
     7.1 BER calculator
     ====================================================== */
  (function () {
    const W = NB.widget('w-ber'); if (!W) return;
    const P = { A: 60, sig: 9, rate: 32 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '아이 절반 높이 A', min: 10, max: 200, value: P.A, fmt: (v) => v + ' mV', onInput: (v) => { P.A = v; upd(); } });
    NB.slider(ctr, { label: '노이즈 σ (rms)', min: 1, max: 30, step: 0.5, value: P.sig, fmt: (v) => v + ' mV', onInput: (v) => { P.sig = v; upd(); } });
    NB.slider(ctr, { label: '비트레이트', min: 1, max: 224, value: P.rate, fmt: (v) => v + ' Gb/s', onInput: (v) => { P.rate = v; upd(); } });
    const box = el('div'); W.body.append(box);
    const chart = NB.chart(box, { height: 260, logY: true, xLabel: 'SNR = 20·log₁₀(A/σ) (dB)', yLabel: 'BER', xMin: 6, xMax: 30, yMin: 1e-18, yMax: 1, yFmt: (v) => L.fmtBER(v), xFmt: (x) => x.toFixed(1) + ' dB' });
    const st = NB.stats(W.body, [{ key: 'snr', label: 'SNR' }, { key: 'nrz', label: 'BER (NRZ)' }, { key: 'pam', label: 'BER (PAM4)' }, { key: 'int', label: '오류 간격 (NRZ)' }]);
    const berN = (snr) => L.Q(Math.pow(10, snr / 20));
    const berP = (snr) => 0.75 * L.Q(Math.pow(10, snr / 20) / 3);
    const fmtT = (s) => (!isFinite(s) ? '∞' : s < 1e-6 ? (s * 1e9).toPrecision(2) + ' ns' : s < 1e-3 ? (s * 1e6).toPrecision(2) + ' µs' : s < 1 ? (s * 1e3).toPrecision(2) + ' ms' : s < 120 ? s.toPrecision(2) + ' 초' : s < 7200 ? (s / 60).toPrecision(2) + ' 분' : s < 172800 ? (s / 3600).toPrecision(2) + ' 시간' : s < 3.15e7 * 2 ? (s / 86400).toPrecision(2) + ' 일' : (s / 3.15e7).toPrecision(2) + ' 년');
    function upd() {
      const snr = 20 * Math.log10(P.A / P.sig);
      const bn = berN(snr), bp = berP(snr);
      const pn = [], pp = [];
      for (let x = 6; x <= 30.01; x += 0.25) { pn.push([x, Math.max(1e-40, berN(x))]); pp.push([x, Math.max(1e-40, berP(x))]); }
      chart.set({ series: [
        { name: 'NRZ', color: NB.css('--c1'), points: pn }, { name: 'PAM4', color: NB.css('--c3'), points: pp },
        { name: '현재 (NRZ)', color: NB.css('--c1'), points: [[snr, Math.max(1e-40, bn)]], marker: true, width: 0, noLegend: true },
        { name: '현재 (PAM4)', color: NB.css('--c3'), points: [[snr, Math.max(1e-40, bp)]], marker: true, width: 0, noLegend: true },
        { name: '1e-12', color: NB.css('--text-mute'), points: [[6, 1e-12], [30, 1e-12]], dash: [4, 4], width: 1, noLegend: true }
      ] });
      st.snr.set(snr.toFixed(1), 'dB');
      st.nrz.set(L.fmtBER(bn), '', bn < 1e-12 ? 'good' : 'bad');
      st.pam.set(L.fmtBER(bp), '', bp < 1e-12 ? 'good' : 'bad');
      st.int.set(fmtT(1 / (bn * P.rate * 1e9)));
    }
    upd();
  })();

  /* ======================================================
     7.2 CRC-8
     ====================================================== */
  const POLY = 0x07;
  function crcBits(bits) { let r = 0; const trace = []; for (const b of bits) { const fb = ((r >> 7) & 1) ^ b; r = (r << 1) & 0xff; if (fb) r ^= POLY; trace.push(r); } return { r, trace }; }
  (function () {
    const W = NB.widget('w-crc'); if (!W) return;
    const P = { msg: '4C 69 6E 6B', step: 0 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const inp = el('input', { class: 'inp', value: P.msg, style: { maxWidth: '260px' } });
    ctr.append(el('div', { class: 'ctrl', style: { minWidth: '220px' } }, el('label', null, '메시지 (16진, 최대 4바이트)'), inp));
    const br = el('div', { class: 'btn-row' }); ctr.append(br);
    NB.button(br, '한 비트 ▶', () => { P.step = Math.min(msgBits.length, P.step + 1); drawReg(); });
    NB.button(br, '끝까지 ⏭', () => { P.step = msgBits.length; drawReg(); });
    NB.button(br, '↺', () => { P.step = 0; drawReg(); });
    const regSvg = S('svg', { class: 'vis', viewBox: '0 0 700 150', style: 'width:100%;max-width:760px;height:auto' });
    W.body.append(regSvg);
    const regInfo = el('div', { class: 'small mono', style: { margin: '2px 0 12px', color: 'var(--text-soft)' } }); W.body.append(regInfo);
    W.body.append(el('div', { class: 'small', style: { fontWeight: 700, marginBottom: '6px' } }, '전송 프레임 = 메시지 + CRC (비트를 클릭해 오류 주입)'));
    const frame = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '8px' } }); W.body.append(frame);
    const res = el('div', { style: { margin: '6px 0 12px', fontSize: '15px' } }); W.body.append(res);
    const mc = el('div', { class: 'btn-row' }); W.body.append(mc);
    mc.append(el('span', { class: 'small muted' }, '몬테카를로 (20,000회): 무작위 오류 비트 수 k ='));
    const mcOut = el('div', { class: 'small mono', style: { marginTop: '8px' } });
    [1, 2, 3, 4, 5, 6, 8].forEach((k) => NB.button(mc, String(k), () => monte(k)));
    W.body.append(mcOut);
    let msgBits = [], errs = new Set();
    function parse() {
      const bytes = inp.value.split(/[^0-9a-fA-F]+/).filter(Boolean).map((h) => parseInt(h, 16) & 255).slice(0, 4);
      msgBits = []; bytes.forEach((b) => { for (let i = 7; i >= 0; i--) msgBits.push((b >> i) & 1); });
      P.step = Math.min(P.step, msgBits.length);
      errs = new Set();
    }
    inp.addEventListener('input', () => { parse(); P.step = msgBits.length; drawReg(); drawFrame(); });
    function drawReg() {
      regSvg.innerHTML = '';
      const { trace } = crcBits(msgBits);
      const r = P.step ? trace[P.step - 1] : 0;
      const prev = P.step > 1 ? trace[P.step - 2] : 0;
      const acc = NB.css('--accent'), text = NB.css('--text'), mute = NB.css('--text-mute'), stroke = NB.css('--border-strong'), xorC = NB.css('--c3');
      const cell = (i) => 620 - i * 66; // r0 at right? draw r7 left .. r0 right
      // registers r7..r0 left to right
      for (let i = 7; i >= 0; i--) {
        const x = 60 + (7 - i) * 70, bit = (r >> i) & 1, changed = ((r ^ prev) >> i) & 1 && P.step > 0;
        S('rect', { x, y: 50, width: 46, height: 40, rx: 6, fill: bit ? NB.alpha(acc, 0.85) : NB.css('--surface'), stroke: changed ? xorC : stroke, 'stroke-width': changed ? 3 : 1.5 }, regSvg);
        const t = S('text', { x: x + 23, y: 77, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: bit ? '#fff' : text, 'font-family': 'var(--mono)' }, regSvg); t.textContent = bit;
        const l = S('text', { x: x + 23, y: 108, 'text-anchor': 'middle', 'font-size': 11, fill: mute }, regSvg); l.textContent = 'r' + i;
        if (i > 0) S('path', { d: 'M' + (x + 46) + ' 70 H' + (x + 70), stroke, 'stroke-width': 1.5 }, regSvg);
        if (i <= 2) { // XOR feeding into r_i from feedback
          const xx = x + 23;
          S('circle', { cx: xx, cy: 28, r: 9, fill: NB.css('--surface'), stroke: xorC, 'stroke-width': 1.5 }, regSvg);
          const tt = S('text', { x: xx, y: 33, 'text-anchor': 'middle', 'font-size': 14, fill: xorC, 'font-weight': 700 }, regSvg); tt.textContent = '⊕';
          S('path', { d: 'M' + xx + ' 37 V50', stroke: xorC, 'stroke-width': 1.5 }, regSvg);
        }
      }
      // feedback line from r7 output
      S('path', { d: 'M60 70 H30 V14 H' + (60 + 7 * 70 + 23) + ' V19', stroke: xorC, 'stroke-width': 1.5, fill: 'none', 'stroke-dasharray': '4 3' }, regSvg);
      const inBit = P.step < msgBits.length ? msgBits[P.step] : '—';
      const t1 = S('text', { x: 6, y: 135, 'font-size': 12, fill: text }, regSvg); t1.textContent = '다음 입력 비트: ' + inBit + '   (피드백 = r7 ⊕ 입력, 다항식 0x07 → r0, r1, r2에 XOR)';
      regInfo.textContent = '처리한 비트 ' + P.step + ' / ' + msgBits.length + (P.step === msgBits.length ? '   →   CRC = 0x' + r.toString(16).toUpperCase().padStart(2, '0') : '');
      drawFrame();
    }
    function drawFrame() {
      const { r: crc } = crcBits(msgBits);
      const crcB = []; for (let i = 7; i >= 0; i--) crcB.push((crc >> i) & 1);
      const all = msgBits.concat(crcB);
      frame.innerHTML = '';
      all.forEach((b, i) => {
        const e = errs.has(i), v = b ^ (e ? 1 : 0);
        const c = el('button', { type: 'button', class: 'cell-btn' + (e ? ' bad' : v ? ' on' : ''), style: { width: '22px', height: '26px', fontSize: '12px', opacity: i >= msgBits.length ? 1 : 0.95, outline: i >= msgBits.length ? '2px solid var(--c7)' : 'none', outlineOffset: '-2px' }, title: i >= msgBits.length ? 'CRC 비트' : '메시지 비트 ' + i }, String(v));
        c.addEventListener('click', () => { if (errs.has(i)) errs.delete(i); else errs.add(i); drawFrame(); });
        frame.append(c);
      });
      const rx = all.map((b, i) => b ^ (errs.has(i) ? 1 : 0));
      const rem = crcBits(rx).r;
      res.innerHTML = errs.size === 0
        ? '<span class="badge ok">수신 OK</span> 나머지 = 0x00 (오류 없음). 노란 테두리 8비트가 CRC입니다.'
        : rem ? '<span class="badge ok">오류 검출 ✓</span> ' + errs.size + '비트 오류 → 나머지 = 0x' + rem.toString(16).toUpperCase().padStart(2, '0') + ' ≠ 0 → NAK, 재전송 요청'
          : '<span class="badge bad">검출 실패 ✗</span> ' + errs.size + '비트 오류인데 나머지가 0입니다! 오류 패턴이 생성 다항식의 배수가 되었습니다.';
    }
    function monte(k) {
      const { r: crc } = crcBits(msgBits);
      const crcB = []; for (let i = 7; i >= 0; i--) crcB.push((crc >> i) & 1);
      const all = msgBits.concat(crcB), n = all.length;
      if (k > n) return;
      let miss = 0;
      const rnd = NB.rng(k * 31 + n);
      for (let t = 0; t < 20000; t++) {
        const rx = all.slice(); const used = new Set();
        while (used.size < k) used.add((rnd() * n) | 0);
        used.forEach((i) => { rx[i] ^= 1; });
        if (crcBits(rx).r === 0) miss++;
      }
      mcOut.innerHTML = 'k = ' + k + ' 비트 오류: 미검출 ' + miss + ' / 20000 = <b>' + (100 * miss / 20000).toFixed(3) + '%</b>' + (k % 2 ? ' (홀수 오류는 (x+1) 인수 덕분에 항상 검출)' : k === 2 ? ' (짧은 프레임에서 2비트 오류는 모두 검출)' : ' (무작위 가정 시 약 2⁻⁸ = 0.39%와 비교)');
    }
    parse(); P.step = msgBits.length; drawReg();
    NB.onTheme(drawReg);
  })();

  /* ======================================================
     7.3 Hamming(7,4)
     ====================================================== */
  (function () {
    const W = NB.widget('w-ham'); if (!W) return;
    let data = [1, 0, 1, 1], flips = new Set();
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', alignItems: 'start' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    left.append(el('div', { class: 'small', style: { fontWeight: 700, marginBottom: '6px' } }, '① 보낼 데이터 d₁ d₂ d₃ d₄ (클릭)'));
    const dRow = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '14px' } }); left.append(dRow);
    left.append(el('div', { class: 'small', style: { fontWeight: 700, marginBottom: '6px' } }, '② 수신 코드워드 (클릭해서 비트 오류 주입)'));
    const cRow = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 42px)', gap: '4px', marginBottom: '14px' } }); left.append(cRow);
    const out = el('div'); left.append(out);
    const svg = S('svg', { class: 'vis', viewBox: '0 0 400 360', style: 'width:100%;max-width:440px;height:auto' }); right.append(svg);
    const POS = ['p₁', 'p₂', 'd₁', 'p₄', 'd₂', 'd₃', 'd₄'];
    const COVER = { 1: [1, 3, 5, 7], 2: [2, 3, 6, 7], 4: [4, 5, 6, 7] };
    function encode(d) {
      const c = [0, 0, 0, 0, 0, 0, 0, 0]; // 1-indexed
      c[3] = d[0]; c[5] = d[1]; c[6] = d[2]; c[7] = d[3];
      c[1] = c[3] ^ c[5] ^ c[7]; c[2] = c[3] ^ c[6] ^ c[7]; c[4] = c[5] ^ c[6] ^ c[7];
      return c;
    }
    function draw() {
      const tx = encode(data);
      const rx = tx.slice(); flips.forEach((i) => { rx[i] ^= 1; });
      const s1 = COVER[1].reduce((a, i) => a ^ rx[i], 0), s2 = COVER[2].reduce((a, i) => a ^ rx[i], 0), s4 = COVER[4].reduce((a, i) => a ^ rx[i], 0);
      const syn = s4 * 4 + s2 * 2 + s1;
      const corr = rx.slice(); if (syn) corr[syn] ^= 1;
      const dec = [corr[3], corr[5], corr[6], corr[7]];
      const ok = dec.every((b, i) => b === data[i]);
      dRow.innerHTML = '';
      data.forEach((b, i) => { const c = el('button', { type: 'button', class: 'cell-btn' + (b ? ' on' : ''), style: { width: '42px', height: '38px' } }, String(b)); c.addEventListener('click', () => { data[i] ^= 1; flips.clear(); draw(); }); dRow.append(c); });
      cRow.innerHTML = '';
      for (let i = 1; i <= 7; i++) {
        const f = flips.has(i);
        const c = el('button', { type: 'button', class: 'cell-btn' + (f ? ' bad' : rx[i] ? ' on' : ''), style: { width: '42px', height: '42px', lineHeight: '1.1' }, html: rx[i] + '<br><span style="font-size:10px;opacity:.75">' + i + ':' + POS[i - 1] + '</span>' });
        c.addEventListener('click', () => { if (flips.has(i)) flips.delete(i); else flips.add(i); draw(); });
        cRow.append(c);
      }
      out.innerHTML = '<div class="mono small">신드롬 (s₄ s₂ s₁) = ' + s4 + s2 + s1 + '₂ = <b>' + syn + '</b>' + (syn ? ' → 비트 ' + syn + ' (' + POS[syn - 1] + ') 정정' : ' → 오류 없음') + '</div>' +
        '<div class="mono small" style="margin-top:4px">복원 데이터: ' + dec.join(' ') + '</div><div style="margin-top:8px">' +
        (flips.size === 0 ? '<span class="badge ok">정상</span>' : ok ? '<span class="badge ok">정정 성공 ✓</span> ' + flips.size + '비트 오류를 고쳤습니다.' : '<span class="badge bad">오정정 ✗</span> ' + flips.size + '비트 오류: 해밍(7,4)는 1비트만 고칠 수 있어, 엉뚱한 비트를 "고쳤습니다". (SECDED는 패리티 1비트를 더해 2비트 오류를 검출만 합니다.)') + '</div>';
      // Venn
      svg.innerHTML = '';
      const circ = { 1: [150, 140], 2: [250, 140], 4: [200, 225] }, R = 95;
      const cols = { 1: NB.css('--c1'), 2: NB.css('--c2'), 4: NB.css('--c4') };
      const bad = { 1: s1, 2: s2, 4: s4 };
      [1, 2, 4].forEach((k) => {
        const [x, y] = circ[k];
        S('circle', { cx: x, cy: y, r: R, fill: NB.alpha(bad[k] ? NB.css('--danger') : cols[k], bad[k] ? 0.16 : 0.08), stroke: bad[k] ? NB.css('--danger') : cols[k], 'stroke-width': bad[k] ? 3 : 2 }, svg);
      });
      const lbl = { 1: [70, 60], 2: [330, 60], 4: [200, 345] };
      [1, 2, 4].forEach((k) => { const t = S('text', { x: lbl[k][0], y: lbl[k][1], 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: bad[k] ? NB.css('--danger') : cols[k] }, svg); t.textContent = 'p' + k + ' 원 ' + (bad[k] ? '✗ 홀수' : '✓ 짝수'); });
      const place = { 1: [110, 110], 2: [290, 110], 4: [200, 285], 3: [200, 95], 5: [148, 205], 6: [252, 205], 7: [200, 170] };
      for (let i = 1; i <= 7; i++) {
        const [x, y] = place[i], f = flips.has(i), isSyn = syn === i;
        S('rect', { x: x - 22, y: y - 20, width: 44, height: 40, rx: 8, fill: f ? NB.css('--danger') : rx[i] ? NB.css('--accent') : NB.css('--surface'), stroke: isSyn ? NB.css('--c7') : NB.css('--border-strong'), 'stroke-width': isSyn ? 3.5 : 1.3 }, svg);
        const t = S('text', { x, y: y + 2, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: f || rx[i] ? '#fff' : NB.css('--text'), 'font-family': 'var(--mono)' }, svg); t.textContent = rx[i];
        const t2 = S('text', { x, y: y + 15, 'text-anchor': 'middle', 'font-size': 9.5, fill: f || rx[i] ? '#fff' : NB.css('--text-mute') }, svg); t2.textContent = POS[i - 1];
      }
    }
    NB.onTheme(draw);
    draw();
  })();

  /* ======================================================
     7.4 Go-Back-N retry
     ====================================================== */
  function GBN(p, D, Wn, seed) {
    const rnd = NB.rng(seed || 3);
    const G = { t: 0, base: 0, next: 0, maxSent: -1, expected: 0, nak: false, pk: [], ak: [], sent: 0, stalls: 0, replays: 0, timeouts: 0, lastProg: 0 };
    G.step = function () {
      const t = G.t;
      for (const q of G.pk) if (q.t0 + D === t) {
        if (q.bad) { q.fate = 'bad'; if (!G.nak) { G.nak = true; G.ak.push({ nak: true, n: G.expected, t0: t }); } }
        else if (q.seq === G.expected) { q.fate = 'ok'; G.expected++; G.nak = false; G.ak.push({ nak: false, n: q.seq, t0: t }); }
        else q.fate = 'drop';
      }
      for (const a of G.ak) if (a.t0 + D === t) {
        const b0 = G.base;
        if (a.nak) { G.base = Math.max(G.base, a.n); G.next = a.n; G.lastProg = t; } else G.base = Math.max(G.base, a.n + 1);
        if (G.base > b0) G.lastProg = t;
      }
      // replay timer: no acknowledgement progress for a full round trip → resend from the oldest unacked packet
      if (G.base < G.next && t - G.lastProg > 2 * D + 4) { G.next = G.base; G.lastProg = t; G.timeouts++; G.nak = false; }
      if (G.next < G.base) G.next = G.base;
      if (G.next < G.base + Wn) {
        const replay = G.next <= G.maxSent;
        if (replay) G.replays++;
        G.pk.push({ seq: G.next, t0: t, bad: rnd() < p, replay });
        G.maxSent = Math.max(G.maxSent, G.next);
        G.next++; G.sent++;
      } else G.stalls++;
      G.t++;
      if (G.pk.length > 400) G.pk.splice(0, G.pk.length - 400);
      if (G.ak.length > 400) G.ak.splice(0, G.ak.length - 400);
    };
    return G;
  }
  (function () {
    const W = NB.widget('w-retry'); if (!W) return;
    const P = { p: 0.05, D: 6, W: 32, speed: 4 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '패킷 오류율', min: 0, max: 0.3, step: 0.01, value: P.p, fmt: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { P.p = v; reset(); } });
    NB.slider(ctr, { label: '편도 지연', min: 1, max: 20, value: P.D, fmt: (v) => v + ' 패킷 시간', onInput: (v) => { P.D = v; reset(); } });
    NB.slider(ctr, { label: '재전송 버퍼 (윈도우)', min: 1, max: 64, value: P.W, fmt: (v) => v + ' 패킷', onInput: (v) => { P.W = v; reset(); } });
    NB.slider(ctr, { label: '속도', min: 1, max: 20, value: P.speed, fmt: (v) => v + ' 슬롯/초', onInput: (v) => { P.speed = v; } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', alignItems: 'start' } }); W.body.append(lay);
    const a = el('div'), b = el('div'); lay.append(a, b);
    const cv = NB.canvas(a, { height: 440 });
    const st = NB.stats(b, [{ key: 'eff', label: '효율 (전달/시간)' }, { key: 'th', label: '이론 근사' }, { key: 'rep', label: '재전송 패킷' }, { key: 'stall', label: '버퍼 가득 대기' }, { key: 'tmo', label: '재전송 타이머 만료' }]);
    const cb = el('div', { style: { marginTop: '10px' } }); b.append(cb);
    const chart = NB.chart(cb, { height: 220, xLabel: '패킷 오류율', yLabel: '효율', xMin: 0, xMax: 0.3, yMin: 0, yMax: 1.05, xFmt: (x) => (x * 100).toFixed(0) + '%' });
    let G, acc = 0;
    const theory = (p) => Math.min(1, P.W / (2 * P.D)) * (1 - p) / (1 + p * 2 * P.D);
    function reset() {
      G = GBN(P.p, P.D, P.W, 5); acc = 0;
      const sim = [], th = [];
      for (let p = 0; p <= 0.3001; p += 0.02) { const g = GBN(p, P.D, P.W, 9); for (let i = 0; i < 3000; i++) g.step(); sim.push([p, g.expected / g.t]); th.push([p, theory(p)]); }
      chart.set({ series: [{ name: '시뮬레이션', color: NB.css('--accent'), points: sim, marker: true }, { name: '근사식', color: NB.css('--text-mute'), points: th, dash: [4, 4], width: 1.5 }], vlines: [{ x: P.p, color: NB.css('--c3') }] });
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const xL = 70, xR = w - 70, top = 30, H = 34; // slots visible
      const tNow = G.t - 1 + acc;
      const Y = (t) => top + (t - (tNow - H)) / H * (h - top - 10);
      const mute = NB.css('--text-mute'), text = NB.css('--text');
      ctx.strokeStyle = NB.css('--node-stroke'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xL, top); ctx.lineTo(xL, h - 6); ctx.moveTo(xR, top); ctx.lineTo(xR, h - 6); ctx.stroke();
      ctx.fillStyle = text; ctx.font = 'bold 13px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('송신 (TX)', xL, 6); ctx.fillText('수신 (RX)', xR, 6);
      ctx.save(); ctx.beginPath(); ctx.rect(0, top, w, h - top); ctx.clip();
      for (const q of G.pk) {
        const t1 = q.t0 + P.D;
        if (t1 < tNow - H - 2 || q.t0 > tNow) continue;
        const prog = NB.clamp((tNow - q.t0) / P.D, 0, 1);
        const col = q.bad ? NB.css('--danger') : q.fate === 'drop' ? NB.css('--border-strong') : q.replay ? NB.css('--c4') : NB.css('--accent');
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        const x2 = NB.lerp(xL, xR, prog), y2 = Y(q.t0 + prog * P.D);
        ctx.beginPath(); ctx.moveTo(xL, Y(q.t0)); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x2, y2, 3, 0, 7); ctx.fill();
        ctx.fillStyle = mute; ctx.font = '10.5px ' + NB.css('--mono'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(q.seq + (q.replay ? 'ʳ' : ''), xL - 6, Y(q.t0));
        if (prog >= 1) { ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.fillText(q.fate === 'ok' ? '✓' + q.seq : q.fate === 'bad' ? '✗CRC' : '버림', xR + 6, Y(t1)); }
      }
      for (const a2 of G.ak) {
        if (a2.t0 + P.D < tNow - H - 2 || a2.t0 > tNow) continue;
        const prog = NB.clamp((tNow - a2.t0) / P.D, 0, 1);
        ctx.strokeStyle = a2.nak ? NB.css('--danger') : NB.alpha(NB.css('--c2'), 0.7); ctx.lineWidth = a2.nak ? 2 : 1;
        ctx.setLineDash(a2.nak ? [] : [3, 3]);
        ctx.beginPath(); ctx.moveTo(xR, Y(a2.t0)); ctx.lineTo(NB.lerp(xR, xL, prog), Y(a2.t0 + prog * P.D)); ctx.stroke(); ctx.setLineDash([]);
        if (a2.nak) { ctx.fillStyle = NB.css('--danger'); ctx.font = 'bold 11px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.fillText('NAK ' + a2.n, NB.lerp(xR, xL, prog * 0.5), Y(a2.t0 + prog * P.D * 0.5) - 8); }
      }
      ctx.restore();
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('시간 ↓   (ʳ = 재전송)', (xL + xR) / 2, 8);
      st.eff.set(G.t ? (100 * G.expected / G.t).toFixed(1) + '%' : '—', '', G.expected / Math.max(1, G.t) > 0.8 ? 'good' : 'bad');
      st.th.set((100 * theory(P.p)).toFixed(1) + '%');
      st.rep.set(G.replays); st.stall.set(G.stalls, '슬롯', G.stalls > G.t * 0.2 ? 'bad' : ''); st.tmo.set(G.timeouts);
    }
    reset();
    cv.draw = draw;
    NB.loop(cv.canvas, (dt) => { acc += dt * P.speed; while (acc >= 1) { acc -= 1; G.step(); } draw(); });
  })();
});
