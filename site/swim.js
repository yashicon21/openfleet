/*
 * Swimlane replay shared by the example runs on index.html and how-it-works.html.
 * Segment kinds: p plan, b baseline tests, i implement, t test, f failure (amber, always labelled),
 * w waiting (dashed), x extension (white outline), c repo coordinator work (white),
 * m merge into the integration branch (white diamond), k merge conflict (amber diamond).
 * Lanes: { name, short? (label on narrow screens), sub?, coord?, segs }.
 */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var C = {
    p: "#48A6EE",
    i: "#EE5AD6",
    t: "#EDEB3C",
    fg: "#F4F4F6",
    muted: "#A8A6AF",
    line: "#45434C",
    raised: "#26252C",
    ink: "#2B1E1B",
    warnBg: "#FFF1CC",
    warn: "#8A5300",
    ground: "#1C1B21",
  };
  var DISP = "font-family: 'Russo One', sans-serif";
  var MONO = "font-family: 'Share Tech Mono', monospace";
  var ROLE = { p: "planner", b: "baseline", i: "implementer", t: "tester" };
  var uid = 0;

  function fmt(t) {
    t = Math.max(0, Math.round(t));
    var s = t % 60;
    return Math.floor(t / 60) + ":" + (s < 10 ? "0" : "") + s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  window.OFSwim = function (o) {
    var D = o.data;
    var END = D.end;
    var svg = o.svg;
    var narrowMq = o.narrowMq || { matches: false };
    var hatch = "of-hatch-" + ++uid;

    var EVENTS = (D.events || []).slice();
    D.lanes.forEach(function (lane) {
      lane.segs.forEach(function (s) {
        var k = s[0];
        if (ROLE[k]) EVENTS.push({ t: s[1], type: "agent.spawned", text: lane.name + "/" + ROLE[k] });
        if (k === "t") EVENTS.push({ t: s[2], type: "test.run", text: lane.name + " · pass" });
        if (k === "f" && !s[3]) EVENTS.push({ t: s[2], type: "test.run", text: lane.name + " · fail, retry" });
        if (k === "m") EVENTS.push({ t: s[1], type: "child.merged", text: (s[4] || lane.name) + " → integration" });
      });
    });
    EVENTS.sort(function (a, b) {
      return a.t - b.t;
    });

    function el(name, attrs, text, parent) {
      var n = document.createElementNS(NS, name);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      if (text != null) n.textContent = text;
      (parent || svg).appendChild(n);
      return n;
    }

    var items, head, dims;

    function label(x, y, text, color, font, size, anchor) {
      return el(
        "text",
        { x: x, y: y, "font-size": size || 12, fill: color, "text-anchor": anchor || "start", style: font || MONO },
        text,
      );
    }

    function build() {
      var narrow = narrowMq.matches;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      items = [];
      var W = narrow ? 400 : 1000;
      var X0 = narrow ? 4 : D.labelWidth || 120;
      var X1 = narrow ? 396 : 990;
      var x = function (t) {
        return X0 + (t / END) * (X1 - X0);
      };
      var defs = el("defs", {});
      var pat = el(
        "pattern",
        { id: hatch, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
        null,
        defs,
      );
      el("rect", { width: 6, height: 6, fill: C.t }, null, pat);
      el("line", { x1: 1, y1: 0, x2: 1, y2: 6, stroke: C.ink, "stroke-width": 2 }, null, pat);

      var PY = narrow ? 20 : 10;
      var LY = narrow ? 70 : 60;
      var LH = narrow ? 50 : 44;
      if (!narrow) label(0, PY + 18, "PROJECT", C.muted, DISP, 12);
      D.project.forEach(function (p) {
        var w = x(p[2]) - x(p[1]) - 2;
        var you = p[3] === "you";
        var r = el("rect", {
          x: x(p[1]),
          y: PY,
          width: Math.max(2, w),
          height: 26,
          rx: 6,
          fill: you ? "none" : C.raised,
          stroke: you ? C.fg : "none",
          "stroke-width": you ? 2 : 0,
          "stroke-dasharray": you ? "4 3" : "none",
        });
        items.push({ kind: "dim", node: r, a: p[1] });
        if (w > p[0].length * 7.5 + 12) label(x(p[1]) + 8, PY + 18, p[0], C.muted, DISP, narrow ? 11 : 12);
        else if (you) label(x(p[1]) + w / 2, PY + 42, p[0], C.fg, DISP, 11, "middle");
      });

      D.lanes.forEach(function (lane, li) {
        var y = LY + li * LH;
        var labY = narrow ? y + 11 : y + 24;
        var barY = narrow ? y + 19 : y + 10;
        var barH = narrow ? 18 : 22;
        var mid = barY + barH / 2;
        el("line", {
          x1: X0,
          x2: X1,
          y1: mid,
          y2: mid,
          stroke: C.line,
          "stroke-width": 1,
          "stroke-dasharray": lane.coord ? "none" : "2 6",
        });
        var nx = narrow ? X0 : lane.sub ? 14 : 0;
        if (lane.sub && !narrow)
          el("path", { d: "M3 " + (y + 4) + "V" + (y + 19) + "H10", stroke: C.line, fill: "none", "stroke-width": 2 });
        label(
          nx,
          labY,
          narrow && lane.short ? lane.short : lane.name,
          lane.coord ? C.fg : C.fg,
          lane.coord ? DISP : MONO,
          lane.coord ? (narrow ? 12 : 13) : narrow ? 14 : 15,
        );

        lane.segs.forEach(function (s) {
          var k = s[0];
          var a = s[1];
          var b = s[2];
          var text = s[3];
          var x0 = x(a);
          var wpx = x(b) - x(a);
          var above = narrow ? barY - 4 : barY - 3;
          if (k === "w") {
            var line = el("line", {
              x1: x0,
              x2: x0,
              y1: mid,
              y2: mid,
              stroke: C.muted,
              "stroke-width": 2,
              "stroke-dasharray": "5 5",
            });
            items.push({ kind: "w", node: line, a: a, b: b, x: x });
            if (text) items.push({ kind: "show", node: label(x0 + 6, above, text, C.muted), a: a });
            return;
          }
          if (k === "m" || k === "k") {
            var d = narrow ? 7 : 8;
            var dia = el("path", {
              d:
                "M" +
                x0 +
                " " +
                (mid - d) +
                "L" +
                (x0 + d) +
                " " +
                mid +
                "L" +
                x0 +
                " " +
                (mid + d) +
                "L" +
                (x0 - d) +
                " " +
                mid +
                "Z",
              fill: k === "m" ? C.fg : C.warnBg,
              stroke: k === "m" ? C.ink : C.warn,
              "stroke-width": 2,
            });
            items.push({ kind: "show", node: dia, a: a });
            if (text)
              items.push({
                kind: "show",
                node: label(
                  x0 + (s[5] === "left" ? -10 : 10),
                  above,
                  text,
                  k === "m" ? C.fg : C.warnBg,
                  MONO,
                  12,
                  s[5] === "left" ? "end" : "start",
                ),
                a: a,
              });
            return;
          }
          var attrs = { x: x0, y: barY, height: barH, rx: 5, width: 0 };
          if (k === "b") attrs.fill = "url(#" + hatch + ")";
          else if (k === "f") {
            attrs.fill = C.warnBg;
            attrs.stroke = C.warn;
            attrs["stroke-width"] = 2;
          } else if (k === "x") {
            attrs.fill = C.ground;
            attrs.stroke = C.fg;
            attrs["stroke-width"] = 2;
          } else if (k === "c") attrs.fill = C.fg;
          else attrs.fill = C[k];
          items.push({ kind: "bar", node: el("rect", attrs), a: a, b: b, x: x });
          var word = k === "f" ? text || "FAIL" : k === "x" || k === "c" ? text : null;
          if (!word) return;
          var fits = wpx > word.length * 7.4 + 10;
          var color = k === "f" ? (fits ? C.warn : C.warnBg) : k === "c" ? (fits ? C.ink : C.fg) : C.fg;
          var node = fits
            ? label(k === "f" ? x(b) - 5 : x0 + 6, mid + 4, word, color, DISP, 11, k === "f" ? "end" : "start")
            : x0 + word.length * 7.4 > X1
              ? label(x(b), above, word, color, DISP, 11, "end")
              : label(x0, above, word, color, DISP, 11);
          items.push({ kind: "show", node: node, a: k === "f" ? b : a });
        });
      });

      var bottom = LY + D.lanes.length * LH + 4;
      (D.marks || []).forEach(function (m, mi) {
        var ln = el("line", {
          x1: x(m.t),
          x2: x(m.t),
          y1: LY - 6,
          y2: bottom,
          stroke: m.color || C.fg,
          "stroke-width": 2,
          "stroke-dasharray": m.solid ? "none" : "3 4",
        });
        var anchor = m.left ? "end" : "start";
        var tx = label(
          x(m.t) + (m.left ? -6 : 6),
          bottom + 18 + (narrow ? mi * 15 : 0),
          m.label,
          m.color || C.fg,
          MONO,
          12,
          anchor,
        );
        items.push({ kind: "show", node: ln, a: m.t });
        items.push({ kind: "show", node: tx, a: m.t });
      });
      var marks = (D.marks || []).length;
      var axisY = bottom + (narrow ? 30 + marks * 15 : 30);
      el("line", { x1: X0, x2: X1, y1: axisY, y2: axisY, stroke: C.line, "stroke-width": 2 });
      var step = narrow ? D.tickNarrow || 120 : D.tick || 60;
      for (var s = 0; s <= END; s += step) {
        el("line", { x1: x(s), x2: x(s), y1: axisY, y2: axisY + 6, stroke: C.line, "stroke-width": 2 });
        label(x(s), axisY + 22, fmt(s), C.muted, MONO, 13, s === 0 ? "start" : x(s) > X1 - 16 ? "end" : "middle");
      }
      head = el("line", { x1: x(END), x2: x(END), y1: PY - 4, y2: axisY, stroke: C.fg, "stroke-width": 2 });
      svg.setAttribute("viewBox", "0 0 " + W + " " + (axisY + 30));
      svg.style.minWidth = narrow ? "0" : (o.minWidth || 720) + "px";
      dims = { x: x };
    }

    var lastShown = -1;
    function frame(t) {
      var x = dims.x;
      items.forEach(function (b) {
        if (b.kind === "bar") {
          var w = Math.max(0, Math.min(t, b.b) - b.a);
          b.node.setAttribute("width", Math.max(0, x(b.a + w) - x(b.a)));
        } else if (b.kind === "w") {
          b.node.setAttribute("x2", x(Math.max(b.a, Math.min(t, b.b))));
          b.node.style.opacity = t >= b.a ? 1 : 0;
        } else if (b.kind === "dim") {
          b.node.style.opacity = t >= b.a ? 1 : 0.3;
        } else {
          b.node.style.opacity = t >= b.a ? 1 : 0;
        }
      });
      head.setAttribute("x1", x(t));
      head.setAttribute("x2", x(t));
      var n = 0;
      while (n < EVENTS.length && EVENTS[n].t <= t) n++;
      if (n !== lastShown) {
        lastShown = n;
        var keep = narrowMq.matches ? 4 : o.keep || 7;
        o.log.innerHTML = EVENTS.slice(Math.max(0, n - keep), n)
          .reverse()
          .map(function (e) {
            return (
              "<li><span>" +
              fmt(e.t) +
              "</span><span><b>" +
              escapeHtml(e.type) +
              "</b><em>" +
              escapeHtml(e.text) +
              "</em></span></li>"
            );
          })
          .join("");
      }
    }

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var t = END;
    var playing = false;
    var raf = 0;
    var last = 0;
    var DURATION_MS = o.duration || 14000;
    function set(v) {
      t = Math.max(0, Math.min(END, v));
      o.range.value = Math.round((t / END) * 1000);
      o.range.setAttribute("aria-valuetext", fmt(t));
      o.clock.textContent = fmt(t);
      frame(t);
    }
    function btnLabel() {
      o.btn.textContent = playing ? "❚❚ PAUSE" : t >= END ? "↺ REPLAY" : "▶ PLAY";
    }
    function tick(now) {
      var dt = now - last;
      last = now;
      set(t + (dt / DURATION_MS) * END);
      if (t >= END) {
        playing = false;
        btnLabel();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    function play() {
      if (reduce) {
        set(END);
        btnLabel();
        return;
      }
      if (t >= END) set(0);
      playing = true;
      btnLabel();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function pause() {
      playing = false;
      cancelAnimationFrame(raf);
      btnLabel();
    }
    o.btn.addEventListener("click", function () {
      if (playing) pause();
      else play();
    });
    o.range.addEventListener("input", function () {
      pause();
      set((o.range.value / 1000) * END);
      btnLabel();
    });

    build();
    set(END);
    btnLabel();
    if (narrowMq.addEventListener)
      narrowMq.addEventListener("change", function () {
        build();
        lastShown = -1;
        frame(t);
      });
    if (!reduce && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              io.disconnect();
              play();
            }
          });
        },
        { threshold: 0.3 },
      );
      io.observe(o.fig);
    }
  };
})();
