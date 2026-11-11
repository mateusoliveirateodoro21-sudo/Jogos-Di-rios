/* Box 10 - interface. Depende de engine.js, i18n.js e (opcional) assets/js/site.js */
(function () {
  'use strict';
  var E = window.Box10Engine, CFG = E.CFG;
  var LANG = (window.SITE && window.SITE.LANG) || 'pt-BR';
  var STR = (window.BOX10_I18N[LANG] || window.BOX10_I18N['pt-BR']);
  function t(k, v) {
    var s = STR[k]; if (s === undefined) return k;
    if (v) for (var n in v) s = s.split('{' + n + '}').join(v[n]);
    return s;
  }
  var SAVE_KEY = 'box10_save_v1', SAVE_VERSION = 1;
  var app = document.getElementById('app');
  var state, view = 'hub', tab = 'race', setup, timer = null, raf = null, saveFailed = false;
  var MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

  /* ---------- salvamento ---------- */
  function fresh() {
    return { v: SAVE_VERSION, carId: null, cars: {}, coins: 0, streak: 0, lastDay: null,
      today: { day: null, results: [], coins: 0 }, lastRace: null, pendingResult: false };
  }
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
    if (!s || s.v !== SAVE_VERSION || typeof s !== 'object') s = fresh();
    var f = fresh(); for (var k in f) if (s[k] === undefined) s[k] = f[k];
    var key = E.dayKey();
    if (s.today.day !== key) { s.today = { day: key, results: [], coins: 0 }; s.pendingResult = false; }
    return s;
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); saveFailed = false; }
    catch (e) { saveFailed = true; }
  }
  function today() { return E.dayKey(); }
  function car() { return state.cars[state.carId]; }

  /* ---------- utilidades ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  function fmtGap(g) { return g < 0.0005 ? '—' : '+' + g.toFixed(3); }
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  function carSvg(color) {
    return '<svg class="carsvg" viewBox="0 0 120 50" aria-hidden="true">' +
      '<rect x="8" y="30" width="104" height="9" rx="3" fill="' + color + '"/>' +
      '<path d="M30 30 L44 14 L78 14 L96 30 Z" fill="' + color + '"/>' +
      '<path d="M46 17 L56 17 L56 29 L38 29 Z M60 17 L76 17 L88 29 L60 29 Z" fill="#cfe8ff" opacity=".85"/>' +
      '<rect x="4" y="22" width="10" height="4" fill="#fff" opacity=".85"/>' +
      '<circle cx="32" cy="39" r="9" fill="#111"/><circle cx="32" cy="39" r="4" fill="#bbb"/>' +
      '<circle cx="88" cy="39" r="9" fill="#111"/><circle cx="88" cy="39" r="4" fill="#bbb"/></svg>';
  }
  function bars(attrs, base) {
    return E.ATTR_KEYS.map(function (k) {
      var v = attrs[k], b = base ? base[k] : v, max = 12;
      return '<div class="attr"><span>' + t('attr_' + k) + '</span><div class="bar"><i class="up" style="width:' + (v / max * 100) + '%"></i><i style="width:' + (b / max * 100) + '%"></i></div><b>' + v.toFixed(1) + '</b></div>';
    }).join('');
  }
  function adSlot(name) { return '<div class="ad-slot" data-slot="' + name + '"></div>'; }
  function fillAds() { if (window.SiteAds) window.SiteAds.refresh(app); }

  /* ---------- pista: pontos suavizados (Catmull-Rom fechado) ---------- */
  var W = 640, H = 420;
  function trackSamples(track) {
    var P = track.points.map(function (p) { return [30 + p[0] * (W - 60) / 100, 30 + p[1] * (H - 60) / 100]; });
    var n = P.length, out = [], i, j, S = 14;
    for (i = 0; i < n; i++) {
      var p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (j = 0; j < S; j++) {
        var u = j / S, u2 = u * u, u3 = u2 * u;
        out.push({
          x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
          y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
        });
      }
    }
    var cum = [0], L = 0;
    for (i = 1; i <= out.length; i++) {
      var a = out[i - 1], b = out[i % out.length];
      L += Math.hypot(b.x - a.x, b.y - a.y); cum.push(L);
    }
    return { pts: out, cum: cum, len: L };
  }
  function pointAt(ts, frac) {
    frac = frac - Math.floor(frac);
    var d = frac * ts.len, lo = 0, hi = ts.cum.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (ts.cum[m] <= d) lo = m; else hi = m; }
    var a = ts.pts[lo % ts.pts.length], b = ts.pts[(lo + 1) % ts.pts.length];
    var f = (d - ts.cum[lo]) / Math.max(1e-6, ts.cum[hi] - ts.cum[lo]);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  function trackPathD(ts) {
    return 'M' + ts.pts.map(function (p) { return p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' L') + ' Z';
  }
  function trackSvg(track) {
    var ts = trackSamples(track), d = trackPathD(ts), s = ts.pts[0];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(track.name) + '" style="width:100%;height:auto;background:#1a1c1f;border-radius:12px;border:1px solid var(--line)">' +
      '<path d="' + d + '" fill="none" stroke="#3a3d42" stroke-width="22" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="8 8" opacity=".55"/>' +
      '<circle cx="' + s.x.toFixed(1) + '" cy="' + s.y.toFixed(1) + '" r="6" fill="var(--yellow)"/></svg>';
  }

  /* ---------- telas ---------- */
  function render() {
    stopTimers();
    if (!state.carId) return renderPick();
    if (view === 'result' && state.lastRace) return renderResult();
    if (state.today.results.length >= CFG.RACES_PER_DAY && view === 'hub' && tab === 'race') return renderSummary();
    if (view === 'setup') return renderSetup();
    return renderHub();
  }

  function hud() {
    var done = state.today.results.length;
    var streakShown = state.lastDay === today() ? state.streak : (state.lastDay && E.dayDiff(today(), state.lastDay) === 1 ? state.streak : 0);
    return '<div class="hud">' +
      '<div class="stat"><b>#' + E.dayNumber(today()) + '</b><span>' + t('day') + '</span></div>' +
      '<div class="stat"><b>' + done + '/' + CFG.RACES_PER_DAY + '</b><span>' + t('races') + '</span></div>' +
      '<div class="stat"><b>🪙 ' + num(state.coins) + '</b><span>' + t('coins') + '</span></div>' +
      '<div class="stat"><b>🔥 ' + streakShown + '</b><span>' + t('streak') + '</span></div></div>';
  }

  function renderPick() {
    var h = '<h2>' + t('pick_title') + '</h2><p class="muted">' + t('pick_sub') + '</p><div class="grid g2">';
    E.CARS.forEach(function (c) {
      h += '<div class="card"><div class="row"><div><h3>' + esc(c.name) + '</h3><div class="muted small">' + esc(c.tagline) + '</div></div>' + carSvg(c.color) + '</div>' +
        bars(c.attrs) + '<button class="btn btn-big" data-pick="' + c.id + '" style="margin-top:8px">' + t('pick_btn') + '</button></div>';
    });
    app.innerHTML = h + '</div>';
    app.onclick = function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-pick'); if (!id) return;
      state.carId = id; state.cars[id] = { parts: {} }; save(); view = 'hub'; render();
    };
  }

  function renderHub() {
    var done = state.today.results.length, h = adSlot('top') + hud();
    h += '<div class="tabs" role="tablist">' + [['race', 'tab_race'], ['garage', 'tab_garage'], ['cars', 'tab_cars']].map(function (x) {
      return '<button role="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + t(x[1]) + '</button>';
    }).join('') + '</div>';
    if (tab === 'race') h += hubRace(done);
    else if (tab === 'garage') h += hubGarage();
    else h += hubCars();
    h += '<p class="small muted" style="margin-top:24px"><button class="btn btn-ghost btn-sm" data-erase>' + t('erase') + '</button></p>';
    if (saveFailed) h += '<p class="small" style="color:var(--bad)">' + t('save_fail') + '</p>';
    app.innerHTML = h; bindHub(); fillAds();
  }

  function hubRace(done) {
    var c = E.getCar(state.carId), up = E.upgradedAttrs(state.carId, car().parts);
    var dots = '';
    for (var i = 1; i <= CFG.RACES_PER_DAY; i++) {
      var p = state.today.results[i - 1], cls = 'dot' + (p ? ' done p' + p : (i === done + 1 ? ' now' : ''));
      dots += '<span class="' + cls + '">' + (p || i) + '</span>';
    }
    var h = '<div class="card"><div class="dots" aria-label="' + t('races') + '">' + dots + '</div>';
    h += '<div class="row"><div><h3>' + esc(c.name) + '</h3><div class="muted small">' + t('race_n', { n: done + 1, max: CFG.RACES_PER_DAY }) + '</div></div>' + carSvg(c.color) + '</div>';
    h += '<button class="btn btn-big" data-next>' + t('next_race') + '</button>';
    if (state.lastRace && state.lastRace.day === today()) h += '<p style="text-align:center"><button class="btn btn-ghost btn-sm" data-last>' + t('view_last') + '</button></p>';
    h += '</div><p class="muted small">' + t('streak_note', { max: CFG.STREAK_MAX_DAYS * CFG.STREAK_STEP }) + '</p>';
    return h;
  }

  function hubGarage() {
    var cs = car(), c = E.getCar(state.carId), up = E.upgradedAttrs(state.carId, cs.parts);
    var h = '<div class="card"><h3>' + t('garage_title', { car: esc(c.name) }) + '</h3><p class="muted small">' + t('garage_sub') + '</p>' + bars(up, c.attrs) + '</div>';
    E.PARTS.forEach(function (p) {
      var lv = cs.parts[p.id] || 0, pips = '';
      for (var i = 1; i <= CFG.MAX_LEVEL; i++) pips += '<span class="pip' + (i <= lv ? ' on' : '') + '"></span>';
      var cost = lv < CFG.MAX_LEVEL ? E.upgradeCost(lv + 1) : 0;
      h += '<div class="card"><div class="row"><div><h3>' + esc(p.name) + '</h3><div class="muted small">' + esc(p.desc) + '</div><div class="pips" style="margin-top:6px">' + pips + '</div></div>' +
        (lv >= CFG.MAX_LEVEL ? '<span class="tag">' + t('maxed') + '</span>' :
          '<button class="btn btn-sm" data-up="' + p.id + '"' + (state.coins < cost ? ' disabled' : '') + '>' + t('upgrade') + ' · 🪙 ' + num(cost) + '</button>') + '</div></div>';
    });
    return h;
  }

  function hubCars() {
    var h = '<h3>' + t('cars_title') + '</h3><p class="muted small">' + t('cars_sub') + '</p>';
    E.CARS.forEach(function (c) {
      var owned = !!state.cars[c.id], active = state.carId === c.id;
      var up = owned ? E.upgradedAttrs(c.id, state.cars[c.id].parts) : c.attrs;
      var btn = active ? '<span class="tag">' + t('in_use') + '</span>' :
        owned ? '<button class="btn btn-sm" data-use="' + c.id + '">' + t('use') + '</button>' :
          '<button class="btn btn-sm" data-buy="' + c.id + '"' + (state.coins < CFG.CAR_PRICE ? ' disabled title="' + t('not_enough') + '"' : '') + '>' + t('buy', { n: '🪙 ' + num(CFG.CAR_PRICE) }) + '</button>';
      h += '<div class="card"><div class="row"><div><h3>' + esc(c.name) + '</h3><div class="muted small">' + esc(c.tagline) + '</div></div>' + carSvg(c.color) + '</div>' +
        bars(up, c.attrs) + '<div style="margin-top:8px">' + btn + '</div></div>';
    });
    return h;
  }

  function bindHub() {
    app.onclick = function (e) {
      var el = e.target, a;
      if (!el.getAttribute) return;
      if ((a = el.getAttribute('data-tab'))) { tab = a; render(); }
      else if (el.hasAttribute('data-next')) startSetup();
      else if (el.hasAttribute('data-last')) { view = 'result'; render(); }
      else if ((a = el.getAttribute('data-up'))) buyPart(a);
      else if ((a = el.getAttribute('data-use'))) { state.carId = a; save(); render(); }
      else if ((a = el.getAttribute('data-buy'))) buyCar(a);
      else if (el.hasAttribute('data-erase')) eraseData();
      else if (el.hasAttribute('data-share')) share();
      else if (el.hasAttribute('data-copy')) copyShare(el);
    };
  }

  function buyPart(id) {
    var parts = car().parts, lv = parts[id] || 0;
    if (lv >= CFG.MAX_LEVEL) return;
    var cost = E.upgradeCost(lv + 1); if (state.coins < cost) return;
    state.coins -= cost; parts[id] = lv + 1; save(); render();
  }
  function buyCar(id) {
    if (state.cars[id] || state.coins < CFG.CAR_PRICE) return;
    state.coins -= CFG.CAR_PRICE; state.cars[id] = { parts: {} }; state.carId = id; save(); render();
  }
  function eraseData() {
    if (!window.confirm(t('erase_confirm'))) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state = load(); view = 'hub'; tab = 'race'; render();
  }

  /* ---------- acerto ---------- */
  function startSetup() {
    var idx = state.today.results.length + 1;
    if (idx > CFG.RACES_PER_DAY) return;
    var spec = E.getRaceSpec(today(), idx);
    setup = { spec: spec, compound1: 'medium', compound2: 'medium', gear: 0.5, pit: 0 };
    view = 'setup'; render();
  }

  function renderSetup() {
    var s = setup.spec, tr = s.track, cmp = ['soft', 'medium', 'hard'];
    var h = adSlot('top') + hud() +
      '<div class="card"><h2>' + t('setup_title', { n: s.idx, track: esc(tr.name) }) + '</h2>' + trackSvg(tr) +
      '<p style="margin:8px 0"><span class="tag">' + t('laps', { n: s.laps }) + '</span><span class="tag">' + t('w_' + s.forecast) + '</span><span class="tag">' + t('t_' + s.temp) + '</span></p>' +
      '<p class="muted small">' + t('forecast_note') + ' ' + t('t_note_' + s.temp) + '</p>' +
      '<p class="small">💡 ' + esc(tr.tip) + '</p></div>';
    h += '<div class="card"><h3>' + t('tires') + '</h3><div class="opt" role="radiogroup">' + cmp.map(function (c) {
      return '<label><input type="radio" name="c1" value="' + c + '"' + (setup.compound1 === c ? ' checked' : '') + '>' + t('c_' + c) + '<small>' + t('c_' + c + '_d') + '</small></label>';
    }).join('') + '</div>' + (s.forecast === 'rain' ? '<p class="small" style="color:var(--yellow)">' + t('c_rain_note') + '</p>' : '') + '</div>';
    h += '<div class="card"><h3>' + t('gear') + '</h3><input type="range" id="gear" min="0" max="100" value="' + Math.round(setup.gear * 100) + '" aria-label="' + t('gear') + '">' +
      '<div class="row small muted"><span>' + t('gear_short') + '</span><span>' + t('gear_long') + '</span></div><p class="muted small">' + t('gear_note') + '</p></div>';
    var opts = '<option value="0">' + t('pit_none') + '</option>';
    for (var i = 1; i < s.laps; i++) opts += '<option value="' + i + '"' + (setup.pit === i ? ' selected' : '') + '>' + t('pit_at', { n: i }) + '</option>';
    h += '<div class="card"><h3>' + t('pit') + '</h3><select id="pit" aria-label="' + t('pit') + '">' + opts + '</select><p class="muted small">' + t('pit_note') + '</p>' +
      '<div id="pit2" class="' + (setup.pit ? '' : 'hidden') + '"><label class="small muted">' + t('pit_tires') + '</label><br><select id="c2">' +
      cmp.map(function (c) { return '<option value="' + c + '"' + (setup.compound2 === c ? ' selected' : '') + '>' + t('c_' + c) + '</option>'; }).join('') + '</select></div></div>';
    h += '<button class="btn btn-big" id="go">' + t('go') + '</button>';
    app.innerHTML = h; fillAds();
    app.onclick = function (e) { if (e.target.id === 'go') launch(); };
    app.onchange = function (e) {
      var el = e.target;
      if (el.name === 'c1') setup.compound1 = el.value;
      else if (el.id === 'pit') { setup.pit = parseInt(el.value, 10) || 0; $('#pit2').classList.toggle('hidden', !setup.pit); }
      else if (el.id === 'c2') setup.compound2 = el.value;
    };
    app.oninput = function (e) { if (e.target.id === 'gear') setup.gear = e.target.value / 100; };
  }

  /* ---------- largada: salva ANTES da animação ---------- */
  function launch() {
    var spec = setup.spec, idx = spec.idx;
    if (state.today.results.length !== idx - 1) { view = 'hub'; render(); return; }
    var res = E.simulateRace(spec, {
      carId: state.carId, parts: car().parts,
      setup: { compound1: setup.compound1, compound2: setup.compound2, gear: setup.gear, pitLap: setup.pit || null }
    });
    var bonus = 0, first = idx === 1;
    if (first) {
      if (state.lastDay === today()) { /* já contado */ }
      else if (state.lastDay && E.dayDiff(today(), state.lastDay) === 1) state.streak += 1;
      else state.streak = 1;
      state.lastDay = today();
      bonus = E.streakBonus(state.streak);
    }
    var total = res.coins.total + bonus;
    state.coins += total; state.today.coins += total; state.today.results.push(res.playerPos);
    state.lastRace = {
      day: today(), idx: idx, trackName: spec.track.name, laps: spec.laps, pos: res.playerPos,
      coins: { base: res.coins.base, fastest: res.coins.fastest, bonus: bonus }, hint: res.hint,
      fastestId: res.fastestId, best: res.player.best,
      table: res.order.map(function (d) { return { id: d.id, name: d.name, color: d.color, isPlayer: !!d.isPlayer, total: d.total, gap: d.gap, pos: d.pos }; })
    };
    state.pendingResult = true; save();
    view = 'race'; animate(spec, res);
  }

  /* ---------- animação ---------- */
  function animate(spec, res) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { view = 'result'; render(); return; }
    var ts = trackSamples(spec.track), D = 30000, maxT = 0, startT = null;
    res.drivers.forEach(function (d) { if (d.total > maxT) maxT = d.total; });
    app.innerHTML = '<div class="card"><div class="row"><h3>' + t('racing') + '</h3><span class="tag" id="lapinfo"></span></div>' +
      '<canvas id="cv" width="' + W + '" height="' + H + '" aria-label="' + t('racing') + '"></canvas><div id="banner"></div>' +
      '<table><tbody id="live"></tbody></table><p style="text-align:center"><button class="btn btn-ghost" id="skip">' + t('skip') + '</button></p></div>';
    var cv = $('#cv'), ctx = cv.getContext('2d'), shown = {}, finished = false;
    $('#skip').onclick = function () { finish(); };
    function progress(d, ts_) {
      if (ts_ >= d.total) return spec.laps + 1 - d.total / 1e4;
      var i = 0; while (i < d.cums.length && d.cums[i] <= ts_) i++;
      var prev = i ? d.cums[i - 1] : 0;
      return i + (ts_ - prev) / d.laps[i];
    }
    function frame(now) {
      if (finished) return;
      if (startT === null) startT = now;
      var real = now - startT; if (real >= D) return finish();
      var simT = real / D * maxT, order = res.drivers.map(function (d) { return { d: d, p: progress(d, simT) }; });
      order.sort(function (a, b) { return b.p - a.p; });
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ts.pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath();
      ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 22; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]);
      order.slice().reverse().forEach(function (o) {
        var pt = pointAt(ts, Math.min(o.p, spec.laps + 0.999) % 1 + (o.p >= spec.laps ? 0 : 0));
        ctx.beginPath(); ctx.arc(pt.x, pt.y, o.d.isPlayer ? 8 : 6.5, 0, 6.2832);
        ctx.fillStyle = o.d.color; ctx.fill();
        ctx.lineWidth = o.d.isPlayer ? 3 : 1.5; ctx.strokeStyle = o.d.isPlayer ? '#fff' : '#000'; ctx.stroke();
      });
      var lead = Math.min(spec.laps, Math.floor(order[0].p) + 1);
      $('#lapinfo').textContent = t('lap') + ' ' + lead + '/' + spec.laps;
      var w = spec.weatherByLap[lead - 1];
      if (spec.changeLap && lead >= spec.changeLap && !shown.w) {
        shown.w = 1; $('#banner').innerHTML = '<div class="banner">' + t(spec.changedTo === 'rain' ? 'rain_start' : (spec.changedTo === 'dry' ? 'dry_start' : 'cloudy_start')) + '</div>';
      }
      $('#live').innerHTML = order.map(function (o, i) {
        return '<tr' + (o.d.isPlayer ? ' class="me"' : '') + '><td>' + (i + 1) + 'º</td><td><span class="sw" style="background:' + o.d.color + '"></span>' + esc(o.d.name) + '</td></tr>';
      }).join('');
      raf = requestAnimationFrame(frame);
    }
    function finish() { finished = true; if (raf) cancelAnimationFrame(raf); view = 'result'; render(); }
    raf = requestAnimationFrame(frame);
  }

  /* ---------- resultado ---------- */
  function hintText(h) { return t('h_' + h.code, { lap: h.lap }); }
  function renderResult() {
    var r = state.lastRace, tot = r.coins.base + r.coins.fastest + r.coins.bonus;
    var h = adSlot('between') + '<div class="card"><h2>' + t('result_title', { n: r.idx }) + ' · ' + esc(r.trackName) + '</h2>' +
      '<div class="row"><div class="big">' + t('you_pos', { p: r.pos }) + '</div><div style="text-align:right"><div class="big">🪙 +' + tot + '</div></div></div>' +
      '<table style="margin-top:12px"><thead><tr><th>' + t('col_pos') + '</th><th>' + t('col_driver') + '</th><th class="r">' + t('col_time') + '</th><th class="r">' + t('col_gap') + '</th></tr></thead><tbody>' +
      r.table.map(function (d) {
        return '<tr' + (d.isPlayer ? ' class="me"' : '') + '><td>' + d.pos + 'º</td><td><span class="sw" style="background:' + d.color + '"></span>' + esc(d.name) + (r.fastestId === d.id ? ' ⏱️' : '') + '</td><td class="r">' + fmt(d.total) + '</td><td class="r">' + fmtGap(d.gap) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="small muted">⏱️ ' + t('fastest') + ' · ' + t('best_lap') + ': ' + fmt(r.best) + '</p>' +
      '<p class="small">' + t('coins_won') + ': ' + t('c_base') + ' ' + r.coins.base + (r.coins.fastest ? ' + ' + t('c_fast') + ' ' + r.coins.fastest : '') + (r.coins.bonus ? ' + ' + t('c_streak') + ' ' + r.coins.bonus : '') + '</p>' +
      '<div class="chief"><b>' + t('chief') + ':</b> ' + hintText(r.hint) + '</div>' +
      '<button class="btn btn-big" data-cont>' + t('continue') + '</button></div>';
    app.innerHTML = h; fillAds();
    app.onclick = function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-cont')) { state.pendingResult = false; save(); view = 'hub'; tab = 'race'; render(); }
    };
  }

  /* ---------- resumo do dia ---------- */
  function shareText() {
    var res = state.today.results;
    return '🏎️ Box 10 #' + E.dayNumber(today()) + ' · ' + res.map(function (p) { return MEDALS[p - 1] || '▫️'; }).join('') +
      ' · 🪙 ' + state.today.coins + ' · 🔥 ' + state.streak + ' dia' + (state.streak === 1 ? '' : 's') + '\n' + location.origin + location.pathname;
  }
  function renderSummary() {
    var res = state.today.results, best = Math.min.apply(null, res);
    var h = adSlot('top') + hud() + '<div class="card"><h2>' + t('summary_title', { n: E.dayNumber(today()) }) + '</h2>' +
      '<div class="dots">' + res.map(function (p) { return '<span class="dot done p' + p + '">' + p + '</span>'; }).join('') + '</div>' +
      '<p>' + t('best_pos') + ': <b>' + best + 'º</b> · ' + t('total_today') + ': <b>🪙 ' + num(state.today.coins) + '</b></p>' +
      '<pre style="white-space:pre-wrap;background:var(--panel2);padding:10px;border-radius:8px;font:inherit">' + esc(shareText()) + '</pre>' +
      '<div class="row" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" data-share>' + t('share') + '</button><button class="btn btn-ghost" data-copy>' + t('copy') + '</button></div></div>' +
      adSlot('result') + '<div class="card" style="text-align:center"><div class="muted small">' + t('next_day_in') + '</div><div class="big" id="cd">--:--:--</div></div>' +
      '<div class="tabs"><button data-tab="garage" aria-selected="false">' + t('tab_garage') + '</button><button data-tab="cars" aria-selected="false">' + t('tab_cars') + '</button></div>' +
      '<p class="small muted"><button class="btn btn-ghost btn-sm" data-erase>' + t('erase') + '</button></p>';
    app.innerHTML = h; bindHub(); fillAds();
    var cd = $('#cd'); function tick() { var ms = E.msToNextDay(); if (ms > 86399000 || ms <= 0) { location.reload(); return; } cd.textContent = clock(ms); }
    tick(); timer = setInterval(tick, 1000);
  }
  function share() { window.open('https://wa.me/?text=' + encodeURIComponent(shareText()), '_blank', 'noopener'); }
  function copyShare(btn) {
    var txt = shareText();
    function ok() { btn.textContent = t('copied'); setTimeout(function () { btn.textContent = t('copy'); }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () {});
    else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
  }
  function stopTimers() { if (timer) clearInterval(timer); timer = null; if (raf) cancelAnimationFrame(raf); raf = null; app.onchange = null; app.oninput = null; }

  /* ---------- início ---------- */
  state = load();
  if (state.pendingResult && state.lastRace && state.lastRace.day === today()) view = 'result';
  render();
  /* troca de dia com a página aberta */
  setInterval(function () { if (state.today.day !== E.dayKey() && view !== 'race') location.reload(); }, 30000);
})();
