/* Page choreography: opening, smooth scroll, the 3D mark's path through the sections,
   and each section's scroll-linked animation. Classic script so the page opens from the disk. */
(function () {
  'use strict';

  const { gsap, ScrollTrigger } = window;
  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // Without GSAP (offline, blocked CDN) the page is still complete: show everything as it is
  if (!gsap || !ScrollTrigger) {
    root.classList.add('reduced', 'no-motion-lib');
    const loader = $('#loader');
    if (loader) loader.remove();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // Respect "reduce motion", but let visitors opt in with ?motion=on
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionForced = new URLSearchParams(location.search).get('motion') === 'on';
  const reduced = prefersReduced && !motionForced;
  root.classList.toggle('reduced', reduced);

  const isMobile = () => innerWidth < 900;
  const radialMode = () => innerWidth >= 1100;
  const WORKS_TOTAL = 56;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  const scene = window.TiusScene
    ? window.TiusScene.createScene($('#webgl'), { reduced })
    : (root.classList.add('no-webgl'), { state: {}, ready: Promise.resolve(), setMouse() {}, setPaused() {} });

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 0.6 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Our own scrolls (links, section stops, form errors) keep the section stops out of the way
  let autoScrolling = false;
  function autoScroll(target, options = {}) {
    autoScrolling = true;
    const done = () => { autoScrolling = false; };
    lenis.scrollTo(target, Object.assign({ force: true }, options, { onComplete: done }));
    setTimeout(done, ((options.duration == null ? 1.2 : options.duration) * 1000) + 400);
  }

  function closeMenu() {
    root.classList.remove('is-menu-open');
    $('.header__menu').setAttribute('aria-expanded', 'false');
    $('#menu').setAttribute('aria-hidden', 'true');
    if (lenis) lenis.start();
  }

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id.length > 1 && document.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      closeMenu();
      if (lenis) autoScroll(target, { duration: 1.6, offset: -(Number(a.dataset.offset) || 0) });
      else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  $('.header__menu').addEventListener('click', () => {
    if (root.classList.contains('is-menu-open')) return closeMenu();
    root.classList.add('is-menu-open');
    $('.header__menu').setAttribute('aria-expanded', 'true');
    $('#menu').setAttribute('aria-hidden', 'false');
    if (lenis) lenis.stop();
  });

  /* ---------- Text helpers ---------- */
  // Every character in its own mask, so it can rise from below
  function splitChars(el) {
    if (!el.dataset.splitDone) {
      el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
      const walk = (node) => {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            const frag = document.createDocumentFragment();
            for (const ch of child.textContent) {
              if (/\s/.test(ch)) { frag.append(' '); continue; }
              const outer = document.createElement('span');
              const inner = document.createElement('span');
              outer.className = 'ch';
              outer.setAttribute('aria-hidden', 'true');
              inner.className = 'ch__in';
              inner.textContent = ch;
              outer.append(inner);
              frag.append(outer);
            }
            child.replaceWith(frag);
          } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR' && child.tagName !== 'WBR') {
            walk(child);
          }
        });
      };
      walk(el);
      el.dataset.splitDone = '1';
    }
    return $$('.ch__in', el);
  }

  function scrollSplit(el, stagger = 0.03) {
    const chars = splitChars(el);
    if (reduced) return;
    gsap.fromTo(chars, { yPercent: 110 }, {
      yPercent: 0, duration: 1.1, ease: 'expo.out', stagger,
      scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
    });
  }

  function scrollReveal(targets, from = { y: 24 }, stagger = 0.1) {
    if (reduced) return;
    const els = gsap.utils.toArray(targets);
    if (!els.length) return;
    gsap.fromTo(els, Object.assign({ opacity: 0 }, from), {
      opacity: 1, x: 0, y: 0, scale: 1, rotationX: 0, duration: 1.3, ease: 'power2.out', stagger,
      scrollTrigger: { trigger: els[0], start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  }

  // Letters flick through random glyphs before they settle
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scramble(el, duration = 1.4) {
    const final = el.dataset.text || (el.dataset.text = el.textContent);
    const p = { v: 0 };
    return gsap.to(p, {
      v: 1, duration, ease: 'none',
      onUpdate() {
        let out = '';
        for (let i = 0; i < final.length; i++) {
          const t = p.v * (final.length + 5) - i;
          out += final[i] === ' ' ? ' ' : t >= 5 ? final[i] : t > 0 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ' ';
        }
        el.textContent = out;
      },
      onComplete() { el.textContent = final; },
    });
  }

  // Characters of an <em> share one gradient: each shows its own slice
  function gradientChars(el) {
    $$('em', el).forEach((em) => {
      const chars = $$('.ch__in', em);
      em.classList.add('grad');
      chars.forEach((c, i) => {
        c.style.setProperty('--i', i);
        c.style.setProperty('--n', chars.length);
      });
    });
  }

  // One plain span per character, for ink-fill effects
  function fillChars(el) {
    const chars = [];
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const ch of child.textContent) {
            const span = document.createElement('span');
            span.textContent = ch;
            chars.push(span);
            frag.append(span);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(el);
    return chars;
  }

  function bigWord(section) {
    const word = $('.bigword', section);
    if (!word || reduced) return;
    gsap.fromTo(word, { xPercent: 6 }, {
      xPercent: -16, ease: 'none',
      scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }

  function focusIn(targets, trigger, stagger = 0.15, start = 'top 82%') {
    if (reduced) return;
    gsap.fromTo(targets, { opacity: 0, y: 26, filter: 'blur(10px)' }, {
      opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, ease: 'power3.out', stagger, clearProps: 'filter',
      scrollTrigger: { trigger, start, toggleActions: 'play none none reverse' },
    });
  }

  /* ---------- The 3D mark's path through the page ---------- */
  // x / y are fractions of the half viewport
  const KEYS = {
    hero:      { x: 0,     y: 0.02,  scale: 0.72, rotX: 0,    rotY: 0,    burst: 0,    blur: 0,  spin: 0 },
    intro:     { x: 0.52,  y: 0.06,  scale: 1.0,  rotX: 0.3,  rotY: -0.6, burst: 0.25, blur: 5,  spin: 0.8 },
    vision:    { x: 0.5,   y: -0.08, scale: 0.85, rotX: -0.1, rotY: 0.55, burst: 0.4,  blur: 0,  spin: 1.6 },
    service:   { x: 0,     y: 0,     scale: 1.1,  rotX: 0,    rotY: 0,    burst: 0.6,  blur: 8,  spin: 2.4 },
    strength:  { x: -0.55, y: -0.32, scale: 0.6,  rotX: 0.2,  rotY: 0.6,  burst: 0.15, blur: 0,  spin: 3.1 },
    works:     { x: -0.8,  y: -0.72, scale: 0.3,  rotX: 0.2,  rotY: 0.3,  burst: 0.8,  blur: 2,  spin: 3.9 },
    clients:   { x: 0.75,  y: 0.6,   scale: 0.42, rotX: 0.2,  rotY: -0.3, burst: 0.6,  blur: 3,  spin: 4.2 },
    flow:      { x: 0.72,  y: -0.7,  scale: 0.4,  rotX: 0.3,  rotY: -0.4, burst: 0.3,  blur: 1,  spin: 4.6 },
    articles:  { x: -0.75, y: 0.6,   scale: 0.42, rotX: 0.2,  rotY: 0.4,  burst: 0.4,  blur: 3,  spin: 5 },
    statement: { x: 0,     y: 0,     scale: 1.15, rotX: 0.15, rotY: 0.4,  burst: 0.55, blur: 6,  spin: 5.4 },
    company:   { x: 0,     y: 0,     scale: 1.1,  rotX: 0,    rotY: 0,    burst: 0.3,  blur: 10, spin: 6 },
    contact:   { x: 0,     y: 0.05,  scale: 0.95, rotX: 0,    rotY: 0,    burst: 0.2,  blur: 10, spin: 6.6 },
  };
  // On phones the mark stays centred, high and soft, behind the copy
  const MOBILE_KEYS = {
    hero:     { y: 0.2, scale: 0.85 },
    intro:    { x: 0, y: 0.35, blur: 6 },
    vision:   { x: 0, y: 0.3, scale: 0.9, blur: 5 },
    strength: { x: 0, y: 0.35, scale: 0.9, blur: 5 },
    works:    { x: 0, y: 0.3, scale: 0.6, blur: 5 },
    clients:  { x: 0.4, y: 0.6, scale: 0.6, blur: 5 },
    flow:     { x: 0.35, y: 0.5, scale: 0.6, blur: 5 },
    articles: { x: -0.3, y: 0.55, scale: 0.6, blur: 5 },
  };
  const MARK_PROPS = Object.keys(KEYS.hero);

  function key(name) {
    if (name === 'works' && !radialMode()) return Object.assign({}, KEYS.works, { x: 0.45, y: 0.2, scale: 0.6, blur: 5 }, isMobile() ? MOBILE_KEYS.works : {});
    return isMobile() ? Object.assign({}, KEYS[name], MOBILE_KEYS[name] || {}) : KEYS[name];
  }

  // Sections register steps; one ticker blends the keys of the step in progress
  const markSteps = [];
  function markTween(from, to, trigger, start = 'top bottom', end = 'top 25%') {
    markSteps.push({ from, to, st: ScrollTrigger.create({ trigger, start, end }) });
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const heroIntro = { frame: reduced ? 1 : 0 };
  let heroST = null;

  function updateMark() {
    let step = null;
    for (const s of markSteps) if (s.st.progress > 0) step = s;
    let target;
    if (!step) target = key('hero');
    else if (reduced) target = key(step.st.progress >= 0.5 ? step.to : step.from);
    else {
      const a = key(step.from);
      const b = key(step.to);
      const t = easeInOut(step.st.progress);
      target = {};
      for (const p of MARK_PROPS) target[p] = a[p] + (b[p] - a[p]) * t;
    }
    const follow = reduced ? 1 : 1 - Math.exp(-gsap.ticker.deltaRatio() * 0.09);
    for (const p of MARK_PROPS) scene.state[p] += (target[p] - scene.state[p]) * follow;
    const out = heroST ? heroST.progress : 0;
    scene.state.frameExpand = reduced ? 0 : out;
    scene.state.frame = heroIntro.frame * (reduced ? (out > 0.6 ? 0 : 1) : 1 - out);
  }

  /* ---------- Sections (in page order, so pin spacing is measured correctly) ---------- */
  function initHero() {
    heroST = ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom top' });
    if (reduced) return;
    const st = { trigger: '.hero', start: 'top top', end: 'bottom 30%', scrub: true };
    gsap.to('.hero__copy', { y: -30, opacity: 0, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__en', { yPercent: -30, opacity: 0, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__scroll', { opacity: 0, ease: 'none', scrollTrigger: Object.assign({}, st, { end: '20% top' }) });
  }

  function initIntro() {
    const section = $('#intro');
    markTween('hero', 'intro', section, 'top bottom', 'top 15%');
    splitChars($('.intro__lead', section));
    const marked = $('.intro__lead em', section);
    if (reduced) { marked.classList.add('is-marked'); return; }
    ScrollTrigger.create({ trigger: marked, start: 'top 75%', onEnter: () => marked.classList.add('is-marked') });

    // Outline copies drift apart from the headline as you scroll past
    const echo = $('.echo', section);
    const ghosts = $$('.echo__line--ghost', echo);
    gsap.fromTo($('.echo__line', echo), { clipPath: 'inset(0% 100% 0% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut',
      scrollTrigger: { trigger: echo, start: 'top 80%', toggleActions: 'play none none reverse' },
    });
    gsap.fromTo(ghosts, { yPercent: 0, opacity: 0 }, {
      yPercent: (i) => (i + 1) * 6, opacity: (i) => 0.9 - i * 0.2, ease: 'none',
      scrollTrigger: { trigger: echo, start: 'top 60%', end: 'bottom top', scrub: 1 },
    });
    gsap.fromTo($$('.intro__lead .ch__in', section), { yPercent: 110 }, {
      yPercent: 0, duration: 1, ease: 'expo.out', stagger: 0.012,
      scrollTrigger: { trigger: '.intro__lead', start: 'top 80%', toggleActions: 'play none none reverse' },
    });
    scrollReveal($$('.intro__text [data-reveal]', section), { y: 40 }, 0.15);
  }

  function initVision() {
    const section = $('#vision');
    markTween('intro', 'vision', section);
    scrollReveal($('.head', section), { y: 30 });
    scrollSplit($('.vision__title', section), 0.025);
    gradientChars($('.vision__title', section));
    bigWord(section);

    // Dial: sixty ticks, four coloured arcs that fill like a clock
    const NS = 'http://www.w3.org/2000/svg';
    const ticks = $('.cycle__ticks', section);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 15 === 0;
      const line = document.createElementNS(NS, 'line');
      const r1 = major ? 100 : 108;
      line.setAttribute('x1', (160 + Math.sin(a) * r1).toFixed(1));
      line.setAttribute('y1', (160 - Math.cos(a) * r1).toFixed(1));
      line.setAttribute('x2', (160 + Math.sin(a) * 116).toFixed(1));
      line.setAttribute('y2', (160 - Math.cos(a) * 116).toFixed(1));
      if (major) line.classList.add('is-major');
      ticks.append(line);
    }
    const ring = 2 * Math.PI * 132;
    const gap = 18;
    const arcLen = ring / 4 - gap;
    const arcs = $$('.cycle__arc', section);
    arcs.forEach((arc, i) => { arc.style.transform = `rotate(${-90 + i * 90 + ((gap / 2) / ring) * 360}deg)`; });
    const steps = $$('.cycle__steps li', section);
    const hand = $('.cycle__hand', section);
    const pct = $('.cycle__pct', section);
    const pct2 = $('.cycle__pct2', section);
    const setCycle = (p) => {
      arcs.forEach((arc, i) => {
        const t = Math.min(Math.max(p * 4 - i, 0), 1);
        arc.style.strokeDasharray = `${arcLen * t} ${ring}`;
        arc.style.opacity = t > 0 ? 1 : 0;
      });
      hand.style.transform = `rotate(${p * 360}deg)`;
      steps.forEach((li, i) => li.classList.toggle('is-on', p * 4 > i + 0.15));
      pct.textContent = Math.round(p * 100);
      pct2.textContent = Math.round(100 * Math.pow(p, 1.4));
    };
    if (reduced) {
      setCycle(1);
      $$('.story__item', section).forEach((item) => item.classList.add('is-active'));
      return;
    }

    const voices = $$('.voices li', section);
    gsap.fromTo(voices, { opacity: 0, y: 30, scale: 0.85, filter: 'blur(8px)' }, {
      opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1, ease: 'back.out(1.6)', stagger: 0.18, clearProps: 'filter',
      scrollTrigger: { trigger: '.voices', start: 'top 85%', toggleActions: 'play none none reverse' },
    });
    voices.forEach((v, i) => {
      gsap.to(v, { x: i % 2 ? -8 : 8, duration: 2.6 + i * 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.4 });
    });

    // The words fill with ink as you read, the line beside them grows, each dot lights in turn
    const story = $('.vision__story', section);
    const items = $$('.story__item', story);
    const words = items.map((item) => fillChars($('p', item)));
    const total = words.reduce((n, w) => n + w.length, 0);
    const read = gsap.timeline({ scrollTrigger: { trigger: story, start: 'top 80%', end: 'bottom 90%', scrub: 0.4 } });
    read.fromTo('.vision__progress i', { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: total * 0.25 + 1 }, 0);
    let at = 0;
    words.forEach((chars, i) => {
      read.fromTo(chars, { opacity: 0.16 }, { opacity: 1, duration: 1, ease: 'none', stagger: 0.25 }, at)
        .call(() => items[i].classList.add('is-active'), null, at + 0.01)
        .call(() => items[i].classList.remove('is-active'), null, at);
      at += chars.length * 0.25;
    });
    gsap.fromTo(items, { opacity: 0, x: 24 }, {
      opacity: 1, x: 0, duration: 1, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: story, start: 'top 85%', toggleActions: 'play none none reverse' },
    });

    const cycle = $('.cycle', section);
    new IntersectionObserver(([e]) => cycle.classList.toggle('is-playing', e.isIntersecting)).observe(cycle);
    scrollReveal(cycle, { y: 50, scale: 0.97 });
    setCycle(0);
    const dial = { p: 0 };
    gsap.to(dial, {
      p: 1, ease: 'none', onUpdate: () => setCycle(dial.p),
      scrollTrigger: { trigger: '.cycle__dial', start: 'top 90%', end: 'center 50%', scrub: 0.8 },
    });
    focusIn($$('.cycle__lead > *', section), '.cycle__lead', 0.12, 'top 92%');
    focusIn($$('.cycle__close > *', section), '.cycle__close', 0.12, 'top 98%');
  }

  function initService() {
    const section = $('#service');
    markTween('vision', 'service', section, 'top bottom', 'top 40%');
    const panel = $('.panel', section);
    scrollSplit($('.feature__title', section), 0.03);
    bigWord(section);

    // Cards flood with their own colour from the pointer; on touch screens a tap does it
    const cards = $$('.svc, .feature', section);
    const aim = (card, e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    cards.forEach((card) => {
      card.addEventListener('pointerenter', (e) => aim(card, e));
      card.addEventListener('pointermove', (e) => aim(card, e));
      card.addEventListener('click', (e) => {
        if (matchMedia('(hover: hover)').matches) return;
        aim(card, e);
        const on = !card.classList.contains('is-active');
        cards.forEach((c) => c.classList.remove('is-active'));
        card.classList.toggle('is-active', on);
      });
    });
    if (reduced) return;

    gsap.fromTo(panel, { scale: 0.93 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top 10%', scrub: true } });
    scrollReveal($('.head', section), { y: 30 });
    scrollReveal($$('[data-reveal]', section), { y: 30 }, 0.1);

    // The four steps of the flow light up one after another
    const steps = $$('.chain li', section);
    gsap.set(steps, { '--fill': '0%' });
    const chain = gsap.timeline({
      scrollTrigger: {
        trigger: '.chain', start: 'top 85%', end: 'top 45%', scrub: 1,
        onUpdate(self) {
          steps.forEach((li, i) => li.classList.toggle('is-on', self.progress >= i / steps.length));
          $('.chain', section).classList.toggle('is-done', self.progress > 0.98);
        },
      },
    });
    steps.slice(0, -1).forEach((li) => chain.to(li, { '--fill': '100%', ease: 'none' }));

    gsap.fromTo($$('.checks li', section), { opacity: 0, x: 30 }, {
      opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07,
      scrollTrigger: { trigger: '.checks', start: 'top 80%', toggleActions: 'play none none reverse' },
    });
    // Little scenes only play while on screen
    const playing = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-playing', e.isIntersecting));
    });
    $$('.svc, .phone', section).forEach((el) => playing.observe(el));

    gsap.fromTo($$('.svc', section), { opacity: 0, y: 40, rotationX: -10, transformOrigin: '50% 100%' }, {
      opacity: 1, y: 0, rotationX: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: '.services', start: 'top 85%', toggleActions: 'play none none reverse' },
    });
  }

  function initStrength() {
    const section = $('#strength');
    markTween('service', 'strength', section);
    if (reduced) return;
    scrollReveal($('.head', section), { y: 30 });
    $$('.strength__item', section).forEach((item) => {
      gsap.fromTo(item, { opacity: 0, y: 50, rotationX: -6, transformPerspective: 1000 }, {
        opacity: 1, y: 0, rotationX: 0, ease: 'power2.out',
        scrollTrigger: { trigger: item, start: 'top 95%', end: 'top 60%', scrub: 1 },
      });
      gsap.fromTo($('.strength__no', item), { yPercent: 30 }, {
        yPercent: -10, ease: 'none',
        scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }

  function initWorks() {
    const section = $('#works');
    markTween('strength', 'works', section, 'top bottom', 'top top');
    const radial = $('.radial', section);
    const svg = $('.radial__lines', section);
    const nodes = $$('.radial__node', section);
    const countEl = $('[data-count]', section);
    const hub = $('.radial__hub', section);
    const hubCount = $('.radial__count', section);
    const showCount = (n) => { countEl.textContent = n; hubCount.textContent = n; };
    const NS = 'http://www.w3.org/2000/svg';
    const lines = nodes.map(() => {
      const line = document.createElementNS(NS, 'line');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', 4);
      svg.append(line, dot);
      return { line, dot };
    });

    // Six industries orbit the hub. CSS places the hub and the cards inside .radial; the lines follow them
    function layoutRadial() {
      if (!radialMode()) return;
      const W = radial.clientWidth;
      const H = radial.clientHeight;
      const cx = hub.offsetLeft;
      const cy = hub.offsetTop;
      const markR = hub.offsetWidth / 2 + 6;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      nodes.forEach((node, i) => {
        const x = node.offsetLeft;
        const y = node.offsetTop;
        const a = Math.atan2(cy - y, x - cx);
        const { line, dot } = lines[i];
        const sx = cx + Math.cos(a) * markR;
        const sy = cy - Math.sin(a) * markR;
        line.setAttribute('x1', sx);
        line.setAttribute('y1', sy);
        line.dataset.x2 = x;
        line.dataset.y2 = y;
        if (reduced) { line.setAttribute('x2', x); line.setAttribute('y2', y); }
        dot.setAttribute('cx', sx);
        dot.setAttribute('cy', sy);
      });
    }
    layoutRadial();
    ScrollTrigger.addEventListener('refreshInit', layoutRadial);
    if (reduced) return;
    scrollReveal($('.head', section), { y: 30 });

    const mm = gsap.matchMedia();
    mm.add('(min-width: 1100px)', () => {
      layoutRadial();
      const counter = { v: 0 };
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top top', end: '+=140%', pin: true, scrub: 1, invalidateOnRefresh: true } });
      tl.fromTo(hub, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)' }, 0)
        .fromTo(counter, { v: 0 }, { v: WORKS_TOTAL, duration: 1.2, ease: 'power2.out', onUpdate: () => showCount(Math.round(counter.v)) }, 0)
        .fromTo($$('.works__label, .works__text, .works__note', section), { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.15, duration: 0.5 }, 0);
      lines.forEach(({ line, dot }, i) => {
        const t = 0.4 + i * 0.35;
        tl.fromTo(dot, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.2 }, t)
          .fromTo(line, { attr: { x2: () => line.getAttribute('x1'), y2: () => line.getAttribute('y1') } }, {
            attr: { x2: () => line.dataset.x2, y2: () => line.dataset.y2 }, duration: 0.4, ease: 'power2.out',
          }, t)
          .fromTo(nodes[i], { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, t + 0.3);
      });
      tl.to({}, { duration: 0.6 });
    });
    mm.add('(max-width: 1099px)', () => {
      const counter = { v: 0 };
      gsap.fromTo(counter, { v: 0 }, {
        v: WORKS_TOTAL, duration: 1.8, ease: 'power2.out', onUpdate: () => showCount(Math.round(counter.v)),
        scrollTrigger: { trigger: '.works__count', start: 'top 85%', toggleActions: 'play none none reverse' },
      });
      scrollReveal(nodes, { y: 40, scale: 0.9 }, 0.1);
    });
  }

  // A row of cards that drifts and loops on its own; touching it hands over control
  function initClientSlider(container) {
    const list = $('.client-slider__list', container);
    if (!list) return;
    const thumb = $('.client-slider__bar i', container);
    const direction = Number(container.dataset.direction) || 1;
    const originals = Array.from(list.children);

    // Three copies side by side; we stay in the middle one and jump by one copy at the edges
    ['prepend', 'append'].forEach((where) => {
      const copies = originals.map((li) => {
        const c = li.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        $$('a, button', c).forEach((el) => { el.tabIndex = -1; });
        return c;
      });
      list[where](...copies);
    });
    let setWidth = 0;
    const measure = () => { setWidth = originals[0].offsetLeft - list.children[0].offsetLeft; };
    measure();
    list.scrollLeft = setWidth;
    let pos = setWidth;
    let manual = reduced;
    let hovering = false;
    let resumeTimer = 0;
    let drag = null;

    const wrap = () => {
      if (list.scrollLeft < setWidth * 0.5) list.scrollLeft += setWidth;
      else if (list.scrollLeft > setWidth * 1.5) list.scrollLeft -= setWidth;
    };
    const drawBar = () => {
      if (!setWidth) return;
      const ratio = Math.min(list.clientWidth / setWidth, 1);
      const p = ((((list.scrollLeft - setWidth) % setWidth) + setWidth) % setWidth) / setWidth;
      thumb.style.width = `${ratio * 100}%`;
      thumb.style.transform = `translateX(${p * (1 / ratio) * 100}%)`;
    };
    list.addEventListener('scroll', () => { if (manual) wrap(); drawBar(); }, { passive: true });
    addEventListener('resize', () => {
      const offset = list.scrollLeft - setWidth;
      measure();
      list.scrollLeft = setWidth + offset;
      pos = list.scrollLeft;
    });

    const takeControl = () => { manual = true; list.classList.add('is-manual'); clearTimeout(resumeTimer); };
    const handBack = (delay = 3500) => {
      if (reduced) return;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        if (hovering || drag) return handBack(1500);
        manual = false;
        list.classList.remove('is-manual');
        pos = list.scrollLeft;
      }, delay);
    };
    list.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovering = true; takeControl(); } });
    list.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovering = false; handBack(1200); } });
    list.addEventListener('touchstart', takeControl, { passive: true });
    list.addEventListener('touchend', () => handBack(), { passive: true });
    list.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { takeControl(); handBack(); } }, { passive: true });
    list.addEventListener('focusin', takeControl);
    list.addEventListener('focusout', () => handBack());

    $$('.client-slider__btn', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        takeControl();
        const card = originals[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(list).columnGap) || 24);
        list.scrollBy({ left: Number(btn.dataset.dir) * card, behavior: 'smooth' });
        handBack(4000);
      });
    });

    // Mouse drag; the pointer is only captured once it really moves, so clicks still land
    list.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      takeControl();
      drag = { x: e.clientX, left: list.scrollLeft, moved: false, id: e.pointerId };
    });
    list.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true;
        list.classList.add('is-dragging');
        list.setPointerCapture(drag.id);
      }
      if (drag.moved) list.scrollLeft = drag.left - dx;
    });
    list.addEventListener('dragstart', (e) => e.preventDefault());
    let justDragged = false;
    const release = () => {
      if (!drag) return;
      justDragged = drag.moved;
      if (justDragged) setTimeout(() => { justDragged = false; });
      drag = null;
      list.classList.remove('is-dragging');
      handBack();
    };
    addEventListener('pointerup', release);
    list.addEventListener('pointercancel', release);
    list.addEventListener('click', (e) => { if (justDragged) { justDragged = false; e.preventDefault(); } }, true);

    let onScreen = false;
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(list);
    const speed = innerWidth < 768 ? 20 : innerWidth < 1200 ? 30 : 40;
    gsap.ticker.add((time, delta) => {
      if (manual || !onScreen) return;
      pos += (direction * speed * delta) / 1000;
      if (pos > setWidth * 1.5) pos -= setWidth;
      else if (pos < setWidth * 0.5) pos += setWidth;
      list.scrollLeft = pos;
    });
    drawBar();
  }

  function initClients() {
    const section = $('#clients');
    markTween('works', 'clients', section, 'top bottom', 'top 30%');
    scrollReveal($('.clients__head', section), { y: 30 });
    const slider = $('.client-slider', section);
    initClientSlider(slider);
    if (reduced) return;
    // The cards rise in one after another
    const list = $('.client-slider__list', slider);
    const cards = $$('.client-note', list);
    const count = cards.filter((li) => !li.hasAttribute('aria-hidden')).length;
    const phone = matchMedia('(max-width: 767px)').matches;
    const tl = gsap.timeline({ scrollTrigger: { trigger: list, start: phone ? 'top 90%' : 'top 85%', toggleActions: 'play none none reverse' } });
    cards.forEach((li, i) => {
      const t = (i % count) * (phone ? 0.08 : 0.12);
      tl.fromTo(li, { opacity: 0, y: phone ? 22 : 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: phone ? 0.8 : 1.1, ease: 'power3.out', clearProps: 'transform' }, t)
        .fromTo(Array.from(li.children), { opacity: 0, y: phone ? 8 : 14 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08, clearProps: 'transform' }, t + 0.2);
    });
    scrollReveal($('.client-slider__nav', slider), { y: 20 });
  }

  function initFlow() {
    const section = $('#flow');
    markTween('clients', 'flow', section, 'top bottom', 'top 30%');
    const steps = $$('.flow__steps li', section);
    if (reduced) return;
    scrollReveal($('.head', section), { y: 30 });
    scrollReveal(steps, { y: 30 }, 0.12);
    const update = (self) => steps.forEach((li, i) => li.classList.toggle('is-on', self.progress >= i / (steps.length - 1) - 0.02));
    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', () => {
      gsap.fromTo('.flow__line i', { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: '.flow__track', start: 'top 70%', end: 'top 20%', scrub: 1, onUpdate: update },
      });
    });
    mm.add('(max-width: 899px)', () => {
      gsap.fromTo('.flow__line i', { scaleY: 0 }, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: '.flow__track', start: 'top 65%', end: 'bottom 65%', scrub: 1, onUpdate: update },
      });
    });
  }

  /* ---------- articles: the three media cards are written in the page ---------- */
  function initArticles() {
    const section = $('#articles');
    markTween('flow', 'articles', section);
    scrollReveal($('.articles__head', section), { y: 30 });
    const list = $('.articles__list', section);
    if (!reduced) {
      gsap.fromTo($$('.article', list), { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: list, start: 'top 85%' } });
    }
  }

  function initStatement() {
    const section = $('.statement');
    markTween('articles', 'statement', section, 'top bottom', 'center center');
    if (reduced) return;
    const [l1, l2] = $$('.statement__line', section);
    const st = { trigger: section, start: 'top 85%', end: 'center 45%', scrub: 1 };
    gsap.fromTo(l1, { clipPath: 'inset(0% 100% 0% 0%)', x: -24 }, { clipPath: 'inset(0% 0% 0% 0%)', x: 0, ease: 'none', scrollTrigger: st });
    gsap.fromTo(l2, { clipPath: 'inset(0% 0% 0% 100%)', x: 24 }, { clipPath: 'inset(0% 0% 0% 0%)', x: 0, ease: 'none', scrollTrigger: st });
    gsap.fromTo($('i', l1), { scaleX: 0, transformOrigin: 'left' }, { scaleX: 1, ease: 'none', scrollTrigger: st });
  }

  function initCompany() {
    const section = $('#company');
    markTween('statement', 'company', section);
    if (reduced) return;
    const panel = $('.panel', section);
    gsap.fromTo(panel, { scale: 0.93 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top 15%', scrub: true } });
    scrollReveal([$('.head', section), $('.company__logo', section)], { y: 30 }, 0.15);
    scrollReveal($$('.company__row', section), { y: 30 }, 0.08);
  }

  function initContact() {
    const section = $('#contact');
    markTween('company', 'contact', section);
    scrollSplit($('.contact__title', section), 0.03);
    if (reduced) return;
    scrollReveal($('.contact__card', section), { y: 40, scale: 0.98 });
    gsap.fromTo($$('.worries li', section), { opacity: 0, y: 24, scale: 0.85 }, {
      opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'back.out(2)', stagger: 0.12,
      scrollTrigger: { trigger: '.worries', start: 'top 88%', toggleActions: 'play none none reverse' },
    });
    scrollReveal([$('.contact__text', section), $('.ig-card', section)], { y: 30 }, 0.12);
  }

  /* ---------- Contact form (front end only: shows the done panel, sends nothing) ---------- */
  function initForm() {
    const form = $('#form');
    const status = $('.form__status', form);
    const submit = $('.form__submit', form);
    const required = $$('[required]', form);

    function check(el) {
      const wrap = el.closest('.form__field, .form__agree');
      let msg = '';
      if (el.validity.valueMissing) msg = el.type === 'checkbox' ? '内容をご確認のうえ、チェックを入れてください。' : 'こちらは必須項目です。';
      else if (el.validity.typeMismatch) msg = 'メールアドレスの形式が正しくありません。';
      else if (!el.validity.valid) msg = '入力内容をご確認ください。';
      wrap.classList.toggle('is-invalid', Boolean(msg));
      $('.form__error', wrap).textContent = msg;
      return !msg;
    }
    const setStatus = (text, isError = false) => {
      status.textContent = text;
      status.classList.toggle('is-error', isError);
    };
    form.addEventListener('focusout', (e) => { if (required.includes(e.target) && e.target.value) check(e.target); });
    const recheck = (e) => {
      if (!e.target.closest('.is-invalid')) return;
      check(e.target);
      if (!$('.is-invalid', form)) setStatus('');
    };
    form.addEventListener('input', recheck);
    form.addEventListener('change', recheck);

    // Freeze the 3D scene while typing so input stays responsive
    form.addEventListener('focusin', () => scene.setPaused(true));
    form.addEventListener('focusout', () => {
      setTimeout(() => { if (!form.contains(document.activeElement)) scene.setPaused(false); });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalid = required.filter((el) => !check(el));
      if (invalid.length) {
        setStatus('入力内容をご確認ください。', true);
        invalid[0].focus({ preventScroll: true });
        if (lenis) autoScroll(invalid[0], { offset: -160, duration: 1 });
        else invalid[0].scrollIntoView({ block: 'center' });
        return;
      }
      submit.disabled = true;
      setStatus('送信しています…');
      setTimeout(() => {
        const done = document.createElement('div');
        done.className = 'form__done';
        done.setAttribute('role', 'status');
        done.innerHTML = '<span class="form__done-icon"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>'
          + '<h4>送信が完了しました</h4>'
          + '<p>お問い合わせありがとうございます。<br>内容を確認のうえ、担当者よりご連絡いたします。</p>';
        form.replaceWith(done);
        scene.setPaused(false);
        if (!reduced) gsap.from(done, { opacity: 0, y: 30, duration: 0.8, ease: 'power3.out' });
        ScrollTrigger.refresh();
      }, 700);
    });
  }

  function initGlobal() {
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => { scene.state.scroll = self.progress; } });
    gsap.ticker.add(updateMark);
    addEventListener('pointermove', (e) => {
      scene.setMouse((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    });
  }

  /* ---------- Section stops ---------- */
  // With a mouse or trackpad, scrolling down settles at the top of each part before moving on
  function initSectionStops() {
    if (!lenis || !matchMedia('(pointer: fine)').matches) return;
    const parts = $$('main > section, main > .pin-spacer > section').filter((s) => !s.hidden && s.id !== 'top');
    let stops = [];
    const HEADING_Y = 120;
    const docTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
    const measure = () => {
      stops = parts.map((s) => {
        const spacer = s.parentElement.classList.contains('pin-spacer') ? s.parentElement : null;
        if (spacer) return Math.round(spacer.getBoundingClientRect().top + scrollY);
        if (s.querySelector(':scope > .panel')) return docTop(s);
        const heading = s.querySelector('.strength__grid, .head__en, .echo, .statement__line');
        return heading ? Math.max(docTop(s), docTop(heading) - HEADING_Y) : docTop(s);
      }).sort((a, b) => a - b);
    };
    measure();
    ScrollTrigger.addEventListener('refresh', measure);

    let wheelAt = 0;
    addEventListener('wheel', () => { wheelAt = performance.now(); }, { passive: true });
    const STOP_TIME = 1.3;
    let holdUntil = 0;
    addEventListener('wheel', (e) => {
      if (performance.now() < holdUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, { capture: true, passive: false });

    const settle = (t) => Math.min(1, 1 - Math.pow(1 - t / 0.7, 3));
    let last = lenis.targetScroll;
    lenis.on('scroll', () => {
      const target = lenis.targetScroll;
      const byWheel = performance.now() - wheelAt < 400 && target - last < innerHeight * 2;
      if (!autoScrolling && byWheel && target > last) {
        const stop = stops.find((y) => y > last + 2 && y <= target);
        if (stop !== undefined) {
          holdUntil = performance.now() + STOP_TIME * 1000;
          autoScroll(stop, { duration: STOP_TIME, easing: settle, lock: true });
          last = stop;
          return;
        }
      }
      last = target;
    });
  }

  /* ---------- Opening ---------- */
  // The letters of 「ワクワク」 hop one after another, again every few seconds
  function hopLetters() {
    const chars = $$('.hero__title em .ch__in');
    if (!chars.length) return;
    const lift = () => -parseFloat(getComputedStyle(chars[0]).fontSize) * 0.22;
    gsap.timeline({ repeat: -1, repeatDelay: 5 })
      .to(chars, { y: lift, duration: 0.26, ease: 'power2.out', stagger: 0.08 })
      .to(chars, { y: 0, duration: 0.6, ease: 'bounce.out', stagger: 0.08 }, 0.26);
  }

  async function playIntro() {
    const loader = $('#loader');
    loader.style.animation = 'none';
    const title = $('.hero__title');
    const heroChars = splitChars(title);
    gradientChars(title);
    const sub = $('.hero__sub');
    const heroReveal = $$('[data-hero-reveal]');
    const scrambles = $$('[data-scramble]');

    if (reduced) {
      loader.remove();
      $('.motion-toggle').hidden = !prefersReduced;
      return;
    }

    root.classList.add('is-loading');
    if (lenis) lenis.stop();
    gsap.set(heroChars, { yPercent: 110, rotateX: -75, filter: 'blur(10px)', transformOrigin: '50% 100%', transformPerspective: 600 });
    gsap.set(sub, { '--wipe': 0 });
    gsap.set(heroReveal, { opacity: 0, y: 24 });
    scrambles.forEach((el) => {
      el.dataset.text = el.textContent;
      el.textContent = el.textContent.replace(/\S/g, ' ');
    });

    // Weighted loading work; the gauge follows it but takes at least 2.2s so the network can show
    let loaded = 0;
    const pageLoaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
    [[document.fonts && document.fonts.ready, 0.25], [scene.ready, 0.45], [pageLoaded, 0.3]].forEach(([work, weight]) => {
      Promise.resolve(work).catch(() => {}).then(() => { loaded += weight; });
    });
    setTimeout(() => { loaded = 1; }, 7000);

    const mark = $('.loader__mark', loader);
    const canvas = $('.loader__canvas', loader);
    gsap.set(mark, { opacity: 0 });
    const particles = window.TiusParticles ? await window.TiusParticles.createLoaderParticles(canvas, mark).catch(() => null) : null;
    let formed = particles ? null : Promise.resolve();

    const pct = $('.loader__pct b', loader);
    const fill = $('.loader__fill', loader);
    const startedAt = performance.now();
    let shown = 0;
    await new Promise((resolve) => {
      const tick = () => {
        const target = Math.min(loaded, (performance.now() - startedAt) / 2200, 1);
        shown += (target - shown) * (1 - Math.pow(0.9, gsap.ticker.deltaRatio()));
        if (target >= 0.999 && shown > 0.995) shown = 1;
        pct.textContent = Math.round(shown * 100);
        fill.style.transform = `scaleX(${shown})`;
        if (!particles) mark.style.opacity = shown;
        if (!formed && (shown > 0.5 || shown === 1)) formed = particles.gather();
        if (shown === 1) { gsap.ticker.remove(tick); resolve(); }
      };
      gsap.ticker.add(tick);
    });
    await formed;

    // Gathered: the particles give way to the crisp mark and the wordmark slides in
    await new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(mark, { opacity: 1, duration: 0.45, ease: 'power1.out' })
        .to(canvas, { opacity: 0, duration: 0.5 }, 0.1)
        .fromTo($('.loader__type', loader), { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'expo.inOut' }, 0.1)
        .to({}, { duration: 0.3 });
    });

    gsap.timeline({ onComplete: () => { if (particles) particles.stop(); loader.remove(); } })
      .to('.loader__logo', { y: -30, opacity: 0, duration: 0.5, ease: 'power2.in' })
      .to('.loader__gauge', { opacity: 0, duration: 0.3 }, 0)
      .fromTo(loader, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, 0.25)
      // The dark face settles in while the loader is still lifting, so the cream copy never lands on paper
      .to(heroIntro, { frame: 1, duration: 0.8, ease: 'power2.out' }, 0.25)
      .to(scene.state, { intro: 1, duration: 2.2, ease: 'power1.out' }, 0.55)
      .add(() => {
        root.classList.remove('is-loading');
        if (lenis) lenis.start();
        ScrollTrigger.refresh();
      }, 0.8)
      .add(() => scrambles.forEach((el, i) => gsap.delayedCall(i * 0.25, () => scramble(el, 1.3))), 0.7)
      // Line 1 flips up character by character out of a blur
      .to(heroChars, { yPercent: 0, rotateX: 0, filter: 'blur(0px)', duration: 1.3, ease: 'expo.out', stagger: 0.035, clearProps: 'filter' }, 0.95)
      // Line 2 is written in behind a glowing scan bar
      .to(sub, { '--wipe': 1, duration: 1.8, ease: 'power3.inOut' }, 1.55)
      .fromTo('.hero__scan', { opacity: 0 }, { opacity: 1, duration: 0.2 }, 1.55)
      .to('.hero__scan', { opacity: 0, duration: 0.45 }, 3.15)
      .add(() => { title.classList.add('is-revealed'); hopLetters(); }, 2.6)
      .to(heroReveal, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.15 }, 1.3);
  }

  Object.assign(scene.state, key('hero'));
  initHero();
  initIntro();
  initVision();
  initService();
  initStrength();
  initWorks();
  initClients();
  initFlow();
  initArticles();
  initStatement();
  initCompany();
  initContact();
  initForm();
  initGlobal();
  initSectionStops();
  playIntro();

  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
