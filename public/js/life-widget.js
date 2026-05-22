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
    grid1:   'rgba(0,0,0,0.22)',      // year grid
    grid2:   'rgba(0,0,0,0.18)',      // month grid
    grid3:   'rgba(0,0,0,0.15)',      // day grid
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
  function getWeekNumber(d) {
    var date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    var week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }
  function parseLocalDate(str) {
    if (!str) return new Date();
    if (str.length === 10) {
      var parts = str.split('-');
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(str);
  }
  function toLocalYYYYMMDD(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var date = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + date;
  }
  function getEventDates(ev) {
    var startD = parseLocalDate(ev.start);
    var endD = parseLocalDate(ev.end || ev.start);
    // If it's a date-only (all day) event, subtract 1 day from end date to make it inclusive
    if (ev.start && ev.start.indexOf('T') === -1 && ev.end && ev.end.indexOf('T') === -1) {
      endD = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate() - 1);
    }
    return { start: startD, end: endD };
  }

  function parseGCalDescription(desc) {
    if (!desc) return { description: '', color: null };
    var marker = '\n\n---\ncolor:';
    var idx = desc.lastIndexOf(marker);
    if (idx !== -1) {
      var colorStr = desc.substring(idx + marker.length).trim();
      var actualDesc = desc.substring(0, idx).trim();
      return { description: actualDesc, color: colorStr };
    }
    return { description: desc, color: null };
  }

  function addOneDay(dateStr) {
    var d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + 1);
    return toLocalYYYYMMDD(d);
  }

  function toGCalDateTimeString(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var date = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + date + 'T' + h + ':' + min + ':00';
  }

  function zoomToLevel(life, level, W, H) {
    var cam = life.cam;
    var targetZ = 1.0;
    if (level === 'Y') targetZ = 1.0;
    else if (level === 'M') targetZ = 2.0;
    else if (level === 'W') targetZ = 4.0;
    else if (level === 'D') targetZ = 8.0;
    else if (level === 'H') targetZ = 14.0;

    var cx = cam.x + (W / 2) / cam.z;
    var cy = cam.y + (H / 2) / cam.z;

    if (level === 'Y' || level === 'M') {
      life._monthFocus = null;
    } else if ((level === 'H' || level === 'D' || level === 'W') && !life._monthFocus) {
      var cell = pickCell(cx, cy, W, H, 'M');
      if (cell && cell.type === 'month') {
        life._monthFocus = { y: cell.y, m: cell.m, half: 0 };
      } else {
        var n = nowInfo();
        life._monthFocus = { y: n.y, m: n.m, half: 0 };
      }
    }

    if (level === 'H' && life._monthFocus) {
      var yi = life._monthFocus.y - CFG.startYear;
      var mRect = mR(yi, life._monthFocus.m, W, H);
      var targetZ = Math.min(W / mRect.w, H / mRect.h);
      zoomToRectInstant(life, mRect, W, H, targetZ);
      return;
    }

    var tx = cx - (W / 2) / targetZ;
    var ty = cy - (H / 2) / targetZ;

    animateCam(life, tx, ty, targetZ, W, H, function() {
      if (typeof sv === 'function') sv();
    });
  }

  function flyToToday(life, W, H) {
    var n = nowInfo();
    var yi = n.y - CFG.startYear;
    if (yi < 0 || yi >= 50) return;
    var rect = mR(yi, n.m, W, H);
    life._monthFocus = { y: n.y, m: n.m, half: (n.d > 14 ? 1 : 0) };
    var targetZ = Math.min(W / rect.w, H / rect.h);
    zoomToRectInstant(life, rect, W, H, targetZ);
  }

  function getEventDuration(ev) {
    var dates = getEventDates(ev);
    return dates.end.getTime() - dates.start.getTime();
  }

  function getCellDateRange(cell) {
    if (!cell) return null;
    var startD, endD;
    if (cell.type === 'year') {
      startD = new Date(cell.y, 0, 1, 0, 0, 0, 0);
      endD = new Date(cell.y, 11, 31, 23, 59, 59, 999);
    } else if (cell.type === 'month') {
      startD = new Date(cell.y, cell.m, 1, 0, 0, 0, 0);
      endD = new Date(cell.y, cell.m, dim(cell.y, cell.m), 23, 59, 59, 999);
    } else if (cell.type === 'week') {
      startD = new Date(cell.y, cell.m, cell.wRow * 7 + 1, 0, 0, 0, 0);
      endD = new Date(cell.y, cell.m, Math.min(dim(cell.y, cell.m), (cell.wRow + 1) * 7), 23, 59, 59, 999);
    } else if (cell.type === 'day') {
      startD = new Date(cell.y, cell.m, cell.d + 1, 0, 0, 0, 0);
      endD = new Date(cell.y, cell.m, cell.d + 1, 23, 59, 59, 999);
    } else if (cell.type === 'slot') {
      var sh = Math.floor(cell.sl / 2);
      var sm = (cell.sl % 2) * 30;
      startD = new Date(cell.y, cell.m, cell.d + 1, sh, sm, 0, 0);
      endD = new Date(cell.y, cell.m, cell.d + 1, sh, sm + 29, 59, 999);
    }
    return { start: startD, end: endD };
  }

  /* ── Frustum Visible Helper ── */
  function isRectVisible(r, cam, W, H) {
    var vw = W / cam.z, vh = H / cam.z;
    return !(r.x + r.w <= cam.x || r.x >= cam.x + vw || r.y + r.h <= cam.y || r.y >= cam.y + vh);
  }

  /* ── LOD — thresholds based on INTERNAL camera zoom (not Miro page zoom) ── */
  function lod(z) {
    if (z <= 1.2)  return 'Y';
    if (z <= 2.5)  return 'M';
    if (z <= 5.0)  return 'W';
    if (z <= 11.0) return 'D';
    return 'H';
  }
  function lodLabel(l) {
    return l==='Y' ? 'Years' : l==='M' ? 'Months' : l==='W' ? 'Weeks' : l==='D' ? 'Days' : 'Zooper';
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
    if (typeof L._monthFocus === 'undefined') L._monthFocus = null;
    return L;
  }
  function clampCam(cam, W, H) {
    cam.z = clamp(cam.z, 0.35, 120);
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
    animateCam(life, tx, ty, targetZ, W, H, function() {
      if (typeof sv === 'function') sv();
    });
  }

  function zoomToRectInstant(life, rect, W, H, targetZ) {
    var cam = life.cam;
    var vw = W / targetZ, vh = H / targetZ;
    var tx = rect.x + rect.w/2 - vw/2;
    var ty = rect.y + rect.h/2 - vh/2;
    tx = clamp(tx, 0, Math.max(0, W - vw));
    ty = clamp(ty, 0, Math.max(0, H - vh));
    cam.z = targetZ; cam.x = tx; cam.y = ty;
    clampCam(cam, W, H);
    if (typeof sv === 'function') sv();
  }

  /* ─────────────────────────────────────────────────────────
     PHASE 1 — Drawing Functions (Light Theme)
     ───────────────────────────────────────────────────────── */
  function drawYears(ctx, W, H, cam) {
    var n = nowInfo();
    for (var i = 0; i < 50; i++) {
      var r = yR(i, W, H), y = CFG.startYear + i;
      if (!isRectVisible(r, cam, W, H)) continue;
      ctx.strokeStyle = CFG.grid1; ctx.lineWidth = 1 / cam.z;
      ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
      if (y === n.y) {
        ctx.strokeStyle = CFG.accent; ctx.lineWidth = 1.8 / cam.z;
        ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
      }
      var fs = Math.min(14 / cam.z, r.h * 0.18);
      ctx.font = 'bold ' + fs + 'px system-ui';
      ctx.textBaseline = 'top';
      ctx.fillStyle = (y === n.y) ? 'rgba(0, 184, 148, 0.8)' : 'rgba(20, 25, 40, 0.35)';
      ctx.fillText(''+y, r.x + 8 / cam.z, r.y + 6 / cam.z);
    }
  }

  function drawMonths(ctx, W, H, cam) {
    var n = nowInfo();
    for (var i = 0; i < 50; i++) {
      var yr = yR(i, W, H), y = CFG.startYear + i;
      if (!isRectVisible(yr, cam, W, H)) continue;
      ctx.strokeStyle = CFG.grid1; ctx.lineWidth = 1.5 / cam.z;
      ctx.strokeRect(yr.x+.5, yr.y+.5, yr.w-1, yr.h-1);
      
      // Draw Year watermark in the background centered
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var yrFs = Math.min(48 / cam.z, yr.h * 0.25);
      ctx.font = 'bold ' + yrFs + 'px system-ui';
      ctx.fillStyle = (y === n.y) ? 'rgba(0, 184, 148, 0.04)' : 'rgba(20, 25, 40, 0.025)';
      ctx.fillText(''+y, yr.x + yr.w / 2, yr.y + yr.h / 2);
      ctx.restore();

      for (var m = 0; m < 12; m++) {
        var mr = mR(i, m, W, H);
        if (!isRectVisible(mr, cam, W, H)) continue;
        ctx.strokeStyle = CFG.grid2; ctx.lineWidth = .7 / cam.z;
        ctx.strokeRect(mr.x+.5, mr.y+.5, mr.w-1, mr.h-1);
        if (y===n.y && m===n.m) {
          ctx.strokeStyle = CFG.accent; ctx.lineWidth = 1.5 / cam.z;
          ctx.strokeRect(mr.x+.5, mr.y+.5, mr.w-1, mr.h-1);
        }
        
        // Draw Month watermark in the background centered
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var mFs = Math.min(20 / cam.z, mr.h * 0.25);
        ctx.font = 'bold ' + mFs + 'px system-ui';
        ctx.fillStyle = (y===n.y && m===n.m) ? 'rgba(0, 184, 148, 0.08)' : 'rgba(20, 25, 40, 0.05)';
        ctx.fillText(MN[m], mr.x + mr.w / 2, mr.y + mr.h / 2);
        ctx.restore();
      }
    }
  }

  function drawWeeks(ctx, W, H, cam) {
    var n = nowInfo();
    for (var i = 0; i < 50; i++) {
      var yr = yR(i, W, H), y = CFG.startYear + i;
      if (!isRectVisible(yr, cam, W, H)) continue;
      ctx.strokeStyle = CFG.grid1; ctx.lineWidth = 1.5;
      ctx.strokeRect(yr.x+.5, yr.y+.5, yr.w-1, yr.h-1);
      
      // Year watermark
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var yrFs = Math.min(48 / cam.z, yr.h * 0.25);
      ctx.font = 'bold ' + yrFs + 'px system-ui';
      ctx.fillStyle = (y === n.y) ? 'rgba(0, 184, 148, 0.04)' : 'rgba(20, 25, 40, 0.025)';
      ctx.fillText(''+y, yr.x + yr.w / 2, yr.y + yr.h / 2);
      ctx.restore();

      for (var m = 0; m < 12; m++) {
        var mr = mR(i, m, W, H);
        if (!isRectVisible(mr, cam, W, H)) continue;
        ctx.strokeStyle = CFG.grid2; ctx.lineWidth = .7;
        ctx.strokeRect(mr.x+.5, mr.y+.5, mr.w-1, mr.h-1);
        
        // Month watermark
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var mFs = Math.min(20 / cam.z, mr.h * 0.25);
        ctx.font = 'bold ' + mFs + 'px system-ui';
        ctx.fillStyle = (y===n.y && m===n.m) ? 'rgba(0, 184, 148, 0.08)' : 'rgba(20, 25, 40, 0.05)';
        ctx.fillText(MN[m], mr.x + mr.w / 2, mr.y + mr.h / 2);
        ctx.restore();

        var rh = mr.h / CFG.dRows; // 5 rows
        for (var r = 0; r < CFG.dRows; r++) {
          var ry = mr.y + r * rh;
          ctx.strokeStyle = CFG.grid3; ctx.lineWidth = .5;
          ctx.beginPath();
          ctx.moveTo(mr.x, ry);
          ctx.lineTo(mr.x + mr.w, ry);
          ctx.stroke();

          // Calculate week number for this week row
          var dVal = r * 7 + 1;
          var ds = dim(y, m);
          if (dVal > ds) dVal = ds;
          var date = new Date(y, m, dVal);
          var wkNum = getWeekNumber(date);

          // Highlight current week if it matches today's week in this month
          var isTodayWeek = false;
          var today = new Date();
          if (today.getFullYear() === y && today.getMonth() === m) {
            var tDay = today.getDate();
            var tRow = Math.floor((tDay - 1) / 7);
            if (tRow === r) {
              isTodayWeek = true;
            }
          }

          if (isTodayWeek) {
            ctx.strokeStyle = CFG.accent; ctx.lineWidth = 1.2;
            ctx.strokeRect(mr.x+.5, ry+.5, mr.w-1, rh-1);
          }

          var screenMrW = mr.w * cam.z;
          var screenRh = rh * cam.z;
          if (screenMrW > 25 && screenRh > 10) {
            var wkFs = Math.min(8 / cam.z, rh * 0.6);
            ctx.font = wkFs + 'px system-ui';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isTodayWeek ? CFG.accent : 'rgba(20, 25, 40, 0.35)';
            ctx.fillText('Wk ' + wkNum, mr.x + 3 / cam.z, ry + 2 / cam.z);
          }
        }
      }
    }
  }

  function drawDays(ctx, W, H, cam) {
    var n = nowInfo(), td = new Date(n.y, n.m, n.d).getTime();
    ctx.textBaseline = 'top';
    for (var i = 0; i < 50; i++) {
      var yr = yR(i, W, H);
      if (!isRectVisible(yr, cam, W, H)) continue;
      var y = CFG.startYear + i;
      for (var m = 0; m < 12; m++) {
        var mr = mR(i, m, W, H);
        if (!isRectVisible(mr, cam, W, H)) continue;
        var ds = dim(y, m);
        for (var d = 0; d < ds; d++) {
          var r = dR(i, m, d, W, H);
          if (!isRectVisible(r, cam, W, H)) continue;
          ctx.strokeStyle = CFG.grid3; ctx.lineWidth = .6 / cam.z;
          ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
          if (new Date(y, m, d+1).getTime() === td) {
            ctx.strokeStyle = CFG.accent; ctx.lineWidth = 1.5 / cam.z;
            ctx.strokeRect(r.x+.5, r.y+.5, r.w-1, r.h-1);
          }
          var screenW = r.w * cam.z;
          var screenH = r.h * cam.z;
          if (screenW > 18 && screenH > 14) {
            var dayFs = Math.min(9 / cam.z, r.h * 0.5);
            ctx.font = dayFs + 'px system-ui';
            ctx.fillStyle = (new Date(y, m, d+1).getTime() === td) ? CFG.accent : 'rgba(20, 25, 40, 0.4)';
            ctx.fillText(''+(d+1), r.x + 3 / cam.z, r.y + 2 / cam.z);
          }
        }
      }
    }
  }

  function drawHours(ctx, W, H, cam) {
    var n = nowInfo();
    for (var i = 0; i < 50; i++) {
      var yr = yR(i, W, H);
      if (!isRectVisible(yr, cam, W, H)) continue;
      var y = CFG.startYear + i;
      for (var m = 0; m < 12; m++) {
        var mr = mR(i, m, W, H);
        if (!isRectVisible(mr, cam, W, H)) continue;
        var ds = dim(y, m);
        for (var d = 0; d < ds; d++) {
          var r = dR(i, m, d, W, H);
          if (!isRectVisible(r, cam, W, H)) continue;
          var screenW = r.w * cam.z;
          var screenH = r.h * cam.z;
          if (screenW < 80 || screenH < 80) continue;
          var isToday = (y===n.y && m===n.m && d+1===n.d);
          var sh = r.h / CFG.slots, eh = r.h / CFG.sects;
          for (var s = 0; s < CFG.sects; s++) {
            ctx.strokeStyle = CFG.grid2; ctx.lineWidth = 1;
            ctx.strokeRect(r.x, r.y + s*eh, r.w, eh);
            
            var hrFs = Math.min(8 / cam.z, eh * 0.5);
            ctx.font = hrFs + 'px system-ui';
            ctx.fillStyle = 'rgba(20, 25, 40, 0.35)';
            ctx.textBaseline = 'top';
            ctx.fillText((s*4)+':00', r.x + 3 / cam.z, r.y + s*eh + 2 / cam.z);
          }
          for (var sl = 0; sl < CFG.slots; sl++) {
            var sy = r.y + sl * sh;
            if (isToday && sl === n.sl) { ctx.fillStyle = CFG.hi3; ctx.fillRect(r.x, sy, r.w, sh); }
            ctx.strokeStyle = CFG.grid3; ctx.lineWidth = .3;
            ctx.beginPath(); ctx.moveTo(r.x, sy); ctx.lineTo(r.x + r.w, sy); ctx.stroke();
          }
          ctx.strokeStyle = isToday ? CFG.accent : CFG.grid1; ctx.lineWidth = isToday ? 2 : 1;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          
          var titleFs = Math.min(10 / cam.z, sh * 1.5);
          ctx.font = 'bold ' + titleFs + 'px system-ui';
          ctx.fillStyle = isToday ? CFG.accent : 'rgba(20, 25, 40, 0.5)';
          ctx.textBaseline = 'bottom';
          ctx.fillText((d+1)+' '+MN[m]+' '+y, r.x + 4 / cam.z, r.y - 3 / cam.z);
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

  function drawOverlays(ctx, ov, W, cam) {
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
      ctx.lineWidth = Math.max(0.5, 1 / cam.z);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sx, py, w, 22, 4);
      else ctx.rect(sx, py, w, 22);
      ctx.fill(); ctx.stroke();
      var minW = 36 / cam.z;
      if (w > minW) {
        var ovFs = Math.min(10 / cam.z, 14);
        var padX = 6 / cam.z;
        ctx.fillStyle = '#1a1a1a'; ctx.font = ovFs + 'px system-ui'; ctx.textBaseline = 'middle';
        ctx.save(); ctx.beginPath(); ctx.rect(sx, py, w, 22); ctx.clip();
        ctx.fillText(ev.title || '', sx + padX, py + 11);
        ctx.restore();
      }
    }
  }

  function getCoveredCells(startD, endD, level, W, H) {
    var cells = [];
    var sTime = startD.getTime(), eTime = endD.getTime();
    
    if (level === 'Y') {
      for (var i = 0; i < 50; i++) {
        var y = CFG.startYear + i;
        var sCell = new Date(y, 0, 1, 0, 0, 0, 0).getTime();
        var eCell = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
        if (sCell <= eTime && eCell >= sTime) {
          var yrRect = yR(i, W, H);
          yrRect.yIndex = i;
          cells.push(yrRect);
        }
      }
    } else if (level === 'M') {
      for (var i = 0; i < 50; i++) {
        var y = CFG.startYear + i;
        for (var m = 0; m < 12; m++) {
          var sCell = new Date(y, m, 1, 0, 0, 0, 0).getTime();
          var eCell = new Date(y, m, dim(y, m), 23, 59, 59, 999).getTime();
          if (sCell <= eTime && eCell >= sTime) {
            cells.push(mR(i, m, W, H));
          }
        }
      }
    } else if (level === 'W') {
      for (var i = 0; i < 50; i++) {
        var y = CFG.startYear + i;
        for (var m = 0; m < 12; m++) {
          for (var r = 0; r < CFG.dRows; r++) {
            var sCell = new Date(y, m, r * 7 + 1, 0, 0, 0, 0).getTime();
            var eCell = new Date(y, m, Math.min(dim(y, m), (r + 1) * 7), 23, 59, 59, 999).getTime();
            if (sCell <= eTime && eCell >= sTime) {
              var mr = mR(i, m, W, H);
              var rh = mr.h / CFG.dRows;
              cells.push({ x: mr.x, y: mr.y + r * rh, w: mr.w, h: rh });
            }
          }
        }
      }
    } else if (level === 'D') {
      for (var i = 0; i < 50; i++) {
        var y = CFG.startYear + i;
        for (var m = 0; m < 12; m++) {
          var ds = dim(y, m);
          for (var d = 0; d < ds; d++) {
            var sCell = new Date(y, m, d + 1, 0, 0, 0, 0).getTime();
            var eCell = new Date(y, m, d + 1, 23, 59, 59, 999).getTime();
            if (sCell <= eTime && eCell >= sTime) {
              cells.push(dR(i, m, d, W, H));
            }
          }
        }
      }
    } else if (level === 'H') {
      for (var i = 0; i < 50; i++) {
        var y = CFG.startYear + i;
        for (var m = 0; m < 12; m++) {
          var ds = dim(y, m);
          for (var d = 0; d < ds; d++) {
            var r = dR(i, m, d, W, H);
            if (r.w < 80 || r.h < 80) continue;
            var slotH = r.h / CFG.slots;
            for (var sl = 0; sl < CFG.slots; sl++) {
              var sh = Math.floor(sl / 2);
              var sm = (sl % 2) * 30;
              var sCell = new Date(y, m, d + 1, sh, sm, 0, 0).getTime();
              var eCell = new Date(y, m, d + 1, sh, sm + 29, 59, 999).getTime();
              if (sCell <= eTime && eCell >= sTime) {
                cells.push({ x: r.x, y: r.y + sl * slotH, w: r.w, h: slotH });
              }
            }
          }
        }
      }
    }
    return cells;
  }

  function drawStickyNote(ctx, x, y, w, h, ev, color, strokeColor, cam) {
    ctx.save();
    
    ctx.fillStyle = color;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5 / cam.z;
    
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x + 2 / cam.z, y + 2 / cam.z, w - 4 / cam.z, h - 4 / cam.z, 4 / cam.z);
    } else {
      ctx.rect(x + 2 / cam.z, y + 2 / cam.z, w - 4 / cam.z, h - 4 / cam.z);
    }
    ctx.fill();
    ctx.stroke();
    
    var title = ev.title || '';
    if (title) {
      var maxW = w - 8 / cam.z;
      var maxH = h - 8 / cam.z;
      if (maxW > 10 / cam.z && maxH > 8 / cam.z) {
        ctx.fillStyle = '#1e272e';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        
        var maxFsScreen = 12;
        var minFsScreen = 6;
        var targetFsScreen = Math.min(maxFsScreen, Math.max(minFsScreen, Math.floor(h * cam.z * 0.4)));
        var fontSize = targetFsScreen / cam.z;
        var words = title.split(' ');
        var lines = [];
        
        while (fontSize * cam.z >= minFsScreen) {
          ctx.font = 'bold ' + fontSize + 'px system-ui, -apple-system, sans-serif';
          lines = [];
          var currentLine = words[0];
          
          for (var i = 1; i < words.length; i++) {
            var word = words[i];
            var width = ctx.measureText(currentLine + ' ' + word).width;
            if (width < maxW) {
              currentLine += ' ' + word;
            } else {
              lines.push(currentLine);
              currentLine = word;
            }
          }
          lines.push(currentLine);
          
          var totalHeight = lines.length * (fontSize * 1.2);
          if (totalHeight <= maxH) {
            break;
          }
          fontSize -= 1 / cam.z;
        }
        
        ctx.font = 'bold ' + fontSize + 'px system-ui, -apple-system, sans-serif';
        var totalHeight = lines.length * (fontSize * 1.2);
        var startY = y + h/2 - totalHeight/2 + (fontSize * 0.6);
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4 / cam.z, y + 4 / cam.z, w - 8 / cam.z, h - 8 / cam.z);
        ctx.clip();
        
        for (var l = 0; l < lines.length; l++) {
          ctx.fillText(lines[l], x + w/2, startY + l * (fontSize * 1.2));
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawCalEventsAsStickyNotes(ctx, events, W, H, level, cam) {
    if (!events || !events.length) return;
    if (level === 'H') return;
    
    var sorted = events.slice().sort(function(a, b) {
      var durA = getEventDuration(a);
      var durB = getEventDuration(b);
      if (durA !== durB) return durB - durA;
      return d2i(a.start) - d2i(b.start);
    });
    
    var yearEventsMap = {};
    var sortedEventCells = [];
    
    for (var i = 0; i < sorted.length; i++) {
      var ev = sorted[i];
      if (!ev.start) continue;
      var dates = getEventDates(ev);
      var cells = getCoveredCells(dates.start, dates.end, level, W, H);
      sortedEventCells.push({ ev: ev, cells: cells });
      
      if (level === 'Y') {
        for (var j = 0; j < cells.length; j++) {
          var yIdx = cells[j].yIndex;
          if (yIdx !== undefined) {
            if (!yearEventsMap[yIdx]) yearEventsMap[yIdx] = [];
            yearEventsMap[yIdx].push(ev);
          }
        }
      }
    }
    
    for (var i = 0; i < sortedEventCells.length; i++) {
      var item = sortedEventCells[i];
      var ev = item.ev;
      var cells = item.cells;
      if (cells.length === 0) continue;
      
      if (level === 'Y') {
        var adjustedCells = [];
        for (var j = 0; j < cells.length; j++) {
          var c = cells[j];
          var yIdx = c.yIndex;
          if (yIdx !== undefined && yearEventsMap[yIdx]) {
            var sharing = yearEventsMap[yIdx];
            var n = sharing.length;
            var idx = sharing.indexOf(ev);
            if (n > 1 && idx !== -1) {
              var newH = c.h / n;
              var newY = c.y + idx * newH;
              adjustedCells.push({
                x: c.x,
                y: newY,
                w: c.w,
                h: newH,
                yIndex: yIdx
              });
              continue;
            }
          }
          adjustedCells.push(c);
        }
        cells = adjustedCells;
      }
      
      var rows = {};
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var yKey = c.y.toFixed(1);
        if (!rows[yKey]) rows[yKey] = [];
        rows[yKey].push(c);
      }
      
      var color = ev.color || 'rgba(52, 152, 219, 0.4)';
      var strokeColor = ev.bc || 'rgba(52, 152, 219, 0.9)';
      
      var keys = Object.keys(rows);
      for (var k = 0; k < keys.length; k++) {
        var rowCells = rows[keys[k]];
        rowCells.sort(function(a, b) { return a.x - b.x; });
        
        var startCell = rowCells[0];
        var lastCell = rowCells[0];
        
        for (var j = 1; j < rowCells.length; j++) {
          var c = rowCells[j];
          if (c.x - (lastCell.x + lastCell.w) < 5) {
            lastCell = c;
          } else {
            drawStickyNote(ctx, startCell.x, startCell.y, (lastCell.x + lastCell.w) - startCell.x, startCell.h, ev, color, strokeColor, cam);
            startCell = c;
            lastCell = c;
          }
        }
        drawStickyNote(ctx, startCell.x, startCell.y, (lastCell.x + lastCell.w) - startCell.x, startCell.h, ev, color, strokeColor, cam);
      }
    }
  }

  /* ── Phase 3 — Google Calendar Event Drawing ── */
  function drawCalEvents(ctx, events, W, H, curLOD) {
    if (!events || !events.length) return;
    var sorted = events.slice().sort(function(a, b) {
      var durA = getEventDuration(a);
      var durB = getEventDuration(b);
      if (durA !== durB) return durB - durA;
      return d2i(a.start) - d2i(b.start);
    });
    for (var i = 0; i < sorted.length; i++) {
      var ev = sorted[i];
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

  function hitCalEvent(wx, wy, events, W, H, level) {
    if (!events || !events.length) return null;
    if (level === 'H') return null;
    
    for (var i = events.length - 1; i >= 0; i--) {
      var ev = events[i];
      if (!ev.start) continue;
      var dates = getEventDates(ev);
      var cells = getCoveredCells(dates.start, dates.end, level, W, H);
      
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) {
          return ev;
        }
      }
    }
    return null;
  }

  function create14hEvent(card, title, description, color, startStr, endStr, isDateTime) {
    var life = ensLife(card);
    if (typeof ensureGoogleToken !== 'function') return Promise.reject('No token function');
    
    return ensureGoogleToken().then(function(token) {
      if (!token) throw new Error('No Google token');
      
      var p = life.cal14hId ? Promise.resolve(life.cal14hId) : 
        fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
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
          if (cal14h) {
            life.cal14hId = cal14h;
            return cal14h;
          }
          
          return fetch('https://www.googleapis.com/calendar/v3/calendars', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ summary: '14h' })
          }).then(function(r) {
            if (!r.ok) throw new Error('Could not find or create "14h" calendar.');
            return r.json();
          }).then(function(newCal) {
            life.cal14hId = newCal.id;
            return newCal.id;
          });
        });
        
      return p.then(function(calId) {
        var finalDescription = (description || '') + '\n\n---\ncolor: ' + color;
        var endStrForGCal = isDateTime ? endStr : addOneDay(endStr);
        
        var body = {
          summary: title || '(No Title)',
          description: finalDescription,
          start: isDateTime ? { dateTime: startStr, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { date: startStr },
          end: isDateTime ? { dateTime: endStr, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { date: endStrForGCal }
        };
        
        return fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calId) + '/events', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }).then(function(r) {
          if (!r.ok) throw new Error('Failed to create event');
          return r.json();
        }).then(function() {
          fetchCalEvents(card);
        });
      });
    });
  }

  function edit14hEvent(card, eventId, title, description, color, startStr, endStr, isDateTime) {
    var life = ensLife(card);
    if (!life.cal14hId) return Promise.reject('No calendar ID');
    if (typeof ensureGoogleToken !== 'function') return Promise.reject('No token function');
    
    return ensureGoogleToken().then(function(token) {
      if (!token) throw new Error('No Google token');
      
      var finalDescription = (description || '') + '\n\n---\ncolor: ' + color;
      var endStrForGCal = isDateTime ? endStr : addOneDay(endStr);
      
      var body = {
        summary: title || '(No Title)',
        description: finalDescription,
        start: isDateTime ? { dateTime: startStr, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { date: startStr },
        end: isDateTime ? { dateTime: endStr, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { date: endStrForGCal }
      };
      
      return fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(life.cal14hId) + '/events/' + encodeURIComponent(eventId), {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }).then(function(r) {
        if (!r.ok) throw new Error('Failed to edit event');
        return r.json();
      }).then(function() {
        fetchCalEvents(card);
      });
    });
  }

  function delete14hEvent(card, eventId) {
    var life = ensLife(card);
    if (!life.cal14hId) return Promise.reject('No calendar ID');
    if (typeof ensureGoogleToken !== 'function') return Promise.reject('No token function');
    
    return ensureGoogleToken().then(function(token) {
      if (!token) throw new Error('No Google token');
      
      return fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(life.cal14hId) + '/events/' + encodeURIComponent(eventId), {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      }).then(function(r) {
        if (!r.ok && r.status !== 410) throw new Error('Failed to delete event');
        fetchCalEvents(card);
      });
    });
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
        life.cal14hId = cal14h; // Store it
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
                
                var parsed = parseGCalDescription(ev.description || '');
                var color = parsed.color || CFG.palette[j % CFG.palette.length];
                
                var fillCol = color;
                var strokeCol = color;
                if (color.startsWith('#') && color.length === 7) {
                  fillCol = color + '44';
                  strokeCol = color + 'aa';
                } else if (color.startsWith('#') && color.length === 9) {
                  fillCol = color;
                  strokeCol = color.slice(0, 7) + 'aa';
                }
                
                mapped.push({
                  id: ev.id || ('gc'+j),
                  title: ev.summary || '',
                  description: parsed.description,
                  start: s,
                  end: e2 || s,
                  color: fillCol,
                  bc: strokeCol,
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

    if (curLOD === 'W') {
      var wRow = clamp(Math.floor((wy - mRect.y) / (mRect.h / CFG.dRows)), 0, CFG.dRows - 1);
      var wRect = { x: mRect.x, y: mRect.y + wRow * (mRect.h / CFG.dRows), w: mRect.w, h: mRect.h / CFG.dRows };
      return { type: 'week', y: y, m: m, wRow: wRow, rect: wRect, i: i };
    }

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

    // Glassy background with shadow & rounded corners
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(mmX, mmY, mmW, mmH, 8);
    } else {
      ctx.rect(mmX, mmY, mmW, mmH);
    }
    ctx.fill();
    ctx.shadowColor = 'transparent'; // reset shadow
    ctx.stroke();

    var scX = mmW / worldW, scY = mmH / worldH;
    for (var i = 0; i < 50; i++) {
      var r = yR(i, worldW, worldH);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(mmX + r.x*scX, mmY + r.y*scY, r.w*scX, r.h*scY);
      ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = .5;
      ctx.strokeRect(mmX + r.x*scX, mmY + r.y*scY, r.w*scX, r.h*scY);
    }

    // Viewport bounds
    var vw = cvW / cam.z, vh = cvH / cam.z;
    var vX = mmX + cam.x*scX;
    var vY = mmY + cam.y*scY;
    var vW = vw*scX;
    var vH = vh*scY;

    // Viewport fill (light accent shade)
    ctx.fillStyle = 'rgba(0, 184, 148, 0.08)';
    ctx.fillRect(vX, vY, vW, vH);

    // Viewport border
    ctx.strokeStyle = CFG.accent; ctx.lineWidth = 1.5;
    ctx.strokeRect(vX, vY, vW, vH);
  }

  /* ─────────────────────────────────────────────────────────
     BUILD — DOM + Render Loop + Interactions
     ───────────────────────────────────────────────────────── */
  function build(card) {
    var life = ensLife(card);

    /* ── Container ── */
    var el = document.createElement('div');
    el.className = 'miro-card miro-life';
    el.dataset.cid = card.id;
    el.style.cssText = 'position:absolute;left:'+(card.x||0)+'px;top:'+(card.y||0)+
                        'px;width:'+(card.w||1200)+'px;height:'+(card.h||700)+'px;';

    /* Delete button */
    if (!card._overlayMode) {
      var del = document.createElement('button');
      del.className = 'mc-del'; del.textContent = '\u2715';
      del.onclick = function(e){ e.stopPropagation();
        if (typeof deleteMiroCard==='function') deleteMiroCard(card.id); };
      el.appendChild(del);

      /* Lock UI */
      if (typeof attachLockUI==='function') try { attachLockUI(el, card); } catch(e){}
    }

    /* ── Header bar (Phase 2 breadcrumb) ── */
    var hdr = document.createElement('div');
    hdr.className = 'life-header'; el.appendChild(hdr);

    var crumb = document.createElement('div');
    crumb.className = 'life-crumb';
    crumb.textContent = '\uD83E\uDDEC Life \u2014 Years';
    hdr.appendChild(crumb);

    /* Zoom switches (Years, Months, Weeks, Days, Hours) */
    var switches = document.createElement('div');
    switches.className = 'life-zoom-switches';
    var lvls = ['Y', 'M', 'W', 'D', 'H'];
    var labels = { Y: 'Years', M: 'Months', W: 'Weeks', D: 'Days', H: 'Zooper' };
    var btnMap = {};
    lvls.forEach(function(lvl) {
      var btn = document.createElement('button');
      btn.textContent = labels[lvl];
      btn.onclick = function(e) {
        e.stopPropagation();
        var wh = getWH();
        zoomToLevel(life, lvl, wh.W, wh.H);
      };
      switches.appendChild(btn);
      btnMap[lvl] = btn;
    });
    hdr.appendChild(switches);

    /* Today button */
    var todayBtn = document.createElement('button');
    todayBtn.className = 'life-today-btn';
    todayBtn.textContent = 'Today';
    todayBtn.onclick = function(e) {
      e.stopPropagation();
      var wh = getWH();
      flyToToday(life, wh.W, wh.H);
    };
    hdr.appendChild(todayBtn);

    /* Sync button (Phase 3) */
    var syncBtn = document.createElement('button');
    syncBtn.className = 'life-sync';
    syncBtn.textContent = '\u21BB Sync';
    syncBtn.title = 'Fetch Google Calendar (14h)';
    syncBtn.onclick = function(e){ e.stopPropagation(); fetchCalEvents(card); };
    hdr.appendChild(syncBtn);

    /* Sprint toggle button */
    var sprBtn = document.createElement('button');
    sprBtn.className = 'life-sync';
    sprBtn.textContent = '\u21C4 Sprint';
    sprBtn.title = 'Toggle Sprint 1/2';
    sprBtn.style.display = 'none';
    sprBtn.onclick = function(e) {
      e.stopPropagation();
      var L = ensLife(card);
      if (!L._monthFocus) return;
      L._monthFocus.half = L._monthFocus.half ? 0 : 1;
      /* Clear DOM cache to rebuild cards */
      if (L._domMap) {
        L._domMap.forEach(function(entry) {
          if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
        });
        L._domMap.clear();
      }
      if (typeof sv === 'function') sv(false, true);
    };
    hdr.appendChild(sprBtn);
    card._sprBtn = sprBtn;

    /* ── Canvas ── */
    var cv = document.createElement('canvas');
    cv.className = 'life-canvas'; el.appendChild(cv);

    var _dayCardContainer = document.createElement('div');
    _dayCardContainer.style.cssText = 'position:absolute;left:0;top:32px;width:100%;height:calc(100% - 32px);pointer-events:none;overflow:hidden;z-index:5;';
    el.appendChild(_dayCardContainer);

    var _lastVisibleKeys = '';
    var _zoomWrapper = null;

    /* ── Tooltip (Phase 4) ── */
    var tooltip = document.createElement('div');
    tooltip.className = 'life-tooltip'; tooltip.style.display = 'none';
    el.appendChild(tooltip);

    /* ── Overlay Editor Panel (Phase 4) ── */
    var editorPanel = document.createElement('div');
    editorPanel.className = 'life-editor'; editorPanel.style.display = 'none';
    editorPanel.innerHTML =
      '<div class="le-title">Event Editor</div>' +
      '<div class="le-field">' +
        '<label>Title</label>' +
        '<input class="le-input" id="le-title-input" placeholder="Event Title" />' +
      '</div>' +
      '<div class="le-field">' +
        '<label>Description</label>' +
        '<textarea class="le-desc-input" id="le-desc-input" placeholder="Description (shows as tooltip)"></textarea>' +
      '</div>' +
      '<div class="le-field" style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">' +
        '<input type="checkbox" id="le-all-day" style="width: auto; margin: 0; cursor: pointer;" />' +
        '<label for="le-all-day" style="display: inline; margin: 0; text-transform: none; cursor: pointer;">All Day Event</label>' +
      '</div>' +
      '<div class="le-datetime-row">' +
        '<div class="le-field">' +
          '<label>From</label>' +
          '<input type="date" id="le-from-date" />' +
          '<input type="time" id="le-from-time" />' +
        '</div>' +
        '<div class="le-field">' +
          '<label>To</label>' +
          '<input type="date" id="le-to-date" />' +
          '<input type="time" id="le-to-time" />' +
        '</div>' +
      '</div>' +
      '<div class="le-field">' +
        '<label>Color</label>' +
        '<div class="le-colors"></div>' +
      '</div>' +
      '<div class="le-actions">' +
        '<button class="le-save">\u2713 Save</button>' +
        '<button class="le-del" style="background:#ff7675;color:#fff;">\uD83D\uDDD1 Delete</button>' +
        '<button class="le-close">\u2715 Cancel</button>' +
      '</div>';
    el.appendChild(editorPanel);

    var allDayCb = editorPanel.querySelector('#le-all-day');
    allDayCb.onchange = function() {
      var isAllDay = allDayCb.checked;
      var fromTimeInput = editorPanel.querySelector('#le-from-time');
      var toTimeInput = editorPanel.querySelector('#le-to-time');
      if (isAllDay) {
        fromTimeInput.style.display = 'none';
        toTimeInput.style.display = 'none';
      } else {
        fromTimeInput.style.display = '';
        toTimeInput.style.display = '';
      }
    };

    /* Populate colour swatches */
    var colorGrid = editorPanel.querySelector('.le-colors');
    var selColor = CFG.palette[0];
    CFG.palette.forEach(function(c) {
      var sw = document.createElement('div');
      sw.className = 'le-csw'; sw.style.background = c;
      sw.dataset.color = c;
      sw.onclick = function(e) {
        e.stopPropagation(); selColor = c;
        colorGrid.querySelectorAll('.le-csw').forEach(function(s){ s.classList.remove('sel'); });
        sw.classList.add('sel');
      };
      colorGrid.appendChild(sw);
    });

    function toLocalTimeStr(d) {
      var h = String(d.getHours()).padStart(2, '0');
      var m = String(d.getMinutes()).padStart(2, '0');
      return h + ':' + m;
    }

    var _editingOv = null;
    function openEditor(ov) {
      _editingOv = ov;
      editorPanel.style.display = 'block';
      
      editorPanel.querySelector('#le-title-input').value = ov.title || '';
      editorPanel.querySelector('#le-desc-input').value = ov.description || '';
      
      var isDateTime = false;
      var startD, endD;
      
      var life = ensLife(card);
      
      if (ov._isNew) {
        startD = ov.startD;
        endD = ov.endD;
        var currentLOD = lod(life.cam.z);
        isDateTime = (currentLOD === 'H');
        editorPanel.querySelector('.le-del').style.display = 'none';
      } else {
        var dates = getEventDates(ov);
        startD = dates.start;
        endD = dates.end;
        if (typeof ov.start === 'string' && ov.start.indexOf('T') !== -1) {
          isDateTime = true;
        }
        editorPanel.querySelector('.le-del').style.display = '';
      }
      
      // Set date inputs
      editorPanel.querySelector('#le-from-date').value = toLocalYYYYMMDD(startD);
      editorPanel.querySelector('#le-to-date').value = toLocalYYYYMMDD(endD);
      
      // Set time inputs
      var fromTimeInput = editorPanel.querySelector('#le-from-time');
      var toTimeInput = editorPanel.querySelector('#le-to-time');
      
      if (isDateTime) {
        allDayCb.checked = false;
        fromTimeInput.style.display = '';
        toTimeInput.style.display = '';
        fromTimeInput.value = toLocalTimeStr(startD);
        toTimeInput.value = toLocalTimeStr(endD);
      } else {
        allDayCb.checked = true;
        fromTimeInput.style.display = 'none';
        toTimeInput.style.display = 'none';
        fromTimeInput.value = '09:00';
        toTimeInput.value = '18:00';
      }
      
      // Setup swatch selection
      var rawColor = ov.color || CFG.ovFill;
      var hexColor = rawColor;
      if (rawColor.startsWith('#')) {
        if (rawColor.length === 9) {
          hexColor = rawColor.slice(0, 7);
        } else if (rawColor.length === 5) {
          hexColor = rawColor.slice(0, 4);
        }
      } else {
        hexColor = CFG.palette[0];
      }
      
      selColor = hexColor;
      colorGrid.querySelectorAll('.le-csw').forEach(function(s) {
        var sColor = s.dataset.color || '';
        if (sColor.toLowerCase() === hexColor.toLowerCase()) {
          s.classList.add('sel');
        } else {
          s.classList.remove('sel');
        }
      });
    }
    
    function closeEditor() { editorPanel.style.display = 'none'; _editingOv = null; }

    editorPanel.querySelector('.le-close').onclick = function(e){ e.stopPropagation(); closeEditor(); };
    editorPanel.querySelector('.le-save').onclick = function(e){
      e.stopPropagation();
      if (!_editingOv) return;
      
      var newTitle = editorPanel.querySelector('#le-title-input').value;
      var newDesc = editorPanel.querySelector('#le-desc-input').value;
      var isAllDay = allDayCb.checked;
      
      var dateFromStr = editorPanel.querySelector('#le-from-date').value;
      var timeFromStr = editorPanel.querySelector('#le-from-time').value;
      var dateToStr = editorPanel.querySelector('#le-to-date').value;
      var timeToStr = editorPanel.querySelector('#le-to-time').value;
      
      var startStr, endStr;
      if (isAllDay) {
        startStr = dateFromStr;
        endStr = dateToStr;
      } else {
        startStr = dateFromStr + 'T' + timeFromStr + ':00';
        endStr = dateToStr + 'T' + timeToStr + ':00';
      }
      
      if (_editingOv._isNew) {
        create14hEvent(card, newTitle, newDesc, selColor, startStr, endStr, !isAllDay).then(function() {
          closeEditor();
          if (typeof sv==='function') sv();
        }).catch(function(err) {
          alert("Error creating: " + err);
        });
      } else if (_editingOv.source === 'gcal') {
        edit14hEvent(card, _editingOv.id, newTitle, newDesc, selColor, startStr, endStr, !isAllDay).then(function() {
          closeEditor();
          if (typeof sv==='function') sv();
        }).catch(function(err) {
          alert("Error saving: " + err);
        });
      } else {
        _editingOv.title = newTitle;
        _editingOv.description = newDesc;
        _editingOv.color = selColor + '44';
        _editingOv.bc = selColor + 'aa';
        _editingOv.start = startStr;
        _editingOv.end = endStr;
        _editingOv.isDateTime = !isAllDay;
        closeEditor();
        if (typeof sv==='function') sv();
      }
    };
    editorPanel.querySelector('.le-del').onclick = function(e){
      e.stopPropagation();
      if (!_editingOv) return;
      if (_editingOv.source === 'gcal') {
        delete14hEvent(card, _editingOv.id).then(function() {
          closeEditor();
          if (typeof sv==='function') sv();
        }).catch(function(err) {
          alert("Error deleting: " + err);
        });
      } else {
        var life = ensLife(card);
        life.ov = life.ov.filter(function(o){ return o !== _editingOv; });
        closeEditor();
        if (typeof sv==='function') sv();
        if (typeof buildOutline==='function') try { buildOutline(); } catch(e2){}
      }
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

    /* Drag via header (skip in overlay mode) */
    if (!card._overlayMode) {
      if (typeof miroSetupCardDrag==='function')
        try { miroSetupCardDrag(hdr, card, ['.mc-del','.mc-lock','.life-sync']); } catch(e){}
      /* 8-way resize handles */
      if (typeof attach8WayResize==='function')
        try { attach8WayResize(el, card, 600, 350); } catch(e){}
    }

    cv.oncontextmenu = function(e){ e.preventDefault(); };

    /* ── Interaction state ── */
    var ST = { dn:false, panning:false, minimapDragging:false, moved:false, sx:0, sy:0, px:0, py:0 };
    function getWH() { return { W:Math.max(1,el.clientWidth), H:Math.max(1,el.clientHeight-32) }; }

    function updateCamFromMinimap(mx, my, cam, W, H) {
      var mmW = 140, mmH = 80;
      mx = clamp(mx, 0, mmW);
      my = clamp(my, 0, mmH);
      var vw = W / cam.z, vh = H / cam.z;
      var worldX = (mx / mmW) * W;
      var worldY = (my / mmH) * H;
      cam.x = worldX - vw / 2;
      cam.y = worldY - vh / 2;
      clampCam(cam, W, H);
      if (typeof sv === 'function') sv(false, true);
    }

    function getMousePos(e) {
      var rect = cv.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
      return {
        x: (e.clientX - rect.left) * (cv.clientWidth / rect.width),
        y: (e.clientY - rect.top) * (cv.clientHeight / rect.height)
      };
    }

    /* Mouse-down */
    cv.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      clampCam(cam, wh.W, wh.H);
      ST.moved = false;

      var pos = getMousePos(e);

      // Check if clicking inside the minimap region
      var mmW = 140, mmH = 80, pad = 10;
      var mmX = wh.W - mmW - pad, mmY = wh.H - mmH - pad;
      if (pos.x >= mmX && pos.x <= mmX + mmW && pos.y >= mmY && pos.y <= mmY + mmH) {
        ST.minimapDragging = true;
        updateCamFromMinimap(pos.x - mmX, pos.y - mmY, cam, wh.W, wh.H);
        e.preventDefault();
        
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }

      // Alt + Click or middle/right click starts panning
      if (e.button === 1 || e.button === 2 || (e.altKey && e.button === 0)) {
        ST.panning = true; ST.px = pos.x; ST.py = pos.y;
        e.preventDefault();
        
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }

      // Left click starts drag-selection (or single selection on click)
      if (e.button === 0) {
        ST.dn = true; ST.sx = pos.x; ST.sy = pos.y;
        var wp = s2w(pos.x, pos.y, cam);
        var curLOD = lod(cam.z);
        
        // Check for click on overlays / calEvents first before initiating cell selection
        layoutOverlays(life.ov);
        var ovHit = hitOverlay(wp.x, wp.y, life.ov, wh.W);
        var calHit = hitCalEvent(wp.x, wp.y, life.calEvents, wh.W, wh.H, curLOD);
        
        if (ovHit && ovHit.source !== 'gcal') {
          ST.dn = false; // Cancel cell selection drag
          openEditor(ovHit);
          e.preventDefault();
          return;
        }
        if (calHit) {
          ST.dn = false; // Cancel cell selection drag
          openEditor(calHit);
          e.preventDefault();
          return;
        }

        var startCell = pickCell(wp.x, wp.y, wh.W, wh.H, curLOD);
        if (startCell) {
          life.selStart = startCell;
          life.selEnd = startCell;
        } else {
          life.selStart = null;
          life.selEnd = null;
        }
        e.preventDefault();
        
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
        return;
      }
    });

    function onWindowMouseMove(e) {
      var pos = getMousePos(e);
      var wh = getWH();
      var life = ensLife(card), cam = life.cam;
      
      if (ST.minimapDragging) {
        var mmW = 140, mmH = 80, pad = 10;
        var mmX = wh.W - mmW - pad, mmY = wh.H - mmH - pad;
        updateCamFromMinimap(pos.x - mmX, pos.y - mmY, cam, wh.W, wh.H);
        return;
      }
      
      var dx = pos.x - (ST.panning ? ST.px : ST.sx);
      var dy = pos.y - (ST.panning ? ST.py : ST.sy);
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) ST.moved = true;
      
      if (ST.panning) {
        cam.x -= dx / cam.z; cam.y -= dy / cam.z;
        ST.px = pos.x; ST.py = pos.y;
        clampCam(cam, wh.W, wh.H);
      } else if (ST.dn && life.selStart) {
        var wp = s2w(pos.x, pos.y, cam);
        var curLOD = lod(cam.z);
        var currentCell = pickCell(wp.x, wp.y, wh.W, wh.H, curLOD);
        if (currentCell) {
          life.selEnd = currentCell;
        }
      }
    }

    function onWindowMouseUp(e) {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      
      if (ST.minimapDragging) {
        ST.minimapDragging = false;
        if (typeof sv === 'function') sv();
        return;
      }
      
      var life = ensLife(card), cam = life.cam, wh = getWH();
      clampCam(cam, wh.W, wh.H);

      if (ST.dn) {
        ST.dn = false;
        var sStart = life.selStart;
        var sEnd = life.selEnd;
        life.selStart = null;
        life.selEnd = null;

        if (sStart && sEnd) {
          var rStart = getCellDateRange(sStart);
          var rEnd = getCellDateRange(sEnd);
          if (rStart && rEnd) {
            var minT = Math.min(rStart.start.getTime(), rEnd.start.getTime());
            var maxT = Math.max(rStart.end.getTime(), rEnd.end.getTime());
            var startD = new Date(minT);
            var endD = new Date(maxT);
            
            openEditor({
              _isNew: true,
              startD: startD,
              endD: endD
            });
          }
          if (typeof sv==='function') sv();
          return;
        }
      }
      
      if (ST.panning) {
        ST.panning = false;
        if (typeof sv==='function') sv();
        return;
      }
    }

    /* Mouse-move for hover tooltip and custom cursor */
    cv.addEventListener('mousemove', function(e) {
      if (ST.dn || ST.panning || ST.minimapDragging) return;
      var wh = getWH();
      var mmW = 140, mmH = 80, pad = 10;
      var mmX = wh.W - mmW - pad, mmY = wh.H - mmH - pad;
      var pos = getMousePos(e);

      // Hide tooltip & set pointer cursor when hovering minimap
      if (pos.x >= mmX && pos.x <= mmX + mmW && pos.y >= mmY && pos.y <= mmY + mmH) {
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
        cv.style.cursor = 'pointer';
      } else {
        cv.style.cursor = '';
        var wp = s2w(pos.x, pos.y, cam);
        var curLOD = lod(cam.z);
        
        var eventHit = hitCalEvent(wp.x, wp.y, life.calEvents, wh.W, wh.H, curLOD) || hitOverlay(wp.x, wp.y, life.ov, wh.W);
        if (eventHit) {
          var txt = eventHit.title || '(No Title)';
          if (eventHit.description) {
            txt += ': ' + eventHit.description;
          }
          tooltip.textContent = txt;
          tooltip.style.display = 'block';
          tooltip.style.opacity = '1';
          tooltip.style.left = (pos.x + 14) + 'px';
          tooltip.style.top = (pos.y + 14 + 32) + 'px';
          cv.style.cursor = 'pointer';
        } else {
          var hit = pickCell(wp.x, wp.y, wh.W, wh.H, curLOD);
          if (hit) {
            var txt = '';
            if (hit.type==='year')  txt = ''+hit.y;
            else if (hit.type==='month') txt = MN[hit.m]+' '+hit.y;
            else if (hit.type==='week') txt = 'Wk ' + getWeekNumber(new Date(hit.y, hit.m, hit.wRow * 7 + 1)) + ' ' + MN[hit.m] + ' ' + hit.y;
            else if (hit.type==='day')   txt = (hit.d+1)+' '+MN[hit.m]+' '+hit.y;
            else if (hit.type==='slot') {
              var h = Math.floor(hit.sl/2);
              txt = (hit.d+1)+' '+MN[hit.m]+' '+hit.y+' '+h+':'+(hit.sl%2?'30':'00');
            }
            tooltip.textContent = txt;
            tooltip.style.display = 'block';
            tooltip.style.opacity = '1';
            tooltip.style.left = (pos.x + 14) + 'px';
            tooltip.style.top = (pos.y + 14 + 32) + 'px';
          } else {
            tooltip.style.display = 'none';
            tooltip.style.opacity = '0';
          }
        }
      }
    });

    cv.addEventListener('mouseleave', function(){
      tooltip.style.display = 'none'; tooltip.style.opacity = '0';
      ST.minimapDragging = false;
    });

    /* Wheel zoom — cursor-anchored, internal camera (Phase 2) */
    function wheelZoom(e) {
      e.stopPropagation(); e.preventDefault();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      clampCam(cam, wh.W, wh.H);
      var pos = getMousePos(e);
      var ox = pos.x, oy = pos.y;
      var before = s2w(ox, oy, cam);
      cam.z *= (e.deltaY < 0 ? 1.14 : 0.88);
      cam.x = before.x - ox / cam.z;
      cam.y = before.y - oy / cam.z;
      clampCam(cam, wh.W, wh.H);
      if (typeof sv==='function') sv(false, true);
    }
    cv.addEventListener('wheel', wheelZoom, { passive: false });
    _dayCardContainer.addEventListener('wheel', wheelZoom, { passive: false });

    /* Double-click = zoom out one level (Phase 2) */
    cv.addEventListener('dblclick', function(e) {
      e.stopPropagation(); e.preventDefault();
      var life = ensLife(card), cam = life.cam, wh = getWH();
      var center = s2w(wh.W/2, wh.H/2, cam);
      if (cam.z > 10.0) { cam.z = 6.0; }
      else if (cam.z > 4.5) { cam.z = 3.0; }
      else if (cam.z > 2.2) { cam.z = 1.6; life._monthFocus = null; }
      else if (cam.z > 0.9) { cam.z = 0.5; life._monthFocus = null; }
      else { cam.z = 0.35; life._monthFocus = null; }
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
        if (cam.z > 10.0) { cam.z = 6.0; }
        else if (cam.z > 4.5) { cam.z = 3.0; }
        else if (cam.z > 2.2) { cam.z = 1.6; life._monthFocus = null; }
        else if (cam.z > 0.9) { cam.z = 0.5; life._monthFocus = null; }
        else { cam.z = 0.35; life._monthFocus = null; }
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
        cam.z = clamp(_tZ * (dist / _tDist), 0.35, 120);
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

    function updateDOMOverlays(life, W, H, level, cam) {
      if (level !== 'H') {
        if (_zoomWrapper) { _dayCardContainer.innerHTML = ''; _zoomWrapper = null; }
        if (life._domMap) { life._domMap.clear(); }
        _lastVisibleKeys = '';
        // Preserve life._evCache and life._evCacheKey to prevent empty rendering on zoom-in
        return;
      }

      // Automatically set _monthFocus if null at level H
      if (!life._monthFocus) {
        var cx = cam.x + (W / 2) / cam.z;
        var cy = cam.y + (H / 2) / cam.z;
        var cell = pickCell(cx, cy, W, H, 'M');
        if (cell && cell.type === 'month') {
          life._monthFocus = { y: cell.y, m: cell.m, half: 0 };
        } else {
          var n = nowInfo();
          life._monthFocus = { y: n.y, m: n.m, half: 0 };
        }
      }

      if (!life._domMap) life._domMap = new Map();

      var visibleDays = [];
      var capHit = false;
      
      for (var i = 0; i < 50 && !capHit; i++) {
        var yr = yR(i, W, H);
        var yrScreenX = (yr.x - cam.x) * cam.z;
        var yrScreenY = (yr.y - cam.y) * cam.z;
        var yrScreenW = yr.w * cam.z;
        var yrScreenH = yr.h * cam.z;
        
        if (yrScreenX + yrScreenW <= 0 || yrScreenX >= W || yrScreenY + yrScreenH <= 0 || yrScreenY >= H) {
          continue;
        }
        
        var y = CFG.startYear + i;
        for (var m = 0; m < 12 && !capHit; m++) {
          var mr2 = mR(i, m, W, H);
          var mrScreenX = (mr2.x - cam.x) * cam.z;
          var mrScreenY = (mr2.y - cam.y) * cam.z;
          var mrScreenW = mr2.w * cam.z;
          var mrScreenH = mr2.h * cam.z;
          
          if (mrScreenX + mrScreenW <= 0 || mrScreenX >= W || mrScreenY + mrScreenH <= 0 || mrScreenY >= H) {
            continue;
          }
          
          var ds = dim(y, m);
          for (var d = 0; d < ds; d++) {
            var r = dR(i, m, d, W, H);
            var screenX = (r.x - cam.x) * cam.z;
            var screenY = (r.y - cam.y) * cam.z;
            var screenW = r.w * cam.z;
            var screenH = r.h * cam.z;
            
            /* Frustum test */
            if (screenX + screenW <= 0 || screenX >= W || screenY + screenH <= 0 || screenY >= H) continue;
            
            /* Bypass size check in H mode, otherwise do frustum test */
            if (level !== 'H' && (screenW < 120 || screenH < 90)) continue;

            /* Filter to focused month in H mode (no sprint split) */
            // if (level === 'H' && life._monthFocus) {
            //   if (y !== life._monthFocus.y || m !== life._monthFocus.m) continue;
            // }

            var key = y + '-' + m + '-' + d;
            visibleDays.push({ key: key, r: r, date: new Date(y, m, d + 1) });
            /* Hard cap */
            if (visibleDays.length >= 140) { capHit = true; break; }
          }
        }
      }

      /* Build a Set of currently visible keys for fast lookup */
      var visibleSet = {};
      for (var vi = 0; vi < visibleDays.length; vi++) visibleSet[visibleDays[vi].key] = true;

      /* Ensure wrapper exists */
      if (!_zoomWrapper) {
        _dayCardContainer.innerHTML = '';
        _zoomWrapper = document.createElement('div');
        _zoomWrapper.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;pointer-events:none;';
        _dayCardContainer.appendChild(_zoomWrapper);
        life._domMap.clear();
      }

      /* Remove cards no longer visible */
      var toRemove = [];
      life._domMap.forEach(function(entry, key) {
        if (!visibleSet[key]) toRemove.push(key);
      });
      for (var ri = 0; ri < toRemove.length; ri++) {
        var old = life._domMap.get(toRemove[ri]);
        if (old && old.el && old.el.parentNode) old.el.parentNode.removeChild(old.el);
        life._domMap.delete(toRemove[ri]);
      }

      /* ── FIX 3: Fetch calendar events for visible date range ── */
      var evts = life._evCache || [];
      if (visibleDays.length > 0) {
        var minMs = visibleDays[0].date.getTime();
        var maxMs = minMs;
        for (var ei = 1; ei < visibleDays.length; ei++) {
          var t = visibleDays[ei].date.getTime();
          if (t < minMs) minMs = t;
          if (t > maxMs) maxMs = t;
        }
        var rangeStart = new Date(minMs);
        var rangeEnd = new Date(maxMs + 86400000); /* +1 day */
        var cacheKey = rangeStart.toISOString().slice(0,10) + '_' + rangeEnd.toISOString().slice(0,10);

        if (cacheKey !== life._evCacheKey && !life._evFetching) {
          life._evFetching = true;
          /* Async fetch — don't block render */
          (function(ck) {
            var promises = [];
            
            // 1. Fetch Calendar Events
            if (typeof fetchCalendarEvents === 'function') {
              promises.push(
                fetchCalendarEvents(rangeStart, rangeEnd)
                  .then(function(allEv) {
                    return { type: 'events', data: (allEv || []).filter(function(e) { return !e.allDay; }) };
                  })
                  .catch(function(err) {
                    console.error('Life-widget events fetch error:', err);
                    return { type: 'events', data: [] };
                  })
              );
            }
            
            // 2. Fetch Calendar List (for Fruit Calendar ID)
            if (typeof getCalendarList === 'function') {
              promises.push(
                getCalendarList()
                  .then(function(cals) {
                    var frCal = cals.find(function(c) { return (c.summary || '').toLowerCase() === "!40's fruit"; });
                    return { type: 'fruit', id: frCal ? frCal.id : '' };
                  })
                  .catch(function(err) {
                    console.error('Life-widget fruit calendar fetch error:', err);
                    return { type: 'fruit', id: '' };
                  })
              );
            }
            
            // 3. Fetch Task Lists and Tasks (for Plan Calendar ID and Tasks)
            if (typeof getAllTaskLists === 'function') {
              promises.push(
                getAllTaskLists()
                  .then(function(lists) {
                    if (lists.length > 0) {
                      var pId = lists[0].id;
                      if (typeof fetchPlanTasks === 'function') {
                        return fetchPlanTasks(pId)
                          .then(function(tasks) {
                            return { type: 'tasks', planCalId: pId, planEvents: tasks };
                          })
                          .catch(function(err) {
                            console.error('Life-widget plan tasks fetch error:', err);
                            return { type: 'tasks', planCalId: pId, planEvents: [] };
                          });
                      }
                    }
                    return { type: 'tasks', planCalId: '', planEvents: [] };
                  })
                  .catch(function(err) {
                    console.error('Life-widget task lists fetch error:', err);
                    return { type: 'tasks', planCalId: '', planEvents: [] };
                  })
              );
            }

            Promise.all(promises).then(function(results) {
              results.forEach(function(r) {
                if (r.type === 'events') {
                  life._evCache = r.data;
                } else if (r.type === 'fruit') {
                  life._fruitCalId = r.id;
                } else if (r.type === 'tasks') {
                  life._planCalId = r.planCalId;
                  life._planEvents = r.planEvents;
                }
              });
              life._evCacheKey = ck;
              life._evFetching = false;
              
              /* Force DOM rebuild with new data */
              life._domMap.forEach(function(entry) {
                if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
              });
              life._domMap.clear();
            }).catch(function(err) {
              console.error('Promise.all error in life-widget fetch:', err);
              life._evFetching = false;
            });
          })(cacheKey);
        }
        evts = life._evCache || [];
      }

      var gapPx = 6;
      var padWorld = gapPx / cam.z;

      // Group visible days by month key: "y-m"
      var monthsMap = {};
      for (var di = 0; di < visibleDays.length; di++) {
        var vd = visibleDays[di];
        var y = vd.date.getFullYear();
        var m = vd.date.getMonth();
        var monthKey = y + '-' + m;

        if (!monthsMap[monthKey]) {
          var yi = y - CFG.startYear;
          var mRect = mR(yi, m, W, H);
          monthsMap[monthKey] = {
            mRect: mRect,
            days: []
          };
        }
        monthsMap[monthKey].days.push(vd);
      }

      // Remove separators for months no longer visible
      var visibleMonthKeys = Object.keys(monthsMap);
      var separators = _zoomWrapper.querySelectorAll('.sprint-separator');
      separators.forEach(function(sep) {
        var mKey = sep.id.replace('sep-', '');
        if (visibleMonthKeys.indexOf(mKey) === -1) {
          if (sep.parentNode) sep.parentNode.removeChild(sep);
        }
      });

      // For each month, compute non-overlapping layout
      Object.keys(monthsMap).forEach(function(monthKey) {
        var mData = monthsMap[monthKey];
        var mRect = mData.mRect;

        // Group days of this month by row index (0 to 4)
        var rows = [[], [], [], [], []];
        mData.days.forEach(function(vd) {
          var d = vd.date.getDate() - 1;
          var rIdx = Math.floor(d / 7);
          if (rIdx >= 0 && rIdx < 5) {
            rows[rIdx].push(vd);
          }
        });

        // Sort each row chronologically
        for (var rIdx = 0; rIdx < 5; rIdx++) {
          rows[rIdx].sort(function(a, b) { return a.date - b.date; });
        }

        // Check if today is present in the month
        var hasToday = mData.days.some(function(vd) {
          return vd.date.toDateString() === new Date().toDateString();
        });

        // Define safe inner boundary: Inset by 8 screen pixels to avoid overlap with grids & highlights
        var borderPadding = 8 / cam.z;
        var safeRect = {
          x: mRect.x + borderPadding,
          y: mRect.y + borderPadding,
          w: mRect.w - 2 * borderPadding,
          h: mRect.h - 2 * borderPadding
        };

        // Width and height limits to calculate s_base proportionally
        var reqWUnits = hasToday ? 1134 : 994;
        var reqHUnits = hasToday ? 642 : 550;
        
        var s_w = (safeRect.w - 14 * padWorld) / reqWUnits;
        var s_h = (safeRect.h - 10 * padWorld) / reqHUnits;
        var s_base = Math.min(s_w, s_h);
        if (s_base < 0.01) s_base = 0.01;

        // Calculate heights of each row
        var rowHeights = [0, 0, 0, 0, 0];
        for (var rIdx = 0; rIdx < 5; rIdx++) {
          var hasTodayInRow = rows[rIdx].some(function(vd) {
            return vd.date.toDateString() === new Date().toDateString();
          });
          rowHeights[rIdx] = (hasTodayInRow ? 196 : 104) * s_base + 2 * padWorld;
        }

        // Calculate vertical start of each row
        var rowStarts = [0, 0, 0, 0, 0];
        rowStarts[0] = 0;
        for (var rIdx = 1; rIdx < 5; rIdx++) {
          var gap = (rIdx === 2) ? (30 * s_base) : 0;
          rowStarts[rIdx] = rowStarts[rIdx - 1] + rowHeights[rIdx - 1] + gap;
        }

        // Append sprint divider line between row 1 and row 2
        var separatorId = 'sep-' + monthKey;
        var sepEl = _zoomWrapper.querySelector('#' + separatorId);
        if (!sepEl) {
          sepEl = document.createElement('div');
          sepEl.id = separatorId;
          sepEl.className = 'sprint-separator';
          sepEl.style.cssText = 'position:absolute;pointer-events:none;display:flex;align-items:center;justify-content:center;font-family:inherit;font-weight:bold;text-transform:uppercase;';
          _zoomWrapper.appendChild(sepEl);
        }
        var parts = monthKey.split('-');
        var yVal = parseInt(parts[0], 10);
        var mVal = parseInt(parts[1], 10);
        var monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        var monthName = monthNames[mVal] || '';
        var sepText = monthName + ' ' + yVal;
        
        var isDk = (card.calTheme || 'light') !== 'light';
        var sepHeight = 30 * s_base;
        var sepY = safeRect.y + rowStarts[2] - sepHeight;
        sepEl.style.left = (safeRect.x + padWorld) + 'px';
        sepEl.style.top = sepY + 'px';
        sepEl.style.width = (safeRect.w - 2 * padWorld) + 'px';
        sepEl.style.height = sepHeight + 'px';
        sepEl.style.fontSize = (12 * s_base) + 'px';
        sepEl.style.letterSpacing = (4 * s_base) + 'px';
        sepEl.style.color = isDk ? 'rgba(255, 255, 255, 0.25)' : 'rgba(20, 25, 40, 0.25)';
        sepEl.textContent = sepText;

        // Position cards sequentially in each row
        for (var rIdx = 0; rIdx < 5; rIdx++) {
          var rowDays = rows[rIdx];
          var currentX = 0;

          for (var rdi = 0; rdi < rowDays.length; rdi++) {
            var vd = rowDays[rdi];
            var isToday = (vd.date.toDateString() === new Date().toDateString());

            var cardW = isToday ? 282 : 142;
            var cardH = isToday ? 196 : 104;
            var wWorld = cardW * s_base;

            vd.calculated = {
              posL: safeRect.x + currentX + padWorld,
              posT: safeRect.y + rowStarts[rIdx] + padWorld,
              s: s_base,
              cardW: cardW,
              cardH: cardH
            };

            currentX += wWorld + 2 * padWorld;
          }
        }
      });

      for (var di = 0; di < visibleDays.length; di++) {
        var vd = visibleDays[di];
        var calc = vd.calculated;
        if (!calc) continue;

        var posL = calc.posL;
        var posT = calc.posT;
        var s = calc.s;
        var cardW = calc.cardW;
        var cardH = calc.cardH;

        var existing = life._domMap.get(vd.key);
        if (existing) {
          /* Update position/scale only */
          existing.el.style.left = posL + 'px';
          existing.el.style.top = posT + 'px';
          existing.el.style.transform = 'scale(' + s + ')';
        } else {
          /* Create new card */
          var wrapper = document.createElement('div');
          wrapper.style.cssText = 'position:absolute;left:' + posL + 'px;top:' + posT + 'px;width:' + cardW + 'px;height:' + cardH + 'px;transform-origin:0 0;pointer-events:auto;overflow:hidden;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.12);';
          wrapper.style.transform = 'scale(' + s + ')';
          wrapper.addEventListener('wheel', wheelZoom, { passive: false });
          
          if (typeof window.renderZooperDayCard === 'function') {
            window.renderZooperDayCard(wrapper, vd.date, {
              theme: card.calTheme || 'light',
              evts: evts,
              fruitCalId: life._fruitCalId || '',
              planEvents: life._planEvents || [],
              planCalId: life._planCalId || '',
              allGridCells: [],
              popupBody: el,
              onRefresh: function() {
                var L = ensLife(card);
                L._evCache = null;
                L._evCacheKey = '';
                if (L._domMap) {
                  L._domMap.forEach(function(entry) {
                    if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
                  });
                  L._domMap.clear();
                }
                if (typeof sv === 'function') sv();
              }
            });
          }
          
          _zoomWrapper.appendChild(wrapper);
          life._domMap.set(vd.key, { el: wrapper });
        }
      }

      /* Update wrapper transform every frame */
      if (_zoomWrapper) {
        var tx = -cam.x * cam.z;
        var ty = -cam.y * cam.z;
        _zoomWrapper.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + cam.z + ')';
      }
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

      /* Show/hide Sprint toggle based on LOD */
      if (card._sprBtn) {
        card._sprBtn.style.display = 'none';
      }
      var hasDOMCards = life._domMap && life._domMap.size > 0;

      if (level === 'Y')      { drawYears(ctx, W, H, cam); }
      else if (level === 'M') { drawYears(ctx, W, H, cam); drawMonths(ctx, W, H, cam); }
      else if (level === 'W') { drawWeeks(ctx, W, H, cam); }
      else if (level === 'D') { drawMonths(ctx, W, H, cam); drawDays(ctx, W, H, cam); }
      else if (level === 'H') { drawMonths(ctx, W, H, cam); }
      else                    { drawMonths(ctx, W, H, cam); }

      /* Manual overlays */
      drawOverlays(ctx, life.ov, W, cam);

      /* Google Calendar events (Phase 3) — canvas only at zoomed-out levels */
      if (level === 'Y' || level === 'M' || level === 'W' || level === 'D') {
        drawCalEventsAsStickyNotes(ctx, life.calEvents, W, H, level, cam);
      }

      /* Draw Shift selection overlay */
      if (life.selStart && life.selEnd) {
        var rStart = getCellDateRange(life.selStart);
        var rEnd = getCellDateRange(life.selEnd);
        if (rStart && rEnd) {
          var minT = Math.min(rStart.start.getTime(), rEnd.start.getTime());
          var maxT = Math.max(rStart.end.getTime(), rEnd.end.getTime());
          var selCells = getCoveredCells(new Date(minT), new Date(maxT), level, W, H);
          ctx.fillStyle = 'rgba(52, 152, 219, 0.25)';
          ctx.strokeStyle = 'rgba(52, 152, 219, 0.7)';
          ctx.lineWidth = 1.5;
          for (var si = 0; si < selCells.length; si++) {
            var c = selCells[si];
            ctx.beginPath();
            ctx.rect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      /* Update DOM Overlays — throttled: full diff every 3rd frame, transform-only otherwise */
      life._domFrame = (life._domFrame || 0) + 1;
      if (life._domFrame % 3 !== 0 && _zoomWrapper) {
        /* Transform-only update (cheap) */
        var tx2 = -cam.x * cam.z;
        var ty2 = -cam.y * cam.z;
        _zoomWrapper.style.transform = 'translate3d(' + tx2 + 'px,' + ty2 + 'px,0) scale(' + cam.z + ')';
      } else {
        updateDOMOverlays(life, W, H, level, cam);
      }

      /* Breadcrumb text (Phase 2) */
      crumb.textContent = '\uD83E\uDDEC Life \u2014 ' + lodLabel(level);

      /* Update zoom switches active states */
      if (btnMap) {
        Object.keys(btnMap).forEach(function(lvl) {
          if (lvl === level) {
            btnMap[lvl].classList.add('active');
          } else {
            btnMap[lvl].classList.remove('active');
          }
        });
      }

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
