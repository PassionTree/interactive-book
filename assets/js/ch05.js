/* Chapter 5 — Router microarchitecture */
NB.ready(function () {
  'use strict';
  const { el } = NB;
  const S = NB.svgEl;
  const PORTS = ['N', 'E', 'S', 'W', 'L'];

  /* ======================================================
     5.1 Router anatomy with step-through
     ====================================================== */
  (function () {
    const W = NB.widget('w-router'); if (!W) return;
    const ctr = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(ctr);
    const svg = S('svg', { class: 'vis', viewBox: '0 0 920 470', style: 'width:100%;height:auto' });
    W.body.append(svg);
    const desc = el('div', { style: { marginTop: '10px', minHeight: '78px', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: '10px', fontSize: '15px' } });
    W.body.append(desc);
    const py = (i) => 52 + i * 84;
    const G = {};
    // ---- input units
    const tipOn = (e, html) => { e.style.cursor = 'help'; e.addEventListener('pointermove', (ev) => NB.tip.show(html, ev.clientX, ev.clientY)); e.addEventListener('pointerleave', () => NB.tip.hide()); };
    G.in = PORTS.map((p, i) => {
      const g = S('g', null, svg);
      const box = S('rect', { x: 40, y: py(i) - 6, width: 200, height: 70, rx: 9, 'stroke-width': 1.4 }, g);
      const t = S('text', { x: 18, y: py(i) + 32, 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle' }, g); t.textContent = p;
      const vcs = [0, 1].map((v) => {
        const slots = [0, 1, 2, 3].map((s) => S('rect', { x: 92 + s * 26, y: py(i) + 4 + v * 30, width: 22, height: 22, rx: 3, 'stroke-width': 1 }, g));
        const lab = S('text', { x: 62, y: py(i) + 20 + v * 30, 'font-size': 11, 'text-anchor': 'middle' }, g); lab.textContent = 'VC' + v;
        const stt = S('rect', { x: 200, y: py(i) + 6 + v * 30, width: 32, height: 18, rx: 3, 'stroke-width': 1 }, g);
        const stx = S('text', { x: 216, y: py(i) + 19 + v * 30, 'font-size': 9.5, 'text-anchor': 'middle' }, g); stx.textContent = 'I';
        return { slots, lab, stt, stx };
      });
      tipOn(box, '<b>입력 유닛 ' + p + '</b><br>VC마다 FIFO 버퍼(여기선 4플릿)와 VC 상태(G: Idle/Routing/VC-alloc/Active, 출력 포트, 출력 VC)를 가집니다.');
      return { g, box, t, vcs };
    });
    // ---- control units
    const ctrlBox = (y, name, sub, tip) => {
      const g = S('g', null, svg);
      const r = S('rect', { x: 278, y, width: 130, height: 64, rx: 10, 'stroke-width': 1.6 }, g);
      const t = S('text', { x: 343, y: y + 28, 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle' }, g); t.textContent = name;
      const s2 = S('text', { x: 343, y: y + 47, 'font-size': 11, 'text-anchor': 'middle' }, g); s2.textContent = sub;
      tipOn(r, tip);
      return { g, r, t, s2 };
    };
    G.rc = ctrlBox(40, 'RC', 'Route Compute', '<b>라우트 계산</b><br>헤드 플릿의 목적지 좌표를 현재 좌표와 비교해 출력 포트를 정합니다. XY라면 비교기 2개면 충분합니다.');
    G.va = ctrlBox(160, 'VA', 'VC Allocator', '<b>VC 할당기</b><br>(입력 VC → 출력 포트의 VC) 요청들을 중재해, 하류 라우터의 비어 있는 VC를 패킷에 배정합니다. 크기 ∝ (p·v)².');
    G.sa = ctrlBox(280, 'SA', 'Switch Allocator', '<b>스위치 할당기</b><br>매 사이클 각 입력 포트에서 한 VC를 고르고(입력 중재), 각 출력 포트에서 한 입력을 고릅니다(출력 중재). 7장 참고.');
    const credG = S('g', null, svg);
    // ---- crossbar
    const xb = S('rect', { x: 440, y: 40, width: 170, height: 396, rx: 12, 'stroke-width': 1.6 }, svg);
    const xbt = S('text', { x: 525, y: 458, 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle' }, svg); xbt.textContent = 'Crossbar 5×5';
    tipOn(xb, '<b>크로스바</b><br>각 출력에 5:1 MUX. 한 사이클에 입력당 하나, 출력당 하나의 연결만 가능합니다.');
    const xin = PORTS.map((p, i) => S('circle', { cx: 446, cy: py(i) + 30, r: 4 }, svg));
    const xout = PORTS.map((p, i) => S('circle', { cx: 604, cy: py(i) + 30, r: 4 }, svg));
    const xpath = S('path', { fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
    const inWires = PORTS.map((p, i) => { const l = S('line', { x1: 240, y1: py(i) + 30, x2: 442, y2: py(i) + 30, 'stroke-width': 1.5 }); svg.insertBefore(l, svg.firstChild); return l; });
    // ---- output units
    G.out = PORTS.map((p, i) => {
      const g = S('g', null, svg);
      const box = S('rect', { x: 640, y: py(i) - 6, width: 170, height: 70, rx: 9, 'stroke-width': 1.4 }, g);
      const w1 = S('line', { x1: 610, y1: py(i) + 30, x2: 640, y2: py(i) + 30, 'stroke-width': 1.5 }, g);
      const ovc = [0, 1].map((v) => {
        const r = S('rect', { x: 652, y: py(i) + 4 + v * 30, width: 92, height: 22, rx: 4, 'stroke-width': 1 }, g);
        const t = S('text', { x: 698, y: py(i) + 19 + v * 30, 'font-size': 10.5, 'text-anchor': 'middle' }, g); t.textContent = 'VC' + v + ': free';
        const c = S('text', { x: 778, y: py(i) + 19 + v * 30, 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'var(--mono)' }, g); c.textContent = 'cr 4';
        return { r, t, c };
      });
      const lk = S('line', { x1: 810, y1: py(i) + 30, x2: 905, y2: py(i) + 30, 'stroke-width': 2.5 }, g);
      const lt = S('text', { x: 860, y: py(i) + 22, 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle' }, g); lt.textContent = p + ' →';
      tipOn(box, '<b>출력 유닛 ' + p + '</b><br>하류 라우터의 각 VC가 누구에게 할당되었는지와 남은 credit(빈 버퍼 칸 수)을 추적합니다.');
      return { g, box, ovc, lk, lt, w1 };
    });
    // flits
    const flitG = S('g', null, svg);
    const fl = [0, 1, 2].map((i) => {
      const g = S('g', { style: 'transition: transform .55s cubic-bezier(.4,.1,.2,1), opacity .3s' }, flitG);
      S('rect', { x: -10, y: -10, width: 20, height: 20, rx: 4, 'stroke-width': 1.5 }, g);
      const t = S('text', { x: 0, y: 4, 'font-size': 11, 'font-weight': 800, 'text-anchor': 'middle', fill: '#fff' }, g); t.textContent = ['H', 'B', 'T'][i];
      return g;
    });
    // control wires
    const cw = S('path', { fill: 'none', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, svg);
    // positions
    const Wp = 3, Ep = 1;
    const POS = {
      off: [-30, py(Wp) + 19], in: [8, py(Wp) + 19],
      b0: [103, py(Wp) + 15], b1: [129, py(Wp) + 15], b2: [155, py(Wp) + 15],
      xb: [525, (py(Wp) + py(Ep)) / 2 + 30], out: [860, py(Ep) + 30], gone: [960, py(Ep) + 30]
    };
    // steps: per-flit positions, highlight, text, VC state
    const steps = [
      { f: ['off', 'off', 'off'], hl: [], t: '대기: 서쪽 이웃 라우터에서 3플릿 패킷(H=헤드, B=바디, T=테일)이 이 라우터의 W 포트로 오고 있습니다. 목적지는 동쪽입니다.', st: 'I' },
      { f: ['b0', 'in', 'off'], hl: ['bw'], t: '<b>BW (Buffer Write)</b> — 헤드 플릿이 W 포트 VC0 버퍼에 저장됩니다. 바로 뒤에서 바디 플릿이 링크를 건너오고 있습니다.', st: 'R' },
      { f: ['b0', 'b1', 'in'], hl: ['rc'], t: '<b>RC (Route Computation)</b> — 헤드의 목적지 x가 현재 x보다 크므로 XY 라우팅은 <b>출력 포트 E</b>를 선택합니다. VC 상태: Routing → VC 할당 대기.', st: 'V' },
      { f: ['b0', 'b1', 'b2'], hl: ['va'], t: '<b>VA (VC Allocation)</b> — E 출력의 하류 VC 중 비어 있는 <b>VC1</b>을 W.VC0에 할당합니다. 이제 이 패킷의 테일이 지나갈 때까지 VC1은 다른 패킷이 쓸 수 없습니다.', st: 'A', ova: true },
      { f: ['b0', 'b1', 'b2'], hl: ['sa'], t: '<b>SA (Switch Allocation)</b> — 헤드가 크로스바의 W→E 연결을 요청합니다. 경쟁자가 없고 E.VC1의 credit이 4 &gt; 0이므로 승인됩니다.', st: 'A', ova: true },
      { f: ['xb', 'b0', 'b1'], hl: ['st'], t: '<b>ST (Switch Traversal)</b> — 헤드가 크로스바를 통과합니다. 버퍼 칸이 하나 비었으므로 상류 라우터에 credit을 돌려보냅니다. 바디 플릿은 RC/VA 없이 곧바로 SA를 요청합니다.', st: 'A', ova: true, cr: 3, xb: true },
      { f: ['out', 'xb', 'b0'], hl: ['lt', 'st'], t: '<b>LT (Link Traversal)</b> — 헤드가 E 링크를 건너 다음 라우터로 갑니다. 같은 사이클에 바디가 크로스바를 통과합니다. 파이프라인이 꽉 찬 상태입니다.', st: 'A', ova: true, cr: 2, xb: true },
      { f: ['gone', 'out', 'xb'], hl: ['lt', 'st'], t: '테일 플릿이 크로스바를 통과합니다. <b>테일이 떠나면 W.VC0의 상태는 Idle로 돌아가고</b>, 출력 E.VC1은 하류에서 테일이 빠져나갔다는 credit이 돌아오면 다시 할당 가능해집니다.', st: 'I', ova: true, cr: 1, xb: true },
      { f: ['gone', 'gone', 'out'], hl: ['lt'], t: '완료: 세 플릿이 1사이클 간격으로 줄지어 라우터를 통과했습니다. 헤드는 6단계(BW·RC·VA·SA·ST·LT), 바디/테일은 4단계(BW·SA·ST·LT)를 거쳤습니다.', st: 'I', cr: 1 }
    ];
    let cur = 0, timer = null;
    const prev = NB.button(ctr, '◀ 이전', () => go(cur - 1));
    const next = NB.button(ctr, '단계 진행 ▶', () => go(cur + 1), 'primary');
    const play = NB.button(ctr, '▶ 자동 재생', () => {
      if (timer) { clearInterval(timer); timer = null; play.textContent = '▶ 자동 재생'; return; }
      if (cur >= steps.length - 1) go(0);
      play.textContent = '⏸ 정지';
      timer = setInterval(() => { if (cur >= steps.length - 1) { clearInterval(timer); timer = null; play.textContent = '▶ 자동 재생'; return; } go(cur + 1); }, 1800);
    });
    const stepLbl = el('span', { class: 'mono small muted' }); ctr.append(stepLbl);
    function paint() {
      const st = steps[cur];
      const node = NB.css('--node'), stroke = NB.css('--node-stroke'), text = NB.css('--text'), mute = NB.css('--text-mute'), link = NB.css('--link'), acc = NB.css('--accent'), surf = NB.css('--surface-2');
      const stageCol = { bw: NB.css('--c6'), rc: NB.css('--c3'), va: NB.css('--c4'), sa: NB.css('--c5'), st: NB.css('--c1'), lt: NB.css('--c2') };
      G.in.forEach((u, i) => {
        const on = i === Wp && st.hl.includes('bw');
        u.box.setAttribute('fill', on ? NB.alpha(stageCol.bw, 0.12) : node); u.box.setAttribute('stroke', on ? stageCol.bw : stroke);
        u.t.setAttribute('fill', text);
        u.vcs.forEach((v, vi) => {
          v.slots.forEach((s) => { s.setAttribute('fill', surf); s.setAttribute('stroke', link); });
          v.lab.setAttribute('fill', mute);
          const active = i === Wp && vi === 0;
          v.stt.setAttribute('fill', active && st.st !== 'I' ? NB.alpha(acc, 0.18) : surf); v.stt.setAttribute('stroke', link);
          v.stx.setAttribute('fill', active && st.st !== 'I' ? acc : mute);
          v.stx.textContent = active ? ({ I: 'Idle', R: 'Rte', V: 'VA?', A: '→E1' }[st.st]) : 'Idle';
        });
      });
      ['rc', 'va', 'sa'].forEach((k) => {
        const on = st.hl.includes(k);
        G[k].r.setAttribute('fill', on ? NB.alpha(stageCol[k], 0.18) : node); G[k].r.setAttribute('stroke', on ? stageCol[k] : stroke);
        G[k].r.setAttribute('stroke-width', on ? 3 : 1.6);
        G[k].t.setAttribute('fill', on ? stageCol[k] : text); G[k].s2.setAttribute('fill', mute);
      });
      const ctrlOn = ['rc', 'va', 'sa'].find((k) => st.hl.includes(k));
      if (ctrlOn) { const y = { rc: 72, va: 192, sa: 312 }[ctrlOn]; cw.setAttribute('d', 'M240 ' + (py(Wp) + 12) + ' C 260 ' + (py(Wp) + 12) + ', 255 ' + y + ', 278 ' + y); cw.setAttribute('stroke', stageCol[ctrlOn]); cw.style.opacity = 1; }
      else cw.style.opacity = 0;
      const xon = st.hl.includes('st');
      xb.setAttribute('fill', xon ? NB.alpha(stageCol.st, 0.07) : node); xb.setAttribute('stroke', xon ? stageCol.st : stroke);
      xbt.setAttribute('fill', text);
      xin.concat(xout).forEach((c) => c.setAttribute('fill', link));
      inWires.forEach((l) => l.setAttribute('stroke', link));
      xpath.setAttribute('d', 'M446 ' + (py(Wp) + 30) + ' C 525 ' + (py(Wp) + 30) + ', 525 ' + (py(Ep) + 30) + ', 604 ' + (py(Ep) + 30));
      xpath.setAttribute('stroke', st.xb ? stageCol.st : 'transparent');
      G.out.forEach((u, i) => {
        const on = i === Ep && st.hl.includes('lt');
        u.box.setAttribute('fill', node); u.box.setAttribute('stroke', stroke);
        u.w1.setAttribute('stroke', link);
        u.lk.setAttribute('stroke', on ? stageCol.lt : link); u.lt.setAttribute('fill', on ? stageCol.lt : mute);
        u.ovc.forEach((o, vi) => {
          const alloc = i === Ep && vi === 1 && st.ova;
          o.r.setAttribute('fill', alloc ? NB.alpha(stageCol.va, 0.18) : surf); o.r.setAttribute('stroke', alloc ? stageCol.va : link);
          o.t.setAttribute('fill', alloc ? stageCol.va : mute); o.t.textContent = 'VC' + vi + (alloc ? ': W.VC0' : ': free');
          o.c.setAttribute('fill', mute);
          o.c.textContent = 'cr ' + (i === Ep && vi === 1 && st.cr != null ? st.cr : 4);
        });
      });
      fl.forEach((g, i) => {
        const p = POS[st.f[i]];
        g.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px)';
        g.style.opacity = st.f[i] === 'off' || st.f[i] === 'gone' ? 0 : 1;
        g.querySelector('rect').setAttribute('fill', i === 0 ? NB.css('--c3') : NB.css('--c1'));
        g.querySelector('rect').setAttribute('stroke', NB.css('--surface'));
      });
    }
    function go(i) {
      cur = NB.clamp(i, 0, steps.length - 1);
      desc.innerHTML = steps[cur].t;
      stepLbl.textContent = 'STEP ' + cur + ' / ' + (steps.length - 1);
      prev.disabled = cur === 0; next.disabled = cur === steps.length - 1;
      paint();
    }
    NB.onTheme(paint);
    go(0);
  })();

  /* ======================================================
     5.2 Pipeline space-time table
     ====================================================== */
  (function () {
    const W = NB.widget('w-pipeline'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const D = {
      base: { name: '기본 (6단계)', head: ['BW', 'RC', 'VA', 'SA', 'ST', 'LT'] },
      la: { name: 'Lookahead RC', head: ['BW/NRC', 'VA', 'SA', 'ST', 'LT'] },
      spec: { name: '+ Speculative SA', head: ['BW/NRC', 'VA/SA', 'ST', 'LT'] },
      byp: { name: 'Bypass (무경합)', head: ['ST', 'LT'] }
    };
    const bodyOf = (s) => ({ 'BW': 'BW', 'BW/NRC': 'BW', 'SA': 'SA', 'VA/SA': 'SA', 'ST': 'ST', 'LT': 'LT' }[s] || null);
    let des = 'base', H = 3, L = 3;
    NB.seg(ctr, { label: '라우터 설계', value: des, options: Object.keys(D).map((k) => ({ value: k, label: D[k].name })), onChange: (v) => { des = v; draw(); } });
    NB.slider(ctr, { label: '라우터 수 (홉)', min: 1, max: 4, value: H, onInput: (v) => { H = v; draw(); } });
    NB.slider(ctr, { label: '패킷 길이 (플릿)', min: 1, max: 5, value: L, onInput: (v) => { L = v; draw(); upd(); } });
    const cv = NB.canvas(W.body, { height: 180 });
    const st = NB.stats(W.body, [{ key: 'tr', label: '홉당 지연 (라우터+링크)' }, { key: 'lat', label: '무부하 지연 T₀' }, { key: 'form', label: '공식' }]);
    const box = el('div', { style: { marginTop: '14px' } }); W.body.append(box);
    const chart = NB.chart(box, { height: 220, xLabel: '홉 수 H', yLabel: '무부하 지연 (사이클)', xMin: 1, xMax: 10, yMin: 0 });
    const SC = () => ({ BW: NB.css('--c6'), 'BW/NRC': NB.css('--c6'), RC: NB.css('--c3'), VA: NB.css('--c4'), 'VA/SA': NB.css('--c5'), SA: NB.css('--c5'), ST: NB.css('--c1'), LT: NB.css('--c2') });
    function draw() {
      const { ctx, w } = cv;
      const d = D[des], per = d.head.length;
      const T = H * per + L - 1;
      const rowH = 26, labW = 64, top = 22;
      const h = top + L * rowH + 12;
      if (Math.abs(cv.h - h) > 1) { cv.canvas.style.height = h + 'px'; const dpr = Math.min(2.5, window.devicePixelRatio || 1); cv.canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cv.h = h; }
      ctx.clearRect(0, 0, w, h);
      const cw = Math.min(54, (w - labW - 4) / T);
      const col = SC(), mute = NB.css('--text-mute'), grid = NB.css('--grid');
      ctx.font = '10px ' + NB.css('--mono'); ctx.fillStyle = mute; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let t = 0; t < T; t++) if (cw > 14 || t % 2 === 0) ctx.fillText(t, labW + (t + 0.5) * cw, 4);
      for (let f = 0; f < L; f++) {
        const y = top + f * rowH;
        ctx.fillStyle = mute; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '12px ' + NB.css('--font');
        ctx.fillText(L === 1 ? '헤드/테일' : f === 0 ? '헤드' : f === L - 1 ? '테일' : '바디' + f, labW - 8, y + rowH / 2);
        for (let t = 0; t < T; t++) { ctx.strokeStyle = grid; ctx.strokeRect(labW + t * cw, y, cw, rowH); }
        for (let r = 0; r < H; r++) d.head.forEach((sname, si) => {
          const t = r * per + si + f;
          const s = f === 0 ? sname : bodyOf(sname);
          if (!s) return;
          ctx.fillStyle = col[s]; ctx.fillRect(labW + t * cw + 1, y + 1, cw - 2, rowH - 2);
          if (cw > 24) {
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold ' + (s.length > 3 ? 8.5 : 10.5) + 'px ' + NB.css('--mono');
            ctx.fillText(s, labW + (t + 0.5) * cw, y + rowH / 2 - (cw > 40 ? 3 : 0));
            if (cw > 40) { ctx.font = '8.5px ' + NB.css('--mono'); ctx.fillText('R' + r, labW + (t + 0.5) * cw, y + rowH / 2 + 8); }
          }
        });
      }
      st.tr.set(per, 'cyc');
      st.lat.set(T, 'cyc');
      st.form.set('<span style="font-size:14px">' + H + '×' + per + ' + ' + (L - 1) + '</span>');
    }
    function upd() {
      chart.set({ series: Object.keys(D).map((k, i) => ({ name: D[k].name, color: NB.palette()[[2, 3, 4, 1][i]], marker: true, points: Array.from({ length: 10 }, (_, h) => [h + 1, (h + 1) * D[k].head.length + L - 1]) })) });
    }
    cv.draw = draw;
    draw(); upd();
    NB.onTheme(upd);
  })();

  /* ======================================================
     5.3 Crossbar
     ====================================================== */
  (function () {
    const W = NB.widget('w-xbar'); if (!W) return;
    const ctr = el('div', { class: 'btn-row', style: { marginBottom: '10px' } }); W.body.append(ctr);
    const conn = new Set(['3-1', '0-2', '4-3']);
    NB.button(ctr, '🎲 무작위 유효 매칭', () => {
      conn.clear();
      const outs = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 5; i++) if (Math.random() < 0.8 && outs[i] !== i) conn.add(i + '-' + outs[i]);
      draw();
    });
    NB.button(ctr, '지우기', () => { conn.clear(); draw(); });
    const res = el('span', { style: { marginLeft: '8px' } }); ctr.append(res);
    const svg = S('svg', { class: 'vis', viewBox: '0 0 420 390', style: 'width:100%;max-width:520px;height:auto;margin:0 auto' });
    W.body.append(svg);
    const x0 = 90, y0 = 50, cs = 56;
    function draw() {
      svg.innerHTML = '';
      const link = NB.css('--link'), acc = NB.css('--accent'), dng = NB.css('--danger'), mute = NB.css('--text-mute'), text = NB.css('--text'), node = NB.css('--node'), stroke = NB.css('--node-stroke');
      const rows = [0, 0, 0, 0, 0], cols = [0, 0, 0, 0, 0];
      conn.forEach((k) => { const [i, j] = k.split('-').map(Number); rows[i]++; cols[j]++; });
      PORTS.forEach((p, i) => {
        const y = y0 + i * cs + cs / 2;
        const t = S('text', { x: x0 - 40, y: y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: rows[i] > 1 ? dng : text }, svg); t.textContent = 'in ' + p;
        S('line', { x1: x0 - 18, y1: y, x2: x0 + 5 * cs, y2: y, stroke: rows[i] ? (rows[i] > 1 ? dng : acc) : link, 'stroke-width': rows[i] ? 2.5 : 1.5 }, svg);
      });
      PORTS.forEach((p, j) => {
        const x = x0 + j * cs + cs / 2;
        const t = S('text', { x, y: y0 - 18, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: cols[j] > 1 ? dng : text }, svg); t.textContent = 'out ' + p;
        S('line', { x1: x, y1: y0 - 6, x2: x, y2: y0 + 5 * cs + 14, stroke: cols[j] ? (cols[j] > 1 ? dng : acc) : link, 'stroke-width': cols[j] ? 2.5 : 1.5 }, svg);
        // mux
        const my = y0 + 5 * cs + 14;
        S('path', { d: 'M' + (x - 18) + ' ' + my + ' L' + (x + 18) + ' ' + my + ' L' + (x + 11) + ' ' + (my + 26) + ' L' + (x - 11) + ' ' + (my + 26) + 'Z', fill: node, stroke: stroke, 'stroke-width': 1.3 }, svg);
        let sel = '–'; conn.forEach((k) => { const [i, jj] = k.split('-').map(Number); if (jj === j) sel = cols[j] > 1 ? '!' : PORTS[i]; });
        const mt = S('text', { x, y: my + 17, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: sel === '!' ? dng : sel === '–' ? mute : acc, 'font-family': 'var(--mono)' }, svg); mt.textContent = sel;
      });
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = x0 + j * cs + cs / 2, y = y0 + i * cs + cs / 2;
        const k = i + '-' + j, on = conn.has(k), uturn = i === j && i !== 4;
        const bad = on && (rows[i] > 1 || cols[j] > 1);
        const c = S('circle', { cx: x, cy: y, r: on ? 11 : 8, fill: uturn ? NB.alpha(link.startsWith('#') ? link : '#999999', 0.4) : on ? (bad ? dng : acc) : node, stroke: uturn ? 'none' : on ? 'none' : stroke, 'stroke-width': 1.3, style: uturn ? '' : 'cursor:pointer' }, svg);
        if (!uturn) c.addEventListener('click', () => { if (conn.has(k)) conn.delete(k); else conn.add(k); draw(); });
        const tt = S('title', null, c); tt.textContent = uturn ? 'U-turn (금지)' : 'in ' + PORTS[i] + ' → out ' + PORTS[j];
      }
      const ok = rows.every((r) => r <= 1) && cols.every((c) => c <= 1);
      res.innerHTML = ok ? '<span class="badge ok">유효한 매칭</span> 동시 전송 ' + conn.size + '개' : '<span class="badge bad">충돌!</span> 한 입력/출력에 연결이 2개 이상';
    }
    NB.onTheme(draw);
    draw();
  })();

  /* ======================================================
     5.4 Area model
     ====================================================== */
  (function () {
    const W = NB.widget('w-area'); if (!W) return;
    const ctr = el('div', { class: 'controls' }); W.body.append(ctr);
    const P = { p: 5, v: 4, d: 4, w: 128 };
    NB.slider(ctr, { label: '포트 수 p', min: 3, max: 10, value: P.p, onInput: (x) => { P.p = x; upd(); } });
    NB.slider(ctr, { label: 'VC 수 v', min: 1, max: 8, value: P.v, onInput: (x) => { P.v = x; upd(); } });
    NB.slider(ctr, { label: 'VC 깊이 d (플릿)', min: 1, max: 8, value: P.d, onInput: (x) => { P.d = x; upd(); } });
    NB.slider(ctr, { label: '플릿 폭 w', min: 0, max: 4, value: 2, fmt: (i) => [32, 64, 128, 256, 512][i] + 'b', onInput: (i) => { P.w = [32, 64, 128, 256, 512][i]; upd(); } });
    const bars = el('div', { style: { marginTop: '8px' } }); W.body.append(bars);
    const st = NB.stats(W.body, [{ key: 'tot', label: '총 면적 (기준 대비)' }, { key: 'buf', label: '버퍼 비율' }, { key: 'xb', label: '크로스바 비율' }]);
    const comp = [
      { k: 'buf', n: '입력 버퍼', c: '--c1', f: (q) => q.p * q.v * q.d * q.w * 1.0 },
      { k: 'xb', n: '크로스바', c: '--c3', f: (q) => Math.pow(q.p * q.w, 2) * 0.015 },
      { k: 'va', n: 'VC 할당기', c: '--c4', f: (q) => Math.pow(q.p * q.v, 2) * 2 },
      { k: 'sa', n: '스위치 할당기', c: '--c5', f: (q) => (q.p * q.v + q.p * q.p) * 9 },
      { k: 'ctl', n: 'RC·제어·credit', c: '--c6', f: (q) => q.p * q.v * 60 + q.p * 300 }
    ];
    const base = comp.reduce((a, c) => a + c.f({ p: 5, v: 4, d: 4, w: 128 }), 0);
    function upd() {
      const vals = comp.map((c) => c.f(P)), tot = vals.reduce((a, b) => a + b, 0);
      const scale = Math.max(tot, base * 1.0);
      const mk = (vs, label, sc) => {
        const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' } });
        row.append(el('span', { class: 'small', style: { width: '64px', color: 'var(--text-mute)', flexShrink: 0 } }, label));
        const bar = el('div', { style: { display: 'flex', height: '30px', flex: '1', borderRadius: '6px', overflow: 'hidden', background: 'var(--surface-2)' } });
        const inner = el('div', { style: { display: 'flex', width: (100 * vs.reduce((a, b) => a + b, 0) / sc).toFixed(2) + '%', transition: 'width .3s' } });
        vs.forEach((v, i) => inner.append(el('div', { title: comp[i].n + ': ' + (100 * v / vs.reduce((a, b) => a + b, 0)).toFixed(1) + '%', style: { width: (100 * v / vs.reduce((a, b) => a + b, 0)) + '%', background: 'var(' + comp[i].c + ')', borderRight: '1px solid var(--surface)' } })));
        bar.append(inner); row.append(bar);
        return row;
      };
      bars.innerHTML = '';
      bars.append(mk(comp.map((c) => c.f({ p: 5, v: 4, d: 4, w: 128 })), '기준', scale), mk(vals, '현재', scale));
      const lg = el('div', { class: 'legend' });
      comp.forEach((c, i) => lg.append(el('span', null, el('i', { style: { background: 'var(' + c.c + ')' } }), c.n + ' ' + (100 * vals[i] / tot).toFixed(0) + '%')));
      bars.append(lg, el('div', { class: 'hint' }, '기준: p=5, v=4, d=4, w=128b (2D Mesh 라우터의 전형적인 설정)'));
      st.tot.set('×' + (tot / base).toFixed(2), '', tot / base > 2 ? 'bad' : '');
      st.buf.set((100 * vals[0] / tot).toFixed(0) + '%');
      st.xb.set((100 * vals[1] / tot).toFixed(0) + '%');
    }
    upd();
  })();
});
