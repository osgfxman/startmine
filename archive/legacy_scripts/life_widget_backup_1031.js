/**
 * @module LifeWidget
 * @description Advanced zoomable life canvas (2000-2049) with 14h Google Calendar & manual overlays
 * @namespace SM.ui.life
 * @depends namespace.js, offline.js, sync.js
 * @provides window.buildMiroLifeWidget, window.createLifeWidget, window._openLifeOverlay, window._closeLifeOverlay
 */

(function() {
  'use strict';

  var CFG = {
    startYear: 2000,
    endYear: 2049,
    yCols: 10, yRows: 5,
    mCols: 3, mRows: 4,
    dCols: 7, dRows: 5,
    slots: 48, sects: 6
  };

  var THEME = {
    bg: '#f6f7fb',
    accent: '#00b894',
    gridLines: 'rgba(0,0,0,0.06)',
    gridLinesM: 'rgba(0,0,0,0.12)',
    gridLinesD: 'rgba(0,0,0,0.18)',
    textLight: 'rgba(0,0,0,0.35)',
    textDark: 'rgba(0,0,0,0.85)',
    currentHighlight: 'rgba(0, 184, 148, 0.08)',
    currentHighlightD: 'rgba(0, 184, 148, 0.22)',
    overlayDefault: 'rgba(9, 132, 227, 0.25)',
    overlayHover: 'rgba(9, 132, 227, 0.4)'
  };

  var W = {
    YW: 4000, YH: 5000,
    MW: 1000, MH: 1000,
    DW: 110, DH: 140
  };

  var PRESET_COLORS = [
    '#55efc4', '#81ecec', '#74b9ff', '#a29bfe',
    '#ffeaa7', '#ff7675', '#fd79a8', '#fdcb6e',
    '#e17055', '#d63031', '#e84393', '#6c5ce7'
  ];

  var STATE = {
    cam: { x: 0, y: 0, z: 0.045 },
    targetCam: null,
    animFrame: 0,
    dirty: true,
    show14h: false,
    events: [],
    manualOverlays: [],
    hoverDate: null,
    isPanning: false,
    isDrawingOverlay: false,
    drawStartCoord: null,
    drawEndCoord: null,
    activeEditorOverlay: null,
    editorMode: 'new' // 'new' or 'edit'
  };

  var _canvas, _ctx, _rect, _dpr;
  var _animationFrameId = null;
  var _tooltipEl = null;
  var _minimapEl = null;

  // Load manual overlays on boot
  try {
    var stored = localStorage.getItem('sm_life_manual_overlays');
    if (stored) STATE.manualOverlays = JSON.parse(stored);
  } catch(e) {}

  function requestDraw() {
    if (!STATE.dirty) {
      STATE.dirty = true;
      if (!_animationFrameId) {
        _animationFrameId = requestAnimationFrame(draw);
      }
    }
  }

  function getLOD() {
    if (STATE.cam.z < 0.12) return 'Y';
    if (STATE.cam.z < 0.9) return 'M';
    if (STATE.cam.z < 6.5) return 'D';
    return 'H';
  }

  function culling(x, y, w, h) {
    var vwX = -STATE.cam.x / STATE.cam.z;
    var vwY = -STATE.cam.y / STATE.cam.z;
    var vwW = _rect.width / STATE.cam.z;
    var vwH = _rect.height / STATE.cam.z;
    return !(x + w < vwX || x > vwX + vwW || y + h < vwY || y > vwY + vwH);
  }

  function dateToCoord(date) {
    var year = date.getFullYear();
    if (year < CFG.startYear || year > CFG.endYear) return null;
    var yearIdx = year - CFG.startYear;
    var yCol = yearIdx % CFG.yCols;
    var yRow = Math.floor(yearIdx / CFG.yCols);
    var yX = yCol * W.YW;
    var yY = yRow * W.YH;

    var month = date.getMonth();
    var mCol = month % CFG.mCols;
    var mRow = Math.floor(month / CFG.mCols);
    var mX = yX + 200 + mCol * 1300;
    var mY = yY + 500 + mRow * 1100;

    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var firstDay = new Date(year, month, 1).getDay();
    firstDay = (firstDay === 0) ? 6 : firstDay - 1; // ISO week starts Mon

    var day = date.getDate();
    var gridIdx = firstDay + (day - 1);
    var dCol = gridIdx % CFG.dCols;
    var dRow = Math.floor(gridIdx / CFG.dCols);
    var dX = mX + 45 + dCol * 130;
    var dY = mY + 200 + dRow * 155;

    var slot = date.getHours() * 2 + (date.getMinutes() >= 30 ? 1 : 0);
    var hHeight = (W.DH - 45) / CFG.slots;
    var slotY = dY + 40 + slot * hHeight;

    return {
      x: dX + 5,
      y: slotY,
      w: W.DW - 10,
      h: hHeight,
      year: year,
      month: month,
      day: day,
      slot: slot
    };
  }

  function getSegments(start, end) {
    var segs = [];
    var curr = new Date(start);
    while (curr <= end) {
      var nextDay = new Date(curr);
      nextDay.setHours(23, 59, 59, 999);
      var segEnd = (nextDay < end) ? nextDay : end;
      
      var cStart = dateToCoord(curr);
      var cEnd = dateToCoord(segEnd);
      if (cStart && cEnd) {
        segs.push({
          year: curr.getFullYear(),
          month: curr.getMonth(),
          day: curr.getDate(),
          startSlot: cStart.slot,
          endSlot: cEnd.slot,
          y: cStart.y,
          h: (cEnd.y - cStart.y) + cEnd.h,
          x: cStart.x,
          w: cEnd.w
        });
      }
      curr = new Date(nextDay.getTime() + 1);
    }
    return segs;
  }

  function layoutOverlays(overlays) {
    var sorted = overlays.map(function(o, i) {
      return { idx: i, start: new Date(o.start), end: new Date(o.end), o: o };
    }).sort(function(a, b) {
      return a.start - b.start;
    });

    var lanes = [];
    sorted.forEach(function(item) {
      var lane = 0;
      while (true) {
        if (!lanes[lane]) {
          lanes[lane] = [];
        }
        var overlap = lanes[lane].some(function(other) {
          return item.start < other.end && item.end > other.start;
        });
        if (!overlap) {
          lanes[lane].push(item);
          item.lane = lane;
          break;
        }
        lane++;
      }
    });
    return sorted;
  }

  function drawYears() {
    var today = new Date();
    var currentYear = today.getFullYear();

    for (var r = 0; r < CFG.yRows; r++) {
      for (var c = 0; c < CFG.yCols; c++) {
        var x = c * W.YW;
        var y = r * W.YH;
        if (!culling(x, y, W.YW, W.YH)) continue;

        var year = CFG.startYear + (r * CFG.yCols + c);
        
        _ctx.strokeStyle = THEME.gridLines;
        _ctx.lineWidth = Math.max(1, 10 / STATE.cam.z);
        _ctx.strokeRect(x, y, W.YW, W.YH);

        if (year === currentYear) {
          _ctx.fillStyle = THEME.currentHighlight;
          _ctx.fillRect(x, y, W.YW, W.YH);
        }

        _ctx.fillStyle = THEME.textLight;
        _ctx.font = 'bold 360px sans-serif';
        _ctx.textAlign = 'center';
        _ctx.fillText(year, x + W.YW/2, y + 400);

        var lod = getLOD();

        // 14h event Year representation
        if (STATE.show14h && STATE.events.length) {
          var count = STATE.events.filter(function(e) { return e.start.getFullYear() === year; }).length;
          if (count > 0) {
            _ctx.fillStyle = '#00b894';
            _ctx.fillRect(x + 200, y + W.YH - 250, Math.min(3600, count * 80), 80);
          }
        }

        if (lod !== 'Y') {
          drawMonths(year, x, y);
        }
      }
    }
  }

  function drawMonths(year, yX, yY) {
    var marginX = 200, marginY = 500, gapX = 300, gapY = 100;
    var today = new Date();
    var isCurrentYear = year === today.getFullYear();
    var currentMonth = today.getMonth();

    for (var r = 0; r < CFG.mRows; r++) {
      for (var c = 0; c < CFG.mCols; c++) {
        var mIdx = r * CFG.mCols + c;
        var x = yX + marginX + c * (W.MW + gapX);
        var y = yY + marginY + r * (W.MH + gapY);
        
        if (!culling(x, y, W.MW, W.MH)) continue;

        _ctx.strokeStyle = THEME.gridLinesM;
        _ctx.lineWidth = Math.max(1, 5 / STATE.cam.z);
        _ctx.strokeRect(x, y, W.MW, W.MH);

        if (isCurrentYear && mIdx === currentMonth) {
          _ctx.fillStyle = THEME.currentHighlight;
          _ctx.fillRect(x, y, W.MW, W.MH);
        }

        _ctx.fillStyle = THEME.textDark;
        _ctx.font = 'bold 120px sans-serif';
        _ctx.textAlign = 'center';
        var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        _ctx.fillText(mNames[mIdx], x + W.MW/2, y + 150);

        if (STATE.show14h && STATE.events.length) {
          var count = STATE.events.filter(function(e) { 
            return e.start.getFullYear() === year && e.start.getMonth() === mIdx; 
          }).length;
          if (count > 0) {
            _ctx.fillStyle = '#00b894';
            _ctx.fillRect(x + 50, y + W.MH - 80, Math.min(900, count * 40), 30);
          }
        }

        if (getLOD() === 'D' || getLOD() === 'H') {
          drawDays(year, mIdx, x, y);
        }
      }
    }
  }

  function drawDays(year, mIdx, mX, mY) {
    var marginX = 45, marginY = 200, gapX = 20, gapY = 15;
    var daysInMonth = new Date(year, mIdx + 1, 0).getDate();
    var firstDay = new Date(year, mIdx, 1).getDay();
    firstDay = (firstDay === 0) ? 6 : firstDay - 1; // ISO week Mon

    var today = new Date();
    var isCurrentMonth = year === today.getFullYear() && mIdx === today.getMonth();

    for (var d = 1; d <= daysInMonth; d++) {
      var gridIdx = firstDay + (d - 1);
      var c = gridIdx % CFG.dCols;
      var r = Math.floor(gridIdx / CFG.dCols);

      var x = mX + marginX + c * (W.DW + gapX);
      var y = mY + marginY + r * (W.DH + gapY);

      if (!culling(x, y, W.DW, W.DH)) continue;

      _ctx.strokeStyle = THEME.gridLinesD;
      _ctx.lineWidth = Math.max(1, 2 / STATE.cam.z);
      _ctx.strokeRect(x, y, W.DW, W.DH);

      if (isCurrentMonth && d === today.getDate()) {
        _ctx.fillStyle = THEME.currentHighlightD;
        _ctx.fillRect(x, y, W.DW, W.DH);
      }

      _ctx.fillStyle = THEME.textDark;
      _ctx.font = '24px sans-serif';
      _ctx.textAlign = 'right';
      _ctx.fillText(d, x + W.DW - 8, y + 30);

      // Render 14h Day Indicator
      if (STATE.show14h && STATE.events.length) {
        var dayEvents = STATE.events.filter(function(e) {
          return e.start.getFullYear() === year && e.start.getMonth() === mIdx && e.start.getDate() === d;
        });
        if (dayEvents.length > 0) {
          _ctx.save();
          _ctx.beginPath();
          _ctx.rect(x + 2, y + W.DH - 25, W.DW - 4, 22);
          _ctx.clip();
          _ctx.fillStyle = 'rgba(0, 184, 148, 0.85)';
          _ctx.fillRect(x + 2, y + W.DH - 25, W.DW - 4, 22);
          _ctx.fillStyle = '#fff';
          _ctx.font = 'bold 13px sans-serif';
          _ctx.textAlign = 'left';
          _ctx.fillText(dayEvents[0].summary, x + 6, y + W.DH - 8);
          _ctx.restore();
        }
      }

      if (getLOD() === 'H' && W.DH * STATE.cam.z > 80) {
        drawHours(x, y, year, mIdx, d);
      }
    }
  }

  function drawHours(dX, dY, year, mIdx, d) {
    var startY = dY + 40;
    var hHeight = (W.DH - 45) / CFG.slots;

    var today = new Date();
    var isCurrentDay = year === today.getFullYear() && mIdx === today.getMonth() && d === today.getDate();
    var currentSlot = today.getHours() * 2 + (today.getMinutes() >= 30 ? 1 : 0);

    for (var i = 0; i < CFG.slots; i++) {
      var slotY = startY + i * hHeight;

      if (isCurrentDay && i === currentSlot) {
        _ctx.fillStyle = 'rgba(255, 118, 117, 0.4)';
        _ctx.fillRect(dX + 5, slotY, W.DW - 10, hHeight);
      } else if (i % 2 === 0) {
        _ctx.fillStyle = 'rgba(0,0,0,0.03)';
        _ctx.fillRect(dX + 5, slotY, W.DW - 10, hHeight);
      }

      if (STATE.show14h && STATE.events.length) {
        var slotEvents = STATE.events.filter(function(e) {
          var segs = getSegments(e.start, e.end);
          return segs.some(function(s) {
            return s.year === year && s.month === mIdx && s.day === d && i >= s.startSlot && i <= s.endSlot;
          });
        });

        if (slotEvents.length > 0) {
          _ctx.fillStyle = 'rgba(0, 184, 148, 0.6)';
          _ctx.fillRect(dX + 6, slotY, W.DW - 12, hHeight);
        }
      }
    }
  }

  function drawOverlays() {
    var sorted = layoutOverlays(STATE.manualOverlays);
    sorted.forEach(function(item) {
      var segs = getSegments(item.start, item.end);
      segs.forEach(function(seg) {
        if (!culling(seg.x, seg.y, seg.w, seg.h)) return;
        _ctx.fillStyle = item.o.color || THEME.overlayDefault;
        _ctx.fillRect(seg.x, seg.y, seg.w, seg.h);

        if (getLOD() === 'H') {
          _ctx.save();
          _ctx.beginPath();
          _ctx.rect(seg.x, seg.y, seg.w, seg.h);
          _ctx.clip();
          _ctx.fillStyle = 'rgba(0,0,0,0.7)';
          _ctx.font = 'bold 12px sans-serif';
          _ctx.textAlign = 'left';
          _ctx.fillText(item.o.title || 'Untitled', seg.x + 5, seg.y + 12);
          _ctx.restore();
        }
      });
    });

    if (STATE.isDrawingOverlay && STATE.drawStartCoord && STATE.drawEndCoord) {
      var segs = getSegments(STATE.drawStartCoord.date, STATE.drawEndCoord.date);
      segs.forEach(function(seg) {
        _ctx.fillStyle = 'rgba(9, 132, 227, 0.4)';
        _ctx.fillRect(seg.x, seg.y, seg.w, seg.h);
        _ctx.strokeStyle = '#0984e3';
        _ctx.lineWidth = 2 / STATE.cam.z;
        _ctx.strokeRect(seg.x, seg.y, seg.w, seg.h);
      });
    }
  }

  function updateMinimap() {
    if (!_minimapEl) return;
    var ctx = _minimapEl.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 140, 80);

    ctx.fillStyle = '#eef1f6';
    ctx.fillRect(0, 0, 140, 80);

    var mw = 140 / (CFG.yCols * W.YW);
    var mh = 80 / (CFG.yRows * W.YH);

    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (var r = 0; r < CFG.yRows; r++) {
      for (var c = 0; c < CFG.yCols; c++) {
        ctx.strokeRect(c * W.YW * mw, r * W.YH * mh, W.YW * mw, W.YH * mh);
      }
    }

    var vwX = -STATE.cam.x / STATE.cam.z;
    var vwY = -STATE.cam.y / STATE.cam.z;
    var vwW = _rect.width / STATE.cam.z;
    var vwH = _rect.height / STATE.cam.z;

    ctx.strokeStyle = '#ff7675';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vwX * mw, vwY * mh, vwW * mw, vwH * mh);
  }

  function draw() {
    STATE.dirty = false;
    _animationFrameId = null;

    if (!_ctx) return;

    if (STATE.targetCam) {
      STATE.animFrame++;
      var t = Math.min(1, STATE.animFrame / 16);
      t = t * (2 - t); // ease out
      STATE.cam.x += (STATE.targetCam.x - STATE.cam.x) * t;
      STATE.cam.y += (STATE.targetCam.y - STATE.cam.y) * t;
      STATE.cam.z += (STATE.targetCam.z - STATE.cam.z) * t;
      
      if (STATE.animFrame >= 16 || Math.abs(STATE.targetCam.z - STATE.cam.z) < 0.001) {
        STATE.targetCam = null;
      } else {
        requestDraw();
      }
    }

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _ctx.fillStyle = THEME.bg;
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

    _ctx.save();
    _ctx.scale(_dpr, _dpr);
    _ctx.translate(STATE.cam.x, STATE.cam.y);
    _ctx.scale(STATE.cam.z, STATE.cam.z);

    drawYears();
    drawOverlays();

    _ctx.restore();
    updateUI();
    updateMinimap();
  }

  function updateUI() {
    var crumb = document.getElementById('life-crumb-text');
    if (crumb) {
      var lod = getLOD();
      crumb.textContent = '🧬 Life \u2192 ' + (lod==='Y'?'Years':lod==='M'?'Months':lod==='D'?'Days':'Hours');
    }
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - STATE.cam.x) / STATE.cam.z,
      y: (sy - STATE.cam.y) / STATE.cam.z
    };
  }

  function worldToDate(wx, wy) {
    var colY = Math.floor(wx / W.YW);
    var rowY = Math.floor(wy / W.YH);
    if (colY < 0 || colY >= CFG.yCols || rowY < 0 || rowY >= CFG.yRows) return null;
    
    var year = CFG.startYear + (rowY * CFG.yCols + colY);
    var mxLocal = wx - colY * W.YW;
    var myLocal = wy - rowY * W.YH;

    var month = 0, day = 1, hour = 0, minute = 0;

    if (myLocal > 500) {
      var mCol = Math.floor((mxLocal - 200) / 1300);
      var mRow = Math.floor((myLocal - 500) / 1100);
      if (mCol >= 0 && mCol < CFG.mCols && mRow >= 0 && mRow < CFG.mRows) {
        month = mRow * CFG.mCols + mCol;
        var dxLocal = mxLocal - 200 - mCol * 1300;
        var dyLocal = myLocal - 500 - mRow * 1100;

        if (dyLocal > 200) {
          var firstDay = new Date(year, month, 1).getDay();
          firstDay = (firstDay === 0) ? 6 : firstDay - 1;
          
          var dCol = Math.floor((dxLocal - 45) / 130);
          var dRow = Math.floor((dyLocal - 200) / 155);
          if (dCol >= 0 && dCol < CFG.dCols && dRow >= 0 && dRow < CFG.dRows) {
            var gridIdx = dRow * CFG.dCols + dCol;
            var dayVal = gridIdx - firstDay + 1;
            var daysInMonth = new Date(year, month + 1, 0).getDate();
            if (dayVal >= 1 && dayVal <= daysInMonth) {
              day = dayVal;

              var hLocal = dyLocal - 200 - dRow * 155;
              if (hLocal > 40) {
                var hHeight = (W.DH - 45) / CFG.slots;
                var slot = Math.floor((hLocal - 40) / hHeight);
                slot = Math.max(0, Math.min(47, slot));
                hour = Math.floor(slot / 2);
                minute = (slot % 2 === 1) ? 30 : 0;
              }
            }
          }
        }
      }
    }

    return new Date(year, month, day, hour, minute);
  }

  function handleWheel(e) {
    e.preventDefault();
    var oldZ = STATE.cam.z;
    var zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
    if (e.ctrlKey) zoomFactor = 1 - e.deltaY * 0.01;

    var newZ = Math.max(0.005, Math.min(80, oldZ * zoomFactor));
    
    var mx = (e.clientX - _rect.left);
    var my = (e.clientY - _rect.top);

    var wx = (mx - STATE.cam.x) / oldZ;
    var wy = (my - STATE.cam.y) / oldZ;

    STATE.cam.x = mx - wx * newZ;
    STATE.cam.y = my - wy * newZ;
    STATE.cam.z = newZ;
    STATE.targetCam = null;
    requestDraw();
  }

  function zoomToRect(wx, wy, ww, wh) {
    var padding = 0.1;
    var screenW = _rect.width * (1 - padding * 2);
    var screenH = _rect.height * (1 - padding * 2);
    
    var targetZ = Math.min(screenW / ww, screenH / wh);
    targetZ = Math.max(0.005, Math.min(80, targetZ));

    var centerX = wx + ww / 2;
    var centerY = wy + wh / 2;

    STATE.targetCam = {
      x: _rect.width / 2 - centerX * targetZ,
      y: _rect.height / 2 - centerY * targetZ,
      z: targetZ
    };
    STATE.animFrame = 0;
    requestDraw();
  }

  function handleClick(e) {
    if (STATE.isDragging) return;
    var mx = e.clientX - _rect.left;
    var my = e.clientY - _rect.top;
    var wCoord = screenToWorld(mx, my);

    var colY = Math.floor(wCoord.x / W.YW);
    var rowY = Math.floor(wCoord.y / W.YH);
    if (colY >= 0 && colY < CFG.yCols && rowY >= 0 && rowY < CFG.yRows) {
      if (getLOD() === 'Y') {
        zoomToRect(colY * W.YW, rowY * W.YH, W.YW, W.YH);
      } else {
        var mxLocal = wCoord.x - colY * W.YW;
        var myLocal = wCoord.y - rowY * W.YH;
        if (myLocal > 500) {
          var mCol = Math.floor((mxLocal - 200) / 1300);
          var mRow = Math.floor((myLocal - 500) / 1100);
          if (mCol >= 0 && mCol < CFG.mCols && mRow >= 0 && mRow < CFG.mRows) {
             if (getLOD() === 'M') {
               var tx = colY*W.YW + 200 + mCol*1300;
               var ty = rowY*W.YH + 500 + mRow*1100;
               zoomToRect(tx, ty, W.MW, W.MH);
             }
          }
        }
      }
    }
  }

  function handleMouseMove(e) {
    var mx = e.clientX - _rect.left;
    var my = e.clientY - _rect.top;
    var wCoord = screenToWorld(mx, my);
    var date = worldToDate(wCoord.x, wCoord.y);

    if (date) {
      _tooltipEl.style.opacity = 1;
      _tooltipEl.style.left = e.clientX + 'px';
      _tooltipEl.style.top = (e.clientY - 15) + 'px';
      var options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      _tooltipEl.textContent = date.toLocaleDateString('en-US', options);
    } else {
      _tooltipEl.style.opacity = 0;
    }

    if (STATE.isDrawingOverlay) {
      STATE.drawEndCoord = { x: wCoord.x, y: wCoord.y, date: date || new Date() };
      requestDraw();
    }
  }

  function openEditor(start, end, existingIdx) {
    var editor = document.querySelector('.life-editor');
    if (!editor) return;
    editor.style.display = 'block';
    
    var titleIn = editor.querySelector('.le-input');
    titleIn.value = existingIdx !== undefined ? STATE.manualOverlays[existingIdx].title : '';
    titleIn.focus();

    var colorSwatches = editor.querySelector('.le-colors');
    colorSwatches.innerHTML = '';
    PRESET_COLORS.forEach(function(col) {
      var swatch = document.createElement('div');
      swatch.className = 'le-csw';
      swatch.style.background = col;
      swatch.onclick = function() {
        colorSwatches.querySelectorAll('.le-csw').forEach(function(s){ s.classList.remove('sel'); });
        swatch.classList.add('sel');
        swatch.dataset.color = col;
      };
      colorSwatches.appendChild(swatch);
    });
    colorSwatches.firstChild.click();

    var saveBtn = editor.querySelector('.le-save');
    var delBtn = editor.querySelector('.le-del');

    saveBtn.onclick = function() {
      var selSwatch = colorSwatches.querySelector('.le-csw.sel');
      var col = selSwatch ? selSwatch.dataset.color : PRESET_COLORS[0];
      var newO = {
        title: titleIn.value || 'Overlay',
        start: start,
        end: end,
        color: col
      };

      if (existingIdx !== undefined) {
        STATE.manualOverlays[existingIdx] = newO;
      } else {
        STATE.manualOverlays.push(newO);
      }
      localStorage.setItem('sm_life_manual_overlays', JSON.stringify(STATE.manualOverlays));
      editor.style.display = 'none';
      requestDraw();
    };

    delBtn.onclick = function() {
      if (existingIdx !== undefined) {
        STATE.manualOverlays.splice(existingIdx, 1);
        localStorage.setItem('sm_life_manual_overlays', JSON.stringify(STATE.manualOverlays));
      }
      editor.style.display = 'none';
      requestDraw();
    };
  }

  function setupInteractions() {
    _canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    var startX, startY, startCamX, startCamY;
    
    _canvas.addEventListener('mousedown', function(e) {
      var mx = e.clientX - _rect.left;
      var my = e.clientY - _rect.top;
      var wCoord = screenToWorld(mx, my);

      if (e.shiftKey) {
        // Start manual overlay selection
        STATE.isDrawingOverlay = true;
        var date = worldToDate(wCoord.x, wCoord.y);
        STATE.drawStartCoord = { x: wCoord.x, y: wCoord.y, date: date || new Date() };
        STATE.drawEndCoord = STATE.drawStartCoord;
      } else if (e.button === 2 || e.button === 1 || e.altKey) {
        STATE.isPanning = true;
        startX = e.clientX; startY = e.clientY;
        startCamX = STATE.cam.x; startCamY = STATE.cam.y;
        STATE.targetCam = null;
        _canvas.style.cursor = 'grabbing';
      }
      STATE.isDragging = false;
    });

    window.addEventListener('mousemove', function(e) {
      if (STATE.isPanning) {
        STATE.isDragging = true;
        STATE.cam.x = startCamX + (e.clientX - startX);
        STATE.cam.y = startCamY + (e.clientY - startY);
        requestDraw();
      }
    });

    window.addEventListener('mouseup', function(e) {
      if (STATE.isPanning) {
        STATE.isPanning = false;
        _canvas.style.cursor = 'default';
      }
      if (STATE.isDrawingOverlay) {
        STATE.isDrawingOverlay = false;
        if (STATE.drawStartCoord && STATE.drawEndCoord) {
          var d1 = STATE.drawStartCoord.date;
          var d2 = STATE.drawEndCoord.date;
          var start = d1 < d2 ? d1 : d2;
          var end = d1 < d2 ? d2 : d1;
          openEditor(start, end);
        }
        STATE.drawStartCoord = null;
        STATE.drawEndCoord = null;
        requestDraw();
      }
    });

    _canvas.addEventListener('mousemove', handleMouseMove);
    _canvas.addEventListener('mouseleave', function() {
      if (_tooltipEl) _tooltipEl.style.opacity = 0;
    });

    _canvas.addEventListener('click', handleClick);
    _canvas.addEventListener('dblclick', function(e) {
      STATE.targetCam = {
        x: STATE.cam.x + (_rect.width/2 - STATE.cam.x)*0.5,
        y: STATE.cam.y + (_rect.height/2 - STATE.cam.y)*0.5,
        z: Math.max(0.005, STATE.cam.z / 2.5)
      };
      STATE.animFrame = 0;
      requestDraw();
    });

    _canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  }

  function fetch14hEvents() {
    if (typeof window.ensureGoogleToken === 'function') {
      window.ensureGoogleToken().then(function() {
        if (!window._googleAccessToken) return;

        var calendarsUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
        fetch(calendarsUrl, { headers: { 'Authorization': 'Bearer ' + window._googleAccessToken } })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            var cal = (data.items || []).find(function(c) {
              return c.summary === '14h' || c.summaryOverride === '14h';
            });
            if (!cal) {
              if (typeof showToast === 'function') showToast('Calendar "14h" not found!');
              return;
            }

            var tMin = new Date(CFG.startYear, 0, 1).toISOString();
            var tMax = new Date(CFG.endYear, 11, 31).toISOString();
            var eventsUrl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cal.id) + 
                            '/events?timeMin=' + tMin + '&timeMax=' + tMax + '&singleEvents=true&orderBy=startTime&maxResults=2500';
            
            fetch(eventsUrl, { headers: { 'Authorization': 'Bearer ' + window._googleAccessToken } })
              .then(function(res) { return res.json(); })
              .then(function(evData) {
                STATE.events = (evData.items || []).map(function(ev) {
                  return {
                    id: ev.id,
                    summary: ev.summary || '(No title)',
                    start: new Date(ev.start.dateTime || ev.start.date),
                    end: new Date(ev.end.dateTime || ev.end.date)
                  };
                });
                if (typeof showToast === 'function') showToast('🧬 Caching ' + STATE.events.length + ' life events');
                requestDraw();
              });
          });
      });
    }
  }

  function build(card) {
    var wrap = document.createElement('div');
    wrap.className = 'miro-life';
    if (card) {
      wrap.dataset.cid = card.id;
      wrap.style.left = (card.x || 0) + 'px';
      wrap.style.top = (card.y || 0) + 'px';
      wrap.style.width = (card.w || 900) + 'px';
      wrap.style.height = (card.h || 600) + 'px';
    }

    var header = document.createElement('div');
    header.className = 'life-header';
    header.innerHTML = '<div class="life-crumb"><span id="life-crumb-text">\uD83E\uDDEC Life \u2192 Years</span></div>' +
      '<button class="life-btn life-eye-btn" title="Toggle 14h Events">\uD83D\uDC41</button>' +
      '<button class="life-btn life-sync" title="Sync 14h">\u21BB</button>' +
      '<button class="life-btn life-today-btn" title="Go to Today">\uD83C\uDFAF</button>';
    
    _canvas = document.createElement('canvas');
    _canvas.className = 'life-canvas';

    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'life-tooltip';
    _tooltipEl.style.position = 'fixed';
    _tooltipEl.style.opacity = 0;
    document.body.appendChild(_tooltipEl);

    _minimapEl = document.createElement('canvas');
    _minimapEl.style.cssText = 'position:absolute;bottom:12px;right:12px;width:140px;height:80px;background:#fff;border:1px solid #ddd;border-radius:6px;z-index:40;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.1);';
    _minimapEl.width = 140;
    _minimapEl.height = 80;

    var editor = document.createElement('div');
    editor.className = 'life-editor';
    editor.style.display = 'none';
    editor.innerHTML = '<div class="le-title">Add Manual Overlay</div>' +
      '<input type="text" class="le-input" placeholder="Title...">' +
      '<div class="le-colors"></div>' +
      '<div class="le-actions">' +
        '<button class="le-del">Delete</button>' +
        '<button class="le-save">Save</button>' +
      '</div>';
    
    wrap.appendChild(header);
    wrap.appendChild(_canvas);
    wrap.appendChild(_minimapEl);
    wrap.appendChild(editor);

    header.querySelector('.life-eye-btn').onclick = function() {
      STATE.show14h = !STATE.show14h;
      header.querySelector('.life-eye-btn').textContent = STATE.show14h ? '👁️' : '👁️‍🗨️';
      if (STATE.show14h && !STATE.events.length) fetch14hEvents();
      requestDraw();
    };

    header.querySelector('.life-sync').onclick = function() {
      fetch14hEvents();
    };

    header.querySelector('.life-today-btn').onclick = function() {
      var today = new Date();
      var yearIdx = today.getFullYear() - CFG.startYear;
      if (yearIdx >= 0 && yearIdx < 50) {
        var colY = yearIdx % CFG.yCols;
        var rowY = Math.floor(yearIdx / CFG.yCols);
        var tx = colY * W.YW + 200 + today.getMonth()*1300;
        var ty = rowY * W.YH + 500 + Math.floor(today.getMonth()/3)*1100;
        zoomToRect(tx, ty, W.MW, W.MH);
      }
    };

    _minimapEl.onclick = function(e) {
      var mRect = _minimapEl.getBoundingClientRect();
      var clickX = e.clientX - mRect.left;
      var clickY = e.clientY - mRect.top;
      var targetWX = (clickX / 140) * (CFG.yCols * W.YW);
      var targetWY = (clickY / 80) * (CFG.yRows * W.YH);
      
      STATE.targetCam = {
        x: _rect.width/2 - targetWX * STATE.cam.z,
        y: _rect.height/2 - targetWY * STATE.cam.z,
        z: STATE.cam.z
      };
      STATE.animFrame = 0;
      requestDraw();
    };

    setTimeout(function() {
      _rect = _canvas.getBoundingClientRect();
      _dpr = window.devicePixelRatio || 1;
      _canvas.width = _rect.width * _dpr;
      _canvas.height = _rect.height * _dpr;
      _ctx = _canvas.getContext('2d');
      setupInteractions();
      
      // Auto zoom to current year
      var today = new Date();
      var yearIdx = today.getFullYear() - CFG.startYear;
      if (yearIdx >= 0 && yearIdx < 50) {
        var colY = yearIdx % CFG.yCols;
        var rowY = Math.floor(yearIdx / CFG.yCols);
        var tx = colY * W.YW;
        var ty = rowY * W.YH;
        STATE.cam = { x: -tx * 0.045 + _rect.width/2, y: -ty * 0.045 + _rect.height/2, z: 0.045 };
      }
      
      requestDraw();
    }, 100);

    wrap.tabIndex = 0;
    wrap.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (editor.style.display === 'block') {
          editor.style.display = 'none';
        } else if (STATE.cam.z > 0.05) {
          STATE.targetCam = {
            x: STATE.cam.x + (_rect.width/2 - STATE.cam.x)*0.5,
            y: STATE.cam.y + (_rect.height/2 - STATE.cam.y)*0.5,
            z: Math.max(0.005, STATE.cam.z / 2)
          };
          STATE.animFrame = 0; requestDraw();
        } else if (window._lifeOverlayEl) {
          window._closeLifeOverlay();
        }
      }
    });

    return wrap;
  }

  // Exports
  window.buildMiroLifeWidget = build;

  window.createLifeWidget = function() {
    var page = window.cp && window.cp();
    if (!page) return;
    if (!page.miroCards) page.miroCards = [];
    var zoom = (page.zoom || 100) / 100;
    var panX = page.panX || 0, panY = page.panY || 0;
    var board = document.getElementById('miro-board');
    var rect = board.getBoundingClientRect();
    var cx = (-panX + (window.innerWidth / 2 - rect.left) / zoom);
    var cy = (-panY + (window.innerHeight / 2 - rect.top) / zoom);

    var card = {
      id: 'life_' + Date.now(),
      type: 'life',
      x: cx - 450, y: cy - 300, w: 900, h: 600
    };
    if (typeof window.pushUndo === 'function') window.pushUndo();
    page.miroCards.push(card);
    if (typeof window.sv === 'function') window.sv();
    if (typeof window.buildMiroCanvas === 'function') window.buildMiroCanvas();
  };

  window._openLifeOverlay = function() {
    if (window._lifeOverlayEl) return;
    var bg = document.createElement('div');
    bg.id = 'life-overlay-backdrop';
    bg.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    
    var panel = document.createElement('div');
    panel.style.cssText = 'width:96vw;height:92vh;background:#f6f7fb;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,0.45);display:flex;flex-direction:column;overflow:hidden;position:relative;border:1px solid rgba(255,255,255,0.1);';
    
    var hdr = document.createElement('div');
    hdr.style.cssText = 'height:48px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;align-items:center;padding:0 16px;background:#fff;';
    var title = document.createElement('span');
    title.style.cssText = 'font-weight:600;font-family:"DM Sans",sans-serif;color:#333;font-size:0.95rem;';
    title.textContent = '\uD83E\uDDEC Life Widget (2000 - 2049)';
    
    var spacer = document.createElement('div');
    spacer.style.flex = '1';
    
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;color:#999;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;';
    closeBtn.onmouseenter = function() { closeBtn.style.background = '#f0f0f0'; };
    closeBtn.onmouseleave = function() { closeBtn.style.background = 'none'; };
    closeBtn.onclick = window._closeLifeOverlay;
    
    hdr.appendChild(title);
    hdr.appendChild(spacer);
    hdr.appendChild(closeBtn);
    
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;position:relative;';
    
    var fakeCard = { w: window.innerWidth * 0.96, h: window.innerHeight * 0.92 - 48 };
    var lifeWidget = build(fakeCard);
    lifeWidget.style.position = 'absolute';
    lifeWidget.style.inset = '0';
    lifeWidget.style.width = '100%';
    lifeWidget.style.height = '100%';
    lifeWidget.style.borderRadius = '0';
    lifeWidget.style.boxShadow = 'none';
    
    body.appendChild(lifeWidget);
    panel.appendChild(hdr);
    panel.appendChild(body);
    bg.appendChild(panel);
    
    bg.onclick = function(e) { if(e.target === bg) window._closeLifeOverlay(); };
    
    document.body.appendChild(bg);
    window._lifeOverlayEl = bg;
  };

  window._closeLifeOverlay = function() {
    if (window._lifeOverlayEl) {
      window._lifeOverlayEl.remove();
      window._lifeOverlayEl = null;
      if (_tooltipEl) {
        _tooltipEl.remove();
        _tooltipEl = null;
      }
    }
  };

})();
