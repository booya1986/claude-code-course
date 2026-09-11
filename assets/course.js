(function () {
  'use strict';

  var C = window.COURSE, TX = window.COURSE_TRANSCRIPTS || {}, RD = window.COURSE_READING || {};
  var KEY = 'cc-course-v1';
  var $ = function (id) { return document.getElementById(id); };
  var TOUCH = window.matchMedia && window.matchMedia('(hover: none)').matches;
  // The videos carry their own Hebrew subtitles, burned into the picture. Overlay captions would stack a second line on top.
  var BURNED = !!C.burnedSubs;

  var video = $('video'), stage = $('stage');
  var state = load();
  var cur = null;          // current chapter object
  var cues = [];           // transcript cues of the current chapter
  var cueEls = [];
  var dragging = false, saveTimer = null, hideTimer = null, notesTimer = null;
  var saveWarned = false;

  var ICONS = {
    1: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><polyline points="7 9 10 12 7 15"/><line x1="12" y1="15" x2="17" y2="15"/></svg>',
    2: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
    3: '<svg viewBox="0 0 24 24"><path d="M9 2h6l1 3h4v15H4V5h4z"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg>',
    4: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="5"/><rect x="5" y="9" width="8" height="6" rx="3"/></svg>',
    5: '<svg viewBox="0 0 24 24"><path d="M4 4h12l4 4v12H4z"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="14" y2="16"/></svg>',
    6: '<svg viewBox="0 0 24 24"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>',
    7: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    8: '<svg viewBox="0 0 24 24"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    9: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>'
  };
  // plan-step boxes, drawn rather than typed as glyphs
  var BOX = {
    done: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3"/><polyline points="4.5 8.2 7 10.6 11.6 5.6"/></svg>',
    now: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3"/><rect class="dot" x="5" y="5" width="6" height="6" rx="1.5"/></svg>',
    todo: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3"/></svg>'
  };

  /* ---------------- storage ---------------- */
  function load() {
    var d = { ch: {}, last: 0, prefs: { rate: 1, volume: 1, muted: false, cc: false, follow: true } };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (raw && typeof raw === 'object') {
        d.ch = raw.ch || {};
        d.last = raw.last || 0;
        for (var k in raw.prefs || {}) d.prefs[k] = raw.prefs[k];
      }
    } catch (e) {}
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      // Private windows and full storage refuse writes. Say so once, instead of losing notes silently.
      if (!saveWarned) { saveWarned = true; toast('הדפדפן הזה לא מאפשר לשמור, ולכן ההערות וההתקדמות לא יישמרו'); }
    }
  }
  function chs(n) {
    if (!state.ch[n]) state.ch[n] = { pos: 0, max: 0, read: 0, done: false, bm: [], notes: '' };
    var s = state.ch[n];
    if (!s.bm) s.bm = [];
    if (typeof s.notes !== 'string') s.notes = '';
    if (typeof s.read !== 'number') s.read = 0;
    return s;
  }

  /* ---------------- helpers ---------------- */
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60);
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
  }
  function byNum(n) {
    for (var i = 0; i < C.chapters.length; i++) if (C.chapters[i].n === n) return C.chapters[i];
    return null;
  }
  // One progress model for every chapter: finished = 100, video = how far you watched, reading = how far you read.
  function progress(n) {
    var s = chs(n), ch = byNum(n);
    if (!ch) return 0;
    if (s.done) return 100;
    if (ch.video && ch.duration) return Math.min(99, Math.round(s.max / ch.duration * 100));
    return Math.min(99, Math.round(s.read));
  }
  function overall() {
    var sum = 0;
    C.chapters.forEach(function (c) { sum += progress(c.n); });
    return Math.round(sum / C.chapters.length);
  }

  /* toast: a single status line, optionally with one action */
  var toastAct = null;
  function toast(msg, actLabel, act) {
    var el = $('toast'), btn = $('toast-act');
    $('toast-msg').textContent = msg;
    toastAct = act || null;
    btn.hidden = !act;
    if (act) btn.textContent = actLabel;
    el.classList.add('on');
    stage.classList.add('toasting');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); stage.classList.remove('toasting'); toastAct = null; }, act ? 5000 : 2200);
  }
  $('toast-act').addEventListener('click', function () {
    var fn = toastAct;
    $('toast').classList.remove('on'); stage.classList.remove('toasting');
    toastAct = null;
    if (fn) fn();
  });

  /* ---------------- /context meter ---------------- */
  function renderMeter() {
    var box = $('ctx-cells');
    box.textContent = '';
    C.chapters.forEach(function (c) {
      var cell = document.createElement('span');
      var p = progress(c.n);
      cell.className = 'cell' + (p >= 100 ? ' full' : '');
      cell.innerHTML = '<i style="--p:' + (p / 100) + '"></i>';
      box.appendChild(cell);
    });
    var o = overall();
    $('ctx-pct').textContent = o + '%';
    var done = C.chapters.filter(function (c) { return chs(c.n).done; }).length;
    $('ctx').setAttribute('aria-label', 'התקדמות בקורס: ' + o + '%, ' + done + ' מתוך ' + C.chapters.length + ' פרקים הושלמו');
    $('ctx').title = o + '% מהקורס · ' + done + ' מתוך ' + C.chapters.length + ' פרקים הושלמו';
  }

  /* ---------------- rail ---------------- */
  function renderRail() {
    var box = $('chaplist');
    box.textContent = '';
    var w = document.createElement('button');
    w.className = 'chap home';
    w.setAttribute('aria-current', cur ? 'false' : 'page');
    w.innerHTML = '<span class="num"><svg class="homeic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg></span><span><span class="t">מסך הפתיחה</span><span class="m">על הקורס ואיך הוא עובד</span></span>';
    w.addEventListener('click', function () { showWelcome(true); });
    box.appendChild(w);
    var R = 2 * Math.PI * 16;
    C.chapters.forEach(function (ch) {
      var s = chs(ch.n), p = progress(ch.n);
      var b = document.createElement('button');
      b.className = 'chap' + (s.done ? ' done' : '') + (ch.video ? '' : ' soon');
      b.setAttribute('aria-current', cur && cur.n === ch.n ? 'page' : 'false');
      var meta;
      if (ch.video) meta = fmt(ch.duration) + (s.done ? ' · הושלם' : (p > 0 ? ' · נצפו ' + p + '%' : ''));
      else meta = '<span class="tag">קריאה בלבד</span>' + (s.done ? ' הושלם' : (p > 0 ? ' נקראו ' + p + '%' : ''));
      b.innerHTML =
        '<span class="num"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rbg" cx="18" cy="18" r="16"></circle>' +
          (p > 0 ? '<circle class="rfg" cx="18" cy="18" r="16" stroke-dasharray="' + (R * p / 100).toFixed(1) + ' ' + R.toFixed(1) + '"></circle>' : '') +
        '</svg><i>' + (s.done ? '<svg class="tick" viewBox="0 0 24 24"><polyline points="5 12.5 10 17.5 19 7"/></svg>' : ch.n) + '</i></span>' +
        '<span><span class="t"></span><span class="m">' + meta + '</span></span>';
      b.querySelector('.t').textContent = ch.title;
      b.setAttribute('aria-label', 'פרק ' + ch.n + ': ' + ch.title + (s.done ? ', הושלם' : (p > 0 ? ', ' + p + '%' : '')));
      b.addEventListener('click', function () { open(ch.n, true); });
      box.appendChild(b);
    });
    renderMeter();
  }

  function closeRail() {
    $('chaplist').classList.remove('open');
    $('rail-toggle').setAttribute('aria-expanded', 'false');
    $('rail-toggle-label').textContent = cur ? 'פרק ' + cur.n + ' מתוך ' + C.chapters.length + ' · ' + cur.title : 'כל הפרקים';
  }

  function toTop() {
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(function () { window.scrollTo({ top: 0, behavior: 'auto' }); });
  }

  /* ---------------- routing ----------------
     Chapter changes push a history entry, so Back returns to the previous chapter
     instead of leaving the course, and editing the hash in an open tab navigates. */
  function go(hash) {
    if (location.hash !== hash) history.pushState(null, '', hash);
  }
  function route() {
    var m = /#ch(\d+)/.exec(location.hash);
    var n = m ? parseInt(m[1], 10) : 0;
    if (n && byNum(n)) { if (!cur || cur.n !== n) open(n, false); }
    else if (cur) showWelcome(false);
  }
  window.addEventListener('hashchange', route);

  /* ---------------- welcome screen ---------------- */
  // Where a returning learner should continue: the chapter they last opened, or the next unfinished one.
  function resumeTarget() {
    var last = byNum(state.last);
    if (last && !chs(last.n).done && progress(last.n) > 0) return last;
    for (var i = 0; i < C.chapters.length; i++) {
      var c = C.chapters[i];
      if (!chs(c.n).done && progress(c.n) > 0) return c;
    }
    if (last) {
      for (var j = last.n + 1; j <= C.chapters.length; j++) if (!chs(j).done) return byNum(j);
    }
    return null;
  }

  function renderWelcome() {
    var withVideo = C.chapters.filter(function (c) { return c.video; });
    var secs = withVideo.reduce(function (a, c) { return a + (c.duration || 0); }, 0);
    $('w-meta').textContent = C.chapters.length + ' פרקים, כ-' + Math.round(secs / 60) + ' דקות';

    var g = $('w-grid');
    g.textContent = '';
    C.chapters.forEach(function (ch) {
      var b = document.createElement('button');
      var p = progress(ch.n);
      b.className = 'w-item' + (ch.video ? '' : ' soon');
      b.innerHTML =
        (ch.thumb ? '<img class="w-thumb" src="' + ch.thumb + '" alt="" loading="lazy">' : '') +
        (p > 0 ? '<span class="w-bar"><i style="width:' + p + '%"></i></span>' : '') +
        '<span class="w-body">' +
          '<span class="w-head"><span class="w-ic">' + (ICONS[ch.n] || '') + '</span><b class="nm"></b></span>' +
          '<p></p>' +
          '<span class="tag">' + (ch.video ? 'וידאו ' + fmt(ch.duration) : 'קריאה · הווידאו בהפקה') + (chs(ch.n).done ? ' · הושלם' : '') + '</span>' +
        '</span>';
      b.querySelector('.nm').textContent = ch.n + '. ' + ch.title;
      b.querySelector('p').textContent = ch.oneliner || ch.subtitle || '';
      b.addEventListener('click', function () { open(ch.n, true); });
      g.appendChild(b);
    });

    var res = resumeTarget(), pri = $('w-primary'), sec = $('w-secondary');
    if (res) {
      var at = res.video && chs(res.n).pos > 5 ? ' (' + fmt(chs(res.n).pos) + ')' : '';
      pri.textContent = 'המשך: פרק ' + res.n + ' · ' + res.title + at;
      pri.onclick = function () { open(res.n, true); };
      sec.hidden = false;
      sec.textContent = 'מההתחלה';
      sec.onclick = function () { open(1, true); };
    } else {
      pri.textContent = 'התחלה מפרק 1';
      pri.onclick = function () { open(1, true); };
      sec.hidden = true;
    }
  }

  var introReady = false;
  function setupIntro() {
    var iv = $('intro-video');
    if (!C.intro || !C.intro.video) { $('introwrap').hidden = true; return; }
    if (!introReady) {
      introReady = true;
      iv.poster = C.intro.poster || '';
      iv.src = C.intro.video;
      iv.addEventListener('ended', function () {
        $('intro-sound').hidden = true;
        $('intro-replay').hidden = false;
      });
      iv.addEventListener('click', function () { if (iv.muted) unmuteIntro(); else if (iv.paused) iv.play(); else iv.pause(); });
      $('intro-sound').addEventListener('click', unmuteIntro);
      $('intro-replay').addEventListener('click', function () {
        $('intro-replay').hidden = true;
        iv.currentTime = 0; iv.play().catch(function () {});
      });
    }
    iv.muted = true;
    $('intro-sound').hidden = false;
    $('intro-replay').hidden = true;
    iv.currentTime = 0;
    iv.play().catch(function () { /* autoplay refused: the poster and the sound button still invite a click */ });
  }
  function unmuteIntro() {
    var iv = $('intro-video');
    iv.muted = false;
    iv.currentTime = 0;
    iv.play().catch(function () {});
    $('intro-sound').hidden = true;
  }
  function stopIntro() {
    var iv = $('intro-video');
    if (iv && !iv.paused) iv.pause();
  }

  function showWelcome(push) {
    if (cur) persist();
    if (cur && cur.video) video.pause();
    cur = null;
    if (push) go('#welcome');
    $('welcome').hidden = false;
    $('player').hidden = true;
    renderWelcome();
    setupIntro();
    renderRail();
    closeRail();
    toTop();
  }

  /* ---------------- open a chapter ---------------- */
  function open(n, push) {
    var ch = byNum(n);
    if (!ch) return;
    if (cur) persist();
    cur = ch;
    state.last = n; save();
    if (push) go('#ch' + n);
    $('welcome').hidden = true;
    $('player').hidden = false;
    stopIntro();
    hideEndcard();

    $('ch-title').textContent = ch.title;
    $('ch-one').textContent = ch.oneliner || ch.subtitle || '';
    $('ch-meta').textContent = 'פרק ' + n + ' מתוך ' + C.chapters.length + (ch.video ? ' · וידאו ' + fmt(ch.duration) : ' · חומר קריאה');

    var s = chs(n);
    stage.classList.toggle('empty', !ch.video);
    video.hidden = !ch.video;
    $('ctrls').hidden = !ch.video;
    $('bigplay').hidden = true;
    var soons = stage.querySelectorAll('.soonbox');
    for (var si = 0; si < soons.length; si++) soons[si].remove();

    if (ch.video) {
      video.poster = ch.poster || '';
      video.src = ch.video;
      video.playbackRate = state.prefs.rate;
      video.volume = state.prefs.volume;
      video.muted = state.prefs.muted;
      video.load();
      $('bigplay').hidden = false;
      if (s.pos > 5 && (!ch.duration || s.pos < ch.duration - 12)) {
        var seek = function () { video.currentTime = s.pos; toast('ממשיכים מ־' + fmt(s.pos)); video.removeEventListener('loadedmetadata', seek); };
        video.addEventListener('loadedmetadata', seek);
      }
    } else {
      // Reading-only chapter: a slim banner, not a dead 16:9 block.
      video.removeAttribute('src'); video.load();
      var d = document.createElement('div');
      d.className = 'soonbox';
      d.innerHTML = (ch.thumb ? '<img class="soon-thumb" src="' + ch.thumb + '" alt="">' : '') +
        '<div><b>הווידאו של הפרק הזה בהפקה</b><p>בינתיים כל העיקרון כתוב כאן למטה, ואפשר לשמור עליו הערות.</p></div>';
      stage.insertBefore(d, $('ctrls'));
    }

    // Tabs that would be empty for a reading-only chapter are not offered at all.
    ['markers', 'bookmarks', 'transcript'].forEach(function (t) { $('tab-' + t).hidden = !ch.video; });

    cues = TX[n] || [];
    lastCue = -1;
    renderTranscript();
    renderMarkers();
    renderBookmarks();
    renderReading();
    renderScrubMarks();
    renderUpNext();
    $('notes').value = s.notes;
    $('note-sub').textContent = 'פרק ' + n + ' · ' + ch.title;
    $('note-saved').textContent = '';
    updateDoneBtn();
    $('btn-prev').disabled = n <= 1;
    $('btn-next').disabled = n >= C.chapters.length;
    $('c-time').textContent = '0:00 / ' + fmt(ch.duration || 0);
    setFill(0, 0, ch.duration || 0);
    $('captions').textContent = '';
    selectTab(ch.video ? 'markers' : 'reading');
    renderRail();
    closeRail();
    toTop();
  }

  function renderUpNext() {
    var box = $('upnext');
    box.textContent = '';
    var next = byNum(cur.n + 1), prev = byNum(cur.n - 1);
    if (next) {
      var b = document.createElement('button');
      b.className = 'un';
      b.innerHTML =
        (next.thumb ? '<img src="' + next.thumb + '" alt="" loading="lazy">' : '') +
        '<span><span class="k">הפרק הבא</span><span class="nm"></span><span class="mt"></span></span>' +
        '<span class="arrow"><svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 18 5 12 11 6"/></svg></span>';
      b.querySelector('.nm').textContent = next.n + '. ' + next.title;
      b.querySelector('.mt').textContent = next.video ? 'וידאו ' + fmt(next.duration) : 'חומר קריאה · הווידאו בהפקה';
      b.addEventListener('click', function () { open(next.n, true); });
      box.appendChild(b);
    }
    var back = document.createElement('button');
    back.className = 'btn back';
    if (prev) {
      back.textContent = 'הפרק הקודם →';
      back.addEventListener('click', function () { open(prev.n, true); });
    } else {
      back.textContent = 'מסך הפתיחה →';
      back.addEventListener('click', function () { showWelcome(true); });
    }
    box.appendChild(back);
  }

  function updateDoneBtn() {
    var s = chs(cur.n), b = $('btn-done');
    b.classList.toggle('done', !!s.done);
    b.setAttribute('aria-pressed', String(!!s.done));
    b.querySelector('span').textContent = s.done ? 'הושלם' : 'סמן כהושלם';
  }

  function persist() {
    if (!cur) return;
    var s = chs(cur.n);
    if (cur.video && isFinite(video.currentTime) && video.currentTime > 0) {
      s.pos = video.currentTime;
      if (video.currentTime > s.max) s.max = video.currentTime;
      var dur = video.duration || cur.duration;
      if (dur && s.max / dur >= 0.95) s.done = true;
    }
    save();
  }

  /* ---------------- tabs (ARIA tab pattern, roving tabindex) ---------------- */
  var TABS = ['markers', 'bookmarks', 'notes', 'transcript', 'reading'];
  function visibleTabs() { return TABS.filter(function (t) { return !$('tab-' + t).hidden; }); }
  function selectTab(name, focus) {
    TABS.forEach(function (t) {
      var on = t === name;
      $('tab-' + t).setAttribute('aria-selected', String(on));
      $('tab-' + t).tabIndex = on ? 0 : -1;
      $('p-' + t).hidden = !on;
    });
    if (focus) $('tab-' + name).focus();
    if (name === 'transcript') scrollCueIntoView(true);
    if (name === 'reading') trackReading();
  }
  TABS.forEach(function (t) {
    var el = $('tab-' + t);
    el.addEventListener('click', function () { selectTab(t); });
    el.addEventListener('keydown', function (e) {
      var list = visibleTabs(), i = list.indexOf(t), to = null;
      // RTL: the visually-next tab sits to the left
      if (e.key === 'ArrowLeft') to = list[(i + 1) % list.length];
      else if (e.key === 'ArrowRight') to = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') to = list[0];
      else if (e.key === 'End') to = list[list.length - 1];
      if (to) { e.preventDefault(); selectTab(to, true); }
    });
  });

  /* ---------------- markers, shown as the chapter's plan ---------------- */
  function renderMarkers() {
    var box = $('markers');
    box.textContent = '';
    var ms = (cur.markers || []);
    lastMk = -2;
    if (!ms.length) { $('plan-status').textContent = ''; return; }
    ms.forEach(function (m, i) {
      var b = document.createElement('button');
      b.className = 'mk';
      b.dataset.i = i;
      b.innerHTML = '<span class="box">' + BOX.todo + '</span><span class="x"></span><span class="time">' + fmt(m.t) + '</span>';
      b.querySelector('.x').textContent = m.title;
      b.setAttribute('aria-label', m.title + ', ' + fmt(m.t));
      b.addEventListener('click', function () { seekTo(m.t); video.play().catch(function () {}); });
      box.appendChild(b);
    });
    updateMarkerHighlight(0);
  }
  function currentMarkerIndex(t) {
    var ms = cur && cur.markers || [], idx = -1;
    for (var i = 0; i < ms.length; i++) if (ms[i].t <= t + 0.15) idx = i;
    return idx;
  }
  var lastMk = -2;
  function updateMarkerHighlight(t) {
    var idx = currentMarkerIndex(t);
    if (idx === lastMk) return;
    lastMk = idx;
    var els = $('markers').querySelectorAll('.mk');
    for (var i = 0; i < els.length; i++) {
      var st = i < idx ? 'done' : (i === idx ? 'now' : 'todo');
      if (els[i].dataset.st === st) continue;
      els[i].dataset.st = st;
      els[i].querySelector('.box').innerHTML = BOX[st];
      if (st === 'now') els[i].setAttribute('aria-current', 'step'); else els[i].removeAttribute('aria-current');
    }
    var total = els.length;
    $('plan-status').textContent = total ? (Math.max(idx, 0) + ' מתוך ' + total + ' שלבים עברו') : '';
  }

  /* ---------------- bookmarks ----------------
     A bookmark never interrupts watching: it drops a pin, keeps the current tab and
     focus, and offers the note as an optional follow-up from the toast. */
  function addBookmark() {
    if (!cur || !cur.video) return;
    var s = chs(cur.n);
    var t = video.currentTime || 0;
    var near = cueAt(t) || cues[cueIndexAt(t)];
    var id = 'b' + Date.now();
    s.bm.push({ id: id, t: t, note: '', quote: near ? near.t : '' });
    s.bm.sort(function (a, b) { return a.t - b.t; });
    save();
    renderBookmarks(); renderScrubMarks();
    toast('נוספה סימנייה ב־' + fmt(t), 'הוספת הערה', function () {
      selectTab('bookmarks');
      var inp = document.querySelector('.bm[data-id="' + id + '"] input');
      if (inp) inp.focus({ preventScroll: true });
    });
  }
  function removeBookmark(id) {
    var s = chs(cur.n), gone = null, at = -1;
    s.bm.forEach(function (x, i) { if (x.id === id) { gone = x; at = i; } });
    if (!gone) return;
    s.bm.splice(at, 1);
    save(); renderBookmarks(); renderScrubMarks();
    var n = cur.n;
    toast('הסימנייה מ־' + fmt(gone.t) + ' נמחקה', 'ביטול', function () {
      var st = chs(n);
      st.bm.push(gone); st.bm.sort(function (a, b) { return a.t - b.t; });
      save();
      if (cur && cur.n === n) { renderBookmarks(); renderScrubMarks(); }
    });
  }
  function renderBookmarks() {
    var s = chs(cur.n), box = $('bookmarks');
    box.textContent = '';
    $('cnt-bm').textContent = s.bm.length;
    $('cnt-bm').hidden = s.bm.length === 0;
    $('bm-add').disabled = !cur.video;
    if (!s.bm.length) {
      box.innerHTML = '<p class="empty-note">עוד אין סימניות בפרק הזה. כפתור הסימנייה בנגן שומר את הרגע ואת המשפט שנאמר בו, ותוכלו לחזור אליו בלחיצה אחת.</p>';
      return;
    }
    s.bm.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'bm'; row.dataset.id = b.id;
      row.innerHTML =
        '<button class="jump"></button>' +
        '<div class="bm-body"><q></q><input type="text" placeholder="הוסיפו הערה, לא חובה"></div>' +
        '<button class="del"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>';
      var jump = row.querySelector('.jump'), q = row.querySelector('q'), inp = row.querySelector('input'), del = row.querySelector('.del');
      jump.textContent = fmt(b.t);
      jump.setAttribute('aria-label', 'קפיצה ל־' + fmt(b.t));
      if (b.quote) q.textContent = b.quote; else q.remove();
      inp.value = b.note || '';
      inp.setAttribute('aria-label', 'הערה לסימנייה ב־' + fmt(b.t));
      del.setAttribute('aria-label', 'מחיקת הסימנייה ב־' + fmt(b.t));
      inp.addEventListener('input', function () { b.note = inp.value; clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); });
      jump.addEventListener('click', function () { seekTo(b.t); video.play().catch(function () {}); });
      del.addEventListener('click', function () { removeBookmark(b.id); });
      box.appendChild(row);
    });
  }

  /* ---------------- notes ---------------- */
  $('notes').addEventListener('input', function () {
    if (!cur) return;
    chs(cur.n).notes = this.value;
    clearTimeout(notesTimer);
    notesTimer = setTimeout(function () { save(); $('note-saved').textContent = 'נשמר'; }, 500);
  });
  $('note-stamp').addEventListener('click', function () {
    if (!cur) return;
    var ta = $('notes'), t = cur.video ? fmt(video.currentTime || 0) : '';
    var stamp = t ? '[' + t + '] ' : '';
    var p = ta.selectionStart;
    ta.value = ta.value.slice(0, p) + stamp + ta.value.slice(p);
    ta.focus(); ta.selectionStart = ta.selectionEnd = p + stamp.length;
    chs(cur.n).notes = ta.value; save(); $('note-saved').textContent = 'נשמר';
  });

  /* ---------------- transcript ---------------- */
  function renderTranscript() {
    var box = $('transcript');
    box.textContent = ''; cueEls = [];
    $('tx-search').value = '';
    if (!cues.length) {
      box.innerHTML = '<p class="empty-note">התמלול של הפרק הזה יתווסף עם הווידאו.</p>';
      $('tx-search').disabled = true; $('tx-copy').disabled = true;
      return;
    }
    $('tx-search').disabled = false; $('tx-copy').disabled = false;
    cues.forEach(function (c, i) {
      var b = document.createElement('button');
      b.className = 'cue'; b.dataset.i = i;
      b.innerHTML = '<span class="time">' + fmt(c.s) + '</span><span class="tx"></span>';
      b.querySelector('.tx').textContent = c.t;
      b.addEventListener('click', function () { seekTo(c.s); video.play().catch(function () {}); });
      box.appendChild(b); cueEls.push(b);
    });
  }
  function cueAt(t) {
    for (var i = cues.length - 1; i >= 0; i--) if (cues[i].s <= t + 0.05) return (t <= cues[i].e + 0.6) ? cues[i] : null;
    return null;
  }
  function cueIndexAt(t) {
    for (var i = cues.length - 1; i >= 0; i--) if (cues[i].s <= t + 0.05) return i;
    return -1;
  }
  var lastCue = -1;
  function updateTranscript(t) {
    var i = cueIndexAt(t);
    if (state.prefs.cc && !BURNED) {
      var c = cues[i];
      var cap = $('captions');
      if (c && t <= c.e + 0.8) {
        if (!cap.firstChild || cap.firstChild.textContent !== c.t) { cap.innerHTML = '<span></span>'; cap.firstChild.textContent = c.t; }
      } else cap.textContent = '';
    }
    if (i === lastCue) return;
    if (cueEls[lastCue]) cueEls[lastCue].classList.remove('active');
    lastCue = i;
    if (cueEls[i]) { cueEls[i].classList.add('active'); scrollCueIntoView(false); }
  }
  function scrollCueIntoView(force) {
    if (!state.prefs.follow && !force) return;
    var el = cueEls[lastCue], box = $('transcript');
    if (!el || $('p-transcript').hidden) return;
    var top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: top, behavior: force ? 'auto' : 'smooth' });
  }
  function syncFollow() {
    $('tx-follow').setAttribute('aria-pressed', String(state.prefs.follow));
    $('tx-follow').textContent = state.prefs.follow ? 'עוקב אחרי הסרטון' : 'לא עוקב';
  }
  $('tx-follow').addEventListener('click', function () {
    state.prefs.follow = !state.prefs.follow; save();
    syncFollow();
    if (state.prefs.follow) scrollCueIntoView(true);
  });
  $('tx-search').addEventListener('input', function () {
    var q = this.value.trim();
    cueEls.forEach(function (el, i) {
      var txt = cues[i].t;
      if (!q) { el.hidden = false; el.querySelector('.tx').textContent = txt; return; }
      var pos = txt.indexOf(q);
      el.hidden = pos < 0;
      if (pos >= 0) {
        var sp = el.querySelector('.tx');
        sp.textContent = '';
        sp.appendChild(document.createTextNode(txt.slice(0, pos)));
        var mk = document.createElement('mark'); mk.textContent = txt.substr(pos, q.length);
        sp.appendChild(mk);
        sp.appendChild(document.createTextNode(txt.slice(pos + q.length)));
      }
    });
  });
  $('tx-copy').addEventListener('click', function () {
    var txt = cues.map(function (c) { return '[' + fmt(c.s) + '] ' + c.t; }).join('\n');
    navigator.clipboard.writeText(txt).then(function () {
      $('tx-copy').textContent = 'הועתק';
      setTimeout(function () { $('tx-copy').textContent = 'העתק תמלול'; }, 1500);
    }, function () { toast('ההעתקה נחסמה בדפדפן. אפשר לסמן את הטקסט ולהעתיק ידנית'); });
  });

  /* ---------------- reading ---------------- */
  function renderReading() {
    var box = $('reading');
    var html = RD[cur.n];
    box.innerHTML = html || '<p class="empty-note">חומר הקריאה של הפרק הזה עדיין לא כתוב.</p>';
    var tables = box.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      if (!tables[i].parentNode.classList.contains('tbl')) {
        var w = document.createElement('div'); w.className = 'tbl';
        tables[i].parentNode.insertBefore(w, tables[i]); w.appendChild(tables[i]);
      }
    }
    // box headings follow the principle's h2 directly, so they are h3 in this outline, not h4
    var hs = box.querySelectorAll('.box > h4');
    for (var h = 0; h < hs.length; h++) {
      var n3 = document.createElement('h3');
      n3.className = 'box-h';
      n3.innerHTML = hs[h].innerHTML;
      hs[h].parentNode.replaceChild(n3, hs[h]);
    }
    // the written guide ships one inline white-space:pre command block; the course wraps instead of scrolling
    var pres = box.querySelectorAll('code[style*="white-space:pre"]');
    for (var k = 0; k < pres.length; k++) { pres[k].style.whiteSpace = 'pre-wrap'; pres[k].style.overflowWrap = 'anywhere'; }
    var links = box.querySelectorAll('a[href^="http"]');
    for (var j = 0; j < links.length; j++) { links[j].target = '_blank'; links[j].rel = 'noopener'; }
  }
  // Reading progress: how far down the written guide the learner has actually scrolled.
  var readTick = false;
  function trackReading() {
    if (!cur || $('p-reading').hidden) return;
    var el = $('reading'), r = el.getBoundingClientRect();
    if (!r.height) return;
    var seen = Math.max(0, Math.min(1, (window.innerHeight - r.top) / r.height)) * 100;
    var s = chs(cur.n);
    if (seen > s.read + 0.5) {
      s.read = seen;
      if (!cur.video && seen >= 97 && !s.done) { s.done = true; updateDoneBtn(); toast('קראתם את כל העיקרון'); }
      clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(); renderRail(); }, 600);
    }
  }
  window.addEventListener('scroll', function () {
    if (readTick) return;
    readTick = true;
    requestAnimationFrame(function () { readTick = false; trackReading(); });
  }, { passive: true });

  /* ---------------- player ---------------- */
  function seekTo(t) {
    if (!cur || !cur.video) return;
    var d = video.duration || cur.duration || 0;
    video.currentTime = Math.max(0, Math.min(d ? d - 0.1 : t, t));
    idle();
  }
  function setFill(p, t, d) {
    $('fill').style.width = p + '%';
    $('head').style.left = p + '%';
    var sc = $('scrub');
    sc.setAttribute('aria-valuenow', Math.round(p));
    sc.setAttribute('aria-valuetext', fmt(t) + ' מתוך ' + fmt(d));
  }
  function renderScrubMarks() {
    if (!cur) return;
    var track = $('track');
    var old = track.querySelectorAll('.div,.pin');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var d = cur.duration || video.duration || 0;
    if (!d) return;
    (cur.markers || []).forEach(function (m) {
      if (m.t <= 0) return;
      var el = document.createElement('div');
      el.className = 'div'; el.style.left = (m.t / d * 100) + '%';
      track.appendChild(el);
    });
    chs(cur.n).bm.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'pin'; el.style.left = (b.t / d * 100) + '%';
      el.title = 'סימנייה: ' + fmt(b.t) + (b.note ? ' · ' + b.note : '');
      el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      el.addEventListener('click', function (e) { e.stopPropagation(); seekTo(b.t); });
      track.appendChild(el);
    });
  }

  video.addEventListener('timeupdate', function () {
    if (!cur || !cur.video) return;
    var d = video.duration || cur.duration || 0;
    if (!d) return;
    setFill(video.currentTime / d * 100, video.currentTime, d);
    $('c-time').textContent = fmt(video.currentTime) + ' / ' + fmt(d);
    updateTranscript(video.currentTime);
    updateMarkerHighlight(video.currentTime);
    var s = chs(cur.n);
    if (video.currentTime > s.max) s.max = video.currentTime;
  });
  video.addEventListener('progress', function () {
    var d = video.duration || 0;
    if (d && video.buffered.length) $('buf').style.width = (video.buffered.end(video.buffered.length - 1) / d * 100) + '%';
  });
  video.addEventListener('loadedmetadata', function () {
    if (cur && cur.video) { cur.duration = video.duration || cur.duration; renderScrubMarks(); $('c-time').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration); }
  });
  video.addEventListener('play', function () { $('bigplay').hidden = true; hideEndcard(); setPlayIcon(true); idle(); });
  video.addEventListener('pause', function () { setPlayIcon(false); persist(); renderRail(); stage.classList.remove('hidectl'); });
  video.addEventListener('ended', function () {
    if (!cur) return;
    var s = chs(cur.n); s.done = true; s.pos = 0; save();
    updateDoneBtn(); renderRail();
    stage.classList.remove('hidectl');
    showEndcard();
  });
  var lastPct = -1;
  setInterval(function () {
    if (!cur || !cur.video || video.paused) return;
    persist();
    var p = progress(cur.n);
    if (p !== lastPct) { lastPct = p; renderRail(); }   // keep the rail ring and /context meter live while watching
  }, 5000);
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', function () { if (document.hidden) persist(); });

  /* end card: finishing a chapter is a moment, not a replay button */
  function showEndcard() {
    var next = byNum(cur.n + 1), el = $('endcard');
    el.innerHTML =
      '<div class="ec">' +
        '<span class="ec-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="5 12.5 10 17.5 19 7"/></svg></span>' +
        '<h2 class="ec-t"></h2>' +
        (next ? '<p class="ec-next"><span>הצעד הבא</span> <b></b></p>' : '<p class="ec-next"><b>סיימתם את כל הפרקים שיש כרגע בקורס</b></p>') +
        '<div class="ec-acts">' +
          (next ? '<button class="btn pri" id="ec-go"></button>' : '') +
          '<button class="btn" id="ec-replay">לצפות שוב</button>' +
        '</div>' +
      '</div>';
    el.querySelector('.ec-t').textContent = 'עיקרון ' + cur.n + ' הושלם';
    if (next) {
      el.querySelector('.ec-next b').textContent = next.n + '. ' + next.title;
      $('ec-go').textContent = 'המשך לעיקרון ' + next.n + ' ←';
      $('ec-go').addEventListener('click', function () { open(next.n, true); });
    }
    $('ec-replay').addEventListener('click', function () { hideEndcard(); video.currentTime = 0; video.play().catch(function () {}); });
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('in'); });
    var first = el.querySelector('button');
    if (first && stage.contains(document.activeElement)) first.focus({ preventScroll: true });
  }
  function hideEndcard() { var el = $('endcard'); el.classList.remove('in'); el.hidden = true; el.textContent = ''; }

  function setPlayIcon(playing) {
    $('c-play').innerHTML = playing
      ? '<svg class="solid" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg class="solid" viewBox="0 0 24 24"><polygon points="6 3 21 12 6 21 6 3"/></svg>';
    $('c-play').setAttribute('aria-label', playing ? 'השהיה' : 'ניגון');
  }
  function toggle() {
    if (!cur || !cur.video) return;
    if (video.paused) video.play().catch(function () {}); else video.pause();
  }
  $('c-play').addEventListener('click', toggle);
  $('bigplay').addEventListener('click', toggle);

  /* taps on the picture: a single tap plays or pauses; on touch screens a double tap
     skips 10 seconds on that side, and on desktop a double click goes fullscreen */
  var tapTimer = null, lastTap = 0;
  video.addEventListener('click', function (e) {
    if (!TOUCH) { toggle(); return; }
    var now = Date.now();
    if (now - lastTap < 280) {
      clearTimeout(tapTimer); lastTap = 0;
      var r = video.getBoundingClientRect();
      var fwd = (e.clientX - r.left) > r.width / 2;   // the timeline runs left to right
      seekTo(video.currentTime + (fwd ? 10 : -10));
      toast(fwd ? '10 שניות קדימה' : '10 שניות אחורה');
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(toggle, 280);
  });
  video.addEventListener('dblclick', function () { if (!TOUCH) { if (fsEl()) exitFs(); else enterFs(); } });

  $('c-back').addEventListener('click', function () { seekTo(video.currentTime - 10); });
  $('c-fwd').addEventListener('click', function () { seekTo(video.currentTime + 10); });
  $('c-mark').addEventListener('click', addBookmark);
  $('bm-add').addEventListener('click', addBookmark);
  $('c-rate').addEventListener('change', function () {
    state.prefs.rate = parseFloat(this.value); video.playbackRate = state.prefs.rate; save();
  });
  $('c-vol').addEventListener('input', function () {
    video.volume = state.prefs.volume = parseFloat(this.value);
    video.muted = state.prefs.muted = (state.prefs.volume === 0);
    save(); setMuteIcon();
  });
  $('c-mute').addEventListener('click', function () {
    video.muted = state.prefs.muted = !video.muted; save(); setMuteIcon();
  });
  function setMuteIcon() {
    var off = video.muted || video.volume === 0;
    $('c-mute').innerHTML = off
      ? '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'
      : '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
    $('c-mute').setAttribute('aria-label', off ? 'ביטול השתקה' : 'השתקה');
  }
  $('c-cc').addEventListener('click', function () {
    state.prefs.cc = !state.prefs.cc; save();
    this.classList.toggle('on', state.prefs.cc);
    this.setAttribute('aria-pressed', String(state.prefs.cc));
    $('captions').textContent = '';
    if (state.prefs.cc) updateTranscript(video.currentTime);
    toast(state.prefs.cc ? 'כתוביות פועלות' : 'כתוביות כבויות');
  });
  $('c-pip').addEventListener('click', function () {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function () {});
  });
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function exitFs() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) fn.call(document);
  }
  function enterFs() {
    var fn = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (fn) {
      var r = fn.call(stage);
      if (r && r.catch) r.catch(function () {});
      return;
    }
    // iOS Safari never gives the container fullscreen; only the video element can go native
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }
  $('c-fs').addEventListener('click', function () {
    if (fsEl()) exitFs(); else enterFs();
  });
  function syncFsIcon() {
    var on = !!fsEl();
    $('c-fs').innerHTML = on
      ? '<svg viewBox="0 0 24 24"><path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    $('c-fs').setAttribute('aria-label', on ? 'יציאה ממסך מלא' : 'מסך מלא');
    $('c-fs').setAttribute('title', on ? 'יציאה ממסך מלא (F)' : 'מסך מלא (F)');
    if (!on) stage.classList.remove('hidectl');
  }
  document.addEventListener('fullscreenchange', syncFsIcon);
  document.addEventListener('webkitfullscreenchange', syncFsIcon);

  /* scrub: pointer events, so it drags with a finger as well as a mouse */
  function scrubAt(e) {
    var r = $('track').getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  var scrub = $('scrub');
  scrub.addEventListener('pointerdown', function (e) {
    if (!cur || !cur.video) return;
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    seekTo(scrubAt(e) * (video.duration || cur.duration));
    e.preventDefault();
  });
  scrub.addEventListener('pointermove', function (e) {
    if (!cur || !cur.video) return;
    var d = video.duration || cur.duration || 0;
    var f = scrubAt(e);
    if (dragging) seekTo(f * d);
    if (e.pointerType !== 'mouse' && !dragging) return;
    var t = f * d, tip = $('tip');
    var m = (cur.markers || [])[currentMarkerIndex(t)];
    tip.innerHTML = '<span class="tt"></span>' + fmt(t);
    if (m) tip.querySelector('.tt').textContent = m.title; else tip.querySelector('.tt').remove();
    tip.hidden = false;
    stage.classList.add('scrubbing');
    var r = $('track').getBoundingClientRect();
    tip.style.left = Math.max(60, Math.min(r.width - 60, f * r.width)) + 'px';
  });
  function endScrub() { dragging = false; $('tip').hidden = true; stage.classList.remove('scrubbing'); }
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);
  scrub.addEventListener('pointerleave', function () { if (!dragging) endScrub(); });
  scrub.addEventListener('keydown', function (e) {
    var d = video.duration || cur.duration || 0;
    if (e.key === 'ArrowRight') { seekTo(video.currentTime + 5); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { seekTo(video.currentTime - 5); e.preventDefault(); }
    else if (e.key === 'Home') { seekTo(0); e.preventDefault(); }
    else if (e.key === 'End') { seekTo(d - 1); e.preventDefault(); }
  });

  /* auto-hide controls; keyboard focus inside the player keeps them visible (CSS :focus-within) */
  function idle() {
    stage.classList.remove('hidectl');
    clearTimeout(hideTimer);
    if (BURNED) return;
    hideTimer = setTimeout(function () { if (!video.paused && !stage.contains(document.activeElement)) stage.classList.add('hidectl'); }, 2600);
  }
  stage.addEventListener('pointermove', idle);
  stage.addEventListener('focusin', idle);
  stage.addEventListener('mouseleave', function () { if (!video.paused && !stage.contains(document.activeElement)) stage.classList.add('hidectl'); });

  /* ---------------- chapter nav ---------------- */
  $('btn-prev').addEventListener('click', function () { if (!cur) return; if (cur.n <= 1) showWelcome(true); else open(cur.n - 1, true); });
  $('btn-next').addEventListener('click', function () { if (cur) open(cur.n + 1, true); });
  $('btn-done').addEventListener('click', function () {
    if (!cur) return;
    var s = chs(cur.n); s.done = !s.done; save(); updateDoneBtn(); renderRail();
  });

  /* ---------------- keyboard ----------------
     Global shortcuts never take a key a focused control owns: Space and Enter
     activate buttons, arrows move between tabs, the scrubber handles its own arrows. */
  document.addEventListener('keydown', function (e) {
    var el = e.target, tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    var onControl = el.closest && el.closest('button, a, summary, [role="tab"], [role="slider"], dialog');
    if (onControl && (k === ' ' || k === 'Enter')) return;
    if (el.closest && el.closest('[role="tab"], [role="slider"]') && /^(Arrow|Home|End)/.test(k)) return;
    if (k === '?') { $('dlg-help').showModal(); e.preventDefault(); return; }
    if (!cur || !cur.video || document.querySelector('dialog[open]')) return;
    var d = video.duration || cur.duration || 0;
    switch (k) {
      case ' ': case 'k': case 'K': toggle(); e.preventDefault(); break;
      case 'j': case 'J': seekTo(video.currentTime - 10); e.preventDefault(); break;
      case 'l': case 'L': seekTo(video.currentTime + 10); e.preventDefault(); break;
      case 'ArrowRight': seekTo(video.currentTime + 5); e.preventDefault(); break;
      case 'ArrowLeft': seekTo(video.currentTime - 5); e.preventDefault(); break;
      case 'ArrowUp': $('c-vol').value = Math.min(1, video.volume + 0.1); $('c-vol').dispatchEvent(new Event('input')); e.preventDefault(); break;
      case 'ArrowDown': $('c-vol').value = Math.max(0, video.volume - 0.1); $('c-vol').dispatchEvent(new Event('input')); e.preventDefault(); break;
      case 'm': case 'M': $('c-mute').click(); break;
      case 'f': case 'F': $('c-fs').click(); break;
      case 'c': case 'C': if (!BURNED) $('c-cc').click(); break;
      case 'b': case 'B': addBookmark(); e.preventDefault(); break;
      case 'n': case 'N': jumpMarker(1); break;
      case 'p': case 'P': jumpMarker(-1); break;
      case '>': case '.': stepRate(1); break;
      case '<': case ',': stepRate(-1); break;
      default:
        if (/^[0-9]$/.test(k) && d) { seekTo(d * parseInt(k, 10) / 10); e.preventDefault(); }
    }
  });
  function jumpMarker(dir) {
    var ms = cur.markers || []; if (!ms.length) return;
    var i = currentMarkerIndex(video.currentTime);
    var t = dir > 0 ? (ms[i + 1] ? ms[i + 1].t : null) : (ms[i] && video.currentTime - ms[i].t > 2 ? ms[i].t : (ms[i - 1] ? ms[i - 1].t : 0));
    if (t !== null) { seekTo(t); toast((ms[currentMarkerIndex(t)] || {}).title || ''); }
  }
  function stepRate(dir) {
    var opts = [0.75, 1, 1.25, 1.5, 1.75, 2];
    var i = opts.indexOf(parseFloat($('c-rate').value));
    i = Math.max(0, Math.min(opts.length - 1, i + dir));
    $('c-rate').value = String(opts[i]);
    $('c-rate').dispatchEvent(new Event('change'));
    toast('מהירות ' + opts[i] + '×');
  }

  /* ---------------- dialogs ---------------- */
  $('rail-toggle').addEventListener('click', function () {
    var isOpen = $('chaplist').classList.toggle('open');
    this.setAttribute('aria-expanded', String(isOpen));
  });
  $('btn-home').addEventListener('click', function () { showWelcome(true); });
  $('btn-help').addEventListener('click', function () { $('dlg-help').showModal(); });
  $('help-close').addEventListener('click', function () { $('dlg-help').close(); });

  /* ---------------- boot ---------------- */
  $('c-rate').value = String(state.prefs.rate);
  $('c-vol').value = String(state.prefs.volume);
  if (BURNED) { $('c-cc').hidden = true; $('help-cc').hidden = true; $('help-cc-k').hidden = true; stage.classList.add('bar-below'); }
  $('c-cc').classList.toggle('on', !!state.prefs.cc);
  $('c-cc').setAttribute('aria-pressed', String(!!state.prefs.cc));
  syncFollow();
  setPlayIcon(false);
  setMuteIcon();

  var m0 = /#ch(\d+)/.exec(location.hash);
  if (m0 && byNum(parseInt(m0[1], 10))) open(parseInt(m0[1], 10), false);
  else showWelcome(false);
})();
