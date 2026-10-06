/* ==========================================================
   NoC Book — cycle-level Network-on-Chip simulator engine
   - 2D mesh / torus (kx × ky, ky may be 1 → ring/line)
   - input-queued virtual-channel routers, credit-based flow control
   - wormhole switching with atomic VC allocation
   - separable round-robin switch allocation
   ========================================================== */
(function () {
  'use strict';
  const NB = window.NB;
  const L = 0, N = 1, E = 2, S = 3, W = 4;
  const PORT_NAMES = ['L', 'N', 'E', 'S', 'W'];
  const DX = [0, 0, 1, 0, -1], DY = [0, -1, 0, 1, 0];
  const OPP = [0, 3, 4, 1, 2];

  /* ---------------- geometry ---------------- */
  function Geo(kx, ky, torus) {
    this.kx = kx; this.ky = ky; this.n = kx * ky; this.torus = !!torus;
  }
  Geo.prototype.x = function (r) { return r % this.kx; };
  Geo.prototype.y = function (r) { return (r / this.kx) | 0; };
  Geo.prototype.id = function (x, y) { return y * this.kx + x; };
  Geo.prototype.nb = function (r, p) {
    if (p === L) return r;
    let x = this.x(r) + DX[p], y = this.y(r) + DY[p];
    if (this.torus) {
      if (DX[p] && this.kx < 2) return -1;
      if (DY[p] && this.ky < 2) return -1;
      x = (x + this.kx) % this.kx; y = (y + this.ky) % this.ky;
      // a 2-ary torus would double-link the same pair; treat as mesh link
      if (this.kx === 2 && DX[p] && ((p === E && this.x(r) === 1) || (p === W && this.x(r) === 0))) return -1;
      if (this.ky === 2 && DY[p] && ((p === S && this.y(r) === 1) || (p === N && this.y(r) === 0))) return -1;
      return this.id(x, y);
    }
    if (x < 0 || y < 0 || x >= this.kx || y >= this.ky) return -1;
    return this.id(x, y);
  };
  Geo.prototype.isWrap = function (r, p) {
    if (!this.torus) return false;
    const x = this.x(r), y = this.y(r);
    return (p === E && x === this.kx - 1) || (p === W && x === 0) || (p === S && y === this.ky - 1) || (p === N && y === 0);
  };
  // signed minimal offset per dimension (torus picks shortest, ties → positive)
  Geo.prototype.off = function (a, b) {
    let dx = this.x(b) - this.x(a), dy = this.y(b) - this.y(a);
    if (this.torus) {
      const kx = this.kx, ky = this.ky;
      let mx = ((dx % kx) + kx) % kx; dx = mx === 0 ? 0 : (mx <= kx / 2 ? mx : mx - kx);
      let my = ((dy % ky) + ky) % ky; dy = my === 0 ? 0 : (my <= ky / 2 ? my : my - ky);
    }
    return [dx, dy];
  };
  Geo.prototype.hops = function (a, b) { const o = this.off(a, b); return Math.abs(o[0]) + Math.abs(o[1]); };

  const xPort = (dx) => (dx > 0 ? E : W);
  const yPort = (dy) => (dy > 0 ? S : N);

  /* ---------------- routing algorithms ----------------
     ports(sim, r, pkt) → candidate output ports (minimal unless noted)
     classes: number of VC classes required (1 or 2)
     cls(sim, r, pkt, port) → class index for the VC on the next hop
     commit(sim, r, pkt, port) → update packet routing state after VA succeeds
  */
  function dor(order) {
    return function (sim, r, dst) {
      const o = sim.geo.off(r, dst);
      if (order === 0) { if (o[0]) return [xPort(o[0])]; if (o[1]) return [yPort(o[1])]; }
      else { if (o[1]) return [yPort(o[1])]; if (o[0]) return [xPort(o[0])]; }
      return [L];
    };
  }
  const XYf = dor(0), YXf = dor(1);
  function datelineCls(sim, r, pkt, p) {
    if (!sim.geo.torus || !sim.cfg.dateline) return 0;
    const dim = p === E || p === W ? 0 : 1;
    let crossed = pkt.dlDim === dim ? pkt.dlCrossed : false;
    if (sim.geo.isWrap(r, p)) crossed = true;
    return crossed ? 1 : 0;
  }
  function datelineCommit(sim, r, pkt, p) {
    if (p === L) return;
    const dim = p === E || p === W ? 0 : 1;
    pkt.dlCrossed = datelineCls(sim, r, pkt, p) === 1;
    pkt.dlDim = dim;
  }

  const ROUTING = {
    xy: {
      name: 'XY (차원 순서)', short: 'XY', torusOK: true, adaptive: false,
      classes: (sim) => (sim.geo.torus && sim.cfg.dateline ? 2 : 1),
      ports: (sim, r, pkt) => XYf(sim, r, pkt.dst),
      cls: datelineCls, commit: datelineCommit
    },
    yx: {
      name: 'YX (차원 순서)', short: 'YX', torusOK: true, adaptive: false,
      classes: (sim) => (sim.geo.torus && sim.cfg.dateline ? 2 : 1),
      ports: (sim, r, pkt) => YXf(sim, r, pkt.dst),
      cls: datelineCls, commit: datelineCommit
    },
    westfirst: {
      name: 'West-First (Turn model)', short: 'West-First', adaptive: true,
      ports(sim, r, pkt) {
        const o = sim.geo.off(r, pkt.dst);
        if (o[0] < 0) return [W];
        const c = [];
        if (o[0] > 0) c.push(E);
        if (o[1]) c.push(yPort(o[1]));
        return c.length ? c : [L];
      }
    },
    northlast: {
      name: 'North-Last (Turn model)', short: 'North-Last', adaptive: true,
      ports(sim, r, pkt) {
        const o = sim.geo.off(r, pkt.dst);
        if (o[1] < 0) return o[0] ? [xPort(o[0])] : [N];
        const c = [];
        if (o[0]) c.push(xPort(o[0]));
        if (o[1] > 0) c.push(S);
        return c.length ? c : [L];
      }
    },
    negfirst: {
      name: 'Negative-First (Turn model)', short: 'Neg-First', adaptive: true,
      ports(sim, r, pkt) {
        const o = sim.geo.off(r, pkt.dst);
        // negative directions = West and South (math convention: north = +y)
        const neg = [];
        if (o[0] < 0) neg.push(W);
        if (o[1] > 0) neg.push(S);
        if (neg.length) return neg;
        const pos = [];
        if (o[0] > 0) pos.push(E);
        if (o[1] < 0) pos.push(N);
        return pos.length ? pos : [L];
      }
    },
    oddeven: {
      name: 'Odd-Even (Chiu)', short: 'Odd-Even', adaptive: true,
      ports(sim, r, pkt) {
        const g = sim.geo;
        const cx = g.x(r), sx = g.x(pkt.src), dxx = g.x(pkt.dst);
        const o = g.off(r, pkt.dst);
        const e0 = o[0], e1 = o[1];
        const c = [];
        if (e0 === 0) { if (e1) c.push(yPort(e1)); }
        else if (e0 > 0) {
          if (e1 === 0) c.push(E);
          else {
            if (cx % 2 === 1 || cx === sx) c.push(yPort(e1));
            if (dxx % 2 === 1 || e0 !== 1) c.push(E);
          }
        } else {
          c.push(W);
          if (cx % 2 === 0 && e1) c.push(yPort(e1));
        }
        return c.length ? c : [L];
      }
    },
    adaptive: {
      name: '완전 적응형 최소 (제약 없음)', short: 'Min-Adaptive', adaptive: true, unsafe: true,
      ports(sim, r, pkt) {
        const o = sim.geo.off(r, pkt.dst);
        const c = [];
        if (o[0]) c.push(xPort(o[0]));
        if (o[1]) c.push(yPort(o[1]));
        return c.length ? c : [L];
      }
    },
    o1turn: {
      name: 'O1TURN (XY/YX 랜덤)', short: 'O1TURN', adaptive: false,
      classes: () => 2,
      init(sim, pkt) { pkt.order = sim.rand() < 0.5 ? 0 : 1; },
      ports: (sim, r, pkt) => (pkt.order ? YXf : XYf)(sim, r, pkt.dst),
      cls: (sim, r, pkt) => pkt.order
    },
    valiant: {
      name: 'Valiant (랜덤 중간 노드)', short: 'Valiant', adaptive: false,
      classes: () => 2,
      init(sim, pkt) { pkt.mid = (sim.rand() * sim.geo.n) | 0; pkt.phase = 0; },
      ports(sim, r, pkt) {
        if (pkt.phase === 0 && r === pkt.mid) pkt.phase = 1;
        return XYf(sim, r, pkt.phase === 0 ? pkt.mid : pkt.dst);
      },
      cls: (sim, r, pkt) => pkt.phase
    }
  };

  /* ---------------- traffic patterns ---------------- */
  function isPow2(n) { return n > 0 && (n & (n - 1)) === 0; }
  const TRAFFIC = {
    uniform: { name: 'Uniform Random', dest: (sim, s) => { let d; do { d = (sim.rand() * sim.geo.n) | 0; } while (d === s && sim.geo.n > 1); return d; } },
    transpose: { name: 'Transpose', dest: (sim, s) => { const g = sim.geo; if (g.kx !== g.ky) return -1; return g.id(g.y(s), g.x(s)); } },
    bitcomp: { name: 'Bit-Complement', dest: (sim, s) => { const g = sim.geo; return g.id(g.kx - 1 - g.x(s), g.ky - 1 - g.y(s)); } },
    bitrev: {
      name: 'Bit-Reverse', dest: (sim, s) => {
        const n = sim.geo.n; if (!isPow2(n)) return TRAFFIC.bitcomp.dest(sim, s);
        const b = Math.log2(n); let d = 0; for (let i = 0; i < b; i++) if (s & (1 << i)) d |= 1 << (b - 1 - i); return d;
      }
    },
    shuffle: {
      name: 'Shuffle', dest: (sim, s) => {
        const n = sim.geo.n; if (!isPow2(n)) return TRAFFIC.uniform.dest(sim, s);
        const b = Math.log2(n); return ((s << 1) | (s >> (b - 1))) & (n - 1);
      }
    },
    tornado: { name: 'Tornado', dest: (sim, s) => { const g = sim.geo; return g.id((g.x(s) + Math.ceil(g.kx / 2) - 1) % g.kx, g.y(s)); } },
    neighbor: { name: 'Nearest Neighbor', dest: (sim, s) => { const g = sim.geo; return g.id((g.x(s) + 1) % g.kx, g.y(s)); } },
    hotspot: {
      name: 'Hotspot (20%→중앙)', dest: (sim, s) => {
        const g = sim.geo, h = g.id((g.kx / 2) | 0, (g.ky / 2) | 0);
        if (sim.rand() < (sim.cfg.hotspotFrac || 0.2) && s !== h) return h;
        return TRAFFIC.uniform.dest(sim, s);
      }
    }
  };

  /* ---------------- simulator ---------------- */
  const DEFAULTS = {
    kx: 4, ky: 4, torus: false, dateline: true,
    vcs: 2, depth: 4, pktLen: 4, rate: 0.1,
    traffic: 'uniform', routing: 'xy',
    routerDelay: 2,       // cycles a head flit spends in a router (RC/VA/SA) before switch traversal
    seed: 1, hotspotFrac: 0.2,
    warmup: 0, measure: Infinity,
    deadlockWindow: 300,
    record: false          // keep per-cycle move list for animation
  };

  function Sim(cfg) {
    this.cfg = Object.assign({}, DEFAULTS, cfg || {});
    const c = this.cfg;
    this.geo = new Geo(c.kx, c.ky, c.torus);
    this.rand = NB.rng(c.seed * 9973 + 17);
    this.route = ROUTING[c.routing] || ROUTING.xy;
    this.pattern = TRAFFIC[c.traffic] || TRAFFIC.uniform;
    const n = this.geo.n, V = c.vcs, P = 5;
    this.V = V;
    this.ncls = this.route.classes ? this.route.classes(this) : 1;
    const NI = n * P * V;
    this.buf = new Array(NI);
    for (let i = 0; i < NI; i++) this.buf[i] = [];
    this.ivPort = new Int8Array(NI).fill(-1);
    this.ivVC = new Int16Array(NI).fill(-1);
    this.credits = new Int32Array(NI);
    this.outBusy = new Int32Array(NI).fill(-1);
    this.outTail = new Uint8Array(NI);
    for (let r = 0; r < n; r++) for (let p = 0; p < P; p++) for (let v = 0; v < V; v++) {
      const i = (r * P + p) * V + v;
      this.credits[i] = p === L ? 1e9 : (this.geo.nb(r, p) >= 0 ? c.depth : 0);
    }
    this.inPtr = new Int32Array(n * P);
    this.outPtr = new Int32Array(n * P);
    this.vaPtr = new Int32Array(n);
    this.srcQ = new Array(n); for (let r = 0; r < n; r++) this.srcQ[r] = [];
    this.niCur = new Array(n).fill(null);
    this.flitT = []; this.credT = [];
    this.moves = []; this.prevMoves = [];
    this.linkUtil = new Float32Array(n * P);
    this.linkCount = new Uint32Array(n * P);
    this.t = 0;
    this.inNet = 0;
    this.lastMove = 0;
    this.deadlocked = false;
    this.pktId = 0;
    this.st = { created: 0, injFlits: 0, ejFlits: 0, mCreated: 0, mDone: 0, latSum: 0, netSum: 0, hopSum: 0, qSum: 0, latMax: 0, winEj: 0, winLatSum: 0, winLatN: 0, hist: [] };
    this.series = [];
    this.winStart = 0;
  }

  Sim.prototype.vcRange = function (cls) {
    const V = this.V;
    if (this.ncls < 2 || V < 2) return [0, V];
    const h = Math.ceil(V / 2);
    return cls ? [h, V] : [0, h];
  };

  Sim.prototype.newPacket = function (src, dst, opts) {
    const pkt = { id: this.pktId++, src, dst, len: (opts && opts.len) || this.cfg.pktLen, t0: this.t, tInj: -1, hops: 0, measure: false };
    if (opts) Object.assign(pkt, opts);
    pkt.color = pkt.color || ((pkt.id * 7 + src * 3) % 8);
    if (this.route.init) this.route.init(this, pkt);
    return pkt;
  };
  // manual injection (for scripted demos)
  Sim.prototype.inject = function (src, dst, opts) {
    const p = this.newPacket(src, dst, opts);
    this.srcQ[src].push(p);
    this.st.created++;
    return p;
  };

  Sim.prototype.outFree = function (o, p) {
    if (this.outBusy[o] < 0) return true;
    if (p !== L && this.outTail[o] && this.credits[o] === this.cfg.depth) { this.outBusy[o] = -1; this.outTail[o] = 0; return true; }
    return false;
  };

  Sim.prototype.step = function () {
    const c = this.cfg, g = this.geo, n = g.n, V = this.V, P = 5, t = this.t;
    const st = this.st;
    this.prevMoves = this.moves;
    this.moves = [];
    let moved = false;
    // 1. link & credit arrival
    const ft = this.flitT; this.flitT = [];
    for (let k = 0; k < ft.length; k++) { const m = ft[k]; m.f.arr = t; this.buf[m.i].push(m.f); }
    const ct = this.credT; this.credT = [];
    for (let k = 0; k < ct.length; k++) this.credits[ct[k]]++;
    // 2. traffic generation
    const measuring = t >= c.warmup && t < c.warmup + c.measure;
    if (c.rate > 0 && t < c.warmup + c.measure) {
      const pg = c.rate / c.pktLen;
      for (let r = 0; r < n; r++) {
        if (this.rand() < pg) {
          const d = this.pattern.dest(this, r);
          if (d < 0 || d === r) continue;
          const pkt = this.newPacket(r, d);
          pkt.measure = measuring;
          if (measuring) st.mCreated++;
          st.created++;
          this.srcQ[r].push(pkt);
        }
      }
    }
    // 3. network interface injection (1 flit / cycle)
    for (let r = 0; r < n; r++) {
      let cur = this.niCur[r];
      if (!cur) {
        if (!this.srcQ[r].length) continue;
        const base = (r * P + L) * V;
        let vc = -1;
        for (let v = 0; v < V; v++) if (this.buf[base + v].length === 0 && this.ivVC[base + v] < 0) { vc = v; break; }
        if (vc < 0) continue;
        const pkt = this.srcQ[r].shift();
        cur = this.niCur[r] = { pkt, vc, sent: 0 };
      }
      const i = (r * P + L) * V + cur.vc;
      if (this.buf[i].length < c.depth) {
        const pkt = cur.pkt;
        const f = { pkt, head: cur.sent === 0, tail: cur.sent === pkt.len - 1, arr: t, seq: cur.sent };
        if (f.head) pkt.tInj = t;
        this.buf[i].push(f);
        cur.sent++;
        this.inNet++;
        st.injFlits++;
        if (cur.sent === pkt.len) this.niCur[r] = null;
      }
    }
    // 4. routers: RC + VA, then SA + ST
    const rd = Math.max(1, c.routerDelay);
    for (let r = 0; r < n; r++) {
      const base = r * P * V;
      // --- route computation + VC allocation (rotating priority)
      const tot = P * V, start = this.vaPtr[r];
      for (let kk = 0; kk < tot; kk++) {
        const iv = base + ((start + kk) % tot);
        const q = this.buf[iv];
        if (!q.length || this.ivVC[iv] >= 0) continue;
        const f = q[0];
        if (!f.head) continue;
        const pkt = f.pkt;
        let ports = this.route.ports(this, r, pkt);
        if (ports.length > 1) {
          // adaptive selection: prefer port with the most downstream credits (ties broken randomly)
          const sel = c.select || 'credit';
          const sc = ports.map((p, idx) => {
            let cr = 0, fv = 0, tot = 0; const ob = (r * P + p) * V;
            for (let v = 0; v < V; v++) { tot += this.credits[ob + v]; if (this.outBusy[ob + v] < 0 || (this.outTail[ob + v] && this.credits[ob + v] === c.depth)) { fv++; cr += this.credits[ob + v] + c.depth; } }
            const s = sel === 'random' ? this.rand() : sel === 'order' ? -idx : sel === 'freevc' ? fv * 100 + tot + this.rand() * 0.5 : sel === 'total' ? tot + this.rand() * 0.5 : cr + this.rand() * 0.5;
            return { p, s };
          });
          sc.sort((a, b) => b.s - a.s);
          ports = sc.map((x) => x.p);
        }
        let done = false;
        for (let pi = 0; pi < ports.length && !done; pi++) {
          const p = ports[pi];
          const ob = (r * P + p) * V;
          let lo = 0, hi = V;
          if (p !== L && this.ncls > 1) { const cls = this.route.cls ? this.route.cls(this, r, pkt, p) : 0; const rg = this.vcRange(cls); lo = rg[0]; hi = rg[1]; }
          for (let v = lo; v < hi; v++) {
            const o = ob + v;
            if (this.outFree(o, p)) {
              this.outBusy[o] = iv; this.outTail[o] = 0;
              this.ivPort[iv] = p; this.ivVC[iv] = v;
              if (this.route.commit) this.route.commit(this, r, pkt, p);
              done = true; break;
            }
          }
        }
      }
      this.vaPtr[r] = (start + 1) % tot;
      // --- switch allocation: input stage (one VC per input port)
      const req = [-1, -1, -1, -1, -1];
      for (let p = 0; p < P; p++) {
        const ib = (r * P + p) * V;
        const s0 = this.inPtr[r * P + p];
        for (let kk = 0; kk < V; kk++) {
          const v = (s0 + kk) % V, iv = ib + v;
          const q = this.buf[iv];
          if (!q.length || this.ivVC[iv] < 0) continue;
          const f = q[0];
          if (t < f.arr + (f.head ? rd - 1 : 0)) continue;
          const op = this.ivPort[iv];
          const o = (r * P + op) * V + this.ivVC[iv];
          if (op !== L && this.credits[o] <= 0) continue;
          req[p] = iv; break;
        }
      }
      // --- output stage (one input per output port)
      for (let op = 0; op < P; op++) {
        const s0 = this.outPtr[r * P + op];
        let win = -1, winP = -1;
        for (let kk = 0; kk < P; kk++) {
          const p = (s0 + kk) % P;
          const iv = req[p];
          if (iv >= 0 && this.ivPort[iv] === op) { win = iv; winP = p; break; }
        }
        if (win < 0) continue;
        this.outPtr[r * P + op] = (winP + 1) % P;
        this.inPtr[r * P + winP] = ((win % V) + 1) % V;
        // --- switch + link traversal
        const f = this.buf[win].shift();
        const ov = this.ivVC[win];
        const o = (r * P + op) * V + ov;
        moved = true;
        // return credit upstream
        if (winP !== L) {
          const up = g.nb(r, winP);
          this.credT.push((up * P + OPP[winP]) * V + (win % V));
        }
        if (op === L) {
          this.inNet--;
          if (t >= c.warmup && t < c.warmup + c.measure) st.winEj++;
          st.ejFlits++;
          if (f.tail) {
            this.outBusy[o] = -1;
            const pkt = f.pkt; pkt.tDone = t + 1;
            const lat = t + 1 - pkt.t0;
            st.winLatSum += lat; st.winLatN++;
            if (pkt.measure) {
              st.mDone++; st.latSum += lat; st.netSum += t + 1 - pkt.tInj; st.hopSum += pkt.hops; st.qSum += pkt.tInj - pkt.t0;
              if (lat > st.latMax) st.latMax = lat;
              const b = Math.min(63, Math.floor(lat / 4)); st.hist[b] = (st.hist[b] || 0) + 1;
            }
            if (this.onDeliver) this.onDeliver(pkt);
          }
          if (c.record) this.moves.push({ r, p: L, f });
        } else {
          this.credits[o]--;
          if (f.tail) this.outTail[o] = 1;
          if (f.head) f.pkt.hops++;
          const nbr = g.nb(r, op);
          this.flitT.push({ f, i: (nbr * P + OPP[op]) * V + ov });
          this.linkCount[r * P + op]++;
          if (c.record) this.moves.push({ r, p: op, f, wrap: g.isWrap(r, op) });
        }
        if (f.tail) { this.ivPort[win] = -1; this.ivVC[win] = -1; }
      }
    }
    // link utilisation EMA (for visualisation)
    if (c.record) {
      const lu = this.linkUtil;
      for (let k = 0; k < lu.length; k++) lu[k] *= 0.96;
      for (const m of this.moves) if (m.p !== L) lu[m.r * P + m.p] += 0.04;
    }
    if (moved || this.inNet === 0) this.lastMove = t;
    if (this.inNet > 0 && t - this.lastMove > c.deadlockWindow) this.deadlocked = true;
    this.t++;
    // sliding-window time series every 100 cycles
    if (this.t - this.winStart >= 100) {
      const dt = this.t - this.winStart;
      this.series.push({ t: this.t, lat: st.winLatN ? st.winLatSum / st.winLatN : null, acc: (st.ejFlits - (this._ejAtWin || 0)) / (n * dt), q: this.queued() });
      this._ejAtWin = st.ejFlits;
      st.winLatSum = 0; st.winLatN = 0;
      this.winStart = this.t;
      if (this.series.length > 400) this.series.shift();
    }
  };


  // Build the VC wait-for graph and return one cycle (list of input-VC indices) or null.
  Sim.prototype.waitCycle = function () {
    const g = this.geo, V = this.V, P = 5, n = g.n;
    const edges = new Map();
    const add = (a, b) => { if (a === b) return; if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
    for (let r = 0; r < n; r++) for (let p = 0; p < P; p++) for (let v = 0; v < V; v++) {
      const iv = (r * P + p) * V + v, q = this.buf[iv];
      if (!q.length) continue;
      const op = this.ivPort[iv];
      if (op >= 0) {
        if (op === L) continue;
        const o = (r * P + op) * V + this.ivVC[iv];
        if (this.credits[o] <= 0) add(iv, (g.nb(r, op) * P + OPP[op]) * V + this.ivVC[iv]);
      } else if (q[0].head) {
        const ports = this.route.ports(this, r, q[0].pkt);
        for (const pp of ports) {
          if (pp === L) continue;
          for (let vv = 0; vv < V; vv++) {
            const o = (r * P + pp) * V + vv;
            if (this.outBusy[o] >= 0) {
              const down = (g.nb(r, pp) * P + OPP[pp]) * V + vv;
              add(iv, this.buf[down].length ? down : this.outBusy[o]);
            }
          }
        }
      }
    }
    const color = new Map(), stack = [];
    let found = null;
    const dfs = (u) => {
      color.set(u, 1); stack.push(u);
      for (const w of edges.get(u) || []) {
        if (found) return;
        const c = color.get(w) || 0;
        if (c === 1) { found = stack.slice(stack.indexOf(w)); return; }
        if (c === 0) dfs(w);
      }
      stack.pop(); color.set(u, 2);
    };
    for (const u of edges.keys()) { if (found) break; if (!color.get(u)) dfs(u); }
    return found;
  };

  Sim.prototype.queued = function () {
    let q = 0;
    for (const s of this.srcQ) q += s.length;
    return q;
  };
  Sim.prototype.bufOcc = function (r, p) {
    let s = 0; const V = this.V, b = (r * 5 + p) * V;
    for (let v = 0; v < V; v++) s += this.buf[b + v].length;
    return s / (V * this.cfg.depth);
  };
  Sim.prototype.results = function () {
    const st = this.st, c = this.cfg, n = this.geo.n;
    const span = Math.max(1, Math.min(this.t, c.warmup + c.measure) - c.warmup);
    return {
      latency: st.mDone ? st.latSum / st.mDone : null,
      netLatency: st.mDone ? st.netSum / st.mDone : null,
      queueing: st.mDone ? st.qSum / st.mDone : null,
      hops: st.mDone ? st.hopSum / st.mDone : null,
      throughput: st.winEj / (n * span),
      done: st.mDone, created: st.mCreated, maxLat: st.latMax
    };
  };

  // Run a single offered-load point headlessly.
  // Returns {rate, latency, throughput, saturated}
  function runPoint(cfg, o) {
    o = Object.assign({ warmup: 1000, measure: 2000, drainMax: 4000, latCap: 600 }, o || {});
    const sim = new Sim(Object.assign({}, cfg, { warmup: o.warmup, measure: o.measure, record: false }));
    const end = o.warmup + o.measure;
    while (sim.t < end) { sim.step(); if (sim.deadlocked) break; }
    let drain = 0;
    while (!sim.deadlocked && sim.st.mDone < sim.st.mCreated && drain < o.drainMax) { sim.step(); drain++; }
    const res = sim.results();
    const sat = sim.deadlocked || sim.st.mDone < sim.st.mCreated || (res.latency != null && res.latency > o.latCap) || sim.queued() > sim.geo.n * 40;
    return Object.assign(res, { rate: cfg.rate, saturated: sat, deadlocked: sim.deadlocked });
  }

  /* ---------------- analytic channel load ----------------
     loads[r*5+p] = expected flits/cycle on channel per unit injection rate (flits/node/cycle) */
  function channelLoad(cfg) {
    const geo = new Geo(cfg.kx, cfg.ky, cfg.torus);
    const fake = { geo, cfg: Object.assign({}, DEFAULTS, cfg), rand: Math.random };
    const route = ROUTING[cfg.routing] || ROUTING.xy;
    const n = geo.n;
    const loads = new Float64Array(n * 5);
    // traffic matrix rows
    function dests(s) {
      const pat = cfg.traffic;
      if (pat === 'uniform') { const out = []; for (let d = 0; d < n; d++) if (d !== s) out.push([d, 1 / (n - 1)]); return out; }
      if (pat === 'hotspot') {
        const h = geo.id((geo.kx / 2) | 0, (geo.ky / 2) | 0), f = cfg.hotspotFrac || 0.2;
        const out = [];
        for (let d = 0; d < n; d++) if (d !== s) out.push([d, (s === h ? 1 : 1 - f) / (n - 1) + (d === h && s !== h ? f : 0)]);
        return out;
      }
      const sim = { geo, cfg: fake.cfg, rand: () => 0.5 };
      const d = TRAFFIC[pat].dest(sim, s);
      return d < 0 || d === s ? [] : [[d, 1]];
    }
    function trace(s, d, w, pkt) {
      let r = s, guard = 0;
      while (r !== d && guard++ < 4 * n) {
        const p = route.ports(fake, r, pkt)[0];
        if (p === L) break;
        loads[r * 5 + p] += w;
        r = geo.nb(r, p);
      }
    }
    for (let s = 0; s < n; s++) {
      for (const [d, w] of dests(s)) {
        if (cfg.routing === 'o1turn') {
          trace(s, d, w / 2, { src: s, dst: d, order: 0 }); trace(s, d, w / 2, { src: s, dst: d, order: 1 });
        } else if (cfg.routing === 'valiant') {
          for (let m = 0; m < n; m++) {
            const pkt = { src: s, dst: d, mid: m, phase: 0 };
            let r = s, guard = 0;
            while (guard++ < 4 * n) {
              const p = route.ports(fake, r, pkt)[0];
              if (p === L) break;
              loads[r * 5 + p] += w / n;
              r = geo.nb(r, p);
            }
          }
        } else if (!route.adaptive) {
          trace(s, d, w, { src: s, dst: d });
        } else {
          // adaptive: split flow evenly across permitted minimal ports (DP by remaining distance)
          const wt = new Float64Array(n); wt[s] = w;
          const order = []; for (let r = 0; r < n; r++) order.push(r);
          order.sort((a, b) => geo.hops(b, d) - geo.hops(a, d));
          const pkt = { src: s, dst: d };
          for (const r of order) {
            if (!wt[r] || r === d) continue;
            const ps = route.ports(fake, r, pkt).filter((p) => p !== L);
            for (const p of ps) { loads[r * 5 + p] += wt[r] / ps.length; wt[geo.nb(r, p)] += wt[r] / ps.length; }
          }
        }
      }
    }
    let max = 0;
    for (let k = 0; k < loads.length; k++) if (loads[k] > max) max = loads[k];
    return { loads, max, ideal: max > 0 ? Math.min(1, 1 / max) : 1, geo };
  }

  /* ---------------- canvas renderer ----------------
     NB.noc.render(ctx, sim, {w,h,frac,detail,showUtil,heat,highlight}) */
  function layout(sim, w, h, o) {
    const g = sim.geo;
    const padX = g.torus ? 46 : 26, padY = g.torus && g.ky > 1 ? 46 : 26;
    const cs = Math.min((w - padX * 2) / g.kx, (h - padY * 2) / g.ky);
    const ox = (w - cs * g.kx) / 2, oy = (h - cs * g.ky) / 2;
    const b = Math.min(cs * (o.detail ? 0.56 : 0.42), o.maxBox || 999);
    return { cs, ox, oy, b, cx: (r) => ox + (g.x(r) + 0.5) * cs, cy: (r) => oy + (g.y(r) + 0.5) * cs };
  }

  // endpoints of the directed lane r --p--> nb
  function lane(sim, Lt, r, p) {
    const g = sim.geo;
    const x = Lt.cx(r), y = Lt.cy(r), hb = Lt.b / 2, off = Math.max(2.5, Lt.b * 0.17);
    const dx = DX[p], dy = DY[p];
    // right-hand traffic: offset perpendicular
    const px = -dy * off, py = dx * off;
    const x1 = x + dx * hb + px, y1 = y + dy * hb + py;
    const nbr = g.nb(r, p);
    if (g.isWrap(r, p)) {
      const ext = Math.min(30, Lt.cs * 0.38);
      const x2 = Lt.cx(nbr) - dx * hb + px, y2 = Lt.cy(nbr) - dy * hb + py;
      // cubic path going outward
      return { wrap: true, pts: [x1, y1, x1 + dx * ext + px * 0.0, y1 + dy * ext, x2 - dx * ext, y2 - dy * ext, x2, y2], bulge: (g.kx > 1 && dx ? 1 : 1) };
    }
    const x2 = Lt.cx(nbr) - dx * hb + px, y2 = Lt.cy(nbr) - dy * hb + py;
    return { wrap: false, pts: [x1, y1, x2, y2] };
  }
  function wrapPath(ctx, pts, sim, Lt, r, p) {
    const [x1, y1, , , , , x2, y2] = pts;
    const dx = DX[p], dy = DY[p];
    const g = sim.geo;
    // route around the outside: go out, run along the border, come back in
    const ext = Math.min(26, Lt.cs * 0.34) + (dx ? (g.y(r) % 2) * 4 : (g.x(r) % 2) * 4);
    ctx.moveTo(x1, y1);
    if (dx) {
      const ylane = y1 + (dy || 0);
      const outY = (g.ky === 1) ? ylane + (dx > 0 ? 1 : -1) * (Lt.cs * 0.42 + ext * 0.4) : ylane;
      if (g.ky === 1) {
        ctx.bezierCurveTo(x1 + dx * ext * 1.6, y1, x1 + dx * ext * 1.6, outY, x1 + dx * ext * 0.2, outY);
        ctx.lineTo(x2 - dx * ext * 0.2, outY);
        ctx.bezierCurveTo(x2 - dx * ext * 1.6, outY, x2 - dx * ext * 1.6, y2, x2, y2);
      } else {
        ctx.bezierCurveTo(x1 + dx * ext * 2.2, y1, x2 - dx * ext * 2.2, y2, x2, y2);
      }
    } else {
      ctx.bezierCurveTo(x1, y1 + dy * ext * 2.2, x2, y2 - dy * ext * 2.2, x2, y2);
    }
  }
  function wrapPoint(sim, Lt, r, p, pts, t) {
    // approximate position along the wrap path by sampling an off-screen path
    const [x1, y1, , , , , x2, y2] = pts;
    const dx = DX[p], dy = DY[p], g = sim.geo;
    const ext = Math.min(26, Lt.cs * 0.34) + (dx ? (g.y(r) % 2) * 4 : (g.x(r) % 2) * 4);
    const bz = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
    if (dx && g.ky === 1) {
      const outY = y1 + (dx > 0 ? 1 : -1) * (Lt.cs * 0.42 + ext * 0.4);
      if (t < 0.2) { const u = t / 0.2; return [bz(x1, x1 + dx * ext * 1.6, x1 + dx * ext * 1.6, x1 + dx * ext * 0.2, u), bz(y1, y1, outY, outY, u)]; }
      if (t > 0.8) { const u = (t - 0.8) / 0.2; return [bz(x2 - dx * ext * 0.2, x2 - dx * ext * 1.6, x2 - dx * ext * 1.6, x2, u), bz(outY, outY, y2, y2, u)]; }
      const u = (t - 0.2) / 0.6; return [NB.lerp(x1 + dx * ext * 0.2, x2 - dx * ext * 0.2, u), outY];
    }
    if (dx) return [bz(x1, x1 + dx * ext * 2.2, x2 - dx * ext * 2.2, x2, t), bz(y1, y1, y2, y2, t)];
    return [bz(x1, x1, x2, x2, t), bz(y1, y1 + dy * ext * 2.2, y2 - dy * ext * 2.2, y2, t)];
  }

  function render(ctx, sim, o) {
    o = o || {};
    const w = o.w, h = o.h, g = sim.geo, P = 5, V = sim.V;
    const Lt = layout(sim, w, h, o);
    const pal = NB.palette();
    const cLink = NB.css('--link'), cNode = NB.css('--node'), cStroke = NB.css('--node-stroke'), cText = NB.css('--text-soft'), cMute = NB.css('--text-mute');
    const cDanger = NB.css('--danger'), cAccent = NB.css('--accent');
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    const lw = Math.max(1.5, Math.min(5, Lt.b * 0.09));
    // links
    for (let r = 0; r < g.n; r++) for (let p = 1; p < P; p++) {
      if (g.nb(r, p) < 0) continue;
      const ln = lane(sim, Lt, r, p);
      let col = cLink, width = lw;
      if (o.heat) {
        const v = o.heat[r * P + p] / (o.heatMax || 1);
        col = NB.util(v); width = lw * (1 + v * 0.9);
      } else if (o.showUtil !== false) {
        const u = Math.min(1, sim.linkUtil[r * P + p] * 1.25);
        if (u > 0.02) { col = NB.util(u); width = lw * (1 + u * 0.8); }
      }
      ctx.strokeStyle = col; ctx.lineWidth = width;
      ctx.beginPath();
      if (ln.wrap) wrapPath(ctx, ln.pts, sim, Lt, r, p);
      else { ctx.moveTo(ln.pts[0], ln.pts[1]); ctx.lineTo(ln.pts[2], ln.pts[3]); }
      ctx.stroke();
      // arrow head (only when large enough)
      if (Lt.b > 26 && !ln.wrap) {
        const [x1, y1, x2, y2] = ln.pts;
        const mx = x1 + (x2 - x1) * 0.62, my = y1 + (y2 - y1) * 0.62;
        ctx.fillStyle = col;
        const a = Math.atan2(y2 - y1, x2 - x1), s = Math.max(4, lw * 1.6);
        ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * s, my + Math.sin(a) * s);
        ctx.lineTo(mx + Math.cos(a + 2.5) * s, my + Math.sin(a + 2.5) * s);
        ctx.lineTo(mx + Math.cos(a - 2.5) * s, my + Math.sin(a - 2.5) * s); ctx.fill();
      }
    }
    // wait-for cycle highlight
    if (o.cycle) {
      ctx.save();
      ctx.strokeStyle = cDanger; ctx.lineWidth = lw * 2.6; ctx.globalAlpha = 0.85;
      for (const iv of o.cycle) {
        const pv = (iv / V) | 0, p = pv % P, r = (pv / P) | 0;
        if (p === L) continue;
        const up = g.nb(r, p);
        const ln = lane(sim, Lt, up, OPP[p]);
        ctx.beginPath();
        if (ln.wrap) wrapPath(ctx, ln.pts, sim, Lt, up, OPP[p]);
        else { ctx.moveTo(ln.pts[0], ln.pts[1]); ctx.lineTo(ln.pts[2], ln.pts[3]); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // routers
    const hb = Lt.b / 2;
    for (let r = 0; r < g.n; r++) {
      const x = Lt.cx(r), y = Lt.cy(r);
      const hl = o.highlight && o.highlight[r];
      ctx.fillStyle = hl ? NB.alpha(hl, 0.18) : cNode;
      ctx.strokeStyle = sim.deadlocked && o.stuck && o.stuck[r] ? cDanger : (hl || cStroke);
      ctx.lineWidth = hl ? 2.4 : 1.4;
      NB.roundRect(ctx, x - hb, y - hb, Lt.b, Lt.b, Math.min(8, Lt.b * 0.18));
      ctx.fill(); ctx.stroke();
      if (o.detail && Lt.b >= 44) drawRouterDetail(ctx, sim, r, x, y, Lt.b, pal, cMute);
      else {
        // buffer occupancy bars on each side
        const bw = Lt.b * 0.5, bt = Math.max(2, Lt.b * 0.09);
        for (let p = 1; p < P; p++) {
          if (g.nb(r, p) < 0) continue;
          const occ = sim.bufOcc(r, p);
          if (occ <= 0) continue;
          ctx.fillStyle = NB.util(0.35 + 0.65 * Math.min(1, occ));
          const dx = DX[p], dy = DY[p];
          if (dx) ctx.fillRect(x + dx * (hb - 2) - (dx > 0 ? bt : 0), y - bw / 2 + bw * (1 - occ), bt, bw * occ);
          else ctx.fillRect(x - bw / 2, y + dy * (hb - 2) - (dy > 0 ? bt : 0), bw * occ, bt);
        }
        if (o.labels !== false && Lt.b >= 22) {
          ctx.fillStyle = cMute; ctx.font = Math.round(Math.min(12, Lt.b * 0.3)) + 'px ' + NB.css('--mono');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(o.labelFn ? o.labelFn(r) : String(r), x, y);
        }
      }
      // source queue indicator
      const q = sim.srcQ[r].length + (sim.niCur[r] ? 1 : 0);
      if (q > 0 && o.showQueue !== false) {
        const qh = Math.min(Lt.cs * 0.3, 2 + q * 1.5);
        ctx.fillStyle = q > 8 ? cDanger : cAccent;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(x + hb + 2, y + hb - qh, Math.max(2, Lt.b * 0.08), qh);
        ctx.globalAlpha = 1;
      }
    }
    // moving flits
    const frac = o.frac == null ? 1 : o.frac;
    const rad = Math.max(2.2, Math.min(6, Lt.b * 0.11));
    const mv = sim.moves;
    for (const m of mv) {
      const col = pal[m.f.pkt.color % pal.length];
      let px, py;
      if (m.p === L) {
        if (frac > 0.6) continue;
        px = Lt.cx(m.r); py = Lt.cy(m.r);
      } else {
        const ln = lane(sim, Lt, m.r, m.p);
        if (ln.wrap) { const q = wrapPoint(sim, Lt, m.r, m.p, ln.pts, frac); px = q[0]; py = q[1]; }
        else { px = NB.lerp(ln.pts[0], ln.pts[2], frac); py = NB.lerp(ln.pts[1], ln.pts[3], frac); }
      }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px, py, m.f.head ? rad * 1.25 : rad, 0, 7); ctx.fill();
      if (m.f.head) { ctx.strokeStyle = cNode; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    if (sim.deadlocked && o.deadlockBanner !== false) {
      ctx.fillStyle = NB.alpha(cDanger.startsWith('#') ? cDanger : '#e03131', 0.92);
      const txt = 'DEADLOCK — ' + sim.cfg.deadlockWindow + '사이클 동안 아무 플릿도 움직이지 못함';
      ctx.font = 'bold 14px ' + NB.css('--font');
      const tw = ctx.measureText(txt).width + 24;
      NB.roundRect(ctx, (w - tw) / 2, 8, tw, 30, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, w / 2, 23);
    }
    return Lt;
  }

  // Detailed view: every VC slot of each input port drawn with the occupying flit color
  function drawRouterDetail(ctx, sim, r, x, y, b, pal, cMute) {
    const g = sim.geo, V = sim.V, D = sim.cfg.depth;
    const hb = b / 2;
    const slot = Math.min(10, (b * 0.62) / Math.max(D, 1));
    const gap = 2;
    const rowH = Math.min(9, (b * 0.24) / V);
    ctx.font = Math.round(Math.min(11, b * 0.13)) + 'px ' + NB.css('--mono');
    ctx.fillStyle = cMute; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sim.cfgLabel ? sim.cfgLabel(r) : 'R' + r, x, y);
    for (let p = 0; p < 5; p++) {
      if (p !== L && g.nb(r, p) < 0) continue;
      if (p === L) continue;
      for (let v = 0; v < V; v++) {
        const q = sim.buf[(r * 5 + p) * V + v];
        for (let s = 0; s < D; s++) {
          // slots run from the port edge inward
          let sx, sy, sw, sh;
          const lanePos = (v - (V - 1) / 2) * (rowH + 1.5);
          if (p === N || p === S) {
            const dy = DY[p];
            sw = rowH; sh = slot;
            sx = x + lanePos - rowH / 2 + (p === N ? -b * 0.18 : b * 0.18);
            sy = y + dy * (hb - 3) - (dy > 0 ? sh : 0) - dy * s * (slot + 0.5);
          } else {
            const dx = DX[p];
            sw = slot; sh = rowH;
            sy = y + lanePos - rowH / 2 + (p === E ? -b * 0.18 : b * 0.18);
            sx = x + dx * (hb - 3) - (dx > 0 ? sw : 0) - dx * s * (slot + 0.5);
          }
          const f = q[s];
          ctx.fillStyle = f ? pal[f.pkt.color % pal.length] : NB.alpha(NB.css('--link').startsWith('#') ? NB.css('--link') : '#999999', 0.25);
          ctx.fillRect(sx, sy, sw - gap * 0.3, sh - gap * 0.3);
        }
      }
    }
  }


  /* ---------------- turn-model channel dependency check ----------------
     allowed(from, to) for 90° turns; straight always allowed; U-turns never.
     Returns shortest cycle as list of channels [{r,p}] or null. */
  function turnCycle(k, allowed, allowedAt) {
    const geo = new Geo(k, k, false);
    const ch = [], id = {};
    for (let r = 0; r < geo.n; r++) for (let p = 1; p <= 4; p++) if (geo.nb(r, p) >= 0) { id[r * 5 + p] = ch.length; ch.push({ r, p }); }
    const adj = ch.map(() => []);
    ch.forEach((c, i) => {
      const b = geo.nb(c.r, c.p);
      for (let q = 1; q <= 4; q++) {
        if (q === OPP[c.p] || geo.nb(b, q) < 0) continue;
        const ok = q === c.p || (allowedAt ? allowedAt(b, c.p, q, geo) : allowed(c.p, q));
        if (ok) adj[i].push(id[b * 5 + q]);
      }
    });
    let best = null;
    for (let s = 0; s < ch.length; s++) {
      const prev = new Int32Array(ch.length).fill(-1), seen = new Uint8Array(ch.length);
      const q = [s]; seen[s] = 1; let found = -1;
      while (q.length && found < 0) {
        const u = q.shift();
        for (const v of adj[u]) {
          if (v === s) { found = u; break; }
          if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); }
        }
      }
      if (found >= 0) {
        const path = [];
        for (let u = found; u !== -1; u = prev[u]) path.push(ch[u]);
        path.reverse();
        if (!best || path.length < best.length) best = path;
        if (best.length <= 4) break;
      }
    }
    return best;
  }

  NB.noc = { turnCycle, Geo, Sim, ROUTING, TRAFFIC, runPoint, channelLoad, render, layout, lane, PORT_NAMES, DX, DY, OPP, L, N, E, S, W };
})();
