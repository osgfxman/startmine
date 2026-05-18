/* ═══════════════════════════════════════════════════════════════
   Life Widget 2000–2049  ▸  All 4 Phases
   Toolbar: mtb-life  |  Keyboard: 6
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     PHASE 1 — Configuration & Light Theme
     ───────────────────────────────────────────────────────── */
  var CFG = {
    startYear: 2000, endYear: 2049,
    yCols: 10, yRows: 5,              // 50 years → 10 × 5
    mCols: 3,  mRows: 4,              // 12 months → 3 × 4
    dCols: 7,  dRows: 5,              // up to 35 cells per month
    slots: 48, sects: 6,              // half-hour slots, 4-hour sections
    bg:      '#f6f7fb',               // light background
    grid1:   'rgba(0,0,0,0.13)',      // year grid
    grid2:   'rgba(0,0,0,0.07)',      // month grid
    grid3:   'rgba(0,0,0,0.04)',      // day grid
    tx:      'rgba(20,25,40,0.82)',   // primary text
    tx2:     'rgba(20,25,40,0.50)',   // secondary text
    accent:  '#00b894',               // highlight / today
    hi:      'rgba(0,184,148,0.16)',  // year highlight
    hi2:     'rgba(0,184,148,0.26)',  // day highlight
    hi3:     'rgba(0,184,148,0.36)',  // slot highlight
    ovFill:  'rgba(255,170,0,0.22)',  // default overlay fill
    ovStroke:'rgba(255,170,0,0.55)',  // default overlay stroke
    palette: [                        // 12 colour presets (Phase 4)
      '#e74c3c','#e67e22','#f1c40f','#2ecc71',
      '#1abc9c','#3498db','#9b59b6','#e84393',
      '#fd79a8','#636e72','#2d3436','#00cec9'
    ]
  };

  var MS  = 864e5;                    // milliseconds per day
  var EP  = new Date(CFG.startYear, 0, 1).getTime();
  var MN  = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

  /* ── Utility helpers ── */
  function totalDays()   { return Math.floor((new Date(CFG.endYear,11,31).getTime() - EP) / MS) + 1; }
  function d2i(d)        { return Math.floor(((typeof d==='string' ? new Date(d) : d).getTime() - EP) / MS); }
  function i2d(i)        { return new Date(EP + i * MS); }
  function dim(y, m)     { return new Date(y, m+1, 0).getDate(); }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function nowInfo() {
    var d = new Date();
    return { y:d.getFullYear(), m:d.getMonth(), d:d.getDate(),
             sl: d.getHours()*2 + (d.getMinutes()>=30 ? 1 : 0) };
  }

  /* ── LOD — thresholds based on INTERNAL camera zoom (not Miro page zoom) ── */
  function lod(z) {
    if (z < 0.9)  return 'Y';
    if (z < 2.2)  return 'M';
    if (z < 6.5)  return 'D';
    return 'H';
  }
  function lodLabel(l) {
    return l==='Y' ? 'Years' : l==='M' ? 'Months' : l==='D' ? 'Days' : 'Hours';
  }

  /* ── Rect mappers (world-space coordinates) ── */
  function yR(i, W, H) {
    var cw = W / CFG.yCols, ch = H / CFG.yRows;
    return { x:(i % CFG.yCols)*cw, y:Math.floor(i / CFG.yCols)*ch, w:cw, h:ch };
  }
  function mR(i, m, W, H) {
    var p = yR(i, W, H), cw = p.w / CFG.mCols, ch = p.h / CFG.mRows;
    return { x:p.x + (m % CFG.mCols)*cw, y:p.y + Math.floor(m / CFG.mCols)*ch, w:cw, h:ch };
  }
  function dR(i, m, d, W, H) {
    var p = mR(i, m, W, H), cw = p.w / CFG.dCols, ch = p.h / CFG.dRows;
    return { x:p.x + (d % CFG.dCols)*cw, y:p.y + Math.floor(d / CFG.dCols)*ch, w:cw, h:ch };
  }

  /* ── Card data initialisation ── */
  function ensLife(card) {
    if (!card.life) card.life = {};
    var L = card.life;
    if (!L.ov)  L.ov  = [];
    if (!L.cam) L.cam = { z:1, x:0, y:0 };
    if (!L.calEvents) L.calEvents = [];
    if (!L._calTS) L._calTS = 0;
    return L;
  }
  function clampCam(cam, W, H) {
    cam.z = clamp(cam.z, 0.35, 30);
    var vw = W / cam.z, vh = H / cam.z;
    cam.x = clamp(cam.x, 0, Math.max(0, W - vw));
    cam.y = clamp(cam.y, 0, Math.max(0, H - vh));
  }
  /* Screen → World */
  function s2w(sx, sy, cam) {
    return { x: cam.x + sx / cam.z, y: cam.y + sy / cam.z };
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 2 — Animated Camera Transitions
     ───────────────────────────────────────────────────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Smoothly fly the camera toward (tx,ty,tz) over ~14 frames */
  function animateCam(life, tx, ty, tz, W, H, onDone) {
    var cam = life.cam, steps = 0;
    (function tick() {
      cam.z = lerp(cam.z, tz, 0.18);
      cam.x = lerp(cam.x, tx, 0.18);
      cam.y = lerp(cam.y, ty, 0.18);
      clampCam(cam, W, H);
      steps++;
      if (steps < 16 && (Math.abs(cam.z-tz)>0.01 || Math.abs(cam.x-tx)>1 || Math.abs(cam.y-ty)>1)) {
        requestAnimationFrame(tick);
      } else {
        cam.z = tz; cam.x = tx; cam.y = ty;
        clampCam(cam, W, H);
        if (onDone) onDone();
      }
    })();
  }

  /** Fly camera so the given rect fills the viewport at targetZ */
  function zoomToRect(life, rect, W, H, targetZ) {
    var vw = W / targetZ, vh = H / targetZ;
    var tx = rect.x + rect.w/2 - vw/2;
    var ty = rect.y + rect.h/2 - vh/2;
    tx = clamp(tx, 0, Math.max(0, W - vw));
    ty = clamp(ty, 0, Math.max(0, H - vh));
    animateCam(life, tx, ty, targetZ, W, H);
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 1 — Drawing Functions (Light Theme)
     ───────────────────────────────────────────────────────── */
  function drawYears(ctx, W, H) {
    var n = nowInfo();
    ctx.font = 'bold 14px system-ui'; ctx.textBaseline = 'top';
    for (var i = 0; i < 50; i++) {
      var r = yR(i, W, H), y = CFG.startYear + i;
      if (y === n.y) { ctx.fillStyle = CFG.hi; ctx.fillRect(r.x, r.y, r.w, r.h); }
      ctx.strokeStyle = CFG.grid1; ctx.lineWidth = 1;
      ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
      ctx.fillStyle = (y === n.y) ? CFG.accent : CFG.tx;
      ctx.fillText(''+y, r.x+8, r.y+6);
    }
  }

  function drawMonths(ctx, W, H) {
    var n = nowInfo();
    ctx.textBaseline = 'top';
    for (var i = 0; i < 50; i++) {
      var yr = yR(i, W, H), y = CFG.startYear + i;
      ctx.strokeStyle = CFG.grid1; ctx.lineWidth = 1.5;
      ctx.strokeRect(yr.x+.5, yr.y+.5, yr.w-1, yr.h-1);
      ctx.font = 'bold 11px system-ui';
      ctx.fillStyle = (y === n.y) ? CFG.accent : CFG.tx;
      ctx.fillText(''+y, yr.x+6, yr.y+4);
      for (var m = 0; m < 12; m++) {
        var mr = mR(i, m, W, H);
        if (y===n.y && m===n.m) { ctx.fillStyle = CFG.hi; ctx.fillRect(mr.x, mr.y, mr.w, mr.h); }
        ctx.strokeStyle = CFG.grid2; ctx.lineWidth = .7;
        ctx.strokeRect(mr.x+.5, mr.y+.5, mr.w-1, mr.h-1);
        ctx.font = '9px system-ui';
        ctx.fillStyle = (y===n.y && m===n.m) ? CFG.accent : CFG.tx2;
        ctx.fillText(MN[m], mr.x+4, mr.y+3);
      }
    }
  }

  function drawDays(ctx, W, H) {
    var n = nowInfo(), td = new Date(n.y, n.m, n.d).getTime();
    for (var i = 0; i < 50; i++) {
      var y = CFG.startYear + i;
      for (var m = 0; m < 12; m++) {
        var ds = dim(y, m);
        for (var d = 0; d < ds; d++) {
          var r = dR(i, m, d, W, H);
          if (new Date(y, m, d+1).getTime() === td) {
            ctx.fillStyle = CFG.hi2; ctx.fillRect(r.x, r.y, r.w, r.h);
          }
          ctx.strokeStyle = CFG.grid3; ctx.lineWidth = .6;
          ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
          if (r.w > 18 && r.h > 14) {
            ctx.font = '8px system-ui'; ctx.textBaseline = 'top';
            ctx.fillStyle = (new Date(y, m, d+1).getTime() === td) ? CFG.accent : CFG.tx2;
            ctx.fillText(''+(d+1), r.x+2, r.y+2);
          }
        }
      }
    }
  }

  function drawHours(ctx, W, H) {
    var n = nowInfo();
    for (var i = 0; i < 50; i++) {
      var y = CFG.startYear + i;
      for (var m = 0; m < 12; m++) {
        var ds = dim(y, m);
        for (var d = 0; d < ds; d++) {
          var r = dR(i, m, d, W, H);
          if (r.w < 80 || r.h < 80) continue;
          var isToday = (y===n.y && m===n.m && d+1===n.d);
          var sh = r.h / CFG.slots, eh = r.h / CFG.sects;
          for (var s = 0; s < CFG.sects; s++) {
            ctx.strokeStyle = CFG.grid2; ctx.lineWidth = 1;
            ctx.strokeRect(r.x, r.y + s*eh, r.w, eh);
            ctx.font = '8px system-ui'; ctx.fillStyle = CFG.tx2; ctx.textBaseline = 'top';
            ctx.fillText((s*4)+':00', r.x+3, r.y + s*eh + 2);
          }
          for (var sl = 0; sl < CFG.slots; sl++) {
            var sy = r.y + sl * sh;
            if (isToday && sl === n.sl) { ctx.fillStyle = CFG.hi3; ctx.fillRect(r.x, sy, r.w, sh); }
            ctx.strokeStyle = CFG.grid3; ctx.lineWidth = .3;
            ctx.beginPath(); ctx.moveTo(r.x, sy); ctx.lineTo(r.x + r.w, sy); ctx.stroke();
          }
          ctx.strokeStyle = isToday ? CFG.accent : CFG.grid1; ctx.lineWidth = isToday ? 2 : 1;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.font = 'bold 10px system-ui'; ctx.fillStyle = isToday ? CFG.accent : CFG.tx;
          ctx.textBaseline = 'bottom';
          ctx.fillText((d+1)+' '+MN[m]+' '+y, r.x+4, r.y-3);
        }
      }
    }
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 3 — Manual Overlay Drawing
     ───────────────────────────────────────────────────────── */
  function layoutOverlays(ov) {
    if (!ov || !ov.length) return;
    ov.sort(function(a,b){ return d2i(a.start) - d2i(b.start); });
    var lanes = [];
    for (var i = 0; i < ov.length; i++) {
      var e = ov[i], s = d2i(e.start), placed = false;
      for (var l = 0; l < lanes.length; l++) {
        if (s >= lanes[l]) { lanes[l] = d2i(e.end); e._l = l; placed = true; break; }
      }
      if (!placed) { e._l = lanes.length; lanes.push(d2i(e.end)); }
    }
  }

  function drawOverlays(ctx, ov, W) {
    if (!ov || !ov.length) return;
    layoutOverlays(ov);
    var T = totalDays();
    for (var j = 0; j < ov.length; j++) {
      var ev = ov[j];
      var sx = (d2i(ev.start) / T) * W;
      var ex = (d2i(ev.end) / T) * W;
      var w = Math.max(ex - sx, 6);
      var py = 8 + ev._l * 26;
      ctx.fillStyle = ev.color || CFG.ovFill;
      ctx.strokeStyle = ev.bc || CFG.ovStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sx, py, w, 22, 4);
      else ctx.rect(sx, py, w, 22);
      ctx.fill(); ctx.stroke();
      if (w > 36) {
        ctx.fillStyle = '#1a1a1a'; ctx.font = '10px system-ui'; ctx.textBaseline = 'middle';
        ctx.save(); ctx.beginPath(); ctx.rect(sx, py, w, 22); ctx.clip();
        ctx.fillText(ev.title || '', sx+6, py+11);
        ctx.restore();
      }
    }
  }

  /* ── Phase 3 — Google Calendar Event Drawing ── */
  function drawCalEvents(ctx, events, W, H, curLOD) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (!ev.start) continue;
      var sd = new Date(ev.start), ed = new Date(ev.end || ev.start);
      var yi = sd.getFullYear() - CFG.startYear;
      if (yi < 0 || yi >= 50) continue;
      var mi = sd.getMonth(), di = sd.getDate() - 1;
      var col = ev.color || 'rgba(52,152,219,0.35)';
      var bc  = ev.bc    || 'rgba(52,152,219,0.7)';

      if (curLOD === 'Y') {
        var yr = yR(yi, W, H);
        ctx.fillStyle = col;
        ctx.fillRect(yr.x + yr.w * (mi/12), yr.y + yr.h - 6, yr.w/12, 5);
      } else if (curLOD === 'M') {
        var mr = mR(yi, mi, W, H);
        ctx.fillStyle = col;
        ctx.fillRect(mr.x + mr.w * (di / dim(sd.getFullYear(), mi)),
                     mr.y + mr.h - 4, Math.max(2, mr.w/31), 3);
      } else if (curLOD === 'D') {
        var dr = dR(yi, mi, di, W, H);
        ctx.fillStyle = col; ctx.strokeStyle = bc; ctx.lineWidth = .5;
        ctx.fillRect(dr.x+1, dr.y + dr.h*0.65, dr.w-2, dr.h*0.3);
        ctx.strokeRect(dr.x+1, dr.y + dr.h*0.65, dr.w-2, dr.h*0.3);
        if (dr.w > 30) {
          ctx.fillStyle = '#222'; ctx.font = '7px system-ui'; ctx.textBaseline = 'top';
          ctx.save(); ctx.beginPath(); ctx.rect(dr.x, dr.y + dr.h*0.65, dr.w, dr.h*0.3); ctx.clip();
          ctx.fillText(ev.title || '', dr.x+3, dr.y + dr.h*0.67);
          ctx.restore();
        }
      } else {
        var dr2 = dR(yi, mi, di, W, H);
        if (dr2.w < 80 || dr2.h < 80) continue;
        var ssh = sd.getHours()*2 + (sd.getMinutes()>=30?1:0);
        var esh = ed.getHours()*2 + (ed.getMinutes()>=30?1:0);
        if (esh <= ssh) esh = ssh + 1;
        var slotH = dr2.h / CFG.slots;
        ctx.fillStyle = col; ctx.strokeStyle = bc; ctx.lineWidth = 1;
        ctx.fillRect(dr2.x+2, dr2.y + ssh*slotH, dr2.w-4, (esh-ssh)*slotH);
        ctx.strokeRect(dr2.x+2, dr2.y + ssh*slotH, dr2.w-4, (esh-ssh)*slotH);
        if (dr2.w > 60) {
          ctx.fillStyle = '#111'; ctx.font = '9px system-ui'; ctx.textBaseline = 'top';
          ctx.save(); ctx.beginPath();
          ctx.rect(dr2.x+2, dr2.y + ssh*slotH, dr2.w-4, (esh-ssh)*slotH); ctx.clip();
          ctx.fillText(ev.title || '', dr2.x+6, dr2.y + ssh*slotH + 3);
          ctx.restore();
        }
      }
    }
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 3 — Google Calendar Fetch ('14h' calendar)
     ───────────────────────────────────────────────────────── */
  var _calFetching = {};

  function fetchCalEvents(card) {
    var life = ensLife(card), cid = card.id;
    if (_calFetching[cid]) return;
    if (typeof ensureGoogleToken !== 'function') return;
    _calFetching[cid] = true;

    ensureGoogleToken().then(function(token) {
      if (!token) { _calFetching[cid] = false; return; }
      return fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(r){ return r.json(); }).then(function(data) {
        var cal14h = null;
        if (data.items) {
          for (var i = 0; i < data.items.length; i++) {
            if ((data.items[i].summary || '').toLowerCase() === '14h') {
              cal14h = data.items[i].id; break;
            }
          }
        }
        if (!cal14h) { _calFetching[cid] = false; return; }
        var tMin = new Date(CFG.startYear, 0, 1).toISOString();
        var tMax = new Date(CFG.endYear, 11, 31).toISOString();
        var url = 'https://www.googleapis.com/calendar/v3/calendars/' +
                  encodeURIComponent(cal14h) + '/events?maxResults=2500' +
                  '&singleEvents=true&orderBy=startTime&timeMin=' + tMin + '&timeMax=' + tMax;
        return fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
          .then(function(r){ return r.json(); })
          .then(function(evData) {
            var mapped = [];
            if (evData.items) {
              for (var j = 0; j < evData.items.length; j++) {
                var ev = evData.items[j];
                var s = ev.start && (ev.start.dateTime || ev.start.date);
                var e2 = ev.end && (ev.end.dateTime || ev.end.date);
                if (!s) continue;
                var ci = j % CFG.palette.length;
                mapped.push({
                  id: ev.id || ('gc'+j), title: ev.summary || '',
                  start: s, end: e2 || s,
                  color: CFG.palette[ci] + '44', bc: CFG.palette[ci] + 'aa',
                  source: 'gcal'
                });
              }
            }
            life.calEvents = mapped;
            life._calTS = Date.now();
            _calFetching[cid] = false;
            if (typeof sv === 'function') sv();
          });
      }).catch(function(err) {
        console.error('[Life GCal]', err);
        _calFetching[cid] = false;
      });
    });
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 2 — Hit-testing & Navigation
     ───────────────────────────────────────────────────────── */
  function pickCell(wx, wy, W, H, curLOD) {
    var cw = W / CFG.yCols, ch = H / CFG.yRows;
    var col = Math.floor(wx / cw), row = Math.floor(wy / ch);
    var i = row * CFG.yCols + col;
    if (i < 0 || i >= 50) return null;
    var y = CFG.startYear + i, yr = yR(i, W, H);
    if (curLOD === 'Y') return { type:'year', y:y, rect:yr, i:i };

    var mw = yr.w / CFG.mCols, mh = yr.h / CFG.mRows;
    var mc = Math.floor((wx - yr.x) / mw), mr2 = Math.floor((wy - yr.y) / mh);
    var m = clamp(mr2 * CFG.mCols + mc, 0, 11);
    var mRect = mR(i, m, W, H);
    if (curLOD === 'M') return { type:'month', y:y, m:m, rect:mRect, i:i };

    var dw = mRect.w / CFG.dCols, dh = mRect.h / CFG.dRows;
    var dc = Math.floor((wx - mRect.x) / dw), dr3 = Math.floor((wy - mRect.y) / dh);
    var d = clamp(dr3 * CFG.dCols + dc, 0, dim(y, m) - 1);
    var dRect = dR(i, m, d, W, H);
    if (curLOD === 'D') return { type:'day', y:y, m:m, d:d, rect:dRect, i:i };

    var sh = dRect.h / CFG.slots;
    var sl = clamp(Math.floor((wy - dRect.y) / sh), 0, CFG.slots - 1);
    return { type:'slot', y:y, m:m, d:d, sl:sl, rect:dRect, i:i };
  }

  /** Checks if (wx,wy) hits a manual overlay bar */
  function hitOverlay(wx, wy, ov, W) {
    if (!ov || !ov.length) return null;
    var T = totalDays();
    for (var j = ov.length - 1; j >= 0; j--) {
      var ev = ov[j];
      var sx = (d2i(ev.start) / T) * W, ex = (d2i(ev.end) / T) * W;
      var w = Math.max(ex - sx, 6), py = 8 + (ev._l || 0) * 26;
      if (wx >= sx && wx <= sx+w && wy >= py && wy <= py+22) return ev;
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 4 — Mini-map
     ───────────────────────────────────────────────────────── */
  function drawMinimap(ctx, cam, cvW, cvH, worldW, worldH, dpr) {
    var mmW = 140, mmH = 80, pad = 10;
    var mmX = cvW - mmW - pad, mmY = cvH - mmH - pad;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeRect(mmX, mmY, mmW, mmH);
    var scX = mmW / worldW, scY = mmH / worldH;
    for (var i = 0; i < 50; i++) {
      var r = yR(i, worldW, worldH);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(mmX + r.x*scX, mmY + r.y*scY, r.w*scX, r.h*scY);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = .5;
      ctx.strokeRect(mmX + r.x*scX, mmY + r.y*scY, r.w*scX, r.h*scY);
    }
    var vw = cvW / cam.z, vh = cvH / cam.z;
    ctx.strokeStyle = CFG.accent; ctx.lineWidth = 2;
    ctx.strokeRect(mmX + cam.x*scX, mmY + cam.y*scY, vw*scX, vh*scY);
  }

  /* ─────────────────────────────────────────────────────────
     BUILD — DOM + Render Loop + Interactions
     ───────────────────────────────────────────────────────── */
  function build(card) {
    ensLife(card);

    /* ── Container ── */
    var el = document.createElement('div');
    el.className = 'miro-card miro-life';
    el.dataset.cid = card.id;
    el.style.cssText = 'position:absolute;left:'+(card.x||0)+'px;top:'+(card.y||0)+
                        'px;width:'+(card.w||1200)+'px;height:'+(card.h||700)+'px;';

    /* Delete button */
    var del = document.createElement('button');
    del.className = 'mc-del'; del.textContent = '\u2715';
    del.onclick = function(e){ e.stopPropagation();
      if (typeof deleteMiroCard==='function') deleteMiroCard(card.id); };
    el.appendChild(del);

    /* Lock UI */
    if (typeof attachLockUI==='function') try { attachLockUI(el, card); } catch(e){}

    /* ── Header bar (Phase 2 breadcrumb) ── */
    var hdr = document.createElement('div');
    hdr.className = 'life-header'; el.appendChild(hdr);

    var crumb = document.createElement('div');
    crumb.className = 'life-crumb';
    crumb.textContent = '\uD83E\uDDEC Life \u2014 Years';
    hdr.appendChild(crumb);

    /* Sync button (Phase 3) */
    var syncBtn = document.createElement('button');
    syncBtn.className = 'life-sync';
    syncBtn.textContent = '\u21BB Sync';
    syncBtn.title = 'Fetch Google Calendar (14h)';
    syncBtn.onclick = function(e){ e.stopPropagation(); fetchCalEvents(card); };
    hdr.appendChild(syncBtn);

    /* ── Canvas ── */
    var cv = document.createElement('canvas');
    cv.className = 'life-canvas'; el.appendChild(cv);

    /* ── Tooltip (Phase 4) ── */
    var tooltip = document.createElement('div');
    tooltip.className = 'life-tooltip'; tooltip.style.display = 'none';
    el.appendChild(tooltip);

    /* ── Overlay Editor Panel (Phase 4) ── */
    var editorPanel = document.createElement('div');
    editorPanel.className = 'life-editor'; editorPanel.style.display = 'none';
    editorPanel.innerHTML =
      '<div class="le-title">Edit Overlay</div>' +
      '<input class="le-input" placeholder="Title" />' +
      '<div class="le-colors"></div>' +
      '<div class="le-actions">' +
        '<button class="le-save">\u2713 Save</button>' +
        '<button class="le-del">\uD83D\uDDD1 Delete</button>' +
        '<button class="le-close">\u2715</button>' +
      '</div>';
    el.appendChild(editorPanel);

    /* Populate colour swatches */
    var colorGrid = editorPanel.querySelector('.le-colors');
    var selColor = CFG.ovFill;
    CFG.palette.forEach(function(c) {
      var sw = document.createElement('div');
      sw.className = 'le-csw'; sw.style.background = c;
      sw.onclick = function(e) {
        e.stopPropagation(); selColor = c + '44';
        colorGrid.querySelectorAll('.le-csw').forEach(function(s){ s.classList.remove('sel'); });
        sw.classList.add('sel');
      };
      colorGrid.appendChild(sw);
    });

    var _editingOv = null;
    function openEditor(ov) {
      _editingOv = ov;
      editorPanel.style.display = 'block';
      editorPanel.querySelector('.le-input').value = ov.title || '';
      selColor = ov.color || CFG.ovFill;
    }
    function closeEditor() { editorPanel.style.display = 'none'; _editingOv = null; }

    editorPanel.querySelector('.le-close').onclick = function(e){ e.stopPropagation(); closeEditor(); };
    editorPanel.querySelector('.le-save').onclick = function(e){
      e.stopPropagation();
      if (!_editingOv) return;
      _editingOv.title = editorPanel.querySelector('.le-input').value;
      _editingOv.color = selColor;
      _editingOv.bc = selColor.replace(/44$/, 'aa');
      closeEditor();
      if (typeof sv==='function') sv();
    };
    editorPanel.querySelector('.le-del').onclick = function(e){
      e.stopPropagation();
      if (!_editingOv) return;
      var life = ensLife(card);
      life.ov = life.ov.filter(function(o){ return o !== _editingOv; });
      closeEditor();
      if (typeof sv==='function') sv();
      if (typeof buildOutline==='function') try { buildOutline(); } catch(e2){}
    };

    /* ── ResizeObserver for HiDPI canvas sizing ── */
    var _dpr = window.devicePixelRatio || 1;
    function rsz() {
      _dpr = window.devicePixelRatio || 1;
      var w = Math.max(1, el.clientWidth);
      var h = Math.max(1, el.clientHeight - 32);
      cv.width  = Math.max(1, Math.floor(w * _dpr));
      cv.height = Math.max(1, Math.floor(h * _dpr));
    }
    rsz();
    try { new ResizeObserver(rsz).observe(el); } catch(e){}

    /* Drag via header */
    if (typeof miroSetupCardDrag==='function')
      try { miroSetupCardDrag(hdr, card, ['.mc-del','.mc-lock','.life-sync']); } catch(e){}
    /* 8-way resize handles */
    if (typeof attach8WayResize==='function')
      try { attach8WayResize(el, card, 600, 350); } catch(e){}

    cv.oncontextmenu = function(e){ e.preventDefault(); };

    /* ── Interaction state ── */
    var ST = { dn:false, panning:false, moved:false, sx:0, sy:0, px:0, py:0 };
    function getWH() { return { W:Math.max(1,el.clientWidth), H:Math.max(1,el.clientHeight-32) }; }

    /* Mouse-down */
    cv.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      clampCam(cam, wh.W, wh.H);
      ST.moved = false;
      if (e.shiftKey && e.button === 0) {
        ST.dn = true; ST.sx = e.offsetX; ST.sy = e.offsetY;
        e.preventDefault(); return;
      }
      if (e.button === 2 || (e.altKey && e.button === 0)) {
        ST.panning = true; ST.px = e.offsetX; ST.py = e.offsetY;
        e.preventDefault(); return;
      }
    });

    /* Mouse-move */
    cv.addEventListener('mousemove', function(e) {
      /* Tooltip (Phase 4) */
      if (!ST.dn && !ST.panning) {
        var life = ensLife(card), cam = life.cam, wh = getWH();
        clampCam(cam, wh.W, wh.H);
        var wp = s2w(e.offsetX, e.offsetY, cam);
        var curLOD = lod(cam.z);
        var hit = pickCell(wp.x, wp.y, wh.W, wh.H, curLOD);
        if (hit) {
          var txt = '';
          if (hit.type==='year')  txt = ''+hit.y;
          else if (hit.type==='month') txt = MN[hit.m]+' '+hit.y;
          else if (hit.type==='day')   txt = (hit.d+1)+' '+MN[hit.m]+' '+hit.y;
          else if (hit.type==='slot') {
            var h = Math.floor(hit.sl/2);
            txt = (hit.d+1)+' '+MN[hit.m]+' '+hit.y+' '+h+':'+(hit.sl%2?'30':'00');
          }
          tooltip.textContent = txt;
          tooltip.style.display = 'block';
          tooltip.style.left = (e.offsetX + 14) + 'px';
          tooltip.style.top = (e.offsetY + 14 + 32) + 'px';
        } else { tooltip.style.display = 'none'; }
      }
      if (!ST.dn && !ST.panning) return;
      var dx = e.offsetX - (ST.panning ? ST.px : ST.sx);
      var dy = e.offsetY - (ST.panning ? ST.py : ST.sy);
      if (Math.abs(dx)>3 || Math.abs(dy)>3) ST.moved = true;
      if (ST.panning) {
        var life2 = ensLife(card), cam2 = life2.cam, wh2 = getWH();
        cam2.x -= dx / cam2.z; cam2.y -= dy / cam2.z;
        ST.px = e.offsetX; ST.py = e.offsetY;
        clampCam(cam2, wh2.W, wh2.H);
        e.preventDefault();
      }
    });

    /* Mouse-up */
    cv.addEventListener('mouseup', function(e) {
      e.stopPropagation();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      clampCam(cam, wh.W, wh.H);

      /* Finish overlay creation (Shift+drag) */
      if (ST.dn) {
        ST.dn = false;
        if (ST.moved) {
          var x1 = Math.min(ST.sx, e.offsetX), x2 = Math.max(ST.sx, e.offsetX);
          var w1 = s2w(x1, 0, cam).x, w2 = s2w(x2, 0, cam).x;
          var T = totalDays();
          var s = i2d(Math.floor((w1/wh.W)*T)).toISOString().slice(0,10);
          var en = i2d(Math.floor((w2/wh.W)*T)).toISOString().slice(0,10);
          var newOv = { id:'m_'+Date.now(), start:s, end:en, title:'', color:CFG.ovFill, bc:CFG.ovStroke };
          life.ov.push(newOv);
          layoutOverlays(life.ov);
          openEditor(newOv);
          if (typeof sv==='function') sv();
        }
        return;
      }
      /* Finish pan */
      if (ST.panning) { ST.panning = false; if (typeof sv==='function') sv(); return; }

      /* Single-click actions */
      if (!ST.moved && e.button === 0) {
        var wp = s2w(e.offsetX, e.offsetY, cam);
        layoutOverlays(life.ov);
        var ovHit = hitOverlay(wp.x, wp.y, life.ov, wh.W);
        if (ovHit && ovHit.source !== 'gcal') { openEditor(ovHit); return; }
        /* Navigation drill-down (Phase 2) */
        var curLOD = lod(cam.z);
        var hit = pickCell(wp.x, wp.y, wh.W, wh.H, curLOD);
        if (!hit) return;
        if (hit.type==='year')       zoomToRect(life, hit.rect, wh.W, wh.H, 1.6);
        else if (hit.type==='month') zoomToRect(life, hit.rect, wh.W, wh.H, 4.0);
        else if (hit.type==='day')   zoomToRect(life, hit.rect, wh.W, wh.H, 12.0);
        else if (hit.type==='slot')  life.sel = { y:hit.y, m:hit.m, d:hit.d, sl:hit.sl };
        if (typeof sv==='function') sv(false, true);
      }
    });

    cv.addEventListener('mouseleave', function(){ tooltip.style.display = 'none'; });

    /* Wheel zoom — cursor-anchored, internal camera (Phase 2) */
    cv.addEventListener('wheel', function(e) {
      e.stopPropagation(); e.preventDefault();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      clampCam(cam, wh.W, wh.H);
      var before = s2w(e.offsetX, e.offsetY, cam);
      cam.z *= (e.deltaY < 0 ? 1.14 : 0.88);
      cam.x = before.x - e.offsetX / cam.z;
      cam.y = before.y - e.offsetY / cam.z;
      clampCam(cam, wh.W, wh.H);
      if (typeof sv==='function') sv(false, true);
    }, { passive: false });

    /* Double-click = zoom out one level (Phase 2) */
    cv.addEventListener('dblclick', function(e) {
      e.stopPropagation(); e.preventDefault();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      var center = s2w(wh.W/2, wh.H/2, cam);
      if (cam.z > 6.5) cam.z = 4.0;
      else if (cam.z > 2.2) cam.z = 1.6;
      else if (cam.z > 0.9) cam.z = 0.5;
      else cam.z = 0.35;
      cam.x = center.x - (wh.W/2) / cam.z;
      cam.y = center.y - (wh.H/2) / cam.z;
      clampCam(cam, wh.W, wh.H);
      if (typeof sv==='function') sv(false, true);
    });

    /* Escape key = zoom out / close editor (Phase 2) */
    el.tabIndex = 0;
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.stopPropagation(); e.preventDefault();
        if (editorPanel.style.display !== 'none') { closeEditor(); return; }
        var life = ensLife(card), cam = life.cam, wh = getWH();
        if (cam.z > 6.5) cam.z = 4.0;
        else if (cam.z > 2.2) cam.z = 1.6;
        else if (cam.z > 0.9) cam.z = 0.5;
        else cam.z = 0.35;
        clampCam(cam, wh.W, wh.H);
        if (typeof sv==='function') sv(false, true);
      }
    });

    /* ── Touch support (Phase 4) — pinch zoom + single-finger pan ── */
    var _tDist = 0, _tZ = 1, _tPanning = false, _tPX = 0, _tPY = 0;
    cv.addEventListener('touchstart', function(e) {
      e.stopPropagation();
      var cam = ensLife(card).cam;
      if (e.touches.length === 2) {
        e.preventDefault();
        var t0 = e.touches[0], t1 = e.touches[1];
        _tDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        _tZ = cam.z;
      } else if (e.touches.length === 1) {
        _tPanning = true;
        _tPX = e.touches[0].clientX; _tPY = e.touches[0].clientY;
      }
    }, { passive: false });
    cv.addEventListener('touchmove', function(e) {
      e.stopPropagation();
      var cam = ensLife(card).cam, wh = getWH();
      if (e.touches.length === 2) {
        e.preventDefault();
        var t0 = e.touches[0], t1 = e.touches[1];
        var dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        cam.z = clamp(_tZ * (dist / _tDist), 0.35, 30);
        clampCam(cam, wh.W, wh.H);
      } else if (e.touches.length === 1 && _tPanning) {
        e.preventDefault();
        var dx = e.touches[0].clientX - _tPX, dy = e.touches[0].clientY - _tPY;
        cam.x -= dx / cam.z; cam.y -= dy / cam.z;
        _tPX = e.touches[0].clientX; _tPY = e.touches[0].clientY;
        clampCam(cam, wh.W, wh.H);
      }
    }, { passive: false });
    cv.addEventListener('touchend', function(e) {
      _tPanning = false;
      if (e.touches.length === 0 && typeof sv === 'function') sv();
    });

    /* ── Auto-fetch calendar on first build (Phase 3) ── */
    var life0 = ensLife(card);
    if (life0.calEvents.length === 0 || (Date.now() - life0._calTS) > 300000) {
      setTimeout(function(){ fetchCalEvents(card); }, 2000);
    }

    /* ─────────────────────────────────────────────────────────
       Render Loop (requestAnimationFrame)
       ───────────────────────────────────────────────────────── */
    var _destroyed = false;
    function draw() {
      if (_destroyed || !el.parentNode) { _destroyed = true; return; }
      var ctx = cv.getContext('2d');
      var wh = getWH(), W = wh.W, H = wh.H;
      var life = ensLife(card), cam = life.cam;
      clampCam(cam, W, H);

      /* Clear */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);

      /* World transform via internal camera */
      ctx.setTransform(_dpr*cam.z, 0, 0, _dpr*cam.z, -cam.x*cam.z*_dpr, -cam.y*cam.z*_dpr);

      /* Background */
      ctx.fillStyle = CFG.bg;
      ctx.fillRect(0, 0, W, H);

      /* LOD-based drawing */
      var level = lod(cam.z);
      if (level === 'Y')      { drawYears(ctx, W, H); }
      else if (level === 'M') { drawYears(ctx, W, H); drawMonths(ctx, W, H); }
      else if (level === 'D') { drawMonths(ctx, W, H); drawDays(ctx, W, H); }
      else                    { drawDays(ctx, W, H); drawHours(ctx, W, H); }

      /* Manual overlays */
      drawOverlays(ctx, life.ov, W);

      /* Google Calendar events (Phase 3) */
      drawCalEvents(ctx, life.calEvents, W, H, level);

      /* Breadcrumb text (Phase 2) */
      crumb.textContent = '\uD83E\uDDEC Life \u2014 ' + lodLabel(level);

      /* Mini-map (Phase 4) */
      drawMinimap(ctx, cam, W, H, W, H, _dpr);

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    return el;
  }

  /* ─────────────────────────────────────────────────────────
     Create Life Card (centered in current Miro viewport)
     ───────────────────────────────────────────────────────── */
  function createLife() {
    var pg = (typeof cp === 'function') ? cp() : null;
    if (!pg) { alert('Open a Miro page first'); return; }
    if (!pg.miroCards) pg.miroCards = [];
    var cv = document.getElementById('miro-canvas');
    var z = ((pg.zoom || 100) / 100);
    var cx = (cv.clientWidth / 2 - (pg.panX || 0)) / z;
    var cy = (cv.clientHeight / 2 - (pg.panY || 0)) / z;
    pg.miroCards.push({
      id: (typeof uid === 'function') ? uid() : ('life' + Date.now()),
      type: 'life',
      x: cx - 600, y: cy - 350, w: 1200, h: 700,
      life: { ov: [], cam: { z:1, x:0, y:0 }, calEvents: [], _calTS: 0, sel: null }
    });
    if (typeof pushUndo === 'function') pushUndo();
    if (typeof sv === 'function') sv();
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    try { if (typeof buildOutline === 'function') buildOutline(); } catch(e){}
  }

  /* ─────────────────────────────────────────────────────────
     Init — wire toolbar button & keyboard shortcut
     ───────────────────────────────────────────────────────── */
  function init() {
    var b = document.getElementById('mtb-life');
    if (b) b.addEventListener('click', createLife);

    document.addEventListener('keydown', function(e) {
      if (e.key === '6' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        var tag = ((document.activeElement || {}).tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' ||
            (document.activeElement && document.activeElement.isContentEditable)) return;
        e.preventDefault();
        createLife();
      }
    });

    /* Expose for miro-core.js type-switch */
    window.buildMiroLifeWidget = build;
    window.createLifeWidget = createLife;
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
