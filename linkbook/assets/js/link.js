/* ==========================================================
   LinkBook — signal & link simulation engine
   - PRBS / LFSR
   - oversampled symbol → waveform synthesis with jitter
   - channel model (two-pole bandwidth + long tail), CTLE, FFE, DFE
   - eye diagram rendering & metrics, Q-function / BER helpers
   ========================================================== */
(function () {
  'use strict';
  const NB = window.NB;
  const L = (NB.link = {});

  /* ---------------- math ---------------- */
  // erfc via Numerical Recipes (relative error < 1.2e-7)
  L.erfc = function (x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  };
  L.Q = (x) => 0.5 * L.erfc(x / Math.SQRT2);
  // gaussian random (Box–Muller) from a uniform rng
  L.gauss = function (rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /* ---------------- PRBS ---------------- */
  // PRBS7: x^7 + x^6 + 1 ; PRBS15: x^15 + x^14 + 1
  L.prbs = function (n, order, seed) {
    order = order || 7;
    const taps = { 7: [7, 6], 9: [9, 5], 11: [11, 9], 15: [15, 14] }[order];
    let s = (seed || 0x5a) & ((1 << order) - 1); if (!s) s = 1;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const b = ((s >> (taps[0] - 1)) ^ (s >> (taps[1] - 1))) & 1;
      s = ((s << 1) | b) & ((1 << order) - 1);
      out[i] = b;
    }
    return out;
  };

  /* ---------------- waveform synthesis ----------------
     symbols: array of levels (e.g. ±1, or PAM4 levels)
     os: samples per UI
     jit: {rj: σ in UI, dj: peak-to-peak in UI (dual-Dirac), sj: sinusoidal amplitude UI, sjf: cycles per symbol}
     returns Float64Array of length symbols.length * os */
  L.synth = function (symbols, os, jit, rnd) {
    const n = symbols.length, w = new Float64Array(n * os);
    const edge = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      let j = 0;
      if (jit) {
        if (jit.rj) j += L.gauss(rnd) * jit.rj;
        if (jit.dj) j += (rnd() < 0.5 ? -0.5 : 0.5) * jit.dj;
        if (jit.sj) j += jit.sj * Math.sin(2 * Math.PI * (jit.sjf || 0.013) * i);
      }
      edge[i] = (i + j) * os;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, Math.round(edge[i])), b = Math.min(n * os, Math.round(edge[i + 1]));
      for (let k = a; k < b; k++) w[k] = symbols[i];
    }
    return w;
  };

  /* ---------------- filters ---------------- */
  // one-pole low-pass with time constant tau (samples)
  L.lp = function (x, tau) {
    const y = new Float64Array(x.length);
    if (tau <= 0.01) { y.set(x); return y; }
    const a = 1 - Math.exp(-1 / tau);
    let s = 0;
    for (let i = 0; i < x.length; i++) { s += (x[i] - s) * a; y[i] = s; }
    return y;
  };
  /* channel: (1-β)·LP(LP(x, τf), τf) + β·LP(x, τs)
     ch = {tau: fast pole (samples), beta: tail fraction, tauS: slow pole (samples)} */
  L.channel = function (x, ch) {
    const f = L.lp(L.lp(x, ch.tau), ch.tau);
    if (!ch.beta) return f;
    const s = L.lp(L.lp(x, ch.tau * 0.6), ch.tauS);
    const y = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = (1 - ch.beta) * f[i] + ch.beta * s[i];
    return y;
  };
  // Nyquist loss (dB, positive) of a channel config at os samples/UI
  L.nyqLoss = function (ch, os) {
    const imp = new Float64Array(Math.max(1024, Math.round((ch.tauS || 0) * 12 + ch.tau * 30))); imp[0] = 1;
    return -L.respDB(L.channel(imp, ch), 1 / (2 * os));
  };
  // find fast-pole tau that gives the requested Nyquist loss (dB)
  L.tauForLoss = function (lossDB, beta, tauS, os) {
    let lo = 0.05, hi = os * 4;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (L.nyqLoss({ tau: m, beta, tauS }, os) < lossDB) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // CTLE: DC gain 1/(1+g), high-frequency gain 1 (peaking = 20log10(1+g) dB)
  L.ctle = function (x, g, tau) {
    if (!g) return x;
    const l = L.lp(x, tau);
    const y = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = (x[i] + g * (x[i] - l[i])) / (1 + g);
    return y;
  };
  // symbol-rate FIR (TX FFE): taps = {pre, main, post, post2}
  L.ffe = function (sym, t) {
    const n = sym.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = (t.main || 1) * sym[i] + (t.pre || 0) * (sym[i + 1] || 0) + (t.post || 0) * (sym[i - 1] || 0) + (t.post2 || 0) * (sym[i - 2] || 0);
    }
    return out;
  };

  // frequency response magnitude (dB) of a sampled impulse response at f (cycles/sample)
  L.respDB = function (h, f) {
    let re = 0, im = 0, dc = 0;
    for (let i = 0; i < h.length; i++) { re += h[i] * Math.cos(2 * Math.PI * f * i); im -= h[i] * Math.sin(2 * Math.PI * f * i); dc += h[i]; }
    return 20 * Math.log10(Math.hypot(re, im) / Math.abs(dc || 1));
  };

  /* ---------------- full link pipeline ----------------
     cfg: {os, nbits, pam (2|4), ch:{tau,beta,tauS}, ctle:{g,tau}, ffe:{pre,main,post}, dfe:[d1,d2,..], noise σ, jit, seed}
     returns {sym, bits, wave, pulse, peak, os, levels} */
  L.run = function (cfg) {
    const os = cfg.os || 32, rnd = NB.rng(cfg.seed || 7);
    const pam = cfg.pam || 2;
    const raw = L.prbs(cfg.nbits * (pam === 4 ? 2 : 1), 9, cfg.seed || 0x55);
    let levels, sym, bits;
    if (pam === 4) {
      levels = [-1, -1 / 3, 1 / 3, 1];
      const gray = [0, 1, 3, 2];
      sym = []; bits = [];
      for (let i = 0; i < cfg.nbits; i++) { const v = gray[raw[2 * i] * 2 + raw[2 * i + 1]]; bits.push(v); sym.push(levels[v]); }
    } else { levels = [-1, 1]; bits = raw.slice(0, cfg.nbits); sym = bits.map((b) => (b ? 1 : -1)); }
    const tx = cfg.ffe ? L.ffe(sym, cfg.ffe) : sym;
    let w = L.synth(tx, os, cfg.jit, rnd);
    w = L.channel(w, cfg.ch);
    // noise injected at the channel output (before the CTLE) so that peaking also amplifies it
    if (cfg.noise && cfg.noiseAt === 'channel') for (let i = 0; i < w.length; i++) w[i] += L.gauss(rnd) * cfg.noise;
    if (cfg.ctle) w = L.ctle(w, cfg.ctle.g, cfg.ctle.tau || os * 0.6);
    // pulse response through the same linear chain (no jitter / noise)
    const plen = 24;
    const pin = new Array(plen).fill(0); pin[4] = 1;
    const ptx = cfg.ffe ? L.ffe(pin, cfg.ffe) : pin;
    let p = L.synth(ptx, os, null, rnd);
    p = L.channel(p, cfg.ch);
    if (cfg.ctle) p = L.ctle(p, cfg.ctle.g, cfg.ctle.tau || os * 0.6);
    let pk = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > p[pk]) pk = i;
    // centre of the near-flat top (for nearly ideal channels the top is a plateau)
    let a0 = pk, a1 = pk;
    while (a0 > 0 && p[a0 - 1] >= p[pk] * 0.995) a0--;
    while (a1 < p.length - 1 && p[a1 + 1] >= p[pk] * 0.995) a1++;
    const peak = Math.round((a0 + a1) / 2);
    const delay = peak - 4 * os; // samples from symbol start to pulse peak
    // DFE (ideal decisions): subtract Σ d_k · sym[n-k] across UI n centered on the sampling point
    if (cfg.dfe && cfg.dfe.some((d) => d)) {
      const half = os / 2;
      for (let n = 0; n < sym.length; n++) {
        let c = 0;
        cfg.dfe.forEach((d, k) => { if (n - k - 1 >= 0) c += d * sym[n - k - 1]; });
        const a = Math.max(0, n * os + delay - half), b = Math.min(w.length, n * os + delay + half);
        for (let i = a; i < b; i++) w[i] -= c;
      }
    }
    if (cfg.noise && cfg.noiseAt !== 'channel') for (let i = 0; i < w.length; i++) w[i] += L.gauss(rnd) * cfg.noise;
    return { sym, bits, wave: w, pulse: p, pulseStart: 4 * os, peak, delay, os, levels, pam };
  };

  // cursors of a pulse response: h[k] at peak + k·os
  L.cursors = function (R, from, to) {
    const out = [];
    for (let k = from; k <= to; k++) { const i = R.peak + k * R.os; out.push([k, i >= 0 && i < R.pulse.length ? R.pulse[i] : 0]); }
    return out;
  };

  /* ---------------- eye metrics ----------------
     returns {height, width (UI), best (sample offset), heights[] per offset} */
  L.eyeMetrics = function (R, skip) {
    const os = R.os, n = R.sym.length, w = R.wave;
    skip = skip || 20;
    const lv = R.levels;
    const thr = []; for (let i = 0; i + 1 < lv.length; i++) thr.push((lv[i] + lv[i + 1]) / 2);
    const heights = [];
    let best = 0, bestH = -1e9;
    for (let off = -os / 2; off < os / 2; off++) {
      // per eye: min of upper group − max of lower group
      let hmin = 1e9;
      for (let e = 0; e < thr.length; e++) {
        let lo = -1e9, hi = 1e9;
        for (let k = skip; k < n - 2; k++) {
          const i = k * os + R.delay + off; if (i < 0 || i >= w.length) continue;
          const v = w[i], s = R.sym[k];
          // classify by transmitted level (ideal symbol), compare across this threshold
          const lvl = lv.indexOf(nearest(lv, s));
          if (lvl === e) lo = Math.max(lo, v);
          else if (lvl === e + 1) hi = Math.min(hi, v);
        }
        hmin = Math.min(hmin, hi - lo);
      }
      heights.push([off / os, hmin]);
      if (hmin > bestH) { bestH = hmin; best = off; }
    }
    const open = heights.filter((h) => h[1] > 0).length;
    return { height: Math.max(0, bestH), width: open / os, best, heights };
  };
  function nearest(arr, v) { let b = arr[0]; for (const a of arr) if (Math.abs(a - v) < Math.abs(b - v)) b = a; return b; }

  /* ---------------- eye drawing ----------------
     draws 2-UI traces centred on the sampling instant */
  L.drawEye = function (ctx, R, o) {
    const { w, h } = o;
    const os = R.os, n = R.sym.length, wave = R.wave;
    const pad = { l: 40, r: 10, t: 10, b: 24 };
    const yr = o.yRange || 1.3;
    const X = (s) => pad.l + (s / (2 * os)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v + yr) / (2 * yr)) * (h - pad.t - pad.b);
    ctx.clearRect(0, 0, w, h);
    const grid = NB.css('--grid'), mute = NB.css('--text-mute');
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const x = pad.l + i / 4 * (w - pad.l - pad.r); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); }
    const tv = [-0.75, -0.375, 0, 0.375, 0.75].map((k) => k * yr);
    tv.forEach((v) => { ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); });
    ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--mono'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [tv[0], 0, tv[4]].forEach((v) => ctx.fillText(v.toFixed(yr < 0.6 ? 2 : 1), pad.l - 5, Y(v)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ['-1 UI', '-0.5', '0', '+0.5', '+1 UI'].forEach((t, i) => ctx.fillText(t, pad.l + i / 4 * (w - pad.l - pad.r), h - pad.b + 5));
    const col = o.color || NB.css('--accent');
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.globalAlpha = o.alpha || Math.max(0.04, Math.min(0.35, 18 / n));
    const skip = 20;
    for (let k = skip; k < n - 2; k++) {
      const c = k * os + R.delay;
      ctx.beginPath();
      for (let s = 0; s <= 2 * os; s++) {
        const i = c - os + s; if (i < 0 || i >= wave.length) continue;
        const x = X(s), y = Y(wave[i]);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (o.metrics) {
      const M = o.metrics;
      const sx = X(os + M.best);
      ctx.strokeStyle = NB.css('--c3'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(sx, pad.t); ctx.lineTo(sx, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
      if (M.height > 0 && R.pam === 2) {
        ctx.strokeStyle = NB.css('--c2'); ctx.lineWidth = 2;
        const hh = M.height / 2;
        ctx.beginPath(); ctx.moveTo(sx, Y(-hh)); ctx.lineTo(sx, Y(hh)); ctx.stroke();
        const wx = M.width * os / 2;
        ctx.beginPath(); ctx.moveTo(X(os + M.best - wx), Y(0)); ctx.lineTo(X(os + M.best + wx), Y(0)); ctx.stroke();
      }
    }
  };

  /* ---------------- generic waveform plot ---------------- */
  // series: [{data: Float64Array|array, color, width, step?}], samples per x-unit given by os
  L.plotWave = function (ctx, o) {
    const { w, h } = o, pad = { l: o.padL || 40, r: 10, t: 10, b: 22 };
    const x0 = o.x0 || 0, x1 = o.x1, y0 = o.y0, y1 = o.y1;
    const X = (x) => pad.l + (x - x0) / (x1 - x0) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b);
    if (!o.keep) ctx.clearRect(0, 0, w, h);
    const grid = NB.css('--grid'), mute = NB.css('--text-mute');
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    (o.yTicks || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); });
    (o.xTicks || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(X(v), pad.t); ctx.lineTo(X(v), h - pad.b); ctx.stroke(); });
    ctx.fillStyle = mute; ctx.font = '11px ' + NB.css('--mono');
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    (o.yTicks || []).forEach((v) => ctx.fillText(o.yFmt ? o.yFmt(v) : v, pad.l - 5, Y(v)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    (o.xTicks || []).forEach((v) => ctx.fillText(o.xFmt ? o.xFmt(v) : v, X(v), h - pad.b + 4));
    (o.series || []).forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      const d = s.data, sx = s.xs || ((i) => i / (s.os || 1));
      let started = false;
      for (let i = 0; i < d.length; i++) {
        const xv = sx(i); if (xv < x0 - 1e-9 || xv > x1 + 1e-9) continue;
        const px = X(xv), py = Y(d[i]);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.setLineDash([]);
    });
    return { X, Y, pad };
  };

  L.fmtBER = function (b) {
    if (!(b > 0)) return '< 1e-300';
    if (b >= 0.01) return b.toFixed(3);
    const e = Math.floor(Math.log10(b)), m = b / Math.pow(10, e);
    return m.toFixed(1) + 'e' + e;
  };
})();
