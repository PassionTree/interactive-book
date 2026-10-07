/* LinkBook Chapter 1 — What is a link */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const L = NB.link;

  /* ======================================================
     1.1 Parallel bus skew
     ====================================================== */
  (function () {
    const W = NB.widget('w-skew'); if (!W) return;
    const P = { rate: 1, n: 8, sigma: 40, margin: 15 };
    const rates = []; for (let i = 0; i <= 30; i++) rates.push(+(0.1 * Math.pow(10, i / 15)).toPrecision(2));
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    NB.slider(ctr, { label: '선당 데이터 레이트', min: 0, max: 30, value: 6, fmt: (i) => rates[i] + ' Gb/s', onInput: (i) => { P.rate = rates[i]; draw(); } });
    NB.slider(ctr, { label: '병렬 선 수', min: 2, max: 32, value: P.n, onInput: (v) => { P.n = v; draw(); } });
    NB.slider(ctr, { label: '스큐 σ (선 간 지연 편차)', min: 2, max: 120, value: P.sigma, fmt: (v) => v + ' ps', onInput: (v) => { P.sigma = v; draw(); } });
    NB.slider(ctr, { label: '셋업+홀드 마진', min: 0, max: 60, value: P.margin, fmt: (v) => v + ' ps', onInput: (v) => { P.margin = v; draw(); } });
    NB.button(ctr, '🎲 다른 칩 (지연 재추첨)', () => { seed++; draw(); });
    P.rate = rates[6];
    let seed = 3;
    const cv = NB.canvas(W.body, { height: (w) => 60 + P.n * 16 });
    const st = NB.stats(W.body, [{ key: 'ui', label: 'UI (비트 시간)' }, { key: 'sk', label: '최악 스큐 (최대−최소)' }, { key: 'r', label: '스큐 / UI' }, { key: 'err', label: '오류 비트 (화면)' }, { key: 'max', label: '대략적 최대 레이트' }]);
    function draw() {
      const rnd = NB.rng(seed * 101);
      const d = []; for (let i = 0; i < P.n; i++) d.push(L.gauss(rnd) * P.sigma);
      const mean = d.reduce((a, b) => a + b, 0) / P.n;
      const dl = d.map((x) => x - mean);
      const nb = 10;
      const bits = []; for (let i = 0; i < P.n; i++) { bits.push([]); for (let k = 0; k < nb + 2; k++) bits[i].push(rnd() < 0.5 ? 1 : 0); }
      const UI = 1000 / P.rate; // ps
      const h = 60 + P.n * 16;
      if (Math.abs(cv.h - h) > 1) { cv.resize(); }
      const { ctx, w } = cv;
      ctx.clearRect(0, 0, w, cv.h);
      const labW = 46, top = 26, rowH = 16, wPlot = w - labW - 150;
      const T0 = -0.5 * UI, T1 = nb * UI;
      const X = (t) => labW + (t - T0) / (T1 - T0) * wPlot;
      const mute = NB.css('--text-mute'), acc = NB.css('--accent'), dng = NB.css('--danger'), warn = NB.css('--c7'), text = NB.css('--text'), grid = NB.css('--grid');
      // clock
      ctx.strokeStyle = NB.css('--c4'); ctx.lineWidth = 1.6; ctx.beginPath();
      for (let k = -1; k <= nb; k++) {
        const t0 = k * UI, y0 = 14, y1 = 4;
        ctx.moveTo(X(Math.max(T0, t0)), y0); ctx.lineTo(X(t0 + UI / 2), y0); ctx.lineTo(X(t0 + UI / 2), y1); ctx.lineTo(X(Math.min(T1, t0 + UI)), y1); ctx.lineTo(X(Math.min(T1, t0 + UI)), y0);
      }
      ctx.stroke();
      ctx.fillStyle = NB.css('--c4'); ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('CLK', labW - 6, 9);
      let errs = 0;
      const tr = Math.min(UI * 0.25, 25);
      for (let i = 0; i < P.n; i++) {
        const y = top + i * rowH, hi = y + 2, lo = y + rowH - 3;
        ctx.fillStyle = mute; ctx.textAlign = 'right'; ctx.fillText('D' + i, labW - 6, y + rowH / 2);
        ctx.strokeStyle = acc; ctx.lineWidth = 1.4; ctx.beginPath();
        // bits[i][k+1] is bit k (bits[i][0] is bit -1); find level at T0, then draw edges inside the window
        let prev = bits[i][0];
        for (let k = 0; k <= nb; k++) if (k * UI + dl[i] < T0) prev = bits[i][k + 1];
        ctx.moveTo(X(T0), prev ? hi : lo);
        for (let k = 0; k <= nb; k++) {
          const te = k * UI + dl[i], b = bits[i][k + 1];
          if (te < T0) continue;
          if (te > T1) break;
          ctx.lineTo(X(Math.max(T0, te - tr / 2)), prev ? hi : lo);
          ctx.lineTo(X(Math.min(T1, te + tr / 2)), b ? hi : lo);
          prev = b;
        }
        ctx.lineTo(X(T1), prev ? hi : lo);
        ctx.stroke();
        ctx.fillStyle = mute; ctx.textAlign = 'left'; ctx.fillText((dl[i] >= 0 ? '+' : '') + dl[i].toFixed(0) + 'ps', X(T1) + 6, y + rowH / 2);
      }
      // sampling
      for (let k = 0; k < nb; k++) {
        const ts = k * UI + UI / 2;
        ctx.strokeStyle = NB.alpha(NB.css('--c4'), 0.6); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(ts), 16); ctx.lineTo(X(ts), top + P.n * rowH); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < P.n; i++) {
          // which bit is on wire i at time ts?
          const idx = Math.floor((ts - dl[i]) / UI);
          const distEdge = Math.min(Math.abs(ts - (idx * UI + dl[i])), Math.abs(ts - ((idx + 1) * UI + dl[i])));
          const meta = distEdge < P.margin;
          const ok = idx === k && !meta;
          if (!ok) errs++;
          const y = top + i * rowH;
          if (!ok) { ctx.fillStyle = meta && idx === k ? warn : dng; ctx.beginPath(); ctx.arc(X(ts), y + rowH / 2, 4, 0, 7); ctx.fill(); }
        }
      }
      ctx.fillStyle = mute; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '11px ' + NB.css('--font');
      ctx.fillText('● 빨강: 이웃 비트를 잡음   ● 노랑: 에지에 너무 가까움(셋업/홀드 위반)', labW, top + P.n * rowH + 8);
      const sk = Math.max(...dl) - Math.min(...dl);
      st.ui.set(UI >= 1000 ? (UI / 1000).toFixed(2) + ' ns' : UI.toFixed(0), UI >= 1000 ? '' : 'ps');
      st.sk.set(sk.toFixed(0), 'ps');
      st.r.set((sk / UI).toFixed(2), '', sk / UI > 0.5 ? 'bad' : 'good');
      st.err.set(errs + ' / ' + nb * P.n, '', errs ? 'bad' : 'good');
      st.max.set((1000 / (sk + 2 * P.margin)).toFixed(2), 'Gb/s');
    }
    cv.draw = draw;
    draw();
  })();

  /* ======================================================
     1.2 Bandwidth calculator
     ====================================================== */
  (function () {
    const W = NB.widget('w-bw'); if (!W) return;
    const ENC = { none: ['없음', 1], b8b10b: ['8b/10b', 0.8], b64b66b: ['64b/66b', 64 / 66], b128b130b: ['128b/130b', 128 / 130], flit: ['FLIT 242B/256B (PCIe 6)', 242 / 256] };
    const P = { lanes: 16, rate: 8, mod: 2, enc: 'b128b130b', proto: 90 };
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const lS = NB.seg(ctr, { label: '레인 수', value: P.lanes, options: [1, 2, 4, 8, 16].map((v) => ({ value: v, label: 'x' + v })), onChange: (v) => { P.lanes = v; upd(); } });
    const RATES = [1.25, 2.5, 5, 8, 10.3125, 16, 25.78125, 32, 53.125, 64, 106.25, 128, 212.5];
    const rS = NB.slider(ctr, { label: '레인당 원시 비트레이트', min: 0, max: RATES.length - 1, value: 3, fmt: (i) => RATES[i] + ' Gb/s', onInput: (i) => { P.rate = RATES[i]; upd(); } });
    const mS = NB.seg(ctr, { label: '변조', value: P.mod, options: [{ value: 2, label: 'NRZ' }, { value: 4, label: 'PAM4' }], onChange: (v) => { P.mod = v; upd(); } });
    const eS = NB.select(ctr, { label: '라인 코드', value: P.enc, options: Object.keys(ENC).map((k) => ({ value: k, label: ENC[k][0] })), onChange: (v) => { P.enc = v; upd(); } });
    const pS = NB.slider(ctr, { label: '프로토콜 효율 (근사)', min: 50, max: 100, value: P.proto, fmt: (v) => v + '%', onInput: (v) => { P.proto = v; upd(); } });
    const pr = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(pr);
    pr.append(el('span', { class: 'small muted' }, '프리셋:'));
    const presets = {
      'PCIe 2.0 x16': [16, 5, 2, 'b8b10b'], 'PCIe 3.0 x16': [16, 8, 2, 'b128b130b'], 'PCIe 5.0 x16': [16, 32, 2, 'b128b130b'],
      'PCIe 6.0 x16': [16, 64, 4, 'flit'], '100GBASE-CR4': [4, 25.78125, 2, 'b64b66b']
    };
    Object.entries(presets).forEach(([n, [l, r, m, e]]) => NB.button(pr, n, () => { P.lanes = l; P.rate = r; P.mod = m; P.enc = e; lS.set(l); rS.set(RATES.indexOf(r)); mS.set(m); eS.set(e); upd(); }));
    const bar = el('div', { style: { margin: '8px 0' } }); W.body.append(bar);
    const st = NB.stats(W.body, [{ key: 'baud', label: '심볼 레이트' }, { key: 'nyq', label: '나이퀴스트 주파수' }, { key: 'ui', label: 'UI' }, { key: 'raw', label: '원시 총합' }, { key: 'code', label: '코딩 후' }, { key: 'eff', label: '실효 (단방향)' }]);
    function upd() {
      const bps = Math.log2(P.mod);
      const baud = P.rate / bps;
      const raw = P.lanes * P.rate;
      const coded = raw * ENC[P.enc][1];
      const eff = coded * P.proto / 100;
      st.baud.set(baud.toFixed(2), 'GBd');
      st.nyq.set((baud / 2).toFixed(2), 'GHz');
      st.ui.set((1000 / baud).toFixed(1), 'ps');
      st.raw.set(raw.toFixed(0), 'Gb/s');
      st.code.set((coded / 8).toFixed(2), 'GB/s');
      st.eff.set((eff / 8).toFixed(2), 'GB/s', 'good');
      const seg = (w, c, t) => '<div title="' + t + '" style="width:' + (100 * w) + '%;background:var(' + c + ');display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700;overflow:hidden;white-space:nowrap">' + (w > 0.06 ? t : '') + '</div>';
      bar.innerHTML = '<div style="display:flex;height:30px;border-radius:8px;overflow:hidden">' +
        seg(eff / raw, '--c2', '유효 데이터 ' + (100 * eff / raw).toFixed(1) + '%') +
        seg((coded - eff) / raw, '--c7', '프로토콜') +
        seg((raw - coded) / raw, '--c3', '라인 코드') + '</div>';
    }
    upd();
  })();

  /* ======================================================
     1.3 Reach vs energy landscape
     ====================================================== */
  (function () {
    const W = NB.widget('w-land'); if (!W) return;
    const D = [
      { s: '온칩 전선', n: '온칩 전선 (NoC 링크)', r: [0.1, 10], e: [0.02, 1], c: '--c1', d: '칩 안의 금속 배선. 리피터를 넣은 전선은 대략 mm당 수십~수백 fJ/bit 수준. 등화나 CDR이 거의 필요 없다.' },
      { s: 'D2D 어드밴스드', n: '다이-투-다이 (어드밴스드 패키지)', r: [0.5, 3], e: [0.1, 0.7], c: '--c6', d: '실리콘 인터포저·브리지 위의 매우 짧고 촘촘한 병렬 링크 (UCIe Advanced, HBM PHY 등). 레인당 속도는 낮지만 수천 개의 레인으로 대역폭 밀도가 높다.' },
      { s: 'D2D 기판', n: '다이-투-다이 (유기 기판)', r: [5, 30], e: [0.3, 1.5], c: '--c2', d: '일반 패키지 기판 위의 칩렛 연결 (UCIe Standard, BoW 등). 클록 포워딩 기반의 단순한 수신기를 쓴다.' },
      { s: '메모리 I/O', n: '메모리 인터페이스 (DDR/LPDDR)', r: [20, 150], e: [2, 20], c: '--c7', d: '넓은 병렬 버스 + 데이터 스트로브(DQS)로 소스 동기 클로킹. 종단 저항과 높은 전압 스윙으로 비트당 에너지가 크다.' },
      { s: '칩-투-칩 SerDes', n: '칩-투-칩 SerDes (PCIe 등)', r: [20, 300], e: [1, 6], c: '--c4', d: '보드 위 수~수십 cm. 임베디드 클록, CDR, TX FFE + RX CTLE/DFE 등화를 쓰는 고속 직렬 링크.' },
      { s: 'LR SerDes', n: '백플레인/케이블 SerDes (LR)', r: [300, 2000], e: [3, 15], c: '--c5', d: '수십 dB의 채널 손실을 견뎌야 해서 강력한 등화와 FEC가 필요하다. 이더넷 백플레인, 구리 케이블 등.' },
      { s: '광 링크', n: '광 링크 (플러거블/CPO)', r: [1000, 1e7], e: [2, 30], c: '--c3', d: '전기→광 변환 후 광섬유로 전송. 거리에 따른 손실이 거의 없어 m~km 단위로 쓰인다. 레이저·모듈레이터·DSP의 전력이 지배적.' }
    ];
    const cv = NB.canvas(W.body, { height: 380 });
    const info = el('div', { style: { minHeight: '50px', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: '10px', fontSize: '15px', marginTop: '8px' } }, '상자를 클릭해 보세요.');
    W.body.append(info);
    let sel = -1, rects = [];
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 60, r: 14, t: 14, b: 44 };
      const lx0 = -1, lx1 = 7, ly0 = -2, ly1 = 2;
      const X = (v) => pad.l + (Math.log10(v) - lx0) / (lx1 - lx0) * (w - pad.l - pad.r);
      const Y = (v) => pad.t + (1 - (Math.log10(v) - ly0) / (ly1 - ly0)) * (h - pad.t - pad.b);
      const grid = NB.css('--grid'), mute = NB.css('--text-mute'), text = NB.css('--text');
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--mono');
      const xl = { '-1': '0.1mm', 0: '1mm', 1: '1cm', 2: '10cm', 3: '1m', 4: '10m', 5: '100m', 6: '1km', 7: '10km' };
      for (let e = lx0; e <= lx1; e++) { const x = X(Math.pow(10, e)); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(xl[e], x, h - pad.b + 5); }
      for (let e = ly0; e <= ly1; e++) { const y = Y(Math.pow(10, e)); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.pow(10, e)), pad.l - 6, y); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '12px ' + NB.css('--font');
      ctx.fillText('도달 거리 (로그)', pad.l + (w - pad.l - pad.r) / 2, h - 4);
      ctx.save(); ctx.translate(14, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('비트당 에너지 pJ/bit (로그)', 0, 0); ctx.restore();
      rects = [];
      D.forEach((d, i) => {
        const x0 = X(d.r[0]), x1 = X(d.r[1]), y0 = Y(d.e[1]), y1 = Y(d.e[0]);
        const c = NB.css(d.c), on = i === sel;
        ctx.fillStyle = NB.alpha(c, on ? 0.38 : 0.18); ctx.strokeStyle = c; ctx.lineWidth = on ? 2.5 : 1.4;
        NB.roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.font = (on ? 'bold ' : '') + '11.5px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const lbl = x1 - x0 < 150 ? d.s : d.n;
        ctx.fillText(lbl, Math.min(x0 + 4, w - 150), y0 + 3);
        rects.push([x0, y0, x1, y1]);
      });
    }
    cv.canvas.style.cursor = 'pointer';
    cv.canvas.addEventListener('click', (e) => {
      const p = cv.pos(e);
      let hit = -1;
      rects.forEach(([a, b, c, d], i) => { if (p.x >= a && p.x <= c && p.y >= b && p.y <= d) hit = i; });
      sel = hit;
      info.innerHTML = hit >= 0 ? '<b style="color:var(' + D[hit].c + ')">' + D[hit].n + '</b> — 거리 ' + fmtR(D[hit].r[0]) + '–' + fmtR(D[hit].r[1]) + ', 대략 ' + D[hit].e[0] + '–' + D[hit].e[1] + ' pJ/bit<br>' + D[hit].d : '상자를 클릭해 보세요.';
      draw();
    });
    const fmtR = (mm) => (mm >= 1e6 ? mm / 1e6 + 'km' : mm >= 1000 ? mm / 1000 + 'm' : mm >= 10 ? mm / 10 + 'cm' : mm + 'mm');
    cv.draw = draw;
    draw();
  })();
});
