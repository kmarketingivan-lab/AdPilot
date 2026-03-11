/**
 * AdPilot Tracking Script
 * Tracks clicks, scroll depth, mousemove for heatmap & session recording.
 * Target: <3KB gzipped. Vanilla JS, no dependencies.
 *
 * Usage:
 *   <script src="https://app.adpilot.com/tracking.js" data-id="xxx"></script>
 *   or: window.AdPilotTrack.init({ trackingId: "xxx" });
 */
(function () {
  "use strict";

  var BEACON_INTERVAL = 5000; // 5s
  var MOVE_THROTTLE = 100; // 100ms
  var RAGE_WINDOW = 500; // 500ms
  var RAGE_THRESHOLD = 3;

  var config = null;
  var sessionId = null;
  var queue = [];
  var timer = null;
  var lastMoveTime = 0;

  // Rage click tracking
  var rageClicks = []; // { el, ts }

  // Scroll tracking
  var maxScroll = 0;
  var lastScrollDepth = 0;

  // --- Helpers ---

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getSessionId() {
    var key = "adpilot_session_id";
    var id = sessionStorage.getItem(key);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return "body";
    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur !== document.body && depth < 5) {
      var tag = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(tag + "#" + cur.id);
        break;
      }
      var cls = cur.className;
      if (typeof cls === "string" && cls.trim()) {
        var first = cls.trim().split(/\s+/)[0];
        parts.unshift(tag + "." + first);
      } else {
        parts.unshift(tag);
      }
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(" > ") || "body";
  }

  function getViewport() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth,
      h: window.innerHeight || document.documentElement.clientHeight,
    };
  }

  function getScrollDepth() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
    var viewH = window.innerHeight || doc.clientHeight || 0;
    var docH = Math.max(
      body.scrollHeight || 0,
      doc.scrollHeight || 0,
      body.offsetHeight || 0,
      doc.offsetHeight || 0,
      body.clientHeight || 0,
      doc.clientHeight || 0
    );
    if (docH <= viewH) return 100;
    return Math.min(100, Math.round(((scrollTop + viewH) / docH) * 100));
  }

  function pushEvent(type, data) {
    var vp = getViewport();
    queue.push({
      type: type,
      x: data.x || 0,
      y: data.y || 0,
      scrollDepth: data.scrollDepth != null ? data.scrollDepth : null,
      element: data.element || null,
      timestamp: new Date().toISOString(),
      pageUrl: location.href,
      viewportW: vp.w,
      viewportH: vp.h,
    });
  }

  // --- Flush ---

  function flush() {
    if (!queue.length || !config) return;

    var payload = {
      trackingId: config.trackingId,
      sessionId: sessionId,
      screenWidth: screen.width,
      screenHeight: screen.height,
      userAgent: navigator.userAgent,
      events: queue.splice(0),
    };

    var url = (config.endpoint || "") + "/api/tracking";
    var json = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([json], { type: "application/json" }));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(json);
    }
  }

  // --- Event handlers ---

  function onClicked(e) {
    var now = Date.now();
    var selector = getSelector(e.target);

    pushEvent("CLICK", {
      x: e.pageX || e.clientX,
      y: e.pageY || e.clientY,
      element: selector,
    });

    // Rage click detection
    rageClicks.push({ el: selector, ts: now });
    // Keep only recent clicks
    rageClicks = rageClicks.filter(function (c) {
      return now - c.ts < RAGE_WINDOW;
    });
    // Check if same element clicked 3+ times within window
    var sameEl = rageClicks.filter(function (c) {
      return c.el === selector;
    });
    if (sameEl.length >= RAGE_THRESHOLD) {
      pushEvent("RAGE_CLICK", {
        x: e.pageX || e.clientX,
        y: e.pageY || e.clientY,
        element: selector,
      });
      // Reset to avoid duplicate rage events
      rageClicks = [];
    }
  }

  function onScrolled() {
    var depth = getScrollDepth();
    if (depth > maxScroll) {
      maxScroll = depth;
    }
    // Only record if depth changed by at least 5%
    if (Math.abs(depth - lastScrollDepth) >= 5) {
      lastScrollDepth = depth;
      pushEvent("SCROLL", {
        x: 0,
        y: window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollDepth: depth,
      });
    }
  }

  function onMouseMoved(e) {
    var now = Date.now();
    if (now - lastMoveTime < MOVE_THROTTLE) return;
    lastMoveTime = now;
    pushEvent("MOUSEMOVE", {
      x: e.pageX || e.clientX,
      y: e.pageY || e.clientY,
    });
  }

  // --- Init ---

  function init(opts) {
    if (!opts || !opts.trackingId) {
      console.warn("[AdPilot] trackingId is required");
      return;
    }

    config = {
      trackingId: opts.trackingId,
      endpoint: opts.endpoint || "",
    };

    sessionId = getSessionId();

    // Attach listeners
    document.addEventListener("click", onClicked, true);
    window.addEventListener("scroll", onScrolled, { passive: true });
    document.addEventListener("mousemove", onMouseMoved, { passive: true });

    // Flush on interval
    timer = setInterval(flush, BEACON_INTERVAL);

    // Flush on page unload
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("beforeunload", flush);
  }

  function destroy() {
    flush();
    if (timer) clearInterval(timer);
    document.removeEventListener("click", onClicked, true);
    window.removeEventListener("scroll", onScrolled);
    document.removeEventListener("mousemove", onMouseMoved);
    config = null;
  }

  // --- Auto-init from script tag ---

  window.AdPilotTrack = { init: init, destroy: destroy, flush: flush };

  // Auto-detect data-id on the script tag
  var scripts = document.getElementsByTagName("script");
  for (var i = scripts.length - 1; i >= 0; i--) {
    var dataId = scripts[i].getAttribute("data-id");
    if (dataId && scripts[i].src && scripts[i].src.indexOf("tracking") !== -1) {
      // Derive endpoint from script src (remove /tracking.js)
      var src = scripts[i].src;
      var endpoint = src.substring(0, src.lastIndexOf("/"));
      init({ trackingId: dataId, endpoint: endpoint });
      break;
    }
  }
})();
