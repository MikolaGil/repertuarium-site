// Progressive enhancement only: every filter also works as a plain GET form without JS.
(function () {
  "use strict";
  // Polish-aware fold for client-side theatre list filtering (mirrors app/text.py:fold)
  function fold(s) {
    return (s || "").replace(/[łŁ]/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // scroll the selected day tile into view
  var on = document.querySelector(".day-tile.on");
  if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });

  var form = document.getElementById("filters");
  if (!form) return;

  // theatre list: type to filter
  document.querySelectorAll(".dd-search").forEach(function (input) {
    var items = input.parentElement.querySelectorAll(".checklist li");
    input.addEventListener("input", function () {
      var q = fold(input.value.trim());
      items.forEach(function (li) {
        li.hidden = !!q && fold(li.getAttribute("data-name")).indexOf(q) === -1;
      });
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
  });

  // picking own dates overrides a preset (Dziś / Weekend ...)
  form.querySelectorAll("[data-clears-preset]").forEach(function (el) {
    el.addEventListener("change", function () {
      var p = form.querySelector("input[type=hidden][name=preset]");
      if (p) p.remove();
    });
  });

  // keep URLs short: drop empty fields on submit
  form.addEventListener("submit", function () {
    form.querySelectorAll("input[name]").forEach(function (el) {
      if ((el.type === "search" || el.type === "date") && !el.value) el.disabled = true;
    });
  });

  // dropdowns (desktop) / bottom sheets (mobile): one open at a time, close on outside click, ✕ or Esc
  var dds = form.querySelectorAll("details.dd");
  var mobile = window.matchMedia("(max-width: 719px)");
  function closeAll(except) { dds.forEach(function (o) { if (o !== except) o.open = false; }); }
  function syncLock() {
    var anyOpen = Array.prototype.some.call(dds, function (d) { return d.open; });
    document.documentElement.style.overflow = anyOpen && mobile.matches ? "hidden" : "";
  }
  dds.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.open) closeAll(d);
      syncLock();
      if (d.open && !mobile.matches) { var s = d.querySelector(".dd-search"); if (s) s.focus(); }
    });
    d.addEventListener("click", function (e) {
      // tap on the dimmed backdrop (the ::before of <details>) closes the sheet
      if (e.target === d && d.open) { d.open = false; }
    });
  });
  form.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { closeAll(null); syncLock(); });
  });
  document.addEventListener("click", function (e) {
    dds.forEach(function (d) { if (d.open && !d.contains(e.target)) d.open = false; });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(null); syncLock(); } });
})();
