/* =========================================================
   Interaction layer — shared by every locale.

   Two rules this file follows:

   1. Motion follows Apple's fluid-interface guidance: springs
      instead of keyframes for anything the user can grab,
      animation starting from the current on-screen value,
      velocity handed off at release, momentum projection for
      the landing point, rubber-banding at the edges.

   2. Localisation is data, not string concatenation. There is
      not a single user-facing sentence in this file: labels
      live in the page (one file per language), and anything
      that is genuinely data — dates, ranges, numbers, plurals,
      lists — goes through Intl with the document's own locale.
   ========================================================= */

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/* ── Localisation engine ──────────────────────────────────
   Everything reads document.documentElement.lang, so a new
   language is a new HTML file — no lookup tables to keep in
   sync with the markup.                                    */
const L10N = (() => {
  const tz = 'UTC';   // dates in markup are calendar dates, not instants: never shift them

  /* A locale we can actually format with. Never assume the tag in the markup is
     one the browser's ICU build knows: walk down the tag's own chain
     (zh-Hant-HK → zh-Hant → zh → en) instead of throwing on the first call.
     The underscore form is included because `lang="zh_CN"` is a classic typo
     that Intl rejects outright. */
  const declared = (document.documentElement.lang || '').trim();
  const dashed = declared.replace(/_/g, '-');
  function usable(tag) {
    if (!tag) return false;
    try { new Intl.DateTimeFormat(tag); return true; } catch (e) { return false; }
  }
  const locale = [
    declared,
    dashed,
    dashed.split('-').slice(0, 2).join('-'),   // zh-Hant-HK → zh-Hant
    dashed.split('-')[0],                      // zh-Hant → zh
    'en',
  ].find(usable) || 'und';

  /* Bad markup in one field shouldn't blank the rest of the page: the element
     keeps whatever text the author already wrote into it. */
  const safe = (fn) => { try { fn(); } catch (e) {} };

  /* "2024-09" or "2024-09-18" → a UTC date, so no timezone can move it a day */
  function parse(value) {
    const [y, m = 1, d = 1] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const dateFormats = {
    ym:   { year: 'numeric', month: 'long' },
    md:   { month: 'short', day: 'numeric' },
    full: { year: 'numeric', month: 'long', day: 'numeric' },
  };

  const monthYear = { year: 'numeric', month: 'long' };

  /* ListFormat's `unit` type has no separator at all in CJK ("甲乙丙"), which
     turns a list of words into a word soup. `conjunction` is the safe choice:
     "A、B和C" in zh, "A, B, and C" in en. */
  const listType = 'conjunction';

  function relative(value) {
    const then = parse(value);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((then.getTime() - today) / 86400000);
    const abs = Math.abs(days);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (abs < 7)   return rtf.format(days, 'day');
    if (abs < 31)  return rtf.format(Math.round(days / 7), 'week');
    if (abs < 335) return rtf.format(Math.round(days / 30.44), 'month');
    return rtf.format(Math.round(days / 365.25), 'year');
  }

  function apply(root = document) {
    $$('[data-l10n-date]', root).forEach((el) => safe(() => {
      const opts = dateFormats[el.dataset.l10nDateFormat] || dateFormats.full;
      el.textContent = new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }).format(parse(el.dataset.l10nDate));
    }));

    $$('[data-l10n-date-range]', root).forEach((el) => safe(() => {
      const [from, to] = el.dataset.l10nDateRange.split('/');
      const fmt = new Intl.DateTimeFormat(locale, { ...monthYear, timeZone: tz });
      const start = parse(from);
      const end = to ? fmt.format(parse(to)) : (el.dataset.l10nPresent || '');
      /* Both ends go through the same formatter, then join with a separator the
         page can override per locale. (Intl.formatRange would be the obvious
         tool, but in zh it switches to "2021/6 – 2024/3" — a different style
         from the "2021年6月" the very same formatter produces.) */
      const sep = el.dataset.l10nRangeSeparator || ' – ';
      el.textContent = (fmt.format(start) + sep + end).trim();
    }));

    $$('[data-l10n-number]', root).forEach((el) => safe(() => {
      const style = el.dataset.l10nNumberStyle;
      el.textContent = new Intl.NumberFormat(locale, style ? { notation: style } : undefined)
        .format(Number(el.dataset.l10nNumber));
    }));

    /* Plural forms arrive from the markup as a small JSON map keyed by
       CLDR plural category — so Arabic's six forms need no new code. */
    $$('[data-l10n-count][data-l10n-forms]', root).forEach((el) => safe(() => {
      let forms;
      try { forms = JSON.parse(el.dataset.l10nForms); } catch (e) { return; }
      const category = new Intl.PluralRules(locale).select(Number(el.dataset.l10nCount));
      el.textContent = forms[category] || forms.other || el.textContent;
    }));

    $$('[data-l10n-relative]', root).forEach((el) => safe(() => {
      el.textContent = relative(el.dataset.l10nRelative);
    }));

    $$('[data-l10n-list]', root).forEach((el) => safe(() => {
      const items = el.dataset.l10nList.split('|').map((s) => s.trim()).filter(Boolean);
      if (!items.length) return;
      try {
        el.textContent = new Intl.ListFormat(locale, { style: 'long', type: listType }).format(items);
      } catch (e) { /* keep the hand-written fallback already in the markup */ }
    }));
  }

  return { locale, declared, apply };
})();

