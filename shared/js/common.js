/* ==========================================================
   Shared runtime for NoC Book & LinkBook: layout, theme, UI helpers, charts
   ========================================================== */
(function () {
  'use strict';

  // A page may define window.NB_BOOK = {name, tagline, logo, chapters, storeKey} before loading this file
  const BOOK = window.NB_BOOK || {};
  const CHAPTERS = BOOK.chapters || [{ file: 'index.html', num: '', title: '표지' }];

  const NB = (window.NB = {});
  NB.CHAPTERS = CHAPTERS;
  NB.BOOK = BOOK;
  const BOOK_NAME = BOOK.name || 'Book', BOOK_TAG = BOOK.tagline || '';

  /* ---------------- DOM helpers ---------------- */
  NB.$ = (s, r = document) => r.querySelector(s);
  NB.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  NB.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  };
  NB.svgEl = function (tag, attrs, parent) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  NB.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  NB.palette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'].map(NB.css);
  NB.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  NB.lerp = (a, b, t) => a + (b - a) * t;
  NB.fmt = (x, d = 2) => (x == null || !isFinite(x) ? '—' : Number(x).toFixed(d));
  NB.store = {
    get(k, d) { try { const v = localStorage.getItem('nocbook:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('nocbook:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  // seeded PRNG (mulberry32)
  NB.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------------- theme ---------------- */
  const themeListeners = [];
  NB.onTheme = (fn) => themeListeners.push(fn);
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    themeListeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  }
  NB.isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const savedTheme = NB.store.get('theme', null);
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => applyTheme(document.documentElement.getAttribute('data-theme')));
  }

  /* ---------------- layout injection ---------------- */
  const LOGO = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/>' +
    '<g stroke="#fff" stroke-width="1.6" opacity=".85"><path d="M9 9H23M9 16H23M9 23H23M9 9V23M16 9V23M23 9V23"/></g>' +
    '<g fill="#fff"><circle cx="9" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><circle cx="23" cy="9" r="2.6"/><circle cx="9" cy="16" r="2.6"/><circle cx="16" cy="16" r="2.6"/><circle cx="23" cy="16" r="2.6"/><circle cx="9" cy="23" r="2.6"/><circle cx="16" cy="23" r="2.6"/><circle cx="23" cy="23" r="2.6"/></g></svg>';
  NB.LOGO = BOOK.logo || LOGO;

  function currentFile() {
    let f = location.pathname.split('/').pop();
    if (!f) f = 'index.html';
    return f;
  }

  function buildHeader() {
    const h = NB.el('header', { class: 'site-header' });
    h.innerHTML =
      '<button class="icon-btn menu-btn" aria-label="목차 열기">☰</button>' +
      '<a class="brand" href="index.html">' + NB.LOGO + '<span>' + BOOK_NAME + ' <small>' + BOOK_TAG + '</small></span></a>' +
      '<div class="header-spacer"></div>' +
      '<button class="icon-btn theme-btn" aria-label="다크 모드 전환" title="테마 전환">◐</button>';
    document.body.prepend(h);
    document.body.append(NB.el('div', { class: 'progress-bar' }));
    h.querySelector('.theme-btn').addEventListener('click', () => {
      const next = NB.isDark() ? 'light' : 'dark';
      NB.store.set('theme', next);
      applyTheme(next);
    });
    h.querySelector('.menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    if (!NB.$('.sidebar')) h.querySelector('.menu-btn').style.display = 'none';
  }

  function buildSidebar() {
    const side = NB.$('.sidebar');
    if (!side) return;
    const cur = currentFile();
    const ul = NB.el('ul', { class: 'toc-list' });
    CHAPTERS.forEach((c) => {
      const li = NB.el('li', { class: c.file === cur ? 'active' : '' },
        NB.el('a', { href: c.file }, NB.el('span', { class: 'num' }, c.num || '◆'), NB.el('span', null, c.title)));
      if (c.file === cur) {
        const sub = NB.el('ul', { class: 'toc-sub' });
        NB.$$('.article h2[id]').forEach((h) => {
          sub.append(NB.el('li', null, NB.el('a', { href: '#' + h.id, 'data-target': h.id }, h.textContent.replace(/^\s*[\d.]+\s*/, ''))));
        });
        if (sub.children.length) li.append(sub);
      }
      ul.append(li);
    });
    side.append(NB.el('h4', null, '목차'), ul);
    side.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
  }

  function buildChapterNav() {
    const art = NB.$('.article');
    if (!art || !art.dataset.chapter) return;
    const i = CHAPTERS.findIndex((c) => c.file === currentFile());
    if (i < 0) return;
    const nav = NB.el('nav', { class: 'chapter-nav' });
    const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
    if (prev) nav.append(NB.el('a', { href: prev.file, class: 'prev' }, NB.el('small', null, '← 이전'), prev.title));
    if (next) nav.append(NB.el('a', { href: next.file, class: 'next' }, NB.el('small', null, '다음 →'), next.title));
    art.append(nav);
  }

  function numberSections() {
    const art = NB.$('.article[data-chapter]');
    if (!art) return;
    const ch = art.dataset.chapter;
    let s = 0;
    NB.$$('h2', art).forEach((h) => {
      if (h.classList.contains('nonum')) return;
      s++;
      if (!h.id) h.id = 's' + s;
      h.insertAdjacentHTML('afterbegin', '<span class="sec">' + ch + '.' + s + '</span>');
    });
    let f = 0;
    NB.$$('figure.figure figcaption', art).forEach((c) => { f++; c.insertAdjacentHTML('afterbegin', '<b>그림 ' + ch + '.' + f + '</b> '); });
  }

  function scrollSpy() {
    const bar = NB.$('.progress-bar');
    const links = NB.$$('.toc-sub a');
    const heads = links.map((a) => document.getElementById(a.dataset.target)).filter(Boolean);
    function onScroll() {
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
      let cur = null;
      for (const hd of heads) if (hd.getBoundingClientRect().top < 140) cur = hd.id;
      links.forEach((a) => a.classList.toggle('current', a.dataset.target === cur));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function buildQuizzes() {
    NB.$$('.quiz').forEach((q) => {
      const ans = +q.dataset.answer;
      NB.$$('.opt', q).forEach((o, i) => {
        o.addEventListener('click', () => {
          if (q.classList.contains('done')) return;
          q.classList.add('done');
          o.classList.add(i === ans ? 'right' : 'wrong');
          NB.$$('.opt', q)[ans].classList.add('right');
        });
      });
    });
  }

  function renderMath() {
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }],
        throwOnError: false
      });
    }
  }

  /* ---------------- tooltip ---------------- */
  let tipBox = null;
  NB.tip = {
    show(html, x, y) {
      if (!tipBox) { tipBox = NB.el('div', { class: 'tip-box' }); document.body.append(tipBox); }
      tipBox.innerHTML = html;
      tipBox.classList.add('show');
      const w = tipBox.offsetWidth, hh = tipBox.offsetHeight;
      let L = x + 14, T = y + 14;
      if (L + w > window.innerWidth - 8) L = x - w - 14;
      if (T + hh > window.innerHeight - 8) T = y - hh - 14;
      tipBox.style.left = Math.max(8, L) + 'px';
      tipBox.style.top = Math.max(8, T) + 'px';
    },
    hide() { if (tipBox) tipBox.classList.remove('show'); }
  };

  /* ---------------- controls ---------------- */
  // slider: returns {el, get, set}
  NB.slider = function (parent, o) {
    const val = NB.el('span', { class: 'val' });
    const input = NB.el('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value });
    const fmt = o.fmt || ((v) => v);
    const wrap = NB.el('div', { class: 'ctrl', style: o.width ? { minWidth: o.width + 'px' } : null },
      NB.el('label', null, NB.el('span', null, o.label), val), input);
    const upd = () => { val.textContent = fmt(+input.value); };
    input.addEventListener('input', () => { upd(); o.onInput && o.onInput(+input.value); });
    input.addEventListener('change', () => { o.onChange && o.onChange(+input.value); });
    upd();
    parent.append(wrap);
    return { el: wrap, input, get: () => +input.value, set: (v) => { input.value = v; upd(); } };
  };
  // segmented control
  NB.seg = function (parent, o) {
    const wrap = NB.el('div', { class: 'ctrl', style: { minWidth: 'auto' } });
    if (o.label) wrap.append(NB.el('span', { class: 'lbl' }, o.label));
    const seg = NB.el('div', { class: 'seg', role: 'group' });
    let cur = o.value;
    const btns = o.options.map((op) => {
      const v = typeof op === 'object' ? op.value : op;
      const b = NB.el('button', { type: 'button', class: v === cur ? 'on' : '', title: op.title || null }, typeof op === 'object' ? op.label : op);
      b.addEventListener('click', () => { set(v); o.onChange && o.onChange(v); });
      b._v = v;
      seg.append(b);
      return b;
    });
    function set(v) { cur = v; btns.forEach((b) => b.classList.toggle('on', b._v === v)); }
    wrap.append(seg);
    parent.append(wrap);
    return { el: wrap, get: () => cur, set };
  };
  NB.select = function (parent, o) {
    const s = NB.el('select');
    o.options.forEach((op) => s.append(NB.el('option', { value: op.value }, op.label)));
    s.value = o.value;
    s.addEventListener('change', () => o.onChange && o.onChange(s.value));
    const wrap = NB.el('div', { class: 'ctrl' }, NB.el('label', null, o.label), s);
    parent.append(wrap);
    return { el: wrap, select: s, get: () => s.value, set: (v) => { s.value = v; } };
  };
  NB.button = function (parent, label, fn, cls) {
    const b = NB.el('button', { type: 'button', class: 'btn ' + (cls || '') }, label);
    b.addEventListener('click', fn);
    parent.append(b);
    return b;
  };
  NB.checkbox = function (parent, o) {
    const i = NB.el('input', { type: 'checkbox' });
    i.checked = !!o.value;
    i.addEventListener('change', () => o.onChange && o.onChange(i.checked));
    const l = NB.el('label', { class: 'check' }, i, o.label);
    parent.append(l);
    return { el: l, get: () => i.checked, set: (v) => { i.checked = v; } };
  };
  NB.stats = function (parent, defs) {
    const g = NB.el('div', { class: 'stats' });
    const out = {};
    defs.forEach((d) => {
      const v = NB.el('div', { class: 'v' }, '—');
      const s = NB.el('div', { class: 'stat' }, NB.el('div', { class: 'k' }, d.label), v);
      out[d.key] = {
        set(x, unit, cls) { v.innerHTML = x + (unit ? ' <small>' + unit + '</small>' : ''); s.className = 'stat ' + (cls || ''); },
        el: s
      };
      g.append(s);
    });
    parent.append(g);
    return out;
  };

  // Build a widget skeleton inside a placeholder <div class="widget" data-title="...">
  NB.widget = function (id) {
    const w = typeof id === 'string' ? document.getElementById(id) : id;
    if (!w) return null;
    const title = w.dataset.title || '';
    let tag = w.dataset.tag;
    if (!tag) {
      const art = w.closest('.article[data-chapter]');
      if (art) tag = '실험 ' + art.dataset.chapter + '.' + (NB.$$('.widget', art).indexOf(w) + 1);
    }
    const head = NB.el('div', { class: 'widget-head' }, NB.el('span', { class: 'tag' }, tag || '실험'), NB.el('span', { class: 'title' }, title));
    const body = NB.el('div', { class: 'widget-body' });
    const foot = w.querySelector('.foot');
    w.prepend(head);
    w.insertBefore(body, foot || null);
    if (foot) foot.className = 'widget-foot';
    return { root: w, head, body, foot };
  };

  /* ---------------- canvas ---------------- */
  // Responsive HiDPI canvas. aspect = height/width or fixed height via o.height
  NB.canvas = function (parent, o) {
    o = o || {};
    const c = NB.el('canvas');
    parent.append(c);
    const ctx = c.getContext('2d');
    const api = { canvas: c, ctx, w: 0, h: 0, draw: o.draw || null };
    function resize() {
      const w = Math.max(200, c.parentElement.clientWidth);
      let h = o.height ? (typeof o.height === 'function' ? o.height(w) : o.height) : w * (o.aspect || 0.5);
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      api.w = w; api.h = h;
      if (api.draw) api.draw();
    }
    api.resize = resize;
    if (window.ResizeObserver) {
      let lastW = 0;
      new ResizeObserver(() => { const w = c.parentElement.clientWidth; if (Math.abs(w - lastW) > 1) { lastW = w; resize(); } }).observe(parent);
    } else window.addEventListener('resize', resize);
    NB.onTheme(() => api.draw && api.draw());
    requestAnimationFrame(resize);
    resize();
    // pointer helper
    api.pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    return api;
  };

  // run fn only when element visible (perf for animations)
  NB.visible = function (el, cb) {
    if (!window.IntersectionObserver) { cb(true); return; }
    new IntersectionObserver((ents) => ents.forEach((e) => cb(e.isIntersecting)), { rootMargin: '100px' }).observe(el);
  };

  // Animation loop helper that pauses offscreen
  NB.loop = function (el, step) {
    let on = false, raf = 0, last = 0;
    function f(t) {
      if (!on) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      step(dt, t);
      raf = requestAnimationFrame(f);
    }
    NB.visible(el, (v) => {
      if (v && !on) { on = true; last = 0; raf = requestAnimationFrame(f); }
      else if (!v) { on = false; cancelAnimationFrame(raf); }
    });
  };

  NB.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  NB.arrow = function (ctx, x1, y1, x2, y2, size) {
    size = size || 6;
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45));
    ctx.lineTo(x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  };
  // color ramp for heatmaps: 0..1 → from surface to accent → warn → danger
  NB.heat = function (t) {
    t = NB.clamp(t, 0, 1);
    const stops = NB.isDark()
      ? [[45, 48, 58], [60, 110, 220], [56, 217, 169], [252, 196, 25], [255, 107, 107]]
      : [[236, 234, 228], [116, 143, 252], [12, 166, 120], [245, 159, 0], [224, 49, 49]];
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  };
  // utilisation ramp: idle grey → amber → red (kept distinct from categorical flit colours)
  NB.util = function (t) {
    t = NB.clamp(t, 0, 1);
    const stops = NB.isDark()
      ? [[75, 78, 90], [190, 150, 60], [255, 146, 43], [255, 80, 80]]
      : [[190, 186, 176], [240, 180, 60], [232, 89, 12], [201, 30, 30]];
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  };
  NB.alpha = function (color, a) {
    // color as #rrggbb or rgb(); returns rgba
    if (color.startsWith('#')) {
      let h = color.slice(1);
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    const m = color.match(/[\d.]+/g);
    return m ? 'rgba(' + m[0] + ',' + m[1] + ',' + m[2] + ',' + a + ')' : color;
  };

  /* ---------------- line chart ---------------- */
  // NB.chart(parent, {height, xLabel, yLabel, logX, logY, xMin, xMax, yMin, yMax, series:[{name,color,points:[[x,y]],dash,marker}]})
  NB.chart = function (parent, opts) {
    const wrap = NB.el('div');
    parent.append(wrap);
    const cv = NB.canvas(wrap, { height: opts.height || 260 });
    const legend = NB.el('div', { class: 'legend' });
    parent.append(legend);
    const state = Object.assign({ series: [] }, opts);
    let hover = null;
    function ext(axis) {
      let lo = Infinity, hi = -Infinity;
      state.series.forEach((s) => s.points.forEach((p) => { const v = p[axis]; if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (lo === hi) { hi = lo + 1; }
      return [lo, hi];
    }
    function niceTicks(lo, hi, n) {
      const span = hi - lo, step0 = span / n;
      const mag = Math.pow(10, Math.floor(Math.log10(step0)));
      const r = step0 / mag;
      const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
      const out = [];
      for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
      return out;
    }
    function draw() {
      const { ctx, w, h } = cv;
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 56, r: 16, t: 14, b: 42 };
      const [ex0, ex1] = ext(0), [ey0, ey1] = ext(1);
      let x0 = state.xMin != null ? state.xMin : ex0, x1 = state.xMax != null ? state.xMax : ex1;
      let y0 = state.yMin != null ? state.yMin : (state.logY ? ey0 : Math.min(0, ey0)), y1 = state.yMax != null ? state.yMax : ey1 * (state.logY ? 1.5 : 1.08);
      if (state.logX && !(x0 > 0)) x0 = x1 > 0 ? x1 / 1000 : 1;
      if (state.logX && !(x1 > x0)) x1 = x0 * 10;
      if (state.logY && !(y0 > 0)) y0 = y1 > 0 ? y1 / 1000 : 0.01;
      if (state.logY && !(y1 > y0)) y1 = y0 * 10;
      const fx = state.logX ? (v) => Math.log10(v) : (v) => v;
      const fy = state.logY ? (v) => Math.log10(Math.max(v, 1e-300)) : (v) => v;
      const X = (v) => pad.l + (fx(v) - fx(x0)) / (fx(x1) - fx(x0)) * (w - pad.l - pad.r);
      const Y = (v) => h - pad.b - (fy(Math.max(Math.min(v, y1 * 10), state.logY ? y0 / 1000 : -1e300)) - fy(y0)) / (fy(y1) - fy(y0)) * (h - pad.t - pad.b);
      const text = NB.css('--text-mute'), grid = NB.css('--grid');
      ctx.font = '12px ' + NB.css('--font');
      ctx.lineWidth = 1;
      // grid
      const xt = state.logX ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(3, Math.floor(w / 90)));
      const yt = state.logY ? logTicks(y0, y1) : niceTicks(y0, y1, 5);
      ctx.strokeStyle = grid; ctx.fillStyle = text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      xt.forEach((v) => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.fillText(fmtTick(v), x, h - pad.b + 6); });
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      yt.forEach((v) => { const y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(fmtTick(v), pad.l - 6, y); });
      // labels
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      if (state.xLabel) ctx.fillText(state.xLabel, pad.l + (w - pad.l - pad.r) / 2, h - 4);
      if (state.yLabel) { ctx.save(); ctx.translate(13, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(state.yLabel, 0, 0); ctx.restore(); }
      // annotations (vertical lines)
      (state.vlines || []).forEach((vl) => {
        const x = X(vl.x); if (x < pad.l || x > w - pad.r) return;
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = vl.color || text; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.restore();
        if (vl.label) { ctx.fillStyle = vl.color || text; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(vl.label, x + 4, pad.t + 2); }
      });
      // series
      ctx.save();
      ctx.beginPath(); ctx.rect(pad.l, pad.t - 4, w - pad.l - pad.r + 4, h - pad.t - pad.b + 4); ctx.clip();
      state.series.forEach((s) => {
        ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width || 2.2;
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        let started = false;
        s.points.forEach((p) => {
          if (p[1] == null || !isFinite(p[1])) { started = false; return; }
          const x = X(p[0]), y = Y(p[1]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        if (s.marker) s.points.forEach((p) => { if (p[1] == null || !isFinite(p[1])) return; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3.2, 0, 7); ctx.fill(); });
      });
      ctx.restore();
      // hover
      if (hover && state.series.length) {
        const xv = state.logX ? Math.pow(10, fx(x0) + (hover.x - pad.l) / (w - pad.l - pad.r) * (fx(x1) - fx(x0))) : x0 + (hover.x - pad.l) / (w - pad.l - pad.r) * (x1 - x0);
        if (xv >= x0 && xv <= x1) {
          const hx = X(xv);
          ctx.strokeStyle = text; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(hx, pad.t); ctx.lineTo(hx, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
          const rows = [];
          state.series.forEach((s) => {
            let best = null, bd = Infinity;
            s.points.forEach((p) => { if (p[1] == null || !isFinite(p[1])) return; const d = Math.abs(X(p[0]) - hx); if (d < bd) { bd = d; best = p; } });
            if (best && bd < 30) { rows.push([s, best]); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(best[0]), Y(best[1]), 4.5, 0, 7); ctx.fill(); }
          });
          if (rows.length) {
            const lines = rows.map(([s, p]) => s.name + ': ' + fmtTick(p[1], true) + (state.xFmt ? ' @ ' + state.xFmt(p[0]) : ' @ x=' + fmtTick(p[0], true)));
            ctx.font = '12px ' + NB.css('--font');
            const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, bh = lines.length * 17 + 8;
            let bx = hx + 10; if (bx + bw > w - 4) bx = hx - bw - 10;
            ctx.fillStyle = NB.alpha(NB.css('--surface').startsWith('#') ? NB.css('--surface') : '#ffffff', 0.94);
            ctx.strokeStyle = NB.css('--border-strong');
            NB.roundRect(ctx, bx, pad.t + 4, bw, bh, 6); ctx.fill(); ctx.stroke();
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            rows.forEach(([s], i) => { ctx.fillStyle = s.color; ctx.fillText(lines[i], bx + 8, pad.t + 9 + i * 17); });
          }
        }
      }
      // legend
      const lk = state.series.filter((s) => s.name && !s.noLegend).map((s) => s.name + s.color + (s.dash ? 'd' : '')).join('|');
      if (lk !== legend._k) {
        legend._k = lk;
        legend.innerHTML = '';
        state.series.forEach((s) => { if (s.name && !s.noLegend) legend.append(NB.el('span', null, NB.el('i', { style: { background: s.color, opacity: s.dash ? 0.6 : 1 } }), s.name)); });
      }
    }
    function logTicks(lo, hi) {
      const out = [];
      if (!(lo > 0) || !isFinite(hi)) return out;
      const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi)), dec = e1 - e0;
      const stepE = dec > 12 ? 3 : dec > 6 ? 2 : 1;
      const mult = dec > 4 ? [1] : [1, 2, 5];
      for (let e = e0; e <= e1 && out.length < 60; e++) {
        if ((e - e0) % stepE) continue;
        mult.forEach((m) => { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); });
      }
      return out;
    }
    function fmtTick(v, precise) {
      if (state.yFmt && precise) return state.yFmt(v);
      const a = Math.abs(v);
      if (a >= 1e9) { const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e); return (Math.abs(m - 1) < 1e-6 ? '' : +m.toPrecision(2) + '×') + '1e' + e; }
      if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
      if (a >= 100) return v.toFixed(0);
      if (a >= 10) return precise ? v.toFixed(1) : v.toFixed(0);
      if (a >= 1) return precise ? v.toFixed(2) : String(+v.toFixed(2));
      if (a === 0) return '0';
      if (a < 1e-3) { const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e); return (Math.abs(m - 1) < 1e-6 && !precise ? '' : (precise ? m.toFixed(2) : +m.toPrecision(2)) + '×') + '1e' + e; }
      return precise ? v.toPrecision(3) : String(+v.toPrecision(2));
    }
    cv.draw = draw;
    cv.canvas.addEventListener('pointermove', (e) => { hover = cv.pos(e); draw(); });
    cv.canvas.addEventListener('pointerleave', () => { hover = null; draw(); });
    draw();
    return {
      set(o) { Object.assign(state, o); draw(); },
      get state() { return state; },
      draw,
      canvas: cv
    };
  };

  /* ---------------- boot ---------------- */
  NB.ready = function (fn) {
    if (document.readyState !== 'loading') setTimeout(fn, 0);
    else document.addEventListener('DOMContentLoaded', fn);
  };
  NB.ready(() => {
    numberSections();
    buildHeader();
    buildSidebar();
    buildChapterNav();
    buildQuizzes();
    scrollSpy();
    if (window.renderMathInElement) renderMath();
    else window.addEventListener('load', renderMath);
    const y = new Date().getFullYear();
    const foot = NB.$('.site-footer');
    if (foot && !foot.textContent.trim()) foot.innerHTML = BOOK_NAME + ' · ' + BOOK_TAG + ' · ' + y + ' · 정적 HTML + Canvas로 제작되어 GitHub Pages에서 동작합니다.';
  });
})();
