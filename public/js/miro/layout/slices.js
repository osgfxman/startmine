/**
 * @module Slices
 * @description Handles Miro page slicing, nested viewport rendering, cell zoom/pan states, Photoshop-style guides, and local card constraints.
 * @namespace SM.miro.layout
 * @depends namespace.js, app.js, miro-state.js, utils.js
 * @provides window.initMiroSlices, window.renderMiroSlices, window.autofitAllMiroSlices, window.partitionMiroCardsIntoCells, window.mergeMiroCellsIntoCards, window.getMiroCardDragZoom, window.clampMiroCardDrag, window.createMiroGrid
 * @safety Protect calculations against NaN. Clamp zoom between 1% and 400%.
 */
(function() {
  let _activeGuideDrag = null; // { type: 'v'|'h', idx: number, startPct: number, startClient: number }
  let _wheelSvTimer = null;
  let _activeCellKey = null;
  let _cellPanning = false;
  let _cellPanStartX = 0, _cellPanStartY = 0;
  let _slicesClipboard = null;
  let _activeLabelDrag = null;
  
  window._mergeSelectionMode = false;
  window._splitSelectionMode = false;
  window._selectedCellsForMerge = new Set();

  window._miroCtrlPressed = false;
  let _ctrlPressed = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Control') {
      _ctrlPressed = true;
      window._miroCtrlPressed = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      _ctrlPressed = false;
      window._miroCtrlPressed = false;
    }
  });
  window.addEventListener('blur', () => {
    _ctrlPressed = false;
    window._miroCtrlPressed = false;
  });

  // Add css styles for rulers, guide handles, cell viewports, and lock badges immediately on load
  if (!document.getElementById('miro-slices-css')) {
    const style = document.createElement('style');
    style.id = 'miro-slices-css';
    style.textContent = `
        .miro-ruler {
          position: absolute;
          background: #1a1d2e;
          border: 1px solid rgba(255, 255, 255, 0.12);
          z-index: 1000;
          box-sizing: border-box;
          user-select: none;
        }
        .miro-ruler-top {
          left: 20px; top: 0; right: 0; height: 20px;
          border-bottom: 2px solid #6c8fff;
          background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 10px 100%;
        }
        .miro-ruler-left {
          left: 0; top: 20px; bottom: 0; width: 20px;
          border-right: 2px solid #6c8fff;
          background-image: linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 100% 10px;
        }
        .miro-ruler-corner {
          left: 0; top: 0; width: 20px; height: 20px;
          background: #121420;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .miro-guide-v {
          position: absolute;
          top: 0; bottom: 0;
          width: 9px;
          margin-left: -4px;
          cursor: col-resize;
          z-index: 999;
        }
        .miro-guide-h {
          position: absolute;
          left: 0; right: 0;
          height: 9px;
          margin-top: -4px;
          cursor: row-resize;
          z-index: 999;
        }
        .miro-guide-line {
          position: absolute;
          pointer-events: none;
        }
        .miro-guide-line.miro-guide-line-v {
          top: 0; bottom: 0; left: 3px; width: 3px;
          background: #6c8fff;
          box-shadow: 0 0 8px rgba(108, 143, 255, 0.8);
        }
        .miro-guide-line.miro-guide-line-h {
          left: 0; right: 0; top: 3px; height: 3px;
          background: #6c8fff;
          box-shadow: 0 0 8px rgba(108, 143, 255, 0.8);
        }
        .miro-guide-line.is-locked {
          background: #ff6b35 !important;
          box-shadow: 0 0 8px rgba(255, 107, 53, 0.8) !important;
        }
        .miro-cell-ruler {
          position: absolute;
          background: #1a1d2e;
          border: 1px solid rgba(255, 255, 255, 0.12);
          z-index: 1010;
          box-sizing: border-box;
          user-select: none;
        }
        .miro-cell-ruler-top {
          left: 15px; top: 0; right: 0; height: 15px;
          border-bottom: 2px solid #57ca85;
          background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px);
          background-size: 10px 100%;
        }
        .miro-cell-ruler-left {
          left: 0; top: 15px; bottom: 0; width: 15px;
          border-right: 2px solid #57ca85;
          background-image: linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
          background-size: 100% 10px;
        }
        .miro-cell-ruler-corner {
          left: 0; top: 0; width: 15px; height: 15px;
          background: #121420;
          border: 1px solid rgba(255, 255, 255, 0.12);
          z-index: 1011;
        }
        .miro-layout-guide-v {
          position: absolute;
          top: 0; bottom: 0;
          width: 7px;
          margin-left: -3px;
          cursor: col-resize;
          z-index: 1005;
        }
        .miro-layout-guide-h {
          position: absolute;
          left: 0; right: 0;
          height: 7px;
          margin-top: -3px;
          cursor: row-resize;
          z-index: 1005;
        }
        .miro-layout-guide-line {
          position: absolute;
          pointer-events: none;
        }
        .miro-layout-guide-line.miro-layout-guide-line-v {
          top: 0; bottom: 0; left: 2px; width: 2px;
          background: #57ca85;
          box-shadow: 0 0 6px rgba(87, 202, 133, 0.7);
        }
        .miro-layout-guide-line.miro-layout-guide-line-h {
          left: 0; right: 0; top: 2px; height: 2px;
          background: #57ca85;
          box-shadow: 0 0 6px rgba(87, 202, 133, 0.7);
        }
        .miro-cell-viewport {
          position: absolute;
          box-sizing: border-box;
          background: var(--bg, #f3f4f6);
          border: 3px solid rgba(108, 143, 255, 0.45);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(108, 143, 255, 0.15);
          overflow: hidden;
        }
        .miro-dragging .miro-cell-viewport {
          overflow: visible !important;
          z-index: 10000 !important;
        }
        .miro-cell-viewport.miro-active-dragging-cell {
          overflow: visible !important;
          z-index: 30000 !important;
        }
        .miro-cell-label {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 0.65rem;
          color: #000000;
          background: transparent;
          padding: 6px 12px;
          border-radius: 8px;
          pointer-events: auto;
          cursor: pointer;
          z-index: 10;
          font-weight: bold;
          font-family: var(--font);
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background .15s, color .15s, box-shadow .2s;
          user-select: none;
        }
        .miro-cell-label:hover {
          background: rgba(0, 0, 0, 0.06);
          color: #000000;
        }
        .miro-cell-label.has-change {
          background: rgba(255, 107, 53, 0.9) !important;
          color: #fff !important;
          box-shadow: 0 0 12px rgba(255, 107, 53, 0.8);
          animation: pulse-glow 2s infinite alternate;
        }
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 8px rgba(255, 107, 53, 0.6); }
          100% { box-shadow: 0 0 18px rgba(255, 107, 53, 1); }
        }
        .miro-cell-color-tag {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .miro-cell-zoom-text {
          opacity: 0.6;
          font-weight: 400;
          font-size: 0.6rem;
        }
        .miro-cell-bg-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          border-radius: 12px;
          z-index: 0;
        }
        /* Custom Context Menu */
        .miro-slices-menu {
          position: fixed;
          background: #ffffff;
          border: 1px solid #dcdfe6;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          z-index: 2000;
          font-family: var(--font);
          font-size: 0.7rem;
          padding: 4px 0;
          min-width: 100px;
        }
        .miro-slices-menu-item {
          padding: 6px 12px;
          cursor: pointer;
          color: #333;
        }
        .miro-slices-menu-item:hover {
          background: #f5f7fa;
          color: var(--ac);
        }
        /* Cell Settings Modal */
        .miro-cell-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.55);
          z-index: 3000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .miro-cell-modal {
          background: #1a1d2e;
          border: 1px solid rgba(108, 143, 255, 0.3);
          border-radius: 16px;
          padding: 20px 24px;
          min-width: 300px;
          max-width: 380px;
          box-shadow: 0 12px 48px rgba(0,0,0,0.6);
          font-family: var(--font);
          color: #e8eaf6;
        }
        .miro-cell-modal h3 {
          margin: 0 0 16px 0;
          font-size: 0.9rem;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .miro-cell-modal .mcm-row {
          margin-bottom: 12px;
        }
        .miro-cell-modal .mcm-row label {
          display: block;
          font-size: 0.65rem;
          color: rgba(255,255,255,0.5);
          margin-bottom: 4px;
        }
        .miro-cell-modal .mcm-row input[type="text"] {
          width: 100%;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 6px 10px;
          color: #fff;
          font-size: 0.75rem;
          outline: none;
          box-sizing: border-box;
        }
        .miro-cell-modal .mcm-row input[type="text"]:focus {
          border-color: #6c8fff;
        }
        .miro-cell-modal .mcm-colors {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .miro-cell-modal .mcm-csw {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: border-color .12s, transform .12s;
        }
        .miro-cell-modal .mcm-csw:hover {
          transform: scale(1.15);
        }
        .miro-cell-modal .mcm-csw.sel {
          border-color: #fff;
        }
        .miro-cell-modal .mcm-bg-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .miro-cell-modal .mcm-bg-row input[type="color"] {
          width: 36px;
          height: 28px;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 6px;
        }
        .miro-cell-modal .mcm-bg-row input[type="range"] {
          flex: 1;
          accent-color: #6c8fff;
        }
        .miro-cell-modal .mcm-bg-row .mcm-opacity-val {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.5);
          min-width: 30px;
          text-align: right;
        }
        .miro-cell-modal .mcm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        .miro-cell-modal .mcm-btn {
          padding: 6px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 600;
          transition: background .12s;
        }
        .miro-cell-modal .mcm-btn-cancel {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
        }
        .miro-cell-modal .mcm-btn-cancel:hover {
          background: rgba(255,255,255,0.15);
        }
        .miro-cell-modal .mcm-btn-save {
          background: #6c8fff;
          color: #fff;
        }
        .miro-cell-modal .mcm-btn-save:hover {
          background: #5a7de8;
        }
    `;
    document.head.appendChild(style);
  }

  function getDynamicTitleValue(type) {
    const now = new Date();
    const Y = now.getFullYear();
    const M = now.getMonth(); // 0-11
    const D = now.getDate();
    const hr = now.getHours();
    const min = now.getMinutes();

    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
    const monthNamesFull = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function formatTime12(h, m) {
      const ampm = h >= 12 ? 'pm' : 'am';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const displayM = m.toString().padStart(2, '0');
      return `${displayH}:${displayM}${ampm}`;
    }

    if (type === 'session') {
      const sessionNum = Math.floor(hr / 4) + 1;
      const startHour = (sessionNum - 1) * 4;
      return `S${sessionNum}(${formatTime12(startHour, 0)})`;
    }

    if (type === 'pomodoro') {
      const totalMinutes = hr * 60 + min;
      const pomoNum = Math.floor(totalMinutes / 30) + 1;
      const startMinTotal = (pomoNum - 1) * 30;
      const startH = Math.floor(startMinTotal / 60);
      const startM = startMinTotal % 60;

      return `P${pomoNum}(${formatTime12(startH, startM)})`;
    }

    if (type === 'day') {
      const gregPart = `${D}${monthNamesShort[M]}`;
      let hijriDay = 1;
      try {
        const formatter = new Intl.DateTimeFormat('en-US-u-ca-islamic', { day: 'numeric' });
        hijriDay = formatter.format(now);
      } catch (err) {
        hijriDay = Math.floor((now.getTime() - new Date(2026, 0, 1).getTime()) / (1000 * 60 * 60 * 24)) % 30; 
      }
      return `${gregPart}/${hijriDay}`;
    }

    if (type === '2days') {
      const blockStart = D % 2 === 0 ? D - 1 : D;
      const blockEnd = blockStart + 1;
      return `${blockStart}-${blockEnd} ${monthNamesShort[M]}`;
    }

    if (type === '3days') {
      const blockIndex = Math.floor((D - 1) / 3);
      const blockStart = blockIndex * 3 + 1;
      let blockEnd = blockStart + 2;
      const daysInMonth = new Date(Y, M + 1, 0).getDate();
      if (blockEnd > daysInMonth) blockEnd = daysInMonth;
      if (blockStart === blockEnd) {
        return `${blockStart} ${monthNamesShort[M]}`;
      }
      return `${blockStart}-${blockEnd} ${monthNamesShort[M]}`;
    }

    if (type === 'week') {
      const weekNum = getWeekNumber(now);
      const sun = new Date(now);
      sun.setDate(now.getDate() - now.getDay());
      const sat = new Date(now);
      sat.setDate(now.getDate() - now.getDay() + 6);
      const endMonth = monthNamesShort[sat.getMonth()];
      return `W${weekNum}(${sun.getDate()}:${sat.getDate()}${endMonth})`;
    }

    if (type === 'weekend') {
      const weekNum = getWeekNumber(now);
      const thu = new Date(now);
      thu.setDate(now.getDate() - now.getDay() + 4);
      const sat = new Date(now);
      sat.setDate(now.getDate() - now.getDay() + 6);
      const endMonth = monthNamesShort[sat.getMonth()];
      return `W${weekNum}(${thu.getDate()}:${sat.getDate()}${endMonth})`;
    }

    if (type === 'sprint') {
      const weekNum = getWeekNumber(now);
      const sprintNum = Math.floor((weekNum - 1) / 2) + 1;
      const oddWeekNum = (sprintNum - 1) * 2 + 1;
      const diffWeeks = weekNum - oddWeekNum;
      const sun = new Date(now);
      sun.setDate(now.getDate() - now.getDay() - (diffWeeks * 7));
      const sat = new Date(now);
      sat.setDate(now.getDate() - now.getDay() + 6 + ((1 - diffWeeks) * 7));
      const endMonth = monthNamesShort[sat.getMonth()];
      return `Sprint${sprintNum}(${sun.getDate()}:${sat.getDate()}${endMonth})`;
    }

    if (type === 'month') {
      return `${monthNamesFull[M]} ${Y}`;
    }

    if (type === 'quarter') {
      const quarter = Math.floor(M / 3) + 1;
      return `Q${quarter} ${Y}`;
    }

    if (type === 'year') {
      return `${Y}`;
    }

    if (type === '5years') {
      const blockStart = Math.floor(Y / 5) * 5;
      const blockEnd = blockStart + 5;
      return `${blockStart}-${blockEnd}`;
    }

    if (type === 'next5years') {
      const blockStart = Math.floor(Y / 5) * 5 + 5;
      const blockEnd = blockStart + 5;
      return `${blockStart}-${blockEnd}`;
    }

    return '';
  }

  function getDynamicProgressValue(type) {
    const now = new Date();
    const Y = now.getFullYear();
    const M = now.getMonth(); // 0-11
    const D = now.getDate();
    const hr = now.getHours();
    const min = now.getMinutes();

    if (type === 'session') {
      const elapsedMins = (hr % 4) * 60 + min;
      const completedPomos = Math.floor(elapsedMins / 30);
      return `${completedPomos}/8`;
    }

    if (type === 'pomodoro') {
      const minOfPomo = min % 30;
      const completedBlocks = Math.floor(minOfPomo / 5);
      return `${completedBlocks}/6`;
    }

    if (type === 'day') {
      return `${hr}/24`;
    }

    if (type === '2days') {
      const dayIndex = D % 2 === 0 ? 1 : 0;
      const elapsedHours = dayIndex * 24 + hr;
      return `${elapsedHours}/48`;
    }

    if (type === '3days') {
      const blockIndex = Math.floor((D - 1) / 3);
      const blockStart = blockIndex * 3 + 1;
      const dayIndex = D - blockStart;
      const elapsedHours = dayIndex * 24 + hr;
      return `${elapsedHours}/72`;
    }

    if (type === 'week') {
      const dayNum = now.getDay() + 1; // Sunday is 1
      return `${dayNum}/7`;
    }

    if (type === 'weekend') {
      const thu = new Date(now);
      thu.setDate(now.getDate() - now.getDay() + 4);
      thu.setHours(0,0,0,0);
      const elapsedDays = Math.min(3, Math.max(0, Math.floor((now - thu) / 86400000) + 1));
      return `${elapsedDays}/3`;
    }

    if (type === 'sprint') {
      const weekNum = getWeekNumber(now);
      const sprintNum = Math.floor((weekNum - 1) / 2) + 1;
      const oddWeekNum = (sprintNum - 1) * 2 + 1;
      const diffWeeks = weekNum - oddWeekNum;
      const sun = new Date(now);
      sun.setDate(now.getDate() - now.getDay() - (diffWeeks * 7));
      sun.setHours(0,0,0,0);
      const elapsedDays = Math.floor((now - sun) / 86400000) + 1;
      return `${elapsedDays}/14`;
    }

    if (type === 'month') {
      const daysInMonth = new Date(Y, M + 1, 0).getDate();
      return `${D}/${daysInMonth}`;
    }

    if (type === 'quarter') {
      const qStartMonth = Math.floor(M / 3) * 3;
      const qStart = new Date(Y, qStartMonth, 1);
      const qEnd = new Date(Y, qStartMonth + 3, 0);
      const qTotalDays = Math.round((qEnd - qStart) / 86400000) + 1;
      const qElapsedDays = Math.round((now - qStart) / 86400000) + 1;
      return `${qElapsedDays}/${qTotalDays}`;
    }

    if (type === 'year') {
      const yearStart = new Date(Y, 0, 1);
      const yearEnd = new Date(Y + 1, 0, 0);
      const yTotalDays = Math.round((yearEnd - yearStart) / 86400000) + 1;
      const yElapsedDays = Math.round((now - yearStart) / 86400000) + 1;
      return `${yElapsedDays}/${yTotalDays}`;
    }

    if (type === '5years') {
      const startYear = Math.floor(Y / 5) * 5;
      const blockStart = new Date(startYear, 0, 1);
      const blockEnd = new Date(startYear + 5, 0, 1);
      const elapsedMs = now - blockStart;
      const totalMs = blockEnd - blockStart;
      const elapsedYearsDecimal = (elapsedMs / totalMs * 5).toFixed(1);
      return `${elapsedYearsDecimal}/5`;
    }

    if (type === 'next5years') {
      const startYear = Math.floor(Y / 5) * 5 + 5;
      const blockStart = new Date(startYear, 0, 1);
      const blockEnd = new Date(startYear + 5, 0, 1);
      const elapsedMs = Math.max(0, now - blockStart);
      const totalMs = blockEnd - blockStart;
      const elapsedYearsDecimal = (elapsedMs / totalMs * 5).toFixed(1);
      return `${elapsedYearsDecimal}/5`;
    }

    return '';
  }

  function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }

  function parseCellKey(cellKey) {
    if (!cellKey) return null;
    const parts = cellKey.split('_');
    if (parts.length === 2) {
      const c = parseInt(parts[0]), r = parseInt(parts[1]);
      return { cStart: c, rStart: r, cEnd: c, rEnd: r };
    } else if (parts.length === 4) {
      return {
        cStart: parseInt(parts[0]),
        rStart: parseInt(parts[1]),
        cEnd: parseInt(parts[2]),
        rEnd: parseInt(parts[3])
      };
    }
    return null;
  }

  function getCellKey(span) {
    if (span.cStart === span.cEnd && span.rStart === span.rEnd) {
      return span.cStart + "_" + span.rStart;
    }
    return span.cStart + "_" + span.rStart + "_" + span.cEnd + "_" + span.rEnd;
  }

  function getActiveCells(page) {
    const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
    const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];
    const cols = vg.length - 1;
    const rows = hg.length - 1;

    const merged = page.mergedCells || [];
    const active = [...merged];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const covered = merged.some(m => c >= m.cStart && c <= m.cEnd && r >= m.rStart && r <= m.rEnd);
        if (!covered) {
          active.push({ cStart: c, rStart: r, cEnd: c, rEnd: r });
        }
      }
    }
    return active;
  }

  function mergeMiroCellRange(page, cStart, rStart, cEnd, rEnd) {
    if (!page.mergedCells) page.mergedCells = [];

    // Remove overlapping merged cells
    page.mergedCells = page.mergedCells.filter(m => {
      const noOverlap = m.cStart > cEnd || m.cEnd < cStart || m.rStart > rEnd || m.rEnd < rStart;
      return noOverlap;
    });

    page.mergedCells.push({ cStart, rStart, cEnd, rEnd });

    const canvas = document.getElementById('miro-canvas');
    if (canvas) {
      partitionMiroCardsIntoCells(page, canvas.clientWidth, canvas.clientHeight);
    }
  }

  window.parseCellKey = parseCellKey;
  window.getActiveCells = getActiveCells;
  window.mergeMiroCellRange = mergeMiroCellRange;

  function parseTitleAndIcon(titleStr) {
    if (!titleStr) return { title: '', icon: null };
    // Match http/https URLs or base64 data URIs
    const imgRegex = /(https?:\/\/[^\s]+|data:image\/[a-zA-Z0-9+/=]*;base64,[^\s]+)/i;
    const match = titleStr.match(imgRegex);
    if (match) {
      const icon = match[1];
      const title = titleStr.replace(icon, '').trim();
      return { title, icon };
    }
    return { title: titleStr, icon: null };
  }

  function updateCellBackgroundGrid(cellDiv, state) {
    if (!state) return;
    const cellZoom = (state.zoom || 100) / 100;
    const cellPanX = state.panX || 0;
    const cellPanY = state.panY || 0;

    // Grid rendering inside the cell
    const BASE = 10;
    const FACTOR = 5;

    let fine = BASE;
    while (fine * cellZoom < 8) fine *= FACTOR;
    while (fine * cellZoom > 200) fine /= FACTOR;

    const medium = fine * FACTOR;
    const coarse = medium * FACTOR;

    const fineScreen = fine * cellZoom;
    const medScreen = medium * cellZoom;
    const coarseScreen = coarse * cellZoom;

    const fineAlpha = Math.max(0, Math.min(1, (fineScreen - 6) / 25)) * 0.05;
    const medAlpha = Math.max(0, Math.min(1, (medScreen - 6) / 40)) * 0.10;
    const coarseAlpha = Math.max(0, Math.min(1, (coarseScreen - 6) / 60)) * 0.16;

    const layers = [];
    const sizes = [];
    const positions = [];

    function addLevel(screenSize, alpha) {
      if (alpha < 0.002) return;
      const c = `rgba(0,0,0,${alpha.toFixed(4)})`;
      layers.push(
        `linear-gradient(${c} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${c} 1px, transparent 1px)`,
      );
      const s = `${screenSize}px ${screenSize}px`;
      sizes.push(s, s);
      const ox = cellPanX % screenSize;
      const oy = cellPanY % screenSize;
      const p = `${ox}px ${oy}px`;
      positions.push(p, p);
    }

    addLevel(fineScreen, fineAlpha);
    addLevel(medScreen, medAlpha);
    addLevel(coarseScreen, coarseAlpha);

    if (layers.length) {
      cellDiv.style.backgroundImage = layers.join(',');
      cellDiv.style.backgroundSize = sizes.join(',');
      cellDiv.style.backgroundPosition = positions.join(',');
    } else {
      cellDiv.style.backgroundImage = 'none';
    }
  }

  // Initialize Slices Mode UI, event listeners, and rulers
  window.initMiroSlices = function initMiroSlices() {
    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;

    // Remove existing rulers
    document.querySelectorAll('.miro-ruler').forEach(el => el.remove());

    const page = cp();
    if (!page || page.pageType !== 'miro' || !page._guidesMode) return;

    // Append Rulers
    const rTop = document.createElement('div');
    rTop.className = 'miro-ruler miro-ruler-top';
    const rLeft = document.createElement('div');
    rLeft.className = 'miro-ruler miro-ruler-left';
    const rCorner = document.createElement('div');
    rCorner.className = 'miro-ruler miro-ruler-corner';

    // Drag from rulers to create new guide
    rTop.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (!page.vGuides) page.vGuides = [];
      page.vGuides.push(pct);
      sv();
      partitionMiroCardsIntoCells(page, rect.width, rect.height);
      buildMiroCanvas();
      // Start dragging immediately
      const idx = page.vGuides.length - 1;
      _activeGuideDrag = { type: 'v', idx, startPct: pct, startClient: e.clientX };
    };

    rLeft.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pct = (e.clientY - rect.top) / rect.height;
      if (!page.hGuides) page.hGuides = [];
      page.hGuides.push(pct);
      sv();
      partitionMiroCardsIntoCells(page, rect.width, rect.height);
      buildMiroCanvas();
      // Start dragging immediately
      const idx = page.hGuides.length - 1;
      _activeGuideDrag = { type: 'h', idx, startPct: pct, startClient: e.clientY };
    };

    canvas.appendChild(rCorner);
    canvas.appendChild(rTop);
    canvas.appendChild(rLeft);
  };

  // Add event listeners for guide dragging globally
  document.addEventListener('mousemove', (e) => {
    if (_activeLabelDrag) {
      const drag = _activeLabelDrag;
      drag.cloneEl.style.left = (e.clientX - drag.offsetX) + 'px';
      drag.cloneEl.style.top = (e.clientY - drag.offsetY) + 'px';
      return;
    }

    if (window._activeLayoutGuideDrag) {
      const drag = window._activeLayoutGuideDrag;
      const page = cp();
      if (!page) return;
      const cellEl = document.querySelector(`.miro-cell-viewport[data-cell-key="${drag.cellKey}"]`);
      if (!cellEl) return;
      const rect = cellEl.getBoundingClientRect();

      if (drag.type === 'v') {
        const delta = e.clientX - drag.startClient;
        let newPct = drag.startPct + (delta / rect.width);
        newPct = Math.max(0.01, Math.min(0.99, newPct));
        if (page.cellGuides && page.cellGuides[drag.cellKey]) {
          page.cellGuides[drag.cellKey].v[drag.idx] = newPct;
        }
        const el = cellEl.querySelector(`.miro-layout-guide-v[data-cell-key="${drag.cellKey}"][data-idx="${drag.idx}"]`);
        if (el) {
          el.style.left = (newPct * 100) + '%';
        }
      } else {
        const delta = e.clientY - drag.startClient;
        let newPct = drag.startPct + (delta / rect.height);
        newPct = Math.max(0.01, Math.min(0.99, newPct));
        if (page.cellGuides && page.cellGuides[drag.cellKey]) {
          page.cellGuides[drag.cellKey].h[drag.idx] = newPct;
        }
        const el = cellEl.querySelector(`.miro-layout-guide-h[data-cell-key="${drag.cellKey}"][data-idx="${drag.idx}"]`);
        if (el) {
          el.style.top = (newPct * 100) + '%';
        }
      }
      return;
    }

    if (!_activeGuideDrag) return;
    const page = cp();
    if (!page) return;
    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (_activeGuideDrag.type === 'v') {
      const delta = e.clientX - _activeGuideDrag.startClient;
      let newPct = _activeGuideDrag.startPct + (delta / rect.width);
      newPct = Math.max(0.02, Math.min(0.98, newPct)); // limit range
      
      // Update guide percentage
      page.vGuides[_activeGuideDrag.idx] = newPct;
      
      // Live visual update of guides elements (cheap)
      const guideEls = document.querySelectorAll(`.miro-guide-v[data-idx="${_activeGuideDrag.idx}"]`);
      guideEls.forEach(el => {
        el.style.left = (newPct * 100) + '%';
      });
    } else {
      const delta = e.clientY - _activeGuideDrag.startClient;
      let newPct = _activeGuideDrag.startPct + (delta / rect.height);
      newPct = Math.max(0.02, Math.min(0.98, newPct)); // limit range
      
      // Update guide percentage
      page.hGuides[_activeGuideDrag.idx] = newPct;
      
      // Live visual update of guides elements (cheap)
      const guideEls = document.querySelectorAll(`.miro-guide-h[data-idx="${_activeGuideDrag.idx}"]`);
      guideEls.forEach(el => {
        el.style.top = (newPct * 100) + '%';
      });
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (window._activeLayoutGuideDrag) {
      window._activeLayoutGuideDrag = null;
      sv();
      buildMiroCanvas();
      return;
    }

    if (_activeLabelDrag) {
      const drag = _activeLabelDrag;
      drag.cloneEl.remove();
      document.body.style.cursor = '';
      
      // Determine which cell viewport is underneath the mouse
      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      const cellViewport = targetEl ? targetEl.closest('.miro-cell-viewport') : null;
      
      if (cellViewport) {
        const destCellKey = cellViewport.dataset.cellKey;
        if (destCellKey && destCellKey !== drag.srcCellKey) {
          performLabelTransfer(drag.srcCellKey, destCellKey, drag.mode);
        }
      }
      
      _activeLabelDrag = null;
      return;
    }

    if (!_activeGuideDrag) return;
    const page = cp();
    if (page) {
      // Re-partition cards on release to assign to new boundaries
      const canvas = document.getElementById('miro-canvas');
      const rect = canvas.getBoundingClientRect();
      partitionMiroCardsIntoCells(page, rect.width, rect.height);
      sv();
      buildMiroCanvas();
    }
    _activeGuideDrag = null;
  });

  // Render sliced cell viewports inside #miro-canvas
  window.renderMiroSlices = function renderMiroSlices(page) {
    const board = document.getElementById('miro-board');
    if (!board) return;

    // Reset board transforms so cell containers scale properly if in Slices edit mode
    if (page._guidesMode) {
      board.style.transform = 'none';
      board.style.zIndex = '2000';
      board.style.pointerEvents = 'none';
    } else {
      board.style.zIndex = '';
      board.style.pointerEvents = '';
    }

    const canvas = document.getElementById('miro-canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;

    // Set board width/height to canvas size so child percentages resolve correctly
    board.style.width = W + 'px';
    board.style.height = H + 'px';

    // Automatically partition any new/unpartitioned cards
    if (typeof window.partitionMiroCardsIntoCells === 'function') {
      window.partitionMiroCardsIntoCells(page, W, H);
    }

    const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
    const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];
    const cols = vg.length - 1;
    const rows = hg.length - 1;

    // Ensure cellStates is initialized
    if (!page.cellStates) page.cellStates = {};
    let cellMetadataChanged = false;

    function drawCellViewport(cellKey, isCustom, customCell, span) {
      const cellDiv = document.createElement('div');
      cellDiv.className = 'miro-cell-viewport';
      cellDiv.dataset.cellKey = cellKey;

      let cw = 0, ch = 0;

      if (isCustom) {
        cellDiv.dataset.isCustom = 'true';
        cellDiv.style.left = (customCell.x * 100) + '%';
        cellDiv.style.width = (customCell.w * 100) + '%';
        cellDiv.style.top = (customCell.y * 100) + '%';
        cellDiv.style.height = (customCell.h * 100) + '%';
        cellDiv.style.border = '3px solid rgba(255, 138, 101, 0.7)';
        cellDiv.style.borderRadius = '16px';
        cellDiv.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.65), inset 0 0 15px rgba(255, 138, 101, 0.2)';
        
        cw = W * customCell.w;
        ch = H * customCell.h;
      } else {
        const c = span.cStart;
        const r = span.rStart;
        const cEnd = span.cEnd;
        const rEnd = span.rEnd;

        cellDiv.dataset.col = c;
        cellDiv.dataset.row = r;
        cellDiv.style.left = (vg[c] * 100) + '%';
        cellDiv.style.width = ((vg[cEnd+1] - vg[c]) * 100) + '%';
        cellDiv.style.top = (hg[r] * 100) + '%';
        cellDiv.style.height = ((hg[rEnd+1] - hg[r]) * 100) + '%';
        cellDiv.style.border = '1px dashed rgba(108, 143, 255, 0.35)';
        cellDiv.style.borderRadius = '12px';
        cellDiv.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(108, 143, 255, 0.15)';

        cw = W * (vg[cEnd+1] - vg[c]);
        ch = H * (hg[rEnd+1] - hg[r]);
      }

      // Apply custom background color if set
      if (page.cellStates[cellKey] && page.cellStates[cellKey].bgColor) {
        const bg = page.cellStates[cellKey].bgColor;
        const opacity = page.cellStates[cellKey].bgOpacity != null ? page.cellStates[cellKey].bgOpacity : 0.15;
        const overlay = document.createElement('div');
        overlay.className = 'miro-cell-bg-overlay';
        overlay.style.background = bg;
        overlay.style.opacity = opacity;
        cellDiv.appendChild(overlay);
      }

      // Retrieve or initialize cell zoom & pan state
      if (!page.cellStates[cellKey]) {
        page.cellStates[cellKey] = { zoom: 30, panX: 0, panY: 0 };
        cellMetadataChanged = true;
      }
      const cellState = page.cellStates[cellKey];

      // Dynamic Title value transition tracking
      if (cellState.dynamicType) {
        const currentDynamicVal = getDynamicTitleValue(cellState.dynamicType);
        if (cellState.lastDynamicValue !== currentDynamicVal) {
          if (cellState.lastDynamicValue) {
            cellState.changeCount = (cellState.changeCount || 0) + 1;
            cellState.hasUnacknowledgedChange = true;
          } else {
            cellState.firstSetAt = new Date().toLocaleString();
            cellState.changeCount = 0;
            cellState.hasUnacknowledgedChange = false;
          }
          cellState.lastDynamicValue = currentDynamicVal;
          cellMetadataChanged = true;
        }
      }

      // Interactive cell label with title, color tag, and zoom
      const lbl = document.createElement('div');
      lbl.className = 'miro-cell-label';
      if (cellState.hasUnacknowledgedChange) {
        lbl.classList.add('has-change');
      }
      if (cellState.changeCount > 0) {
        lbl.setAttribute('title', `Started: ${cellState.firstSetAt || ''} (${cellState.changeCount})`);
      }

      // Checkbox for merge/split selection
      if (window._mergeSelectionMode) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'miro-cell-merge-cb';
        cb.dataset.cellKey = cellKey;
        cb.style.cssText = 'width: 16px; height: 16px; cursor: pointer; pointer-events: auto; z-index: 100; margin-right: 6px; accent-color: #6c8fff;';
        if (window._selectedCellsForMerge && window._selectedCellsForMerge.has(cellKey)) {
          cb.checked = true;
        }
        cb.onclick = (e) => {
          e.stopPropagation(); // prevent opening settings modal
        };
        cb.onchange = (e) => {
          if (!window._selectedCellsForMerge) window._selectedCellsForMerge = new Set();
          if (cb.checked) {
            window._selectedCellsForMerge.add(cellKey);
          } else {
            window._selectedCellsForMerge.delete(cellKey);
          }
        };
        lbl.appendChild(cb);
      }

      // Determine icon and title
      const userTitle = cellState.title || '';
      const dynamicVal = cellState.dynamicType ? getDynamicTitleValue(cellState.dynamicType) : '';
      let displayIcon = cellState.icon || '';
      let iconSize = cellState.iconSize || 40;

      // Fallback parser if icon is not set but title contains one
      let parsedTitle = userTitle;
      if (!displayIcon && userTitle) {
        const parsed = parseTitleAndIcon(userTitle);
        parsedTitle = parsed.title;
        displayIcon = parsed.icon;
      }

      // Left Column: Icon Image (if present)
      if (displayIcon) {
        const img = document.createElement('img');
        img.src = displayIcon;
        img.style.width = iconSize + 'px';
        img.style.height = iconSize + 'px';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '4px';
        img.style.flexShrink = '0';
        lbl.appendChild(img);
      }

      // Right Column: Stack of text rows
      const textStack = document.createElement('div');
      textStack.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2px;';

      // Row 1: Title Text (with Color tag dot if present)
      const row1 = document.createElement('div');
      row1.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 4px; font-weight: bold;';

      // Color tag dot
      if (cellState.colorTag) {
        const dot = document.createElement('span');
        dot.className = 'miro-cell-color-tag';
        dot.style.background = cellState.colorTag;
        row1.appendChild(dot);
      }

      // Title Text
      let defaultName = '';
      if (isCustom) {
        defaultName = customCell.title || 'Screen';
      } else {
        const c = span.cStart;
        const r = span.rStart;
        const cEnd = span.cEnd;
        const rEnd = span.rEnd;
        defaultName = `Cell [${c+1}, ${r+1}]`;
        if (c !== cEnd || r !== rEnd) {
          defaultName = `Merged Cell [${c+1},${r+1} to ${cEnd+1},${rEnd+1}]`;
        }
      }
      const line1Text = parsedTitle || dynamicVal || defaultName;
      const titleSpan = document.createElement('span');
      titleSpan.textContent = line1Text;
      row1.appendChild(titleSpan);
      textStack.appendChild(row1);

      // Row 2: Dynamic value (only if User Title was used on Row 1)
      if (parsedTitle && dynamicVal) {
        const row2 = document.createElement('div');
        row2.style.cssText = 'font-size: 0.6rem; opacity: 0.85; font-weight: normal;';
        row2.textContent = dynamicVal;
        textStack.appendChild(row2);
      }

      // Row 3: Zoom percentage + Dynamic Progress tag
      const row3 = document.createElement('div');
      row3.className = 'miro-cell-zoom-text';
      row3.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px;';
      
      const zoomSpan = document.createElement('span');
      zoomSpan.className = 'zoom-value';
      zoomSpan.textContent = `${cellState.zoom || 100}%`;
      row3.appendChild(zoomSpan);

      if (cellState.dynamicType) {
        const progVal = getDynamicProgressValue(cellState.dynamicType);
        if (progVal) {
          const sep = document.createElement('span');
          sep.textContent = '•';
          sep.style.opacity = '0.5';
          row3.appendChild(sep);

          const progSpan = document.createElement('span');
          progSpan.className = 'miro-cell-progress-text';
          progSpan.textContent = progVal;
          row3.appendChild(progSpan);
        }
      }
      textStack.appendChild(row3);

      lbl.appendChild(textStack);

      // Click to open settings modal
      lbl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        showCellSettingsModal(cellKey);
      });

      // Right-click label context menu
      lbl.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showCellLabelContextMenu(ev, cellKey);
      });

      // Ctrl/Alt drag shortcuts
      lbl.addEventListener('mousedown', (e) => {
        if (e.ctrlKey || e.altKey) {
          e.stopPropagation();
          e.preventDefault();
          startLabelDrag(e, cellKey, e.ctrlKey ? 'cut' : 'copy');
        }
      });

      cellDiv.appendChild(lbl);

      // Internal cell board
      const cellBoard = document.createElement('div');
      cellBoard.className = 'miro-cell-board';
      cellBoard.style.position = 'absolute';
      cellBoard.style.left = '0';
      cellBoard.style.top = '0';
      cellBoard.style.width = '100%';
      cellBoard.style.height = '100%';
      cellBoard.style.transformOrigin = '0 0';

      // Retrieve or initialize cell zoom & pan state
      if (!page.cellStates[cellKey]) {
        page.cellStates[cellKey] = { zoom: 30, panX: 0, panY: 0 };
      }
      const state = page.cellStates[cellKey];
      
      // Clamp and apply transforms
      clampCellState(cellKey, cw, ch);

      // Apply background grid
      updateCellBackgroundGrid(cellDiv, state);

      const z = state.zoom / 100;
      cellBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${z})`;
      cellBoard.style.setProperty('--inv-zoom', 1 / z);

      // Render card child elements
      const cellCards = (page.miroCards || []).filter(card => card.cell === cellKey);
      const buildersMap = {
        sticky: 'buildMiroSticky',
        image: 'buildMiroImage',
        text: 'buildMiroText',
        shape: 'buildMiroShape',
        pen: 'buildMiroPen',
        grid: 'buildMiroGridCard',
        mindmap: 'buildMiroMindMap',
        trello: 'buildMiroTrello',
        bwidget: 'buildMiroBookmarkWidget',
        array: 'buildMiroArray',
        calendar: 'buildMiroGantt',
        gantt: 'buildMiroGantt',
        embed: 'buildMiroEmbed',
        'overlay-page': 'buildMiroOverlayWidget',
        life: 'buildMiroLifeWidget',
      };

      cellCards.forEach((card) => {
        try {
          const fnName = buildersMap[card.type];
          const fn = fnName ? window[fnName] : null;
          const fallback = window.buildMiroCard;
          let el;
          if (typeof fn === 'function') el = fn(card);
          else if (typeof fallback === 'function') el = fallback(card);
          
          if (el) {
            // Hide delete/lock buttons if the widget is inside grid layout (cleaner)
            const delBtn = el.querySelector('.mc-del');
            const lockBtn = el.querySelector('.mc-lock');
            if (delBtn) delBtn.style.setProperty('--inv-zoom', '1');
            if (lockBtn) lockBtn.style.setProperty('--inv-zoom', '1');
            
            if (card.pinned) {
              cellDiv.appendChild(el);
              el.style.position = 'absolute';
              el.style.left = (card._pinCellX || 0) + 'px';
              el.style.top = (card._pinCellY || 0) + 'px';
              el.style.width = (card._pinCellW || card.w || 200) + 'px';
              el.style.height = (card._pinCellH || card.h || 150) + 'px';
              el.style.zIndex = '20';
              el.style.transform = 'none';
            } else {
              cellBoard.appendChild(el);
            }
          }
        } catch (err) {
          console.error('[CELL RENDER ERROR]', card && card.type, card && card.id, err);
        }
      });

      cellDiv.appendChild(cellBoard);

      // --- LAYOUT GUIDES & LOCAL RULERS IMPLEMENTATION ---
      if (!page.cellGuides) page.cellGuides = {};
      if (!page.cellGuides[cellKey]) page.cellGuides[cellKey] = { v: [], h: [] };

      // Render local rulers if layout guides edit mode is active
      if (page._layoutGuidesMode) {
        const crTop = document.createElement('div');
        crTop.className = 'miro-cell-ruler miro-cell-ruler-top';
        const crLeft = document.createElement('div');
        crLeft.className = 'miro-cell-ruler miro-cell-ruler-left';
        const crCorner = document.createElement('div');
        crCorner.className = 'miro-cell-ruler miro-cell-ruler-corner';

        crTop.onmousedown = (e) => {
          e.stopPropagation(); e.preventDefault();
          const rect = cellDiv.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          if (!page.cellGuides) page.cellGuides = {};
          if (!page.cellGuides[cellKey]) page.cellGuides[cellKey] = { v: [], h: [] };
          page.cellGuides[cellKey].v.push(pct);
          sv();
          buildMiroCanvas();
          const idx = page.cellGuides[cellKey].v.length - 1;
          window._activeLayoutGuideDrag = { cellKey, type: 'v', idx, startPct: pct, startClient: e.clientX };
        };

        crLeft.onmousedown = (e) => {
          e.stopPropagation(); e.preventDefault();
          const rect = cellDiv.getBoundingClientRect();
          const pct = (e.clientY - rect.top) / rect.height;
          if (!page.cellGuides) page.cellGuides = {};
          if (!page.cellGuides[cellKey]) page.cellGuides[cellKey] = { v: [], h: [] };
          page.cellGuides[cellKey].h.push(pct);
          sv();
          buildMiroCanvas();
          const idx = page.cellGuides[cellKey].h.length - 1;
          window._activeLayoutGuideDrag = { cellKey, type: 'h', idx, startPct: pct, startClient: e.clientY };
        };

        cellDiv.appendChild(crCorner);
        cellDiv.appendChild(crTop);
        cellDiv.appendChild(crLeft);
      }

      // Render vertical and horizontal layout guides
      const guides = page.cellGuides && page.cellGuides[cellKey];
      if (guides) {
        (guides.v || []).forEach((pct, idx) => {
          const seg = document.createElement('div');
          seg.className = 'miro-layout-guide-v';
          seg.dataset.cellKey = cellKey;
          seg.dataset.idx = idx;
          seg.style.left = (pct * 100) + '%';
          seg.style.top = '0';
          seg.style.bottom = '0';

          const line = document.createElement('div');
          line.className = 'miro-layout-guide-line miro-layout-guide-line-v';
          seg.appendChild(line);

          if (!page._layoutGuidesMode) {
            seg.style.pointerEvents = 'none';
            seg.style.cursor = 'default';
          } else {
            seg.onmousedown = (e) => {
              e.stopPropagation(); e.preventDefault();
              window._activeLayoutGuideDrag = { cellKey, type: 'v', idx, startPct: pct, startClient: e.clientX };
            };
            seg.oncontextmenu = (e) => {
              e.preventDefault(); e.stopPropagation();
              showLayoutGuideContextMenu(e, cellKey, 'v', idx);
            };
          }
          cellDiv.appendChild(seg);
        });

        (guides.h || []).forEach((pct, idx) => {
          const seg = document.createElement('div');
          seg.className = 'miro-layout-guide-h';
          seg.dataset.cellKey = cellKey;
          seg.dataset.idx = idx;
          seg.style.top = (pct * 100) + '%';
          seg.style.left = '0';
          seg.style.right = '0';

          const line = document.createElement('div');
          line.className = 'miro-layout-guide-line miro-layout-guide-line-h';
          seg.appendChild(line);

          if (!page._layoutGuidesMode) {
            seg.style.pointerEvents = 'none';
            seg.style.cursor = 'default';
          } else {
            seg.onmousedown = (e) => {
              e.stopPropagation(); e.preventDefault();
              window._activeLayoutGuideDrag = { cellKey, type: 'h', idx, startPct: pct, startClient: e.clientY };
            };
            seg.oncontextmenu = (e) => {
              e.preventDefault(); e.stopPropagation();
              showLayoutGuideContextMenu(e, cellKey, 'h', idx);
            };
          }
          cellDiv.appendChild(seg);
        });
      }
      // --- END LAYOUT GUIDES ---

      canvas.appendChild(cellDiv);
    }

    // Render normal active cell viewports (if guides exist)
    const hasGridGuides = page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0));
    if (hasGridGuides) {
      const activeCells = getActiveCells(page);
      activeCells.forEach((span) => {
        const cellKey = getCellKey(span);
        drawCellViewport(cellKey, false, null, span);
      });
    } else {
      // If there are no guides, render one single full-boundary grid cell covering 100% W and H
      drawCellViewport("0_0", false, null, { cStart: 0, rStart: 0, cEnd: 0, rEnd: 0 });
    }

    // Render Custom Cells viewports
    if (page.customCells) {
      page.customCells.forEach((cc) => {
        drawCellViewport(cc.id, true, cc, null);
      });
    }

    // Render draggable guide overlays if guides exist
    const hasGuides = page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0));
    if (hasGuides && page._guidesMode) {
      // Render Vertical Guides
      (page.vGuides || []).forEach((pct, idx) => {
        const gIdx = vg.indexOf(pct) - 1;

        for (let r = 0; r < rows; r++) {
          const isCrossed = (page.mergedCells || []).some(m => {
            return r >= m.rStart && r <= m.rEnd && m.cStart <= gIdx && gIdx < m.cEnd;
          });
          if (isCrossed) continue;

          const segment = document.createElement('div');
          segment.className = 'miro-guide-v';
          segment.dataset.idx = idx;
          segment.style.left = (pct * 100) + '%';
          segment.style.top = (hg[r] * 100) + '%';
          segment.style.height = ((hg[r+1] - hg[r]) * 100) + '%';
          segment.style.bottom = 'auto';

          const lineVisual = document.createElement('div');
          lineVisual.className = 'miro-guide-line miro-guide-line-v';
          if (page.lockedGuides && page.lockedGuides.indexOf('v_' + idx) !== -1) {
            lineVisual.classList.add('is-locked');
          }
          segment.appendChild(lineVisual);

          if (!page._guidesMode) {
            segment.style.pointerEvents = 'none';
            segment.style.cursor = 'default';
          }

          // Events
          segment.onmousedown = (e) => {
            if (page.lockedGuides && page.lockedGuides.indexOf('v_' + idx) !== -1) return;
            e.stopPropagation(); e.preventDefault();
            _activeGuideDrag = { type: 'v', idx, startPct: pct, startClient: e.clientX };
          };

          segment.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            showSlicesContextMenu(e, 'v', idx);
          };

          canvas.appendChild(segment);
        }
      });

      // Render Horizontal Guides
      (page.hGuides || []).forEach((pct, idx) => {
        const gIdx = hg.indexOf(pct) - 1;

        for (let c = 0; c < cols; c++) {
          const isCrossed = (page.mergedCells || []).some(m => {
            return c >= m.cStart && c <= m.cEnd && m.rStart <= gIdx && gIdx < m.rEnd;
          });
          if (isCrossed) continue;

          const segment = document.createElement('div');
          segment.className = 'miro-guide-h';
          segment.dataset.idx = idx;
          segment.style.top = (pct * 100) + '%';
          segment.style.left = (vg[c] * 100) + '%';
          segment.style.width = ((vg[c+1] - vg[c]) * 100) + '%';
          segment.style.right = 'auto';

          const lineVisual = document.createElement('div');
          lineVisual.className = 'miro-guide-line miro-guide-line-h';
          if (page.lockedGuides && page.lockedGuides.indexOf('h_' + idx) !== -1) {
            lineVisual.classList.add('is-locked');
          }
          segment.appendChild(lineVisual);

          if (!page._guidesMode) {
            segment.style.pointerEvents = 'none';
            segment.style.cursor = 'default';
          }

          // Events
          segment.onmousedown = (e) => {
            if (page.lockedGuides && page.lockedGuides.indexOf('h_' + idx) !== -1) return;
            e.stopPropagation(); e.preventDefault();
            _activeGuideDrag = { type: 'h', idx, startPct: pct, startClient: e.clientY };
          };

          segment.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            showSlicesContextMenu(e, 'h', idx);
          };

          canvas.appendChild(segment);
        }
      });
    }

    if (cellMetadataChanged) {
      setTimeout(() => {
        sv();
      }, 0);
    }
  };

  // Show custom context menu for locking or deleting guides
  function showSlicesContextMenu(e, type, idx) {
    document.querySelectorAll('.miro-slices-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'miro-slices-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const page = cp();
    if (!page.lockedGuides) page.lockedGuides = [];
    const guideKey = type + '_' + idx;
    const isLocked = page.lockedGuides.indexOf(guideKey) !== -1;

    // Lock Item
    const lockItem = document.createElement('div');
    lockItem.className = 'miro-slices-menu-item';
    lockItem.textContent = isLocked ? '🔓 Unlock Guide' : '🔒 Lock Guide';
    lockItem.onclick = () => {
      if (isLocked) {
        page.lockedGuides = page.lockedGuides.filter(k => k !== guideKey);
      } else {
        page.lockedGuides.push(guideKey);
      }
      menu.remove();
      sv();
      buildMiroCanvas();
    };
    menu.appendChild(lockItem);

    // Delete Item
    const delItem = document.createElement('div');
    delItem.className = 'miro-slices-menu-item';
    delItem.textContent = '🗑️ Delete Guide';
    delItem.onclick = () => {
      const canvas = document.getElementById('miro-canvas');
      const W = canvas.clientWidth, H = canvas.clientHeight;
      
      // Merge cells first to prevent card deletion
      mergeMiroCellsIntoCards(page, W, H);
      
      // Clear merged cells because grid layout has changed
      page.mergedCells = [];
      
      if (type === 'v') {
        page.vGuides.splice(idx, 1);
      } else {
        page.hGuides.splice(idx, 1);
      }
      
      // Re-partition with new guides list
      partitionMiroCardsIntoCells(page, W, H);
      menu.remove();
      sv();
      buildMiroCanvas();
    };
    menu.appendChild(delItem);

    document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
  }

  // Show custom context menu for locking or deleting layout guides
  function showLayoutGuideContextMenu(e, cellKey, type, idx) {
    document.querySelectorAll('.miro-slices-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'miro-slices-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const page = cp();
    const delItem = document.createElement('div');
    delItem.className = 'miro-slices-menu-item';
    delItem.textContent = '🗑️ Delete Guide';
    delItem.onclick = () => {
      if (page.cellGuides && page.cellGuides[cellKey] && page.cellGuides[cellKey][type]) {
        page.cellGuides[cellKey][type].splice(idx, 1);
        sv();
        buildMiroCanvas();
      }
      menu.remove();
    };
    menu.appendChild(delItem);

    document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
  }

  // Constrain cell panX and panY so that card bounds don't disappear
  window.clampCellState = function clampCellState(cellKey, cellW, cellH) {
    const page = cp();
    if (!page || !page.cellStates || !page.cellStates[cellKey]) return;
    const state = page.cellStates[cellKey];
    const zoom = state.zoom / 100;

    const cards = (page.miroCards || []).filter(c => c.cell === cellKey);
    if (cards.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach(c => {
      minX = Math.min(minX, c.x || 0);
      minY = Math.min(minY, c.y || 0);
      maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
      maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
    });

    const contentW = (maxX - minX) * zoom;
    if (contentW <= cellW) {
      const minPan = -minX * zoom;
      const maxPan = cellW - maxX * zoom;
      state.panX = Math.max(minPan, Math.min(maxPan, state.panX));
    } else {
      const minPan = cellW - maxX * zoom;
      const maxPan = -minX * zoom;
      state.panX = Math.max(minPan, Math.min(maxPan, state.panX));
    }

    const contentH = (maxY - minY) * zoom;
    if (contentH <= cellH) {
      const minPan = -minY * zoom;
      const maxPan = cellH - maxY * zoom;
      state.panY = Math.max(minPan, Math.min(maxPan, state.panY));
    } else {
      const minPan = cellH - maxY * zoom;
      const maxPan = -minY * zoom;
      state.panY = Math.max(minPan, Math.min(maxPan, state.panY));
    }
  };

  // Convert absolute coordinates to cell-local coordinates based on guide percentages & custom cells
  window.partitionMiroCardsIntoCells = function partitionMiroCardsIntoCells(page, canvasW, canvasH) {
    if (!page.vGuides) page.vGuides = [];
    if (!page.hGuides) page.hGuides = [];
    const hasGuides = page.vGuides.length > 0 || page.hGuides.length > 0;
    const hasCustom = page.customCells && page.customCells.length > 0;
    if (!hasGuides && !hasCustom) return;

    const vg = [0, ...[...page.vGuides].sort((a,b)=>a-b), 1];
    const hg = [0, ...[...page.hGuides].sort((a,b)=>a-b), 1];

    (page.miroCards || []).forEach(card => {
      // Calculate absolute center coords in board space
      let absCX = card.x || 0;
      let absCY = card.y || 0;
      let cellZoom = 1;
      let cellPanX = 0;
      let cellPanY = 0;
      let cellLeft = 0;
      let cellTop = 0;

      if (card.cell) {
        const state = (page.cellStates && page.cellStates[card.cell]) || { zoom: 100, panX: 0, panY: 0 };
        cellZoom = (state.zoom || 100) / 100;
        cellPanX = state.panX || 0;
        cellPanY = state.panY || 0;

        if (card.cell.startsWith('cc_')) {
          const cc = (page.customCells || []).find(c => c.id === card.cell);
          if (cc) {
            cellLeft = cc.x * canvasW;
            cellTop = cc.y * canvasH;
          }
        } else {
          const parts = card.cell.split('_');
          const c = parseInt(parts[0]), r = parseInt(parts[1]);
          cellLeft = (vg[c] || 0) * canvasW;
          cellTop = (hg[r] || 0) * canvasH;
        }
      }

      absCX = cellLeft + cellPanX + ((card.x || 0) + (card.w || 280) / 2) * cellZoom;
      absCY = cellTop + cellPanY + ((card.y || 0) + (card.h || 240) / 2) * cellZoom;

      // Percentage coordinate of center relative to canvas
      const pctX = absCX / canvasW;
      const pctY = absCY / canvasH;

      // 1. Check if dropped inside a custom cell (in reverse order to match topmost drawn)
      let targetCustomCell = null;
      if (page.customCells) {
        for (let i = page.customCells.length - 1; i >= 0; i--) {
          const cc = page.customCells[i];
          if (pctX >= cc.x && pctX <= (cc.x + cc.w) && pctY >= cc.y && pctY <= (cc.y + cc.h)) {
            targetCustomCell = cc;
            break;
          }
        }
      }

      if (targetCustomCell) {
        if (card.cell === targetCustomCell.id) return;
        const cellLeft = targetCustomCell.x * canvasW;
        const cellTop = targetCustomCell.y * canvasH;
        const targetState = (page.cellStates && page.cellStates[targetCustomCell.id]) || { zoom: 100, panX: 0, panY: 0 };
        const targetZoom = (targetState.zoom || 100) / 100;
        const targetPanX = targetState.panX || 0;
        const targetPanY = targetState.panY || 0;

        card.cell = targetCustomCell.id;
        card.x = (absCX - cellLeft - targetPanX) / targetZoom - (card.w || 280) / 2;
        card.y = (absCY - cellTop - targetPanY) / targetZoom - (card.h || 240) / 2;
        return;
      }

      // 2. Otherwise partition into normal grid cell viewports (if guides exist)
      if (hasGuides) {
        let col = vg.length - 2;
        for (let i = 0; i < vg.length - 1; i++) {
          if (pctX >= vg[i] && pctX < vg[i+1]) { col = i; break; }
        }

        let row = hg.length - 2;
        for (let i = 0; i < hg.length - 1; i++) {
          if (pctY >= hg[i] && pctY < hg[i+1]) { row = i; break; }
        }

        const mergedCell = (page.mergedCells || []).find(m => col >= m.cStart && col <= m.cEnd && row >= m.rStart && row <= m.rEnd);
        
        let targetCell;
        let cellLeftCol, cellTopRow;
        if (mergedCell) {
          targetCell = mergedCell.cStart + "_" + mergedCell.rStart + "_" + mergedCell.cEnd + "_" + mergedCell.rEnd;
          cellLeftCol = mergedCell.cStart;
          cellTopRow = mergedCell.rStart;
        } else {
          targetCell = col + "_" + row;
          cellLeftCol = col;
          cellTopRow = row;
        }

        if (card.cell === targetCell) return;

        const cellLeft = vg[cellLeftCol] * canvasW;
        const cellTop = hg[cellTopRow] * canvasH;
        const targetState = (page.cellStates && page.cellStates[targetCell]) || { zoom: 30, panX: 0, panY: 0 };
        const targetZoom = (targetState.zoom || 30) / 100;
        const targetPanX = targetState.panX || 0;
        const targetPanY = targetState.panY || 0;

        card.cell = targetCell;
        card.x = (absCX - cellLeft - targetPanX) / targetZoom - (card.w || 280) / 2;
        card.y = (absCY - cellTop - targetPanY) / targetZoom - (card.h || 240) / 2;
      } else {
        // If guides are not active, card falls back to main canvas board (no cell)
        if (card.cell) {
          card.x = absCX - (card.w || 280) / 2;
          card.y = absCY - (card.h || 240) / 2;
          delete card.cell;
        }
      }
    });
  };

  // Convert cell-local coordinates back to absolute coordinates
  window.mergeMiroCellsIntoCards = function mergeMiroCellsIntoCards(page, canvasW, canvasH) {
    if (!page.vGuides) page.vGuides = [];
    if (!page.hGuides) page.hGuides = [];
    
    const vg = [0, ...[...page.vGuides].sort((a,b)=>a-b), 1];
    const hg = [0, ...[...page.hGuides].sort((a,b)=>a-b), 1];

    (page.miroCards || []).forEach(card => {
      if (card.cell) {
        let cellZoom = 1;
        let cellPanX = 0;
        let cellPanY = 0;
        let cellLeft = 0;
        let cellTop = 0;

        const state = (page.cellStates && page.cellStates[card.cell]) || { zoom: 100, panX: 0, panY: 0 };
        cellZoom = (state.zoom || 100) / 100;
        cellPanX = state.panX || 0;
        cellPanY = state.panY || 0;

        if (card.cell.startsWith('cc_')) {
          const cc = (page.customCells || []).find(c => c.id === card.cell);
          if (cc) {
            cellLeft = cc.x * canvasW;
            cellTop = cc.y * canvasH;
          }
        } else {
          const parts = card.cell.split('_');
          const c = parseInt(parts[0]), r = parseInt(parts[1]);
          cellLeft = (vg[c] || 0) * canvasW;
          cellTop = (hg[r] || 0) * canvasH;
        }

        card.x = cellLeft + cellPanX + (card.x || 0) * cellZoom;
        card.y = cellTop + cellPanY + (card.y || 0) * cellZoom;
        delete card.cell;
      }
    });
  };

  // Calculate local zoom level for card dragging
  window.getMiroCardDragZoom = function getMiroCardDragZoom(card) {
    const page = cp();
    if (page && page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0))) {
      if (card.cell && page.cellStates && page.cellStates[card.cell]) {
        return page.cellStates[card.cell].zoom / 100;
      }
    }
    return (page.zoom || 100) / 100;
  };

  // Clamps card x/y coords to keep it inside cell boundaries and layout guides
  window.clampMiroCardDrag = function clampMiroCardDrag(card, x, y) {
    const page = cp();
    if (!page || !card.cell || !page.cellStates || !page.cellStates[card.cell]) return { x, y };

    const cellEl = document.querySelector(`.miro-cell-viewport[data-cell-key="${card.cell}"]`);
    if (!cellEl) return { x, y };

    const cellW = cellEl.clientWidth;
    const cellH = cellEl.clientHeight;
    const state = page.cellStates[card.cell];
    const zoom = state.zoom / 100;

    // Local coordinates limits
    const minX = -state.panX / zoom;
    const maxX = (cellW - state.panX) / zoom - (card.w || 280);
    const minY = -state.panY / zoom;
    const maxY = (cellH - state.panY) / zoom - (card.h || 240);

    let clampedX = maxX >= minX ? Math.max(minX, Math.min(maxX, x)) : minX;
    let clampedY = maxY >= minY ? Math.max(minY, Math.min(maxY, y)) : minY;

    // Apply layout guides blocking and snapping
    const ctrlPressed = !!(window._miroCtrlPressed || _ctrlPressed);
    const guides = page.cellGuides && page.cellGuides[card.cell];
    if (guides && !ctrlPressed) {
      const snapDist = 8 / zoom;
      
      // Vertical Guides
      if (guides.v && guides.v.length > 0 && card._dragStartX !== undefined) {
        const startX = card._dragStartX;
        const localGuidesV = guides.v.map(pct => (pct * cellW - state.panX) / zoom);
        
        localGuidesV.forEach(gx => {
          // Snap right edge
          if (Math.abs((clampedX + card.w) - gx) < snapDist) {
            clampedX = gx - card.w;
          }
          // Snap left edge
          if (Math.abs(clampedX - gx) < snapDist) {
            clampedX = gx;
          }

          // Block crossing
          if (startX + card.w <= gx) {
            // Card was fully to the left
            if (clampedX + card.w > gx) {
              clampedX = gx - card.w;
            }
          } else if (startX >= gx) {
            // Card was fully to the right
            if (clampedX < gx) {
              clampedX = gx;
            }
          }
        });
      }

      // Horizontal Guides
      if (guides.h && guides.h.length > 0 && card._dragStartY !== undefined) {
        const startY = card._dragStartY;
        const localGuidesH = guides.h.map(pct => (pct * cellH - state.panY) / zoom);
        
        localGuidesH.forEach(gy => {
          // Snap bottom edge
          if (Math.abs((clampedY + card.h) - gy) < snapDist) {
            clampedY = gy - card.h;
          }
          // Snap top edge
          if (Math.abs(clampedY - gy) < snapDist) {
            clampedY = gy;
          }

          // Block crossing
          if (startY + card.h <= gy) {
            // Card was fully above
            if (clampedY + card.h > gy) {
              clampedY = gy - card.h;
            }
          } else if (startY >= gy) {
            // Card was fully below
            if (clampedY < gy) {
              clampedY = gy;
            }
          }
        });
      }
    }

    return { x: clampedX, y: clampedY };
  };

  // Automatically fit zoom and pan for all cells in sliced mode
  window.autofitAllMiroSlices = function autofitAllMiroSlices() {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    
    const hasGridGuides = page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0));
    const hasCustomCells = page.customCells && page.customCells.length > 0;
    
    if (!hasGridGuides && !hasCustomCells) {
      if (typeof window.zoomToFitSelection === 'function') {
        window.zoomToFitSelection();
      }
      return;
    }

    const canvas = document.getElementById('miro-canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;

    // Partition cards first to ensure correct coordinates mapping
    partitionMiroCardsIntoCells(page, W, H);

    const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
    const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];

    if (!page.cellStates) page.cellStates = {};

    // 1. Process grid viewports
    if (hasGridGuides) {
      const activeCells = getActiveCells(page);
      activeCells.forEach((span) => {
        const cellKey = getCellKey(span);
        const c = span.cStart;
        const r = span.rStart;
        const cEnd = span.cEnd;
        const rEnd = span.rEnd;

        const cellW = W * (vg[cEnd+1] - vg[c]);
        const cellH = H * (hg[rEnd+1] - hg[r]);

        fitSingleCell(cellKey, cellW, cellH);
      });
    } else {
      // 100% full-board virtual cell
      fitSingleCell("0_0", W, H);
    }

    // 2. Process custom cell viewports
    if (hasCustomCells) {
      page.customCells.forEach((cc) => {
        const cellW = W * cc.w;
        const cellH = H * cc.h;
        fitSingleCell(cc.id, cellW, cellH);
      });
    }

    function fitSingleCell(cellKey, cellW, cellH) {
      const cards = (page.miroCards || []).filter(card => card.cell === cellKey);
      if (cards.length === 0) {
        if (!page.cellStates[cellKey]) {
          page.cellStates[cellKey] = { zoom: 30, panX: 0, panY: 0 };
        } else {
          page.cellStates[cellKey].zoom = 30;
          page.cellStates[cellKey].panX = 0;
          page.cellStates[cellKey].panY = 0;
        }
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        minX = Math.min(minX, card.x || 0);
        minY = Math.min(minY, card.y || 0);
        maxX = Math.max(maxX, (card.x || 0) + (card.w || 280));
        maxY = Math.max(maxY, (card.y || 0) + (card.h || 240));
      });

      const contentW = maxX - minX;
      const contentH = maxY - minY;

      // Add 30px padding
      const zoomW = (cellW - 30) / contentW;
      const zoomH = (cellH - 30) / contentH;
      let fitZoom = Math.min(zoomW, zoomH);
      fitZoom = Math.max(0.1, Math.min(4.0, fitZoom)); // clamp between 10% and 400%

      const zPercent = Math.round(fitZoom * 100);
      const panX = (cellW - (minX + maxX) * fitZoom) / 2;
      const panY = (cellH - (minY + maxY) * fitZoom) / 2;

      if (!page.cellStates[cellKey]) {
        page.cellStates[cellKey] = { zoom: zPercent, panX, panY };
      } else {
        page.cellStates[cellKey].zoom = zPercent;
        page.cellStates[cellKey].panX = panX;
        page.cellStates[cellKey].panY = panY;
      }
      clampCellState(cellKey, cellW, cellH);
    }

    sv();
    buildMiroCanvas();
    if (typeof showToast === 'function') showToast('🔍 Auto-fit all slices complete');
  };

  // Helper to quickly create an equal/unequal grid layout up to 20x20
  window.createMiroGrid = function createMiroGrid(cols, rows) {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    cols = Math.max(1, Math.min(20, cols));
    rows = Math.max(1, Math.min(20, rows));

    const canvas = document.getElementById('miro-canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;

    // Reset current cells back to absolute cards first
    mergeMiroCellsIntoCards(page, W, H);

    page.vGuides = [];
    page.hGuides = [];
    page.lockedGuides = [];
    page.mergedCells = []; // Clear merged cells

    // equal vertical divisions
    for (let i = 1; i < cols; i++) {
      page.vGuides.push(i / cols);
    }

    // equal horizontal divisions
    for (let i = 1; i < rows; i++) {
      page.hGuides.push(i / rows);
    }

    // Partition cards
    partitionMiroCardsIntoCells(page, W, H);
    if (!page.cellStates) page.cellStates = {};
    page._guidesMode = true; // turn on guides mode
    
    // Auto-fit immediately for best fit
    autofitAllMiroSlices();
    
    initMiroSlices();
    sv();
    buildMiroCanvas();
  };

  // Handle cell-local drag panning (used by miro-engine.js)
  window.handleMiroCellPanStart = function handleMiroCellPanStart(e) {
    const page = cp();
    if (!page || page.pageType !== 'miro') return false;
    const hasSlices = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
    if (!hasSlices) return false;

    // Only pan on middle-click (e.button === 1) or Alt + left click
    if (e.button !== 1 && !e.altKey) return false;

    const cellViewport = e.target.closest('.miro-cell-viewport');
    if (!cellViewport) return false;

    _activeCellKey = cellViewport.dataset.cellKey;
    const state = page.cellStates[_activeCellKey] || { zoom: 100, panX: 0, panY: 0 };
    _cellPanning = true;
    _cellPanStartX = e.clientX - state.panX;
    _cellPanStartY = e.clientY - state.panY;

    cellViewport.style.cursor = 'grabbing';
    return true;
  };

  window.handleMiroCellPanMove = function handleMiroCellPanMove(e) {
    if (!_cellPanning || !_activeCellKey) return false;
    const page = cp();
    if (!page || !page.cellStates || !page.cellStates[_activeCellKey]) return false;

    const state = page.cellStates[_activeCellKey];
    state.panX = e.clientX - _cellPanStartX;
    state.panY = e.clientY - _cellPanStartY;

    // Get cell element dimensions
    const cellEl = document.querySelector(`.miro-cell-viewport[data-cell-key="${_activeCellKey}"]`);
    if (cellEl) {
      if (!e.altKey) clampCellState(_activeCellKey, cellEl.clientWidth, cellEl.clientHeight);
      const cellBoard = cellEl.querySelector('.miro-cell-board');
      if (cellBoard) {
        const z = state.zoom / 100;
        cellBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${z})`;
      }
      updateCellBackgroundGrid(cellEl, state);
    }
    return true;
  };

  window.handleMiroCellPanEnd = function handleMiroCellPanEnd() {
    if (!_cellPanning) return false;
    _cellPanning = false;
    
    // Restore cursors
    document.querySelectorAll('.miro-cell-viewport').forEach(el => { el.style.cursor = ''; });
    _activeCellKey = null;
    sv();
    return true;
  };

  // Handle cell-local wheel zooming (used by miro-engine.js)
  window.handleMiroCellWheel = function handleMiroCellWheel(e) {
    const page = cp();
    if (!page || page.pageType !== 'miro') return false;
    const hasSlices = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
    if (!hasSlices) return false;

    const cellViewport = e.target.closest('.miro-cell-viewport');
    if (!cellViewport) return false;

    e.preventDefault();
    const cellKey = cellViewport.dataset.cellKey;
    const parts = cellKey.split('_');
    const col = parseInt(parts[0]), row = parseInt(parts[1]);

    const cellW = cellViewport.clientWidth;
    const cellH = cellViewport.clientHeight;
    const cellState = page.cellStates[cellKey] || { zoom: 100, panX: 0, panY: 0 };

    const rect = cellViewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const oldZoom = cellState.zoom / 100;
    const boardPointX = (cursorX - cellState.panX) / oldZoom;
    const boardPointY = (cursorY - cellState.panY) / oldZoom;

    // Predefined levels zoom helper
    const zoomLevels = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      12, 14, 16, 18, 20, 22,
      25, 28, 31, 35, 39, 44, 49, 55, 62, 69, 77, 86, 97, 108,
      121, 136, 152, 171, 191, 214, 240, 268, 301, 337, 377, 400
    ];

    function getNextLocalZoom(current, direction) {
      if (direction > 0) {
        for (let i = 0; i < zoomLevels.length; i++) {
          if (zoomLevels[i] > current) return zoomLevels[i];
        }
        return zoomLevels[zoomLevels.length - 1];
      } else {
        for (let i = zoomLevels.length - 1; i >= 0; i--) {
          if (zoomLevels[i] < current) return zoomLevels[i];
        }
        return zoomLevels[0];
      }
    }

    const direction = e.deltaY > 0 ? -1 : 1;

    // Single cell zoom only (no global sync to avoid trackpad pinch conflict)
    const newZoomNum = getNextLocalZoom(cellState.zoom, direction);
    cellState.zoom = newZoomNum;
    const newZoom = newZoomNum / 100;

    cellState.panX = cursorX - (boardPointX * newZoom);
    cellState.panY = cursorY - (boardPointY * newZoom);
    clampCellState(cellKey, cellW, cellH);

    // Live update board style transforms and zoom text for this cell only
    const cellBoard = cellViewport.querySelector('.miro-cell-board');
    if (cellBoard) {
      const z = cellState.zoom / 100;
      cellBoard.style.transform = `translate(${cellState.panX}px, ${cellState.panY}px) scale(${z})`;
    }
    const zoomText = cellViewport.querySelector('.miro-cell-zoom-text');
    if (zoomText) {
      const zoomValSpan = zoomText.querySelector('.zoom-value');
      if (zoomValSpan) {
        zoomValSpan.textContent = `${cellState.zoom}%`;
      } else {
        zoomText.textContent = `(${cellState.zoom}%)`;
      }
    }

    updateCellBackgroundGrid(cellViewport, cellState);

    clearTimeout(_wheelSvTimer);
    _wheelSvTimer = setTimeout(() => sv(), 1000);

    return true;
  };

  // ─── Cell Settings Modal ───
  const _colorTagPalette = [
    '#ff4444', '#ff8a65', '#ffca28', '#66bb6a', '#42a5f5',
    '#7e57c2', '#ec407a', '#26c6da', '#8d6e63', '#78909c'
  ];

  function showCellSettingsModal(cellKey) {
    // Remove any existing modal
    document.querySelectorAll('.miro-cell-modal-overlay').forEach(el => el.remove());

    const page = cp();
    if (!page || !page.cellStates) return;
    if (!page.cellStates[cellKey]) page.cellStates[cellKey] = { zoom: 100, panX: 0, panY: 0 };
    const state = page.cellStates[cellKey];

    const isCustomCell = cellKey.startsWith('cc_');
    let c = 0, r = 0;
    if (!isCustomCell) {
      const parts = cellKey.split('_');
      c = parseInt(parts[0]); r = parseInt(parts[1]);
    }

    const overlay = document.createElement('div');
    overlay.className = 'miro-cell-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'miro-cell-modal';

    // Title
    const h3 = document.createElement('h3');
    h3.textContent = isCustomCell ? `⚙️ Custom Screen Settings` : `⚙️ Cell [${c+1}, ${r+1}] Settings`;
    modal.appendChild(h3);

    // Row: Title input
    const titleRow = document.createElement('div');
    titleRow.className = 'mcm-row';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = state.title || '';
    titleInput.placeholder = isCustomCell ? 'Screen' : `Cell [${c+1}, ${r+1}]`;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleInput);
    modal.appendChild(titleRow);

    // Row: Dynamic Title select
    const dynamicRow = document.createElement('div');
    dynamicRow.className = 'mcm-row';
    const dynamicLabel = document.createElement('label');
    dynamicLabel.textContent = 'Dynamic Title Type';
    const dynamicSelect = document.createElement('select');
    dynamicSelect.style.cssText = 'width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 6px 10px; color: #fff; font-size: 0.75rem; outline: none; box-sizing: border-box;';
    
    const dynamicOptions = [
      { val: '', label: 'None' },
      { val: 'pomodoro', label: 'This Pomodoro' },
      { val: 'session', label: 'This Session' },
      { val: 'day', label: 'This Day' },
      { val: '2days', label: '2Days Back2Back' },
      { val: '3days', label: '3 Days' },
      { val: 'weekend', label: 'Weekend Project' },
      { val: 'week', label: 'This Week' },
      { val: 'sprint', label: 'This Sprint' },
      { val: 'month', label: 'This Month' },
      { val: 'quarter', label: 'This Quarter' },
      { val: 'year', label: 'This Year' },
      { val: '5years', label: 'This 5 Years' },
      { val: 'next5years', label: 'Next 5' }
    ];
    
    dynamicOptions.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.label;
      o.style.cssText = 'background: #1a1d2e; color: #fff;';
      if (state.dynamicType === opt.val) o.selected = true;
      dynamicSelect.appendChild(o);
    });
    
    dynamicRow.appendChild(dynamicLabel);
    dynamicRow.appendChild(dynamicSelect);
    modal.appendChild(dynamicRow);

    // Update tracker metadata
    if (state.firstSetAt && state.changeCount !== undefined) {
      const trackerRow = document.createElement('div');
      trackerRow.className = 'mcm-row';
      trackerRow.style.cssText = 'font-size: 0.65rem; color: rgba(255,255,255,0.45); margin-top: 4px; margin-bottom: 8px;';
      trackerRow.innerHTML = `<span>Tracker: Started <strong>${state.firstSetAt}</strong> (${state.changeCount} changes)</span>`;
      modal.appendChild(trackerRow);
    }

    // Row: Acknowledge Update Checkbox (only if there is an unacknowledged change)
    let ackCheckbox = null;
    if (state.hasUnacknowledgedChange) {
      const ackRow = document.createElement('div');
      ackRow.className = 'mcm-row';
      ackRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 8px; margin-bottom: 8px;';
      
      ackCheckbox = document.createElement('input');
      ackCheckbox.type = 'checkbox';
      ackCheckbox.id = 'mcm-ack-change';
      ackCheckbox.style.cssText = 'width: 16px; height: 16px; accent-color: #ff6b35; cursor: pointer;';
      
      const ackLabel = document.createElement('label');
      ackLabel.htmlFor = 'mcm-ack-change';
      ackLabel.style.cssText = 'font-size: 0.7rem; color: #ff8a65; cursor: pointer; user-select: none; margin: 0;';
      ackLabel.textContent = 'Acknowledge Update (Clear Highlight)';
      
      ackRow.appendChild(ackCheckbox);
      ackRow.appendChild(ackLabel);
      modal.appendChild(ackRow);
    }

    // Row: Icon Image (Upload/Selection)
    const iconRow = document.createElement('div');
    iconRow.className = 'mcm-row';
    const iconLabel = document.createElement('label');
    iconLabel.textContent = 'Icon Image';
    iconRow.appendChild(iconLabel);

    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:4px;';

    // File Input (Hidden)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    // Upload Button
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'mcm-btn mcm-btn-cancel';
    uploadBtn.style.cssText = 'padding:6px 12px;font-size:0.65rem;';
    uploadBtn.textContent = state.icon ? 'Change Image' : 'Choose Image…';

    // Preview thumbnail
    const prevImg = document.createElement('img');
    prevImg.style.cssText = 'width:32px;height:32px;object-fit:contain;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:none;';
    if (state.icon) {
      prevImg.src = state.icon;
      prevImg.style.display = 'block';
    }

    // Clear Button
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'mcm-btn mcm-btn-cancel';
    clearBtn.style.cssText = 'padding:6px 12px;font-size:0.65rem;color:#ff4444;background:rgba(255,68,68,0.1);display: ' + (state.icon ? 'block' : 'none') + ';';
    clearBtn.textContent = 'Remove';

    let currentIconUrl = state.icon || '';

    // File selection handler
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        prevImg.src = base64;
        prevImg.style.display = 'block';
        uploadBtn.textContent = 'Uploading…';
        uploadBtn.disabled = true;

        if (typeof window.uploadToImgBB === 'function') {
          window.uploadToImgBB(base64).then(url => {
            uploadBtn.disabled = false;
            if (url) {
              currentIconUrl = url;
              uploadBtn.textContent = 'Uploaded ✓';
              clearBtn.style.display = 'block';
              if (typeof showToast === 'function') showToast('✅ Icon uploaded to ImgBB!');
            } else {
              uploadBtn.textContent = '⚠️ Upload Failed';
              prevImg.style.display = currentIconUrl ? 'block' : 'none';
              prevImg.src = currentIconUrl || '';
              if (typeof showToast === 'function') showToast('❌ Upload failed.');
            }
          });
        } else {
          fetch('https://api.imgbb.com/1/upload?key=129f1b49da234235959ee4405ac9ebb1', {
            method: 'POST',
            body: new URLSearchParams({ image: base64.split(',')[1] })
          })
          .then(res => res.json())
          .then(data => {
            uploadBtn.disabled = false;
            if (data.success) {
              currentIconUrl = data.data.url;
              uploadBtn.textContent = 'Uploaded ✓';
              clearBtn.style.display = 'block';
              if (typeof showToast === 'function') showToast('✅ Icon uploaded to ImgBB!');
            } else {
              uploadBtn.textContent = '⚠️ Upload Failed';
              prevImg.style.display = currentIconUrl ? 'block' : 'none';
              prevImg.src = currentIconUrl || '';
              if (typeof showToast === 'function') showToast('❌ Upload failed.');
            }
          })
          .catch(() => {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '⚠️ Upload Failed';
            prevImg.style.display = currentIconUrl ? 'block' : 'none';
            prevImg.src = currentIconUrl || '';
          });
        }
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    };

    uploadBtn.onclick = () => fileInput.click();

    clearBtn.onclick = () => {
      currentIconUrl = '';
      prevImg.style.display = 'none';
      prevImg.src = '';
      clearBtn.style.display = 'none';
      uploadBtn.textContent = 'Choose Image…';
    };

    iconContainer.appendChild(fileInput);
    iconContainer.appendChild(uploadBtn);
    iconContainer.appendChild(clearBtn);
    iconContainer.appendChild(prevImg);
    iconRow.appendChild(iconContainer);
    modal.appendChild(iconRow);

    // Row: Icon Size slider
    const sizeRow = document.createElement('div');
    sizeRow.className = 'mcm-row';
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Icon Size (pixels)';
    sizeRow.appendChild(sizeLabel);
    const sizeContainer = document.createElement('div');
    sizeContainer.className = 'mcm-bg-row';

    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '8';
    sizeSlider.max = '120';
    sizeSlider.value = state.iconSize || 40;

    const sizeVal = document.createElement('span');
    sizeVal.className = 'mcm-opacity-val';
    sizeVal.textContent = sizeSlider.value + 'px';
    sizeSlider.oninput = () => { sizeVal.textContent = sizeSlider.value + 'px'; };

    sizeContainer.appendChild(sizeSlider);
    sizeContainer.appendChild(sizeVal);
    sizeRow.appendChild(sizeContainer);
    modal.appendChild(sizeRow);

    // Row: Color Tag
    const colorRow = document.createElement('div');
    colorRow.className = 'mcm-row';
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color Tag';
    colorRow.appendChild(colorLabel);
    const colorContainer = document.createElement('div');
    colorContainer.className = 'mcm-colors';
    let selectedColor = state.colorTag || '';

    // "None" swatch
    const noneSw = document.createElement('div');
    noneSw.className = 'mcm-csw' + (!selectedColor ? ' sel' : '');
    noneSw.style.background = 'rgba(255,255,255,0.1)';
    noneSw.title = 'None';
    noneSw.textContent = '✕';
    noneSw.style.display = 'flex';
    noneSw.style.alignItems = 'center';
    noneSw.style.justifyContent = 'center';
    noneSw.style.fontSize = '0.55rem';
    noneSw.style.color = 'rgba(255,255,255,0.4)';
    noneSw.onclick = () => {
      selectedColor = '';
      colorContainer.querySelectorAll('.mcm-csw').forEach(s => s.classList.remove('sel'));
      noneSw.classList.add('sel');
    };
    colorContainer.appendChild(noneSw);

    _colorTagPalette.forEach(hex => {
      const sw = document.createElement('div');
      sw.className = 'mcm-csw' + (selectedColor === hex ? ' sel' : '');
      sw.style.background = hex;
      sw.onclick = () => {
        selectedColor = hex;
        colorContainer.querySelectorAll('.mcm-csw').forEach(s => s.classList.remove('sel'));
        sw.classList.add('sel');
      };
      colorContainer.appendChild(sw);
    });
    colorRow.appendChild(colorContainer);
    modal.appendChild(colorRow);

    // Row: Background Color & Opacity
    const bgRow = document.createElement('div');
    bgRow.className = 'mcm-row';
    const bgLabel = document.createElement('label');
    bgLabel.textContent = 'Background Color & Opacity';
    bgRow.appendChild(bgLabel);
    const bgContainer = document.createElement('div');
    bgContainer.className = 'mcm-bg-row';

    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.value = state.bgColor || '#6c8fff';

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = Math.round((state.bgOpacity != null ? state.bgOpacity : 0) * 100);

    const opacityVal = document.createElement('span');
    opacityVal.className = 'mcm-opacity-val';
    opacityVal.textContent = opacitySlider.value + '%';
    opacitySlider.oninput = () => { opacityVal.textContent = opacitySlider.value + '%'; };

    bgContainer.appendChild(bgColorInput);
    bgContainer.appendChild(opacitySlider);
    bgContainer.appendChild(opacityVal);
    bgRow.appendChild(bgContainer);
    modal.appendChild(bgRow);

    // Row: Merge Cells / Custom Cell Actions
    const mergeRow = document.createElement('div');
    mergeRow.className = 'mcm-row';

    if (isCustomCell) {
      const mergeLabel = document.createElement('label');
      mergeLabel.textContent = 'Custom Cell Actions';
      mergeRow.appendChild(mergeLabel);

      const actionContainer = document.createElement('div');
      actionContainer.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;';

      const delCellBtn = document.createElement('button');
      delCellBtn.type = 'button';
      delCellBtn.className = 'mcm-btn mcm-btn-cancel';
      delCellBtn.style.cssText = 'color:#ff4444;background:rgba(255,68,68,0.1);padding:6px 12px;font-size:0.65rem;';
      delCellBtn.textContent = '🗑️ Delete Screen/Cell';
      delCellBtn.onclick = () => {
        if (!confirm('Are you sure you want to delete this custom screen? All elements inside it will be returned to the main canvas.')) return;
        
        // Remove from page.customCells
        page.customCells = (page.customCells || []).filter(cc => cc.id !== cellKey);
        
        // Remove cell state
        if (page.cellStates[cellKey]) delete page.cellStates[cellKey];

        // Move all cards that were in this custom cell to the main board
        (page.miroCards || []).forEach(card => {
          if (card.cell === cellKey) {
            delete card.cell;
          }
        });

        overlay.remove();
        sv();
        buildMiroCanvas();
      };
      actionContainer.appendChild(delCellBtn);
      mergeRow.appendChild(actionContainer);
    } else {
      const mergeLabel = document.createElement('label');
      mergeLabel.textContent = 'Merge/Split Cells';
      mergeRow.appendChild(mergeLabel);

      const mergeContainer = document.createElement('div');
      mergeContainer.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;';

      const span = parseCellKey(cellKey);
      const isMerged = (span.cStart !== span.cEnd || span.rStart !== span.rEnd);

      if (isMerged) {
        const unmergeBtn = document.createElement('button');
        unmergeBtn.type = 'button';
        unmergeBtn.className = 'mcm-btn mcm-btn-cancel';
        unmergeBtn.style.cssText = 'color:#ff4444;background:rgba(255,68,68,0.1);padding:6px 12px;font-size:0.65rem;';
        unmergeBtn.textContent = '🔓 Split / Unmerge Cell';
        unmergeBtn.onclick = () => {
          if (!confirm('Split this merged cell back into individual grid cells?')) return;
          page.mergedCells = (page.mergedCells || []).filter(m => !(m.cStart === span.cStart && m.rStart === span.rStart && m.cEnd === span.cEnd && m.rEnd === span.rEnd));
          
          // Re-partition cards
          const canvas = document.getElementById('miro-canvas');
          if (canvas) partitionMiroCardsIntoCells(page, canvas.clientWidth, canvas.clientHeight);
          
          overlay.remove();
          sv();
          buildMiroCanvas();
        };
        mergeContainer.appendChild(unmergeBtn);
      } else {
        const mergeColBtn = document.createElement('button');
        mergeColBtn.type = 'button';
        mergeColBtn.className = 'mcm-btn mcm-btn-cancel';
        mergeColBtn.style.cssText = 'padding:6px 12px;font-size:0.65rem;';
        mergeColBtn.textContent = '🔗 Merge Column';
        mergeColBtn.onclick = () => {
          if (!confirm(`Merge all cells in column ${c+1}?`)) return;
          const totalRows = (page.hGuides || []).length + 1;
          mergeMiroCellRange(page, c, 0, c, totalRows - 1);
          overlay.remove();
          sv();
          buildMiroCanvas();
        };

        const mergeRowBtn = document.createElement('button');
        mergeRowBtn.type = 'button';
        mergeRowBtn.className = 'mcm-btn mcm-btn-cancel';
        mergeRowBtn.style.cssText = 'padding:6px 12px;font-size:0.65rem;';
        mergeRowBtn.textContent = '🔗 Merge Row';
        mergeRowBtn.onclick = () => {
          if (!confirm(`Merge all cells in row ${r+1}?`)) return;
          const totalCols = (page.vGuides || []).length + 1;
          mergeMiroCellRange(page, 0, r, totalCols - 1, r);
          overlay.remove();
          sv();
          buildMiroCanvas();
        };

        mergeContainer.appendChild(mergeColBtn);
        mergeContainer.appendChild(mergeRowBtn);

        const totalCols = (page.vGuides || []).length + 1;
        const totalRows = (page.hGuides || []).length + 1;
        if (totalCols > 1 || totalRows > 1) {
          const customContainer = document.createElement('div');
          customContainer.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;margin-top:8px;font-size:0.65rem;';
          
          customContainer.appendChild(document.createTextNode('Merge to: '));
          
          const colSel = document.createElement('select');
          colSel.style.cssText = 'background:#121420;color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:4px;font-size:0.65rem;padding:2px 4px;';
          for (let colIdx = c; colIdx < totalCols; colIdx++) {
            const opt = document.createElement('option');
            opt.value = colIdx;
            opt.textContent = `Col ${colIdx+1}`;
            colSel.appendChild(opt);
          }
          
          const rowSel = document.createElement('select');
          rowSel.style.cssText = 'background:#121420;color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:4px;font-size:0.65rem;padding:2px 4px;';
          for (let rowIdx = r; rowIdx < totalRows; rowIdx++) {
            const opt = document.createElement('option');
            opt.value = rowIdx;
            opt.textContent = `Row ${rowIdx+1}`;
            rowSel.appendChild(opt);
          }
          
          const goBtn = document.createElement('button');
          goBtn.type = 'button';
          goBtn.className = 'mcm-btn mcm-btn-save';
          goBtn.style.cssText = 'padding:3px 8px;font-size:0.65rem;';
          goBtn.textContent = 'Go';
          goBtn.onclick = () => {
            const cEnd = parseInt(colSel.value);
            const rEnd = parseInt(rowSel.value);
            if (cEnd === c && rEnd === r) {
              alert('Cannot merge a cell with itself.');
              return;
            }
            if (!confirm(`Merge cells from [${c+1}, ${r+1}] to [${cEnd+1}, ${rEnd+1}]?`)) return;
            mergeMiroCellRange(page, c, r, cEnd, rEnd);
            overlay.remove();
            sv();
            buildMiroCanvas();
          };

          customContainer.appendChild(colSel);
          customContainer.appendChild(rowSel);
          customContainer.appendChild(goBtn);
          mergeContainer.appendChild(customContainer);
        }
      }
      mergeRow.appendChild(mergeContainer);
    }
    modal.appendChild(mergeRow);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'mcm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mcm-btn mcm-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => overlay.remove();

    const saveBtn = document.createElement('button');
    saveBtn.className = 'mcm-btn mcm-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
      const oldDynamicType = state.dynamicType || '';
      const newDynamicType = dynamicSelect.value || '';

      state.title = titleInput.value.trim() || '';
      state.dynamicType = newDynamicType;
      state.icon = currentIconUrl;
      state.iconSize = parseInt(sizeSlider.value) || 40;
      state.colorTag = selectedColor;
      const oVal = parseInt(opacitySlider.value);
      if (oVal > 0) {
        state.bgColor = bgColorInput.value;
        state.bgOpacity = oVal / 100;
      } else {
        delete state.bgColor;
        delete state.bgOpacity;
      }

      if (ackCheckbox && ackCheckbox.checked) {
        state.hasUnacknowledgedChange = false;
      }

      if (newDynamicType !== oldDynamicType) {
        if (newDynamicType) {
          state.lastDynamicValue = getDynamicTitleValue(newDynamicType);
          state.firstSetAt = new Date().toLocaleString();
          state.changeCount = 0;
          state.hasUnacknowledgedChange = false;
        } else {
          delete state.lastDynamicValue;
          delete state.firstSetAt;
          delete state.changeCount;
          delete state.hasUnacknowledgedChange;
        }
      }

      overlay.remove();
      sv();
      buildMiroCanvas();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    // Close on overlay click (outside modal)
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    titleInput.focus();
  }

  function showCellLabelContextMenu(e, cellKey) {
    document.querySelectorAll('.miro-slices-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'miro-slices-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const page = cp();
    if (!page || !page.cellStates) return;
    const state = page.cellStates[cellKey] || {};

    // Acknowledge Update (only if hasUnacknowledgedChange is true)
    if (state.hasUnacknowledgedChange) {
      const ackItem = document.createElement('div');
      ackItem.className = 'miro-slices-menu-item';
      ackItem.style.color = '#ff8a65';
      ackItem.textContent = '✔️ Acknowledge Update';
      ackItem.onclick = () => {
        state.hasUnacknowledgedChange = false;
        menu.remove();
        sv();
        buildMiroCanvas();
        if (typeof showToast === 'function') showToast('✔️ Update acknowledged');
      };
      menu.appendChild(ackItem);
    }

    // Copy Title
    const copyItem = document.createElement('div');
    copyItem.className = 'miro-slices-menu-item';
    copyItem.textContent = '📋 Copy Title';
    copyItem.onclick = () => {
      _slicesClipboard = {
        title: state.title,
        dynamicType: state.dynamicType,
        icon: state.icon,
        iconSize: state.iconSize,
        colorTag: state.colorTag,
        bgColor: state.bgColor,
        bgOpacity: state.bgOpacity
      };
      menu.remove();
      if (typeof showToast === 'function') showToast('📋 Title copied');
    };
    menu.appendChild(copyItem);

    // Cut Title
    const cutItem = document.createElement('div');
    cutItem.className = 'miro-slices-menu-item';
    cutItem.textContent = '✂️ Cut Title';
    cutItem.onclick = () => {
      _slicesClipboard = {
        title: state.title,
        dynamicType: state.dynamicType,
        icon: state.icon,
        iconSize: state.iconSize,
        colorTag: state.colorTag,
        bgColor: state.bgColor,
        bgOpacity: state.bgOpacity
      };
      // Clear from source
      delete state.title;
      delete state.dynamicType;
      delete state.icon;
      delete state.iconSize;
      delete state.colorTag;
      delete state.bgColor;
      delete state.bgOpacity;
      delete state.lastDynamicValue;
      delete state.firstSetAt;
      delete state.changeCount;
      delete state.hasUnacknowledgedChange;
      
      menu.remove();
      sv();
      buildMiroCanvas();
      if (typeof showToast === 'function') showToast('✂️ Title cut');
    };
    menu.appendChild(cutItem);

    // Paste Title
    const pasteItem = document.createElement('div');
    pasteItem.className = 'miro-slices-menu-item';
    pasteItem.textContent = '📋 Paste Title';
    if (!_slicesClipboard) {
      pasteItem.style.opacity = '0.5';
      pasteItem.style.pointerEvents = 'none';
    } else {
      pasteItem.onclick = () => {
        if (_slicesClipboard) {
          state.title = _slicesClipboard.title || '';
          state.dynamicType = _slicesClipboard.dynamicType || '';
          state.icon = _slicesClipboard.icon || '';
          state.iconSize = _slicesClipboard.iconSize || 40;
          state.colorTag = _slicesClipboard.colorTag || '';
          if (_slicesClipboard.bgColor) {
            state.bgColor = _slicesClipboard.bgColor;
            state.bgOpacity = _slicesClipboard.bgOpacity != null ? _slicesClipboard.bgOpacity : 0.15;
          } else {
            delete state.bgColor;
            delete state.bgOpacity;
          }
          // Reset tracker fields for fresh start
          delete state.lastDynamicValue;
          delete state.firstSetAt;
          delete state.changeCount;
          delete state.hasUnacknowledgedChange;

          if (state.dynamicType) {
            state.lastDynamicValue = getDynamicTitleValue(state.dynamicType);
            state.firstSetAt = new Date().toLocaleString();
            state.changeCount = 0;
            state.hasUnacknowledgedChange = false;
          }
        }
        menu.remove();
        sv();
        buildMiroCanvas();
        if (typeof showToast === 'function') showToast('📋 Title pasted');
      };
    }
    menu.appendChild(pasteItem);

    document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
  }

  function startLabelDrag(e, srcCellKey, mode) {
    const originalLabel = e.currentTarget;
    const clone = originalLabel.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.zIndex = '10000';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.75';
    clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    
    // Set initial position
    const rect = originalLabel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    clone.style.left = (e.clientX - offsetX) + 'px';
    clone.style.top = (e.clientY - offsetY) + 'px';
    document.body.appendChild(clone);

    _activeLabelDrag = {
      srcCellKey,
      mode,
      cloneEl: clone,
      offsetX,
      offsetY
    };

    document.body.style.cursor = 'grabbing';
  }

  function performLabelTransfer(srcCellKey, destCellKey, mode) {
    const page = cp();
    if (!page || !page.cellStates) return;
    
    const srcState = page.cellStates[srcCellKey] || {};
    if (!page.cellStates[destCellKey]) {
      page.cellStates[destCellKey] = { zoom: 100, panX: 0, panY: 0 };
    }
    const destState = page.cellStates[destCellKey];
    
    destState.title = srcState.title || '';
    destState.dynamicType = srcState.dynamicType || '';
    destState.icon = srcState.icon || '';
    destState.iconSize = srcState.iconSize || 40;
    destState.colorTag = srcState.colorTag || '';
    if (srcState.bgColor) {
      destState.bgColor = srcState.bgColor;
      destState.bgOpacity = srcState.bgOpacity != null ? srcState.bgOpacity : 0.15;
    } else {
      delete destState.bgColor;
      delete destState.bgOpacity;
    }
    
    // Reset tracker fields for fresh start
    delete destState.lastDynamicValue;
    delete destState.firstSetAt;
    delete destState.changeCount;
    delete destState.hasUnacknowledgedChange;

    if (destState.dynamicType) {
      destState.lastDynamicValue = getDynamicTitleValue(destState.dynamicType);
      destState.firstSetAt = new Date().toLocaleString();
      destState.changeCount = 0;
      destState.hasUnacknowledgedChange = false;
    }

    if (mode === 'cut') {
      delete srcState.title;
      delete srcState.dynamicType;
      delete srcState.icon;
      delete srcState.iconSize;
      delete srcState.colorTag;
      delete srcState.bgColor;
      delete srcState.bgOpacity;
      delete srcState.lastDynamicValue;
      delete srcState.firstSetAt;
      delete srcState.changeCount;
      delete srcState.hasUnacknowledgedChange;
      
      if (typeof showToast === 'function') showToast('✂️ Title cut & pasted');
    } else {
      if (typeof showToast === 'function') showToast('📋 Title copied & pasted');
    }
    
    sv();
    buildMiroCanvas();
  }

  window.splitMiroCell = function splitMiroCell(cellKey, C, R) {
    const page = cp();
    if (!page) return;

    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // Save cards to absolute coordinates first
    if (typeof window.mergeMiroCellsIntoCards === 'function') {
      window.mergeMiroCellsIntoCards(page, W, H);
    }

    const span = parseCellKey(cellKey);
    if (!span) return;

    const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
    const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];

    const xStart = vg[span.cStart];
    const xEnd = vg[span.cEnd + 1];
    const yStart = hg[span.rStart];
    const yEnd = hg[span.rEnd + 1];

    // If it was a merged cell, remove it
    if (page.mergedCells) {
      page.mergedCells = page.mergedCells.filter(m => !(m.cStart === span.cStart && m.rStart === span.rStart && m.cEnd === span.cEnd && m.rEnd === span.rEnd));
    }

    if (!page.vGuides) page.vGuides = [];
    if (!page.hGuides) page.hGuides = [];

    // Add new vertical guides
    for (let i = 1; i < C; i++) {
      const val = xStart + (i / C) * (xEnd - xStart);
      if (!page.vGuides.some(v => Math.abs(v - val) < 0.001)) {
        page.vGuides.push(val);
      }
    }

    // Add new horizontal guides
    for (let j = 1; j < R; j++) {
      const val = yStart + (j / R) * (yEnd - yStart);
      if (!page.hGuides.some(h => Math.abs(h - val) < 0.001)) {
        page.hGuides.push(val);
      }
    }

    // Sort guides
    page.vGuides.sort((a,b)=>a-b);
    page.hGuides.sort((a,b)=>a-b);

    // Re-partition cards
    if (typeof window.partitionMiroCardsIntoCells === 'function') {
      window.partitionMiroCardsIntoCells(page, W, H);
    }

    sv();
    buildMiroCanvas();
  };

  window.autoAlignMiroGuides = function autoAlignMiroGuides() {
    const page = cp();
    if (!page) return;

    const cols = (page.vGuides || []).length + 1;
    const rows = (page.hGuides || []).length + 1;

    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // Save cards to absolute coordinates first
    if (typeof window.mergeMiroCellsIntoCards === 'function') {
      window.mergeMiroCellsIntoCards(page, W, H);
    }

    page.vGuides = [];
    page.hGuides = [];

    for (let i = 1; i < cols; i++) {
      page.vGuides.push(i / cols);
    }
    for (let i = 1; i < rows; i++) {
      page.hGuides.push(i / rows);
    }

    if (typeof window.partitionMiroCardsIntoCells === 'function') {
      window.partitionMiroCardsIntoCells(page, W, H);
    }
    
    sv();
    buildMiroCanvas();

    if (typeof showToast === 'function') showToast('⚖️ Guides aligned equally!');
  };

  function setupMiroSlicesButtons() {
    const mergeBtn = document.getElementById('mz-merge-btn');
    const splitBtn = document.getElementById('mz-split-btn');
    const alignBtn = document.getElementById('mz-align-btn');
    const cancelBtn = document.getElementById('mz-cancel-op');

    if (!mergeBtn || !splitBtn || !alignBtn || !cancelBtn) return;

    mergeBtn.onclick = () => {
      const page = cp();
      if (!page || page.pageType !== 'miro') return;

      if (!window._mergeSelectionMode) {
        // Enter merge mode
        window._mergeSelectionMode = true;
        window._splitSelectionMode = false;
        window._selectedCellsForMerge = new Set();

        mergeBtn.textContent = '✓';
        splitBtn.style.display = 'none';
        alignBtn.style.display = 'none';
        cancelBtn.style.display = 'inline-block';

        if (typeof showToast === 'function') showToast('🔗 Merge mode active: Check cells to merge');
        buildMiroCanvas();
      } else {
        // Confirm merge of any checked checkboxes
        const checked = window._selectedCellsForMerge;
        if (checked && checked.size >= 2) {
          let minCol = Infinity, minRow = Infinity;
          let maxCol = -Infinity, maxRow = -Infinity;
          let hasGrid = false;

          checked.forEach(cellKey => {
            if (!cellKey.startsWith('cc_')) {
              const span = parseCellKey(cellKey);
              if (span) {
                hasGrid = true;
                minCol = Math.min(minCol, span.cStart);
                minRow = Math.min(minRow, span.rStart);
                maxCol = Math.max(maxCol, span.cEnd);
                maxRow = Math.max(maxRow, span.rEnd);
              }
            }
          });

          if (hasGrid) {
            mergeMiroCellRange(page, minCol, minRow, maxCol, maxRow);
            if (typeof showToast === 'function') showToast('🔗 Cells merged successfully');
          }
        }

        // Reset state
        window._mergeSelectionMode = false;
        window._selectedCellsForMerge = new Set();

        mergeBtn.textContent = '🔗';
        splitBtn.style.display = 'inline-block';
        alignBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'none';

        sv();
        buildMiroCanvas();
      }
    };

    splitBtn.onclick = () => {
      const page = cp();
      if (!page || page.pageType !== 'miro') return;

      if (!window._splitSelectionMode) {
        // Enter split mode
        window._splitSelectionMode = true;
        window._mergeSelectionMode = true;
        window._selectedCellsForMerge = new Set();

        splitBtn.textContent = '✓';
        mergeBtn.style.display = 'none';
        alignBtn.style.display = 'none';
        cancelBtn.style.display = 'inline-block';

        if (typeof showToast === 'function') showToast('🥞 Split mode active: Check a cell to split');
        buildMiroCanvas();
      } else {
        // Confirm split
        const checked = window._selectedCellsForMerge;
        if (!checked || checked.size !== 1) {
          alert('Please select exactly 1 cell to split.');
          return;
        }

        const targetCellKey = Array.from(checked)[0];
        
        // Prompt user
        const gridVal = prompt('Enter columns and rows to split this cell into (e.g. 2,2 or 3,1):', '2,2');
        if (gridVal === null) return; // cancelled
        
        const parts = gridVal.split(',');
        const cols = parseInt(parts[0]);
        const rows = parseInt(parts[1]);

        if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1 || cols > 20 || rows > 20) {
          alert('Please enter valid columns and rows (1-20).');
          return;
        }

        // Perform split
        splitMiroCell(targetCellKey, cols, rows);

        // Reset state
        window._splitSelectionMode = false;
        window._mergeSelectionMode = false;
        window._selectedCellsForMerge = new Set();

        splitBtn.textContent = '🥞';
        mergeBtn.style.display = 'inline-block';
        alignBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'none';

        if (typeof showToast === 'function') showToast('🥞 Cell split successfully');
      }
    };

    alignBtn.onclick = () => {
      autoAlignMiroGuides();
    };

    cancelBtn.onclick = () => {
      window._mergeSelectionMode = false;
      window._splitSelectionMode = false;
      window._selectedCellsForMerge = new Set();

      mergeBtn.textContent = '🔗';
      splitBtn.textContent = '🥞';
      mergeBtn.style.display = 'inline-block';
      splitBtn.style.display = 'inline-block';
      alignBtn.style.display = 'inline-block';
      cancelBtn.style.display = 'none';

      buildMiroCanvas();
    };
  }

  // Register namespace
  SM.miro.layout = SM.miro.layout || {};
  SM.miro.layout.initMiroSlices = window.initMiroSlices;
  SM.miro.layout.renderMiroSlices = window.renderMiroSlices;
  SM.miro.layout.autofitAllMiroSlices = window.autofitAllMiroSlices;
  SM.miro.layout.partitionMiroCardsIntoCells = window.partitionMiroCardsIntoCells;
  SM.miro.layout.mergeMiroCellsIntoCards = window.mergeMiroCellsIntoCards;
  SM.miro.layout.getMiroCardDragZoom = window.getMiroCardDragZoom;
  SM.miro.layout.clampMiroCardDrag = window.clampMiroCardDrag;
  SM.miro.layout.createMiroGrid = window.createMiroGrid;
  SM.miro.layout.splitMiroCell = window.splitMiroCell;
  SM.miro.layout.autoAlignMiroGuides = window.autoAlignMiroGuides;
  SM.miro.layout.mergeMiroCellRange = window.mergeMiroCellRange;
  SM.miro.layout.parseCellKey = window.parseCellKey;
  SM.miro.layout.getActiveCells = window.getActiveCells;

  // Run init on startup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.initMiroSlices();
      setupMiroSlicesButtons();
    });
  } else {
    window.initMiroSlices();
    setupMiroSlicesButtons();
  }
})();