L10N.apply();

/* ── Theme ───────────────────────────────────────────────── */
(function theme() {
  const btn = $('#themeToggle');
  if (!btn) return;

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => document.documentElement.dataset.theme
    || (systemDark.matches ? 'dark' : 'light');

  // Both labels come from the markup, so a new language never needs a code change.
  const sync = () => {
    const dark = current() === 'dark';
    const label = dark ? btn.dataset.labelToLight : btn.dataset.labelToDark;
    if (label) btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(dark));
  };
  sync();

  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('site-theme', next); } catch (e) {}
    sync();
  });
})();

/* ── Scroll: nav material, reading progress, hero depth ──── */
(function scrollChrome() {
  const nav = $('#nav');
  const bar = $('#progressBar');
  const hero = $('#heroInner');
  const parallax = hero ? $$(':scope > *', hero) : [];
  let queued = false;

  function frame() {
    queued = false;
    const y = window.scrollY;

    if (nav) nav.classList.toggle('is-scrolled', y > 8);

    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? clamp(y / max, 0, 1) : 0) + ')';
    }

    // A small, restrained depth cue that settles within one viewport.
    if (hero && !reduceMotion()) {
      const t = clamp(y / window.innerHeight, 0, 1);
      parallax.forEach((el, i) => {
        const depth = 0.06 + i * 0.02;
        el.style.transform = 'translate3d(0, ' + (t * window.innerHeight * depth) + 'px, 0)';
        el.style.opacity = String(clamp(1 - t * (0.85 + i * 0.1), 0, 1));
      });
    }
  }

  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }, { passive: true });

  addEventListener('resize', frame, { passive: true });
  frame();
})();

/* ── Reveal on scroll ────────────────────────────────────── */
(function reveal() {
  const items = $$('[data-reveal]');
  if (!items.length) return;

  if (reduceMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  let batch = 0;
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((entry) => {
      entry.target.style.transitionDelay = Math.min(batch * 60, 240) + 'ms';
      entry.target.classList.add('is-visible');
      batch++;
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });

  items.forEach((el) => io.observe(el));
})();

/* ── A spring, in Apple's terms ────────────────────────────
   damping ratio (1 = no overshoot) + response (seconds).
   Integrated in fixed substeps so it stays stable, and always
   safe to interrupt: stop(), then re-target from the live value. */
function spring({ from, to, velocity = 0, damping = 1, response = 0.4, onUpdate, onComplete }) {
  const omega = (2 * Math.PI) / response;
  const k = omega * omega;
  const c = 2 * damping * omega;

  let x = from;
  let v = velocity;
  let raf = 0;
  let last = performance.now();
  let stopped = false;

  function step(now) {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    const substeps = 8;
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      const a = -k * (x - to) - c * v;
      v += a * h;
      x += v * h;
    }

    if (onUpdate) onUpdate(x, v);

    if (Math.abs(x - to) < 0.4 && Math.abs(v) < 8) {
      if (onUpdate) onUpdate(to, 0);
      if (onComplete) onComplete();
      return;
    }
    raf = requestAnimationFrame(step);
  }

  raf = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}

/* Apple's momentum projection: where would this flick come to rest? */
function project(velocity, decelerationRate = 0.998) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/* Progressive resistance past a boundary, instead of a hard stop. */
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* ── Carousel ─────────────────────────────────────────────
   Direct manipulation with pointer capture, 1:1 tracking from
   where the track was grabbed, velocity handoff on release,
   momentum projection to choose the landing card, and
   rubber-banding past either end. Direction-aware, so an RTL
   locale does not need a second implementation.            */
