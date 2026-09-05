(function () {
  'use strict';

  var C = window.COURSE, TX = window.COURSE_TRANSCRIPTS || {}, RD = window.COURSE_READING || {};
  var KEY = 'cc-course-v1';
  var $ = function (id) { return document.getElementById(id); };

  var video = $('video'), stage = $('stage');
  var state = load();
  var cur = null;          // current chapter object
  var cues = [];           // transcript cues of the current chapter
  var cueEls = [];
  var dragging = false, saveTimer = null, hideTimer = null, notesTimer = null;

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

  /* ---------------- storage ---------------- */
  function load() {
    var d = { ch: {}, prefs: { rate: 1, volume: 1, muted: false, cc: false, follow: true } };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (raw && typeof raw === 'object') {
        d.ch = raw.ch || {};
        for (var k in raw.prefs || {}) d.prefs[k] = raw.prefs[k];
      }
    } catch (e) {}
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function chs(n) {
    if (!state.ch[n]) state.ch[n] = { pos: 0, max: 0, done: false, bm: [], notes: '' };
    var s = state.ch[n];
    if (!s.bm) s.bm = [];
    if (typeof s.notes !== 'string') s.notes = '';
    return s;
  }

  /* ---------------- helpers ---------------- */
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60);
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg; el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('on'); }, 1800);
  }
  function pct(n) {
    var s = chs(n), ch = byNum(n);
    if (!ch || !ch.duration) return 0;
    return Math.min(100, Math.round(s.max / ch.duration * 100));
  }
  function byNum(n) {
    for (var i = 0; i < C.chapters.length; i++) if (C.chapters[i].n === n) return C.chapters[i];
    return null;
  }

  /* ---------------- rail ---------------- */
  function renderRail() {
    var box = $('chaplist');
    box.textContent = '';
    var w = document.createElement('button');
    w.className = 'chap';
    w.setAttribute('aria-current', cur ? 'false' : 'true');
    w.innerHTML = '<span class="num"><i>★</i></span><span><span class="t">מסך הפתיחה</span><span class="m">על הקורס ואיך הוא עובד</span></span>';
    w.addEventListener('click', function () { showWelcome(true); });
    box.appendChild(w);
    C.chapters.forEach(function (ch) {
      var s = chs(ch.n), p = pct(ch.n);
      var b = document.createElement('button');
      b.className = 'chap' + (s.done ? ' done' : '') + (ch.video ? '' : ' soon');
      b.setAttribute('aria-current', cur && cur.n === ch.n ? 'true' : 'false');
      b.dataset.n = ch.n;
      var meta = ch.video
        ? fmt(ch.duration) + (s.done ? ' · הושלם' : (p > 0 ? ' · נצפו ' + p + '%' : ''))
        : '<span class="tag">קריאה בלבד</span>';
      var C0 = 2 * Math.PI * 16;
      var ring = ch.video
        ? '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rbg" cx="18" cy="18" r="16"></circle>' +
          (p > 0 ? '<circle class="rfg" cx="18" cy="18" r="16" stroke-dasharray="' + (C0 * p / 100).toFixed(1) + ' ' + C0.toFixed(1) + '"></circle>' : '') +
          '</svg>'
        : '';
      b.innerHTML =
        '<span class="num">' + ring + '<i>' + (s.done ? '✓' : ch.n) + '</i></span>' +
        '<span><span class="t"></span><span class="m">' + meta + '</span></span>';
      b.querySelector('.t').textContent = ch.title;
      b.addEventListener('click', function () { open(ch.n, true); });
      box.appendChild(b);
    });
    var done = C.chapters.filter(function (c) { return chs(c.n).done; }).length;
    var total = C.chapters.length;
    var frac = Math.round(done / total * 100);
    $('ring-fg').setAttribute('stroke-dasharray', (frac * 97.4 / 100) + ' 100');
    $('overall-txt').textContent = done + ' מתוך ' + total + ' פרקים';
    var tb = $('topbar-bar'); if (tb) tb.style.width = frac + '%';
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

  /* ---------------- welcome screen ---------------- */
  function renderWelcome() {
    var withVideo = C.chapters.filter(function (c) { return c.video; });
    var secs = withVideo.reduce(function (a, c) { return a + (c.duration || 0); }, 0);
    var done = C.chapters.filter(function (c) { return chs(c.n).done; }).length;
    $('w-stats').innerHTML =
      '<span><b>' + C.chapters.length + '</b> עקרונות</span>' +
      '<span><b>' + withVideo.length + '</b> פרקי וידאו זמינים</span>' +
      '<span>כ־<b>' + Math.round(secs / 60) + '</b> דקות צפייה</span>' +
      '<span><b>' + done + '</b> פרקים שסיימתם</span>';

    var g = $('w-grid');
    g.textContent = '';
    C.chapters.forEach(function (ch) {
      var b = document.createElement('button');
      b.className = 'w-item' + (ch.video ? '' : ' soon');
      b.innerHTML =
        '<span class="w-media">' +
          (ch.thumb ? '<img class="w-thumb" src="' + ch.thumb + '" alt="" loading="lazy">' : '') +
          '<span class="w-chip">' + (ICONS[ch.n] || '') + '<b>' + ch.n + '</b></span>' +
        '</span>' +
        '<span class="w-body"><b class="nm"></b><p></p>' +
        '<span class="tag">' + (ch.video ? 'וידאו ' + fmt(ch.duration) + ' · תמלול · חומר קריאה' : 'הווידאו בהפקה · חומר קריאה זמין') + '</span></span>';
      b.querySelector('.nm').textContent = ch.title;
      b.querySelector('p').textContent = ch.oneliner || ch.subtitle || '';
      b.addEventListener('click', function () { open(ch.n, true); });
      g.appendChild(b);
    });

    // resume button: the furthest chapter with real progress
    var res = null;
    C.chapters.forEach(function (ch) {
      var st = chs(ch.n);
      if (ch.video && !st.done && st.pos > 5) res = ch;
    });
    var rb = $('w-resume');
    if (res) {
      rb.hidden = false;
      rb.textContent = 'המשך פרק ' + res.n + ' · ' + res.title + ' (' + fmt(chs(res.n).pos) + ')';
      rb.onclick = function () { open(res.n, true); };
    } else { rb.hidden = true; }
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
    if (push) history.replaceState(null, '', '#welcome');
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
    if (push) history.replaceState(null, '', '#ch' + n);
    $('welcome').hidden = true;
    $('player').hidden = false;
    stopIntro();

    $('ch-lbl').textContent = 'פרק ' + n + ' מתוך ' + C.chapters.length;
    $('ch-title').textContent = ch.title;
    $('ch-one').textContent = ch.oneliner || ch.subtitle || '';

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
      video.removeAttribute('src'); video.load();
      var d = document.createElement('div');
      d.className = 'soonbox';
      d.innerHTML = (ch.thumb ? '<img class="soon-bg" src="' + ch.thumb + '" alt="">' : '') +
        '<div class="soon-in"><div class="big">הפרק בהפקה</div>' +
        '<p>הווידאו של עיקרון ' + n + ' עדיין לא מוכן. חומר הקריאה המלא כבר כאן — בלשונית «חומר קריאה».</p></div>';
      stage.insertBefore(d, $('ctrls'));
    }

    cues = TX[n] || [];
    renderTranscript();
    renderMarkers();
    renderBookmarks();
    renderReading();
    renderScrubMarks();
    renderUpNext();
    $('notes').value = s.notes;
    $('note-saved').textContent = '';
    updateDoneBtn();
    $('btn-prev').disabled = n <= 1;
    $('btn-next').disabled = n >= C.chapters.length;
    $('c-time').textContent = '0:00 / ' + fmt(ch.duration || 0);
    setFill(0);
    $('captions').textContent = '';
    selectTab(ch.video ? 'markers' : 'reading');
    renderRail();
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

  /* ---------------- tabs ---------------- */
  var TABS = ['markers', 'bookmarks', 'notes', 'transcript', 'reading'];
  function selectTab(name) {
    TABS.forEach(function (t) {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('p-' + t).hidden = t !== name;
    });
    if (name === 'transcript') scrollCueIntoView(true);
  }
  TABS.forEach(function (t) { $('tab-' + t).addEventListener('click', function () { selectTab(t); }); });

  /* ---------------- markers (sub-chapters) ---------------- */
  function renderMarkers() {
    var box = $('markers');
    box.textContent = '';
    var ms = (cur.markers || []);
    if (!ms.length) {
      box.innerHTML = '<p class="empty-note">אין פרקי משנה לפרק הזה.</p>';
      return;
    }
    ms.forEach(function (m, i) {
      var b = document.createElement('button');
      b.className = 'mk';
      b.dataset.i = i;
      b.innerHTML = '<span class="time">' + fmt(m.t) + '</span><span class="x"></span>';
      b.querySelector('.x').textContent = m.title;
      b.addEventListener('click', function () { seekTo(m.t); video.play().catch(function () {}); });
      box.appendChild(b);
    });
  }
  function currentMarkerIndex(t) {
    var ms = cur && cur.markers || [], idx = -1;
    for (var i = 0; i < ms.length; i++) if (ms[i].t <= t + 0.15) idx = i;
    return idx;
  }
  function updateMarkerHighlight(t) {
    var idx = currentMarkerIndex(t);
    var els = $('markers').querySelectorAll('.mk');
    for (var i = 0; i < els.length; i++) els[i].setAttribute('aria-current', String(i === idx));
  }

  /* ---------------- bookmarks ---------------- */
  function addBookmark() {
    if (!cur || !cur.video) return;
    var s = chs(cur.n);
    var t = video.currentTime || 0;
    var near = cueAt(t);
    var id = 'b' + Date.now();
    s.bm.push({ id: id, t: t, note: '', quote: near ? near.t : '' });
    s.bm.sort(function (a, b) { return a.t - b.t; });
    save();
    renderBookmarks(); renderScrubMarks();
    toast('נוספה סימנייה ב־' + fmt(t));
    selectTab('bookmarks');
    var inp = document.querySelector('.bm[data-id="' + id + '"] input');
    if (inp) inp.focus();
  }
  function renderBookmarks() {
    var s = chs(cur.n), box = $('bookmarks');
    box.textContent = '';
    $('cnt-bm').textContent = s.bm.length;
    $('cnt-bm').hidden = s.bm.length === 0;
    $('bm-add').disabled = !cur.video;
    if (!s.bm.length) {
      box.innerHTML = '<p class="empty-note">עוד אין סימניות בפרק הזה. לחצו <kbd>B</kbd> בזמן הצפייה כדי לסמן רגע, ותוכלו לחזור אליו בלחיצה אחת.</p>';
      return;
    }
    s.bm.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'bm'; row.dataset.id = b.id;
      row.innerHTML =
        '<button class="jump">' + fmt(b.t) + '</button>' +
        '<input type="text" placeholder="למה סימנתם את זה?">' +
        '<button class="del" aria-label="מחיקה"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>';
      var inp = row.querySelector('input');
      inp.value = b.note || '';
      if (!b.note && b.quote) inp.placeholder = '״' + b.quote.slice(0, 60) + '״';
      inp.addEventListener('input', function () { b.note = inp.value; clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); });
      row.querySelector('.jump').addEventListener('click', function () { seekTo(b.t); video.play().catch(function () {}); });
      row.querySelector('.del').addEventListener('click', function () {
        s.bm = s.bm.filter(function (x) { return x.id !== b.id; });
        save(); renderBookmarks(); renderScrubMarks();
      });
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
    var stamp = '[' + t + '] ';
    var p = ta.selectionStart;
    ta.value = ta.value.slice(0, p) + stamp + ta.value.slice(p);
    ta.focus(); ta.selectionStart = ta.selectionEnd = p + stamp.length;
    chs(cur.n).notes = ta.value; save(); $('note-saved').textContent = 'נשמר';
  });

  /* ---------------- transcript ---------------- */
  function renderTranscript() {
    var box = $('transcript');
    box.textContent = ''; cueEls = [];
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
    if (i === lastCue) return;
    if (cueEls[lastCue]) cueEls[lastCue].classList.remove('active');
    lastCue = i;
    if (cueEls[i]) { cueEls[i].classList.add('active'); scrollCueIntoView(false); }
    if (state.prefs.cc) {
      var c = cues[i];
      $('captions').innerHTML = (c && t <= c.e + 0.8) ? '<span></span>' : '';
      if (c && $('captions').firstChild) $('captions').firstChild.textContent = c.t;
    }
  }
  function scrollCueIntoView(force) {
    if (!state.prefs.follow && !force) return;
    var el = cueEls[lastCue], box = $('transcript');
    if (!el || $('p-transcript').hidden) return;
    var top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: top, behavior: force ? 'auto' : 'smooth' });
  }
  $('tx-follow').addEventListener('click', function () {
    state.prefs.follow = !state.prefs.follow; save();
    this.setAttribute('aria-pressed', String(state.prefs.follow));
    this.textContent = state.prefs.follow ? 'עוקב אחרי הסרטון' : 'לא עוקב';
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
    navigator.clipboard.writeText(txt).then(function () { $('tx-copy').textContent = 'הועתק ✓'; setTimeout(function () { $('tx-copy').textContent = 'העתק תמלול'; }, 1500); });
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
    // the written guide ships one inline white-space:pre command block; the course wraps instead of scrolling
    var pres = box.querySelectorAll('code[style*="white-space:pre"]');
    for (var k = 0; k < pres.length; k++) { pres[k].style.whiteSpace = 'pre-wrap'; pres[k].style.overflowWrap = 'anywhere'; }
    var links = box.querySelectorAll('a[href^="http"]');
    for (var j = 0; j < links.length; j++) { links[j].target = '_blank'; links[j].rel = 'noopener'; }
  }

  /* ---------------- player ---------------- */
  function seekTo(t) {
    if (!cur || !cur.video) return;
    var d = video.duration || cur.duration || 0;
    video.currentTime = Math.max(0, Math.min(d ? d - 0.1 : t, t));
  }
  function setFill(p) {
    $('fill').style.width = p + '%';
    $('head').style.left = p + '%';
    $('scrub').setAttribute('aria-valuenow', Math.round(p));
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
      el.title = 'סימנייה: ' + fmt(b.t) + (b.note ? ' — ' + b.note : '');
      el.addEventListener('click', function (e) { e.stopPropagation(); seekTo(b.t); });
      track.appendChild(el);
    });
  }

  video.addEventListener('timeupdate', function () {
    if (!cur || !cur.video) return;
    var d = video.duration || cur.duration || 0;
    if (!d) return;
    setFill(video.currentTime / d * 100);
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
  video.addEventListener('play', function () { $('bigplay').hidden = true; setPlayIcon(true); idle(); });
  video.addEventListener('pause', function () { setPlayIcon(false); persist(); renderRail(); stage.classList.remove('hidectl'); });
  video.addEventListener('ended', function () {
    if (!cur) return;
    var s = chs(cur.n); s.done = true; s.pos = 0; save();
    updateDoneBtn(); renderRail(); $('bigplay').hidden = false;
    stage.classList.remove('hidectl');
    var next = byNum(cur.n + 1);
    if (next && next.video) toast('הפרק הבא: ' + next.title);
  });
  setInterval(function () { if (cur && cur.video && !video.paused) { persist(); } }, 5000);
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', function () { if (document.hidden) persist(); });

  function setPlayIcon(playing) {
    $('c-play').innerHTML = playing
      ? '<svg class="solid" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg class="solid" viewBox="0 0 24 24"><polygon points="6 3 21 12 6 21 6 3"/></svg>';
  }
  function toggle() {
    if (!cur || !cur.video) return;
    if (video.paused) video.play().catch(function () {}); else video.pause();
  }
  $('c-play').addEventListener('click', toggle);
  $('bigplay').addEventListener('click', toggle);
  video.addEventListener('click', toggle);
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
    if (!state.prefs.cc) $('captions').textContent = ''; else { lastCue = -1; updateTranscript(video.currentTime); }
    toast(state.prefs.cc ? 'כתוביות פועלות' : 'כתוביות כבויות');
  });
  $('c-pip').addEventListener('click', function () {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function () {});
  });
  $('c-fs').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen && stage.requestFullscreen().catch(function () {});
  });

  /* scrub */
  function scrubAt(e) {
    var r = $('track').getBoundingClientRect();
    var x = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width;
    return Math.max(0, Math.min(1, x));
  }
  $('scrub').addEventListener('mousedown', function (e) {
    if (!cur || !cur.video) return;
    dragging = true; var d = video.duration || cur.duration; seekTo(scrubAt(e) * d);
    e.preventDefault();
  });
  document.addEventListener('mousemove', function (e) {
    if (dragging && cur && cur.video) seekTo(scrubAt(e) * (video.duration || cur.duration));
  });
  document.addEventListener('mouseup', function () { dragging = false; });
  $('scrub').addEventListener('mousemove', function (e) {
    if (!cur || !cur.video) return;
    var d = video.duration || cur.duration || 0;
    var f = scrubAt(e), t = f * d, tip = $('tip');
    var i = currentMarkerIndex(t), m = (cur.markers || [])[i];
    tip.innerHTML = '<span class="tt"></span>' + fmt(t);
    if (m) tip.querySelector('.tt').textContent = m.title; else tip.querySelector('.tt').remove();
    tip.hidden = false;
    var r = $('track').getBoundingClientRect();
    tip.style.left = Math.max(60, Math.min(r.width - 60, f * r.width)) + 'px';
  });
  $('scrub').addEventListener('mouseleave', function () { $('tip').hidden = true; });
  $('scrub').addEventListener('keydown', function (e) {
    var d = video.duration || cur.duration || 0;
    if (e.key === 'ArrowRight') { seekTo(video.currentTime + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { seekTo(video.currentTime - 5); e.preventDefault(); }
    if (e.key === 'Home') { seekTo(0); e.preventDefault(); }
    if (e.key === 'End') { seekTo(d - 1); e.preventDefault(); }
  });

  /* auto-hide controls */
  function idle() {
    stage.classList.remove('hidectl');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!video.paused) stage.classList.add('hidectl'); }, 2600);
  }
  stage.addEventListener('mousemove', idle);
  stage.addEventListener('mouseleave', function () { if (!video.paused) stage.classList.add('hidectl'); });

  /* ---------------- chapter nav ---------------- */
  $('btn-prev').addEventListener('click', function () { if (!cur) return; if (cur.n <= 1) showWelcome(true); else open(cur.n - 1, true); });
  $('btn-next').addEventListener('click', function () { if (cur) open(cur.n + 1, true); });
  $('btn-done').addEventListener('click', function () {
    if (!cur) return;
    var s = chs(cur.n); s.done = !s.done; save(); updateDoneBtn(); renderRail();
  });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === '?') { $('dlg-help').showModal(); e.preventDefault(); return; }
    if (!cur || !cur.video) return;
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
      case 'c': case 'C': $('c-cc').click(); break;
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

  /* ---------------- dialogs / data ---------------- */
  $('rail-toggle').addEventListener('click', function () {
    var open = $('chaplist').classList.toggle('open');
    this.setAttribute('aria-expanded', String(open));
  });
  $('btn-home').addEventListener('click', function () { showWelcome(true); });
  $('w-start').addEventListener('click', function () { open(1, true); });
  $('btn-help').addEventListener('click', function () { $('dlg-help').showModal(); });
  $('help-close').addEventListener('click', function () { $('dlg-help').close(); });
  /* ---------------- boot ---------------- */
  $('c-rate').value = String(state.prefs.rate);
  $('c-vol').value = String(state.prefs.volume);
  $('c-cc').classList.toggle('on', !!state.prefs.cc);
  $('tx-follow').setAttribute('aria-pressed', String(state.prefs.follow));
  $('tx-follow').textContent = state.prefs.follow ? 'עוקב אחרי הסרטון' : 'לא עוקב';
  setPlayIcon(false);
  setMuteIcon();

  var m = /#ch(\d+)/.exec(location.hash);
  if (m && byNum(parseInt(m[1], 10))) open(parseInt(m[1], 10), false);
  else showWelcome(false);
})();
