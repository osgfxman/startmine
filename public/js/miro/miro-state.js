/**
 * @module MiroState
 * @description Holds the shared state and coordinate variables for the Miro engine
 * @namespace SM.miro.state
 * @depends namespace.js
 * @provides SM.miro.state variables (activeTool, panX, zoom, selection bounds, etc.)
 * @safety Do not overwrite the entire state object, only mutate its properties
 */
// js/miro/miro-state.js
(function() {
  // We use window assignments or var to ensure they are available globally
  // to the rest of the application without strict mode errors.

  window._miroMode = true;
  window._miroPanning = false;
  window._miroPanStartX = 0;
  window._miroPanStartY = 0;
  window._miroCardDrag = null;
  window._miroCardResize = null;
  window._miroSelected = new Set();
  window._alignDragging = false;
  window._justRubberBanded = false;
  window._stickyCreateMode = false;
  window._edgePanRAF = null;
  window._miroImgData = null; // { imgbbUrl, naturalW, naturalH }
  window._activeTool = 'select';
  window._penMode = false;
  window._shapeMode = false;
  window._activeShapeType = 'rect';
  window._penPoints = [];
  window._penDrawing = false;
  window._textCreateMode = false;
  window._gridCreateMode = false;
  window._mindmapCreateMode = false;
  window._widgetCreateMode = false;
  window._trelloCreateMode = false;
  window._embedCreateMode = false;
  window._overlayPageCreateMode = false;
  window._overlayPageCreateIdx = 0;
  window._gridPickerRows = 3;
  window._gridPickerCols = 3;
  window._mouseX = 0;
  window._mouseY = 0;
  window._ctxTargetCid = null;
  window._calendarCreateMode = false;
  window._cachedCalendarList = null;
  window._cachedCalendarListTs = 0;

  // Make them accessible via namespace as well
  window.SM.miro.state = {
    get miroMode() { return window._miroMode; },
    set miroMode(v) { window._miroMode = v; },
    get miroPanning() { return window._miroPanning; },
    set miroPanning(v) { window._miroPanning = v; },
    get miroPanStartX() { return window._miroPanStartX; },
    set miroPanStartX(v) { window._miroPanStartX = v; },
    get miroPanStartY() { return window._miroPanStartY; },
    set miroPanStartY(v) { window._miroPanStartY = v; },
    get miroCardDrag() { return window._miroCardDrag; },
    set miroCardDrag(v) { window._miroCardDrag = v; },
    get miroCardResize() { return window._miroCardResize; },
    set miroCardResize(v) { window._miroCardResize = v; },
    get miroSelected() { return window._miroSelected; },
    get alignDragging() { return window._alignDragging; },
    set alignDragging(v) { window._alignDragging = v; },
    get justRubberBanded() { return window._justRubberBanded; },
    set justRubberBanded(v) { window._justRubberBanded = v; },
    get stickyCreateMode() { return window._stickyCreateMode; },
    set stickyCreateMode(v) { window._stickyCreateMode = v; },
    get edgePanRAF() { return window._edgePanRAF; },
    set edgePanRAF(v) { window._edgePanRAF = v; },
    get activeTool() { return window._activeTool; },
    set activeTool(v) { window._activeTool = v; },
    get penMode() { return window._penMode; },
    set penMode(v) { window._penMode = v; },
    get shapeMode() { return window._shapeMode; },
    set shapeMode(v) { window._shapeMode = v; },
    get activeShapeType() { return window._activeShapeType; },
    set activeShapeType(v) { window._activeShapeType = v; },
    get textCreateMode() { return window._textCreateMode; },
    set textCreateMode(v) { window._textCreateMode = v; },
    get gridCreateMode() { return window._gridCreateMode; },
    set gridCreateMode(v) { window._gridCreateMode = v; },
    get mindmapCreateMode() { return window._mindmapCreateMode; },
    set mindmapCreateMode(v) { window._mindmapCreateMode = v; },
    get widgetCreateMode() { return window._widgetCreateMode; },
    set widgetCreateMode(v) { window._widgetCreateMode = v; },
    get trelloCreateMode() { return window._trelloCreateMode; },
    set trelloCreateMode(v) { window._trelloCreateMode = v; },
    get embedCreateMode() { return window._embedCreateMode; },
    set embedCreateMode(v) { window._embedCreateMode = v; },
    get overlayPageCreateMode() { return window._overlayPageCreateMode; },
    set overlayPageCreateMode(v) { window._overlayPageCreateMode = v; },
    get mouseX() { return window._mouseX; },
    set mouseX(v) { window._mouseX = v; },
    get mouseY() { return window._mouseY; },
    set mouseY(v) { window._mouseY = v; }
  };
})();
