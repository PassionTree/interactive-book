/* Chapter 4 — Flow control */
NB.ready(function () {
  'use strict';
  const { el } = NB;

  /* ======================================================
     4.1 Packet anatomy
     ====================================================== */
  (function () {
    const W = NB.widget('w-packet'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    let type = 'resp', bytes = 64, fw = 128, k = 8;
    NB.seg(ctr, { label: '메시지 종류', value: type, options: [{ value: 'rdreq', label: '읽기 요청' }, { value: 'wrreq', label: '쓰기 요청' }, { value: 'resp', label: '읽기 응답' }], onChange: (v) => { type = v; upd(); } });
    const bS = NB.slider(ctr, { label: '데이터 크기', min: 8, max: 256, step: 8, value: bytes, fmt: (v) => v + ' B', onInput: (v) => { bytes = v; upd(); } });
    NB.seg(ctr, { label: '플릿(링크) 폭', value: fw, options: [32, 64, 128, 256, 512].map((v) => ({ value: v, label: v + 'b' })), onChange: (v) => { fw = v; upd(); } });
    NB.seg(ctr, { label: '메시 크기', value: k, options: [4, 8, 16].map((v) => ({ value: v, label: v + '×' + v })), onChange: (v) => { k = v; upd(); } });
    const box = el('div', { style: { overflowX: 'auto' } }); W.body.append(box);
    const st = NB.stats(W.body, [{ key: 'n', label: '플릿 수' }, { key: 'hdr', label: '헤더 비트' }, { key: 'eff', label: '전송 효율 (payload/전체)' }, { key: 'ser', label: '직렬화 지연' }]);
    const legend = el('div', { class: 'legend' }); W.body.append(legend);
    const FIELDS = [
      { k: 'side', c: '--text-mute', n: '플릿 타입+VC (사이드밴드)' },
      { k: 'route', c: '--c3', n: '목적지/출발지 좌표' },
      { k: 'ctrl', c: '--c7', n: '메시지 클래스·트랜잭션 ID' },
      { k: 'addr', c: '--c4', n: '주소' },
      { k: 'data', c: '--c2', n: '데이터(payload)' },
      { k: 'pad', c: '--border-strong', n: '빈 공간(padding)' }
    ];
    legend.innerHTML = FIELDS.map((f) => '<span><i style="background:var(' + f.c + ')"></i>' + f.n + '</span>').join('');
    function upd() {
      bS.el.style.opacity = type === 'rdreq' ? 0.4 : 1;
      const cb = 2 * Math.ceil(Math.log2(k));
      const side = 4;
      const hdr = [['route', 2 * cb], ['ctrl', 3 + 8]];
      if (type !== 'resp') hdr.push(['addr', 48]);
      const dataBits = type === 'rdreq' ? 0 : bytes * 8;
      const hdrBits = hdr.reduce((a, b) => a + b[1], 0);
      // build flits greedily
      const flits = [];
      let cur = [['side', side]], room = fw - side;
      const pushField = (kind, bits) => {
        while (bits > 0) {
          if (room === 0) { flits.push(cur); cur = [['side', side]]; room = fw - side; }
          const take = Math.min(bits, room);
          cur.push([kind, take]); room -= take; bits -= take;
        }
      };
      hdr.forEach(([kk, b]) => pushField(kk, b));
      pushField('data', dataBits);
      if (room > 0) cur.push(['pad', room]);
      flits.push(cur);
      // render
      const pxPerBit = Math.max(1, Math.min(4, 620 / fw));
      box.innerHTML = '';
      flits.forEach((f, i) => {
        const tag = flits.length === 1 ? 'H/T' : i === 0 ? 'Head' : i === flits.length - 1 ? 'Tail' : 'Body';
        const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '3px 0' } });
        row.append(el('span', { class: 'mono small', style: { width: '74px', color: 'var(--text-mute)', flexShrink: 0, whiteSpace: 'nowrap' } }, '#' + i + ' ' + tag));
        const bar = el('div', { style: { display: 'flex', height: '22px', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border-strong)', width: fw * pxPerBit + 'px', flexShrink: 0 } });
        f.forEach(([kind, bits]) => {
          const fd = FIELDS.find((x) => x.k === kind);
          const seg = el('div', { title: fd.n + ' ' + bits + 'b', style: { width: bits * pxPerBit + 'px', background: kind === 'pad' ? 'repeating-linear-gradient(45deg, transparent 0 4px, var(--border) 4px 6px)' : 'var(' + fd.c + ')', opacity: kind === 'side' ? 0.55 : 0.9, borderRight: '1px solid var(--surface)' } });
          if (bits * pxPerBit > 34) { seg.style.fontSize = '10px'; seg.style.color = '#fff'; seg.style.fontFamily = 'var(--mono)'; seg.style.textAlign = 'center'; seg.style.lineHeight = '22px'; seg.style.overflow = 'hidden'; seg.textContent = kind === 'pad' ? '' : bits + 'b'; }
          bar.append(seg);
        });
        row.append(bar);
        box.append(row);
      });
      const tot = flits.length * fw;
      st.n.set(flits.length);
      st.hdr.set(hdrBits + side * flits.length, 'b');
      st.eff.set(dataBits ? (100 * dataBits / tot).toFixed(0) + '%' : '—', '', dataBits && dataBits / tot < 0.6 ? 'bad' : '');
      st.ser.set(flits.length, 'cycles');
    }
    upd();
  })();

  /* ======================================================
     4.2 Switching space-time diagram
     ====================================================== */
  (function () {
    const W = NB.widget('w-switching'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const P = { H: 4, L: 5, tr: 2, D: 2, block: true, bs: 8, bl: 8 };
    NB.slider(ctr, { label: '홉 수 H', min: 1, max: 6, value: P.H, onInput: (v) => { P.H = v; draw(); } });
    NB.slider(ctr, { label: '패킷 길이 L (플릿)', min: 1, max: 8, value: P.L, onInput: (v) => { P.L = v; draw(); } });
    NB.slider(ctr, { label: '라우터 지연 tr', min: 1, max: 3, value: P.tr, onInput: (v) => { P.tr = v; draw(); } });
    NB.slider(ctr, { label: 'Wormhole 버퍼 (플릿)', min: 1, max: 4, value: P.D, onInput: (v) => { P.D = v; draw(); } });
    const c2 = el('div', { class: 'controls' }); W.body.append(c2);
    NB.checkbox(c2, { label: '마지막 링크 막힘', value: P.block, onChange: (v) => { P.block = v; draw(); } });
    NB.slider(c2, { label: '막힘 시작 사이클', min: 0, max: 20, value: P.bs, onInput: (v) => { P.bs = v; draw(); } });
    NB.slider(c2, { label: '막힘 길이', min: 1, max: 16, value: P.bl, onInput: (v) => { P.bl = v; draw(); } });
    const cv = NB.canvas(W.body, { height: (w) => 3 * (Math.min(6, 6) * 22 + 40) + 10 });
    function simulate(mode) {
      const { H, L, tr, D } = P;
      const cap = (n) => (n >= H ? 1e9 : n === 0 ? 1e9 : mode === 'wh' ? D : L);
      const pos = new Array(L).fill(0), tx = new Array(L).fill(-1e9);
      const grid = []; for (let c = 0; c <= H; c++) grid.push({});
      const held = []; for (let c = 0; c <= H; c++) held.push([1e9, -1]);
      let t = 0, done = -1;
      while (t < 200) {
        for (let c = H; c >= 1; c--) {
          // front flit at node c-1
          let f = -1; for (let i = 0; i < L; i++) if (pos[i] === c - 1) { f = i; break; }
          if (f < 0) continue;
          if (P.block && c === H && t >= P.bs && t < P.bs + P.bl) continue;
          const occ = pos.filter((p) => p === c).length;
          if (occ >= cap(c)) continue;
          if (c - 1 === 0) { if (f === 0 && t < tr) continue; }
          else {
            if (mode === 'saf') {
              if (f === 0) { const allIn = pos.every((p) => p === c - 1); if (!allIn) continue; if (t < tx[L - 1] + 1 + tr) continue; }
              else if (t < tx[f] + 1) continue;
            } else if (t < tx[f] + (f === 0 ? tr : 1)) continue;
          }
          if (mode === 'vct' && f === 0 && c < H) { const occN = pos.filter((p) => p === c).length; if (cap(c) - occN < L) continue; }
          pos[f] = c; tx[f] = t; grid[c][t] = f;
          if (f === 0) held[c][0] = t;
          if (f === L - 1) held[c][1] = t;
        }
        t++;
        if (pos.every((p) => p === H)) { done = t; break; }
      }
      return { grid, held, lat: done };
    }
    function draw() {
      const { ctx, w } = cv;
      const res = { saf: simulate('saf'), vct: simulate('vct'), wh: simulate('wh') };
      const maxT = Math.max(res.saf.lat, res.vct.lat, res.wh.lat) + 1;
      const rowH = 20, labW = 92, gap = 40;
      const blockH = P.H * rowH + gap;
      const h = 3 * blockH + 34;
      if (Math.abs(cv.h - h) > 1) { cv.canvas.style.height = h + 'px'; const dpr = Math.min(2.5, window.devicePixelRatio || 1); cv.canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cv.h = h; }
      ctx.clearRect(0, 0, w, h);
      const cw = Math.max(6, (w - labW - 10) / maxT);
      const pal = NB.palette(), mute = NB.css('--text-mute'), text = NB.css('--text'), grid = NB.css('--grid'), danger = NB.css('--danger');
      const names = { saf: ['Store-and-Forward', '--c3'], vct: ['Virtual Cut-Through', '--c4'], wh: ['Wormhole (버퍼 ' + P.D + ')', '--c1'] };
      ['saf', 'vct', 'wh'].forEach((m, bi) => {
        const R = res[m], y0 = bi * blockH + 40;
        const col = NB.css(names[m][1]);
        ctx.fillStyle = col; ctx.font = 'bold 13px ' + NB.css('--font'); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(names[m][0] + '  —  지연 ' + R.lat + ' 사이클', 0, y0 - 4);
        for (let c = 1; c <= P.H; c++) {
          const y = y0 + (c - 1) * rowH;
          ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText('링크 ' + c + (c === P.H ? ' →Dst' : ''), labW - 6, y + rowH / 2);
          const [h0, h1] = R.held[c];
          for (let t = 0; t < maxT; t++) {
            const x = labW + t * cw;
            ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.strokeRect(x, y, cw, rowH);
            const f = R.grid[c][t];
            if (f != null) {
              ctx.fillStyle = col; ctx.globalAlpha = 0.35 + 0.65 * (1 - f / Math.max(1, P.L));
              ctx.fillRect(x + 1, y + 1, cw - 2, rowH - 2); ctx.globalAlpha = 1;
              if (cw >= 12) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.fillText(f === 0 ? 'H' : f === P.L - 1 ? 'T' : f, x + cw / 2, y + rowH / 2 + 0.5); }
            } else if (m !== 'saf' && t > h0 && t < h1) {
              ctx.fillStyle = NB.alpha(col, 0.13); ctx.fillRect(x + 1, y + 1, cw - 2, rowH - 2);
            }
            if (P.block && c === P.H && t >= P.bs && t < P.bs + P.bl) { ctx.strokeStyle = danger; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 2, y + rowH - 2); ctx.lineTo(x + cw - 2, y + 2); ctx.stroke(); }
          }
        }
      });
      ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let t = 0; t < maxT; t += Math.max(1, Math.ceil(24 / cw))) ctx.fillText(t, labW + (t + 0.5) * cw, 0);
    }
    cv.draw = draw;
    draw();
  })();

  /* ======================================================
     4.3 Credit-based flow control
     ====================================================== */
  (function () {
    const W = NB.widget('w-credit'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const P = { B: 2, Lw: 1, cp: 1, rate: 1, speed: 3 };
    NB.slider(ctr, { label: '버퍼 깊이 B', min: 1, max: 10, value: P.B, onInput: (v) => { P.B = v; reset(); } });
    NB.slider(ctr, { label: '링크 지연 (편도)', min: 1, max: 4, value: P.Lw, fmt: (v) => v + ' cyc', onInput: (v) => { P.Lw = v; reset(); } });
    NB.slider(ctr, { label: 'Credit 처리 지연', min: 0, max: 3, value: P.cp, fmt: (v) => v + ' cyc', onInput: (v) => { P.cp = v; reset(); } });
    NB.slider(ctr, { label: '하류 소비율', min: 0.25, max: 1, step: 0.05, value: P.rate, fmt: (v) => v.toFixed(2), onInput: (v) => { P.rate = v; reset(); } });
    NB.slider(ctr, { label: '애니메이션 속도', min: 1, max: 12, value: P.speed, fmt: (v) => v + ' cyc/s', onInput: (v) => { P.speed = v; } });
    const lay = el('div', { class: 'split', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' } }); W.body.append(lay);
    const left = el('div'), right = el('div'); lay.append(left, right);
    const cv = NB.canvas(left, { height: 250 });
    const st = NB.stats(left, [{ key: 'tcrt', label: 'credit 왕복 지연 t_crt' }, { key: 'theo', label: '이론 처리량' }, { key: 'meas', label: '측정 처리량' }, { key: 'cr', label: '상류 credit' }]);
    const chart = NB.chart(right, { height: 270, xLabel: '버퍼 깊이 B (플릿)', yLabel: '링크 처리량 (flit/cycle)', xMin: 1, xMax: 10, yMin: 0, yMax: 1.1 });
    let S, acc = 0;
    const tcrt = () => 2 * P.Lw + P.cp + 1;
    function reset() { S = { t: 0, cr: P.B, flits: [], credits: [], buf: [], racc: 0, sent: 0, recv: 0, hist: [], id: 0, ev: [] }; updChart(); }
    function step() {
      const t = S.t;
      // credits become usable
      S.credits = S.credits.filter((c) => { if (c.use <= t) { S.cr++; return false; } return true; });
      // flits arrive
      S.flits = S.flits.filter((f) => { if (f.arr <= t) { S.buf.push({ id: f.id, tIn: t }); return false; } return true; });
      // downstream consumption
      S.racc = Math.min(1 + P.rate, S.racc + P.rate);
      if (S.racc >= 1 && S.buf.length && S.buf[0].tIn < t) { S.buf.shift(); S.racc -= 1; S.recv++; S.credits.push({ sent: t, arr: t + P.Lw, use: t + P.Lw + P.cp }); S.hist.push(t); }
      // upstream send
      if (S.cr > 0) { S.cr--; S.flits.push({ id: S.id++, sent: t, arr: t + P.Lw }); S.sent++; }
      S.t++;
      S.hist = S.hist.filter((x) => x > S.t - 40);
    }
    function updChart() {
      const pts = [], tc = tcrt();
      for (let b = 1; b <= 10; b += 0.05) pts.push([b, Math.min(P.rate, Math.min(1, Math.floor(b) / tc))]);
      chart.set({ series: [{ name: '이론: min(소비율, B/t_crt)', color: NB.css('--c1'), points: pts }, { name: '현재 설정', color: NB.css('--c3'), points: [[P.B, Math.min(P.rate, P.B / tc)]], marker: true, width: 0 }], vlines: [{ x: tc, label: 'B = t_crt', color: NB.css('--text-mute') }] });
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const node = NB.css('--node'), stroke = NB.css('--node-stroke'), mute = NB.css('--text-mute'), text = NB.css('--text'), c1 = NB.css('--c1'), c2 = NB.css('--c2'), link = NB.css('--link');
      const ux = 16, uw = 120, dx = w - 16 - 150, dw = 150, y0 = 40, bh = 150;
      // routers
      ctx.fillStyle = node; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
      NB.roundRect(ctx, ux, y0, uw, bh, 10); ctx.fill(); ctx.stroke();
      NB.roundRect(ctx, dx, y0, dw, bh, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = text; ctx.font = 'bold 13px ' + NB.css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('상류 라우터', ux + uw / 2, y0 + 8); ctx.fillText('하류 라우터', dx + dw / 2, y0 + 8);
      // credit counter
      ctx.font = 'bold 40px ' + NB.css('--mono'); ctx.fillStyle = S.cr > 0 ? c2 : NB.css('--danger'); ctx.textBaseline = 'middle';
      ctx.fillText(S.cr, ux + uw / 2, y0 + 78);
      ctx.font = '12px ' + NB.css('--font'); ctx.fillStyle = mute; ctx.fillText('credit 카운터', ux + uw / 2, y0 + 112);
      // downstream buffer slots
      const sw = Math.min(26, (dw - 20) / P.B - 3), sx0 = dx + dw / 2 - (P.B * (sw + 3)) / 2;
      for (let i = 0; i < P.B; i++) {
        const x = sx0 + i * (sw + 3), y = y0 + 64;
        const f = S.buf[P.B - 1 - i];
        ctx.fillStyle = f ? c1 : 'transparent'; ctx.strokeStyle = stroke; ctx.lineWidth = 1;
        ctx.fillRect(x, y, sw, 30); ctx.strokeRect(x, y, sw, 30);
      }
      ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.fillText('입력 버퍼 (' + S.buf.length + '/' + P.B + ')', dx + dw / 2, y0 + 112);
      ctx.strokeStyle = link; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dx + dw - 6, y0 + 79); ctx.lineTo(dx + dw + 12, y0 + 79); ctx.stroke();
      // lanes
      const lx0 = ux + uw, lx1 = dx, fy = y0 + 50, cy = y0 + 110;
      ctx.strokeStyle = link; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lx0, fy); ctx.lineTo(lx1, fy); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(lx0, cy); ctx.lineTo(lx1, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--font'); ctx.textBaseline = 'bottom';
      ctx.fillText('데이터 링크 → (' + P.Lw + ' cyc)', (lx0 + lx1) / 2, fy - 12);
      ctx.textBaseline = 'top'; ctx.fillText('← credit 반환 (' + P.Lw + ' cyc + 처리 ' + P.cp + ')', (lx0 + lx1) / 2, cy + 10);
      const tNow = S.t - 1 + acc;
      S.flits.forEach((f) => {
        const p = NB.clamp((tNow - f.sent) / (f.arr - f.sent), 0, 1);
        const x = NB.lerp(lx0 + 8, lx1 - 8, p);
        ctx.fillStyle = c1; ctx.fillRect(x - 9, fy - 9, 18, 18);
      });
      S.credits.forEach((c) => {
        const p = NB.clamp((tNow - c.sent) / (c.arr - c.sent), 0, 1);
        const x = NB.lerp(lx1 - 8, lx0 + 8, p);
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x, cy, 7, 0, 7); ctx.fill();
        if (p >= 1) { ctx.fillStyle = mute; ctx.font = '10px ' + NB.css('--font'); ctx.fillText('처리중', x, cy + 9); }
      });
      ctx.fillStyle = mute; ctx.font = '12px ' + NB.css('--mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('cycle ' + S.t, 6, 6);
      // stats
      const tc = tcrt();
      st.tcrt.set(tc, 'cyc');
      st.theo.set(Math.min(P.rate, P.B / tc, 1).toFixed(2));
      const meas = S.hist.length / Math.min(40, Math.max(1, S.t));
      st.meas.set(S.t > 10 ? meas.toFixed(2) : '…', '', S.t > 10 && meas < 0.99 * Math.min(1, P.rate) ? 'bad' : 'good');
      st.cr.set(S.cr + ' / ' + P.B);
    }
    reset();
    cv.draw = draw;
    NB.loop(cv.canvas, (dt) => {
      acc += dt * P.speed;
      while (acc >= 1) { acc -= 1; step(); }
      draw();
    });
    NB.onTheme(updChart);
  })();
});
