// Static (GitHub Pages) mode only: filters, search, day strip and "Pokaż więcej" run in the browser
// on data/feed.json, which carries every upcoming showtime with its card HTML rendered by the server
// template (_card.html). Pages are plain links and GET forms, so nothing is intercepted: when the URL
// has filter parameters (or the page was built on an earlier day) the feed is rendered here.
(function () {
  "use strict";
  var body = document.body;
  if (!body.dataset.static) return;
  var ctx = document.getElementById("feed-ctx");
  if (!ctx) return; // not a feed page (e.g. /teatry)

  var BASE = body.dataset.base || "";
  var PAGE = 60;
  var KEYS = ["preset", "od", "do", "t", "kat", "dz", "tag", "q", "page"];
  var MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia",
    "września", "października", "listopada", "grudnia"];
  var MON_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
  var DAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];
  var DAYS_SHORT = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"];
  var PRESETS = { dzis: "Dziś", jutro: "Jutro", weekend: "Na weekend", tydzien: "W tym tygodniu" };
  var ALL = "wszystkie"; // ?preset=wszystkie: every upcoming date; the plain feed defaults to today
  var THEATRE_PAGE = !!ctx.dataset.theatre;
  var CLEAN = { dzis: "/dzis", jutro: "/jutro", weekend: "/weekend", tydzien: "/tydzien" };

  // ---------------------------------------------------------------- helpers
  function fold(s) {
    return (s || "").replace(/[łŁ]/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function norm(s) { return fold(s).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function wd(d) { return (d.getDay() + 6) % 7; } // Monday = 0
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plural(n, one, few, many) {
    return n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
  }
  function shortDate(d) { return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function dayLabel(d, today) {
    var diff = Math.round((d - today) / 864e5);
    if (diff === 0) return "Dziś";
    if (diff === 1) return "Jutro";
    return DAYS[wd(d)] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + (d.getFullYear() !== today.getFullYear() ? " " + d.getFullYear() : "");
  }

  function readState(search) {
    var sp = new URLSearchParams(search), st = { t: [], kat: [], dz: [], tag: [] };
    KEYS.forEach(function (k) {
      var v = sp.getAll(k).filter(Boolean);
      if (st[k]) st[k] = v; else st[k] = v[0] || "";
    });
    st.page = Math.max(1, parseInt(st.page, 10) || 1);
    if (!PRESETS[st.preset] && st.preset !== ALL) st.preset = "";
    return st;
  }
  function withDefaultDate(st) { // same rule as the server: no date and no search -> today (not on theatre pages)
    if (!THEATRE_PAGE && !ctx.dataset.preset && !st.preset && !st.od && !st.do && !st.q) { st.preset = "dzis"; st._def = true; }
    return st;
  }
  function noDateOnTheatre(st) { return THEATRE_PAGE && !st.preset && !st.od && !st.do; }
  function implied() { // the page's own filter (/dzis -> preset, /teatr/x -> theatre)
    var st = readState("");
    if (ctx.dataset.preset) st.preset = ctx.dataset.preset;
    if (ctx.dataset.theatre) st.t = [ctx.dataset.theatre];
    return st;
  }
  function toParams(st, over) {
    var o = Object.assign({}, st, over || {}), out = [];
    KEYS.forEach(function (k) {
      var v = o[k];
      if (k === "page" && (!v || v === 1)) return;
      if (k === "preset" && o._def && v === "dzis") return; // the default date is implied, not written
      (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x) out.push([k, String(x)]); });
    });
    return out;
  }
  function url(st, over) { // same rules as seo.feed_url: clean path when the filter is a single preset/theatre
    var p = toParams(st, over);
    if (!p.length) return BASE + "/";
    if (p.length === 1 && p[0][0] === "preset" && CLEAN[p[0][1]]) return BASE + CLEAN[p[0][1]];
    if (p.length === 1 && p[0][0] === "t") return BASE + "/teatr/" + encodeURIComponent(p[0][1]);
    return BASE + "/?" + new URLSearchParams(p).toString();
  }
  function range(st, today) {
    var w = wd(today);
    if (st.preset === "dzis") return [today, today];
    if (st.preset === "jutro") return [addDays(today, 1), addDays(today, 1)];
    if (st.preset === "weekend") return w >= 5 ? [today, addDays(today, 6 - w)] : [addDays(today, 5 - w), addDays(today, 6 - w)];
    if (st.preset === "tydzien") return [today, addDays(today, 6 - w)];
    var a = st.od ? parse(st.od) : null, b = st.do ? parse(st.do) : null;
    if (a && b && b < a) { var x = a; a = b; b = x; }
    return [a, b];
  }
  function matches(it, st, words, from, to, nowTs) {
    if (it.ts < nowTs - 1800) return false; // started more than 30 minutes ago
    if (from && it.d < iso(from)) return false;
    if (to && it.d > iso(to)) return false;
    if (st.t.length && st.t.indexOf(it.th) < 0) return false;
    if (st.kat.length && st.kat.indexOf(it.cat) < 0) return false;
    if (st.dz.length && st.dz.indexOf(it.dz) < 0) return false;
    if (st.tag.length && !st.tag.some(function (t) { return it.tags.indexOf(t) >= 0; })) return false;
    for (var i = 0; i < words.length; i++) if (it.n.indexOf(words[i]) < 0) return false;
    return true;
  }
  function rangeLabel(st, from, to, today) {
    if (!from && !to) return "Najbliższe spektakle";
    var span = from && to ? (iso(from) === iso(to) ? dayLabel(from, today) : shortDate(from) + " – " + shortDate(to))
      : (from ? "od " + shortDate(from) : "do " + shortDate(to));
    if (st.preset === "dzis" || st.preset === "jutro") return PRESETS[st.preset];
    return st.preset ? PRESETS[st.preset] + " · " + span : span;
  }

  // ---------------------------------------------------------------- render
  function render(data, st, scrollToMore) {
    var today = parse(iso(new Date())), nowTs = Date.now() / 1000;
    var r = range(st, today), from = r[0], to = r[1];
    var words = norm(st.q).split(" ").filter(Boolean);
    var rows = data.items.filter(function (it) { return matches(it, st, words, from, to, nowTs); });
    var shown = rows.slice(0, PAGE * st.page);

    // results
    var html = ['<div class="results-head"><h2>' + esc(rangeLabel(st, from, to, today)) + '</h2><p class="muted">' +
      rows.length + " " + plural(rows.length, "termin", "terminy", "terminów") + "</p></div>"];
    if (!rows.length) {
      html.push('<div class="empty"><div class="empty-art" aria-hidden="true"><svg viewBox="0 0 32 32"><use href="' + BASE +
        '/static/icons.svg#mark"/></svg></div><h3>Kurtyna opadła</h3><p>Nie znaleźliśmy spektakli dla tych filtrów. Spróbuj innej daty lub teatru.</p>' +
        '<p><a class="btn btn-primary" href="' + esc(url(st, { preset: ALL, od: "", do: "", q: "", page: 1 })) + '">Pokaż wszystkie terminy</a></p></div>');
    }
    var i = 0;
    while (i < shown.length) {
      var d = shown[i].d, group = [];
      while (i < shown.length && shown[i].d === d) group.push(shown[i++]);
      var day = parse(d), label = dayLabel(day, today);
      html.push('<section class="day" id="d-' + d + '"><h3 class="day-head"><span class="dh-label">' + esc(label) + "</span>" +
        (label === "Dziś" || label === "Jutro" ? '<span class="dh-date">' + DAYS[wd(day)] + ", " + day.getDate() + "." + pad(day.getMonth() + 1) + "</span>" : "") +
        '<span class="dh-count">' + group.length + '</span></h3><ul class="cards">' +
        group.map(function (g) { return g.h; }).join("") + "</ul></section>");
    }
    if (rows.length > shown.length) {
      html.push('<p class="more" id="more"><a class="btn btn-ghost" href="' + esc(url(st, { page: st.page + 1 })) + '#more">Pokaż więcej</a></p>');
    }
    var results = document.querySelector("section.results");
    if (results) results.innerHTML = html.join("");

    renderStrip(data, st, today, nowTs, words, from, to);
    syncControls(data, st);
    if (scrollToMore && location.hash) {
      var target = document.querySelector(location.hash);
      if (target) target.scrollIntoView();
    }
  }

  function renderStrip(data, st, today, nowTs, words, from, to) {
    var strip = document.querySelector(".daystrip");
    if (!strip) return;
    var noDates = Object.assign({}, st, { preset: "", od: "", do: "" });
    var counts = {};
    data.items.forEach(function (it) {
      if (matches(it, noDates, words, today, addDays(today, 13), nowTs)) counts[it.d] = (counts[it.d] || 0) + 1;
    });
    var tiles = [];
    for (var k = 0; k < 14; k++) {
      var d = addDays(today, k), key = iso(d), n = counts[key] || 0;
      var sel = from && to && key >= iso(from) && key <= iso(to) && (to - from) / 864e5 < 14;
      var dow = k === 0 ? "dziś" : (k === 1 ? "jutro" : DAYS_SHORT[wd(d)]);
      tiles.push('<a role="listitem" class="day-tile' + (sel ? " on" : "") + (wd(d) >= 5 ? " we" : "") + (n ? "" : " is-empty") +
        '" href="' + esc(url(st, { preset: "", od: key, do: key, page: 1 })) + '" rel="nofollow" aria-label="' + dow + " " + d.getDate() +
        " " + MON_SHORT[d.getMonth()] + ": " + n + ' spektakli"><span class="dt-dow">' + dow + '</span><span class="dt-num">' + d.getDate() +
        '</span><span class="dt-mon">' + MON_SHORT[d.getMonth()] + '</span><span class="dt-count">' + (n || "–") + "</span></a>");
    }
    strip.innerHTML = tiles.join("");
    var on = strip.querySelector(".day-tile.on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function syncControls(data, st) {
    var active = toParams(st, { page: 1 }).length > 0;
    // hero: compact look once filters are applied on the home page
    var hero = document.querySelector(".hero");
    if (hero && active && !ctx.dataset.preset && !ctx.dataset.theatre) {
      hero.classList.add("hero--compact");
      hero.querySelectorAll(".eyebrow, .hero-title, .hero-sub").forEach(function (el) { el.hidden = true; });
    }
    var search = document.querySelector(".hero-search");
    if (search) {
      search.querySelectorAll('input[type=hidden]').forEach(function (el) { el.remove(); });
      toParams(st, { q: "", page: 1 }).forEach(function (p) {
        var h = document.createElement("input"); h.type = "hidden"; h.name = p[0]; h.value = p[1]; search.insertBefore(h, search.firstChild);
      });
      var q = search.querySelector("input[name=q]"); if (q) q.value = st.q;
    }
    document.querySelectorAll(".presets .pill").forEach(function (a) {
      var key = Object.keys(CLEAN).filter(function (k) { return a.textContent.trim() === PRESETS[k]; })[0] || "";
      a.classList.toggle("on", key ? st.preset === key : (st.preset === ALL || noDateOnTheatre(st)));
      a.setAttribute("href", url(st, { preset: key || (THEATRE_PAGE ? "" : ALL), od: "", do: "", page: 1 }));
    });
    // tag row: each pill toggles its tag (theatre pages keep "all dates")
    document.querySelectorAll(".tagbar a[data-tag]").forEach(function (a) {
      var tag = a.dataset.tag, on = st.tag.indexOf(tag) >= 0;
      var tags = on ? st.tag.filter(function (t) { return t !== tag; }) : st.tag.concat([tag]);
      a.classList.toggle("on", on);
      a.setAttribute("aria-pressed", on ? "true" : "false");
      a.setAttribute("href", url(st, noDateOnTheatre(st) ? { tag: tags, preset: ALL, page: 1 } : { tag: tags, page: 1 }));
    });
    var form = document.getElementById("filters");
    if (form) {
      var formState = { preset: st._def ? "" : (st.preset || (noDateOnTheatre(st) ? ALL : "")), q: st.q };
      ["preset", "q"].forEach(function (k) {
        var h = form.querySelector('input[type=hidden][name="' + k + '"]');
        if (formState[k] && !h) { h = document.createElement("input"); h.type = "hidden"; h.name = k; form.insertBefore(h, form.firstChild); }
        if (h) { if (formState[k]) h.value = formState[k]; else h.remove(); }
      });
      form.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
        cb.checked = (st[cb.name] || []).indexOf(cb.value) >= 0;
      });
      var od = form.querySelector("input[name=od]"), dd = form.querySelector("input[name=do]");
      if (od) od.value = st.preset ? "" : st.od;
      if (dd) dd.value = st.preset ? "" : st.do;
      var clear = form.querySelector(".link-clear");
      if (active && !clear) { clear = document.createElement("a"); clear.className = "link-clear"; clear.textContent = "Wyczyść"; form.appendChild(clear); }
      if (clear) { clear.href = BASE + "/"; clear.hidden = !active; }
    }
    // chips: search phrase and selected theatres, each removable
    var chips = document.querySelector("p.chips");
    var parts = [];
    var x = '<svg aria-hidden="true"><use href="' + BASE + '/static/icons.svg#close"/></svg>';
    if (st.q) parts.push('<a class="chip" href="' + esc(url(st, { q: "", page: 1 })) + '" title="Usuń wyszukiwanie">„' + esc(st.q) + "” " + x + "</a>");
    st.t.forEach(function (slug) {
      var th = data.theatres[slug] || { n: slug, h: 340 };
      parts.push('<a class="chip" style="--h: ' + th.h + '" href="' + esc(url(st, { t: st.t.filter(function (s) { return s !== slug; }), page: 1 })) +
        '" title="Usuń filtr">' + esc(th.n) + " " + x + "</a>");
    });
    if (parts.length) {
      if (!chips) { chips = document.createElement("p"); chips.className = "chips"; var res = document.querySelector("section.results"); res.parentNode.insertBefore(chips, res); }
      chips.innerHTML = parts.join("");
    } else if (chips) chips.remove();
  }

  // ---------------------------------------------------------------- start
  var fromUrl = readState(location.search);
  var hasParams = toParams(fromUrl).length > 0;
  var stale = body.dataset.built && body.dataset.built !== iso(new Date()); // built on an earlier day
  if (!hasParams && !stale) return;
  var st = withDefaultDate(hasParams ? fromUrl : implied());
  fetch(BASE + "/data/feed.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (data) { render(data, st, true); })
    .catch(function (e) { if (window.console) console.warn("feed.json:", e); });
})();