function createCarousel(root) {
  const viewport = $('.carousel__viewport', root);
  const track = $('.carousel__track', root);
  if (!viewport || !track) return;

  const slides = $$('.work', track);
  const prev = $('[data-rail="prev"]');
  const next = $('[data-rail="next"]');
  if (!slides.length) return;

  const dir = getComputedStyle(track).direction === 'rtl' ? -1 : 1;

  let x = 0;            // current presentation value (px)
  let v = 0;            // current velocity (px/s)
  let target = 0;       // where the spring is heading
  let minX = 0;         // most-advanced position (negative)
  let maxX = 0;         // resting / start position
  let animation = null;
  let dragging = false;
  let moved = 0;
  let grabX = 0;
  let grabOffset = 0;   // where inside the track the user grabbed — respected, never snapped
  let samples = [];     // recent pointer history, for velocity at release

  function render() {
    track.style.transform = 'translate3d(' + x + 'px, 0, 0)';
  }

  function measure() {
    minX = Math.min(0, viewport.clientWidth - track.scrollWidth);
    maxX = 0;
    x = clamp(x, minX, maxX);
    target = x;
    render();
  }

  /* Snap points come from layout, so they survive resize and RTL. */
  function snapPoints() {
    const trackLeft = track.getBoundingClientRect().left;
    return slides.map((s) => clamp(-(s.getBoundingClientRect().left - trackLeft), minX, maxX));
  }

  function stopAnim() {
    if (animation) animation.stop();
    animation = null;
  }

  /* Always start from the live value + live velocity: that is what
     makes the motion interruptible mid-flight.                 */
  function animateTo(to, velocity, damping) {
    stopAnim();
    target = to;
    if (reduceMotion()) {
      x = to; v = 0; render(); syncButtons(); return;
    }
    animation = spring({
      from: x,
      to: to,
      velocity: velocity || 0,
      damping: typeof damping === 'number' ? damping : 1,
      response: 0.4,
      onUpdate: function (next, nextV) { x = next; v = nextV; render(); },
      onComplete: function () { animation = null; v = 0; syncButtons(); }
    });
  }

  function nearestIndex(value) {
    const points = snapPoints();
    const at = typeof value === 'number' ? value : x;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p - at);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function goToIndex(i, velocity, damping) {
    const points = snapPoints();
    animateTo(points[clamp(i, 0, points.length - 1)], velocity, damping);
  }

  function syncButtons() {
    const i = nearestIndex();
    const atStart = dir === 1 ? i === 0 : i === slides.length - 1;
    const atEnd = dir === 1 ? i === slides.length - 1 : i === 0;
    if (prev) prev.setAttribute('aria-disabled', String(atStart));
    if (next) next.setAttribute('aria-disabled', String(atEnd));
  }

  function velocityFromHistory() {
    if (samples.length < 2) return 0;
    const newest = samples[samples.length - 1];
    let oldest = samples[0];
    for (let i = samples.length - 1; i >= 0; i--) {
      if (newest.t - samples[i].t > 90) break;
      oldest = samples[i];
    }
    const dt = newest.t - oldest.t;
    if (dt < 12) return v;
    return ((newest.x - oldest.x) / dt) * 1000;
  }

  viewport.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    moved = 0;
    grabX = e.clientX;
    grabOffset = x;
    samples = [{ x: e.clientX, t: performance.now() }];
    stopAnim();          // grab a moving element and it simply stops under your finger
    try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
    viewport.classList.add('is-dragging');
  });

  viewport.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    const shifted = e.clientX - grabX;
    moved = Math.max(moved, Math.abs(shifted));

    // 1:1 tracking, with progressive resistance past an edge.
    let nextX = grabOffset + shifted * dir;
    if (nextX > maxX) nextX = maxX + rubberband(nextX - maxX, viewport.clientWidth);
    else if (nextX < minX) nextX = minX - rubberband(minX - nextX, viewport.clientWidth);

    x = nextX;
    render();

    const now = performance.now();
    samples.push({ x: e.clientX, t: now });
    while (samples.length > 2 && now - samples[0].t > 120) samples.shift();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('is-dragging');
    try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}

    const releaseVelocity = velocityFromHistory() * dir;
    // Land where the flick was going, not where the finger stopped.
    const projected = x + project(releaseVelocity);
    const index = nearestIndex(clamp(projected, minX, maxX));
    // Bounce only when the gesture itself carried momentum.
    const damping = Math.abs(releaseVelocity) > 120 ? 0.8 : 1;
    goToIndex(index, releaseVelocity, damping);
  }

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // A drag should never trigger the card's link.
  viewport.addEventListener('click', function (e) {
    if (moved > 8) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Keyboard: arrows nudge by one card. In an RTL locale, "next" is to the left.
  track.addEventListener('keydown', function (e) {
    const forward = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (forward) {
      e.preventDefault();
      goToIndex(nearestIndex() + forward * dir);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToIndex(dir === 1 ? 0 : slides.length - 1);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToIndex(dir === 1 ? slides.length - 1 : 0);
    }
  });

  if (prev) prev.addEventListener('click', function () { goToIndex(nearestIndex() - dir); });
  if (next) next.addEventListener('click', function () { goToIndex(nearestIndex() + dir); });

  // Focusing an off-screen card brings it into view (never trap the user).
  viewport.addEventListener('focusin', function (e) {
    const slide = e.target.closest ? e.target.closest('.work') : null;
    if (slide) goToIndex(slides.indexOf(slide));
  });

  // Trackpad horizontal scroll, retargeted through the same spring.
  viewport.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // vertical stays native
    e.preventDefault();
    animateTo(clamp(target - e.deltaX * dir, minX, maxX), v, 1);
  }, { passive: false });

  let resizeQueued = false;
  addEventListener('resize', function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      measure();
      goToIndex(nearestIndex());
    });
  }, { passive: true });

  measure();
  syncButtons();
}

const carouselRoot = $('#carousel');
if (carouselRoot) createCarousel(carouselRoot);

/* ── Language handling ───────────────────────────────────────
   A static site can offer the other language, but it must not
   hijack the visit. So: remember an explicit choice, and only
   *offer* a switch when the browser asks for something else. */
(function language() {
  const KEY_CHOICE = 'site-lang';
  const KEY_DISMISSED = 'site-lang-hint-dismissed';
  const current = document.documentElement.lang;

  const supported = $$('.lang-switch__opt')
    .map((a) => a.getAttribute('hreflang'))
    .filter(Boolean);

  /* The first *supported* language in the visitor's own priority order,
     rather than simply the first language they happen to list. */
  function preferred() {
    const wanted = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ''];
    for (const tag of wanted) {
      const low = String(tag).toLowerCase();
      const primary = low.split('-')[0];
      if (primary === 'zh') {
        const zh = matchChinese(low);
        if (zh) return zh;
      }
      const match = supported.find((s) => s.toLowerCase() === low)
        || supported.find((s) => s.split('-')[0].toLowerCase() === primary);
      if (match) return match;
    }
    return null;
  }

  /* Chinese needs one extra step. `zh` alone doesn't say which script the
     reader wants, so a visitor asking for zh-TW / zh-Hant-* must land on the
     Traditional page rather than whichever zh variant happens to be listed
     first — otherwise Simplified and Traditional get swapped for exactly the
     readers who care about the difference. */
  function matchChinese(low) {
    const zh = supported.filter((s) => /^zh/i.test(s));
    if (!zh.length) return null;
    const traditional = zh.find((s) => /hant|tw|hk|mo/i.test(s));
    const simplified = zh.find((s) => !/hant|tw|hk|mo/i.test(s));
    const wantsTraditional = /hant|(^|-)tw($|-)|(^|-)hk($|-)|(^|-)mo($|-)/.test(low);
    return wantsTraditional ? (traditional || simplified) : (simplified || traditional);
  }

  // An explicit choice is remembered and honoured on later visits.
  $$('[data-lang-remember]').forEach((a) => {
    a.addEventListener('click', () => {
      try { localStorage.setItem(KEY_CHOICE, a.dataset.langRemember); } catch (e) {}
    });
  });

  const hint = $('#langHint');
  if (!hint) return;

  const choice = (() => { try { return localStorage.getItem(KEY_CHOICE); } catch (e) { return null; } })();
  const dismissed = (() => { try { return localStorage.getItem(KEY_DISMISSED) === '1'; } catch (e) { return false; } })();
  const target = preferred();

  if (choice || dismissed || !target || target === current) return;

  /* The page carries one variant per other language, and the visitor sees the
     one written in theirs. Adding a locale means adding markup, not code. */
  const variants = $$('[data-lang-variant]', hint)
    .filter((el) => el.dataset.langVariant === target);
  if (!variants.length) return;
  variants.forEach((el) => el.classList.add('is-current-variant'));

  hint.hidden = false;
  // Reserve room at the end of the page so the pill never covers the footer.
  document.documentElement.classList.add('has-lang-hint');
  // One frame at rest, then materialize: position, scale and blur arrive together.
  requestAnimationFrame(() => requestAnimationFrame(() => hint.classList.add('is-visible')));

  /* The offer is for someone who just arrived. The moment they start reading,
     it steps aside instead of following them down the page — the switch stays
     available in the navigation, so nothing is lost. */
  function stepAside() {
    if (window.scrollY < window.innerHeight * 0.5) return;
    removeEventListener('scroll', stepAside);
    hint.classList.remove('is-visible');
    document.documentElement.classList.remove('has-lang-hint');
    setTimeout(() => { hint.hidden = true; }, 420);
  }
  addEventListener('scroll', stepAside, { passive: true });

  $$('.lang-hint__close', hint).forEach((btn) => {
    btn.addEventListener('click', () => {
      hint.classList.remove('is-visible');
      document.documentElement.classList.remove('has-lang-hint');
      try { localStorage.setItem(KEY_DISMISSED, '1'); } catch (e) {}
      setTimeout(() => { hint.hidden = true; }, 320);
    });
  });
})();
