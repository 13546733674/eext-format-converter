/**
 * Generate Pro V3 symbol document source from parsed Xpedition symbol data.
 * Converts XpedSymbol into the `||` delimited Pro V3 format used in lib2.elibu.
 */

import { generateSymbolBoilerplate } from './pro-layers';
import type { XpedSymbol, XpedSymbolPin, XpedSymbolGraphic } from './symbol-text-parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

let _symTicket = 3;
let _symId = 0;
function nextSymId(prefix = 'e'): string { return `${prefix}${++_symId}`; }
function nextSymTicket(): number { return _symTicket++; }
function resetSymState(): void { _symTicket = 3; _symId = 0; }

/**
 * Compute EasyEDA pin rotation from raw Xpedition coordinates.
 * Returns angle: 0=right, 90=up, 180=left, 270=down.
 */
function computePinRotation(tipX: number, tipY: number, bodyX: number, bodyY: number): number {
  const dx = bodyX - tipX;
  const dy = bodyY - tipY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 0 : 180;
  }
  return dy >= 0 ? 90 : 270;
}

/**
 * Determine pin name alignment based on pin rotation (direction).
 * EasyEDA uses LEFT_MIDDLE / RIGHT_MIDDLE (not _CENTER).
 *   rotation=0   (left-side pin)  → LEFT_MIDDLE  (text extends left toward tip)
 *   rotation=180 (right-side pin) → RIGHT_MIDDLE (text extends right toward tip)
 *   rotation=90  (bottom pin)     → LEFT_MIDDLE
 *   rotation=270 (top pin)        → RIGHT_MIDDLE
 */
function pinRotationToNameAlign(rotation: number): string {
  if (rotation === 0 || rotation === 90) return 'LEFT_MIDDLE';
  return 'RIGHT_MIDDLE';
}

// ─── Main conversion: all parts in one document ─────────────────────────────

export function generateSymbolDocument(symbol: XpedSymbol, uuid: string): string {
  resetSymState();

  const partsCount = symbol.partsCount || 1;
  const zoom = symbol.zoomLevel || 1;
  const lines: string[] = [];

  // Coordinate conversion:
  //   V54+: raw values are in ZoomLevel×nm. 1 EasyEDA unit = 0.01 inch = 254000nm
  //         eeUnit = raw × ZoomLevel / 254000
  //   V53-: raw values are already in EasyEDA-friendly units (≈ 0.001 inch / mil)
  //         eeUnit = raw × ZoomLevel × 0.1
  const s = symbol.version >= 54
    ? (v: number) => Math.round(v * zoom / 254000 * 100) / 100
    : (v: number) => Math.round(v * zoom * 0.1 * 100) / 100;

  // DOCHEAD
  const now = Date.now();
  lines.push(`{"type":"DOCHEAD"}||{"docType":"SYMBOL","client":"dc1b67a7c337aae3","uuid":"${uuid}","updateTime":${now},"version":"${now}"}|`);

  // CANVAS
  lines.push(`{"type":"CANVAS","ticket":1,"id":"CANVAS"}||{"originX":0,"originY":0}|`);

  // One PART entry per gate
  for (let p = 0; p < partsCount; p++) {
    const partTitle = partsCount > 1 ? `${symbol.name}.${p + 1}` : `${symbol.name}.1`;
    lines.push(`{"type":"PART","ticket":${2 + p},"id":"${partTitle}"}||{"title":"${partTitle}"}|`);
  }

  _symTicket = 2 + partsCount;
  let zIndex = 3 + partsCount;

  // Generate content for each part
  for (let p = 0; p < partsCount; p++) {
    const partTitle = partsCount > 1 ? `${symbol.name}.${p + 1}` : `${symbol.name}.1`;
    const pinsForPart = filterPinsForPart(symbol.pins, p, partsCount, symbol.hetero);
    const isFirstPart = p === 0;
    const isLastPart = p === partsCount - 1;

    // Part-level attributes
    const symbolAttr = symbol.properties['DEVICE'] || symbol.name;
    const symAttrId = nextSymId('e');
    lines.push(
      `{"type":"ATTR","ticket":${nextSymTicket()},"id":"${symAttrId}"}||{"x":null,"y":null,"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_BOTTOM","value":"${escapeJson(symbolAttr)}","keyVisible":false,"valueVisible":false,"key":"Symbol","fillColor":null,"parentId":"${partTitle}","zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
    );

    const desAttrId = nextSymId('e');
    const refDes = symbol.properties['Ref Designator'] || 'U?';
    lines.push(
      `{"type":"ATTR","ticket":${nextSymTicket()},"id":"${desAttrId}"}||{"x":null,"y":null,"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_BOTTOM","value":"${escapeJson(refDes)}","keyVisible":false,"valueVisible":false,"key":"Designator","fillColor":null,"parentId":"${partTitle}","zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
    );

    // Multi-part structure:
    //   Part 1 (first): pins(display:true) then graphics
    //   Part 2..N-1 (middle): pins(display:false) then graphics
    //   Part N (last): graphics BEFORE pins, display:true
    if (isLastPart && partsCount > 1) {
      // Last part: graphics BEFORE pins, display:true
      for (const graphic of symbol.graphics) {
        zIndex = emitGraphic(lines, graphic, s, zIndex, partTitle);
      }
      zIndex = emitPinsForPart(lines, pinsForPart, p, s, zIndex, partTitle, true);
    } else {
      // First and middle parts: pins then graphics
      const display = isFirstPart;
      zIndex = emitPinsForPart(lines, pinsForPart, p, s, zIndex, partTitle, display);
      for (const graphic of symbol.graphics) {
        zIndex = emitGraphic(lines, graphic, s, zIndex, partTitle);
      }
    }
  }

  return lines.join('\n');
}

// ─── Pin emission ────────────────────────────────────────────────────────────

function emitPinsForPart(
  lines: string[],
  pins: XpedSymbolPin[],
  partIndex: number,
  s: (v: number) => number,
  zIndex: number,
  partTitle: string,
  display: boolean,
): number {
  for (const pin of pins) {
    const tipXs = s(pin.startX);
    const tipYs = s(-pin.startY);
    const bodyXs = s(pin.endX);
    const bodyYs = s(-pin.endY);
    const rotation = computePinRotation(pin.startX, pin.startY, pin.endX, pin.endY);
    const pinLength = Math.round(Math.sqrt(
      Math.pow(bodyXs - tipXs, 2) + Math.pow(bodyYs - tipYs, 2)
    ));
    const pinShape = pin.inverted ? 'INVERTED' : 'NONE';

    const pinId = nextSymId('e');
    lines.push(
      `{"type":"PIN","ticket":${nextSymTicket()},"id":"${pinId}"}||{"display":${display},"x":${tipXs},"y":${tipYs},"length":${pinLength},"rotation":${rotation},"color":null,"pinShape":"${pinShape}","zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
    );

    // Pin Name
    if (pin.label) {
      const nameAttrId = nextSymId('e');
      const lx = s(pin.labelX || pin.startX);
      const ly = s(-(pin.labelY || pin.startY));
      const align = pinRotationToNameAlign(rotation);
      const labelRot = (pin.labelRotation || 0) * 90;
      const vis = pin.labelVisible;
      lines.push(
        `{"type":"ATTR","ticket":${nextSymTicket()},"id":"${nameAttrId}"}||{"x":${lx},"y":${ly},"rotation":${labelRot},"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"${align}","value":"${escapeJson(pin.label)}","keyVisible":false,"valueVisible":${vis},"key":"Pin Name","fillColor":null,"parentId":"${pinId}","zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
      );
    }

    // Pin Number
    if (pin.pinNumbers.length > 0) {
      const numAttrId = nextSymId('e');
      const numValue = pin.pinNumbers.length > partIndex
        ? pin.pinNumbers[partIndex]
        : pin.pinNumbers.join(',');
      const numX = tipXs + 2;
      const numY = tipYs - 1;
      const numVis = pin.pinNumberVisible;
      lines.push(
        `{"type":"ATTR","ticket":${nextSymTicket()},"id":"${numAttrId}"}||{"x":${numX},"y":${numY},"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_BOTTOM","value":"${numValue}","keyVisible":false,"valueVisible":${numVis},"key":"Pin Number","fillColor":null,"parentId":"${pinId}","zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
      );
    }

    // Pin Type
    const typeAttrId = nextSymId('e');
    lines.push(
      `{"type":"ATTR","ticket":${nextSymTicket()},"id":"${typeAttrId}"}||{"x":${tipXs},"y":${tipYs},"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":null,"italic":null,"underline":null,"strikeout":null,"align":"LEFT_BOTTOM","value":"${pin.pinType || 'Undefined'}","keyVisible":false,"valueVisible":false,"key":"Pin Type","fillColor":null,"parentId":"${pinId}","zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
    );
  }
  return zIndex;
}

// ─── Graphic element emission ────────────────────────────────────────────────

function emitGraphic(
  lines: string[],
  graphic: XpedSymbolGraphic,
  s: (v: number) => number,
  zIndex: number,
  partTitle: string,
): number {
  switch (graphic.type) {
    case 'polyline':
    case 'polygon': {
      const polyId = nextSymId('e');
      const ticket = nextSymTicket();
      const closed = graphic.type === 'polygon';
      const pts = graphic.points.map(pt => `{"x":${s(pt.x)},"y":${s(-pt.y)},"hashed":0}`).join(',');
      lines.push(
        `{"type":"POLY","ticket":${ticket},"id":"${polyId}"}||{"points":[${pts}],"strokeColor":null,"strokeStyle":null,"fillColor":null,"strokeWidth":null,"fillStyle":null,"closed":${closed},"zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
      );
      break;
    }
    case 'rect': {
      const polyId = nextSymId('e');
      const ticket = nextSymTicket();
      const x1 = s(graphic.x1), y1 = s(-graphic.y1);
      const x2 = s(graphic.x2), y2 = s(-graphic.y2);
      const pts = [
        `{"x":${x1},"y":${y1},"hashed":0}`,
        `{"x":${x2},"y":${y1},"hashed":0}`,
        `{"x":${x2},"y":${y2},"hashed":0}`,
        `{"x":${x1},"y":${y2},"hashed":0}`,
        `{"x":${x1},"y":${y1},"hashed":0}`,
      ].join(',');
      lines.push(
        `{"type":"POLY","ticket":${ticket},"id":"${polyId}"}||{"points":[${pts}],"strokeColor":null,"strokeStyle":null,"fillColor":null,"strokeWidth":null,"fillStyle":null,"closed":true,"zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
      );
      break;
    }
    case 'circle': {
      const polyId = nextSymId('e');
      const ticket = nextSymTicket();
      const cx = s(graphic.cx), cy = s(-graphic.cy);
      const r = s(graphic.radius);
      lines.push(
        `{"type":"POLY","ticket":${ticket},"id":"${polyId}"}||{"points":["CIRCLE",${cx},${cy},${r}],"strokeColor":null,"strokeStyle":null,"fillColor":null,"strokeWidth":null,"fillStyle":null,"closed":false,"zIndex":${zIndex++},"locked":false,"partId":"${partTitle}"}|`
      );
      break;
    }
    case 'arc': {
      const arcId = nextSymId('e');
      const ticket = nextSymTicket();
      const sx = s(graphic.startX);
      const sy = s(-graphic.startY);
      const ex = s(graphic.endX);
      const ey = s(-graphic.endY);
      const rx = s(graphic.centerX);
      const ry = s(-graphic.centerY);
      lines.push(
        `{"type":"ARC","ticket":${ticket},"id":"${arcId}"}||{"startX":${sx},"startY":${sy},"endX":${ex},"endY":${ey},"referX":${rx},"referY":${ry},"strokeColor":null,"strokeStyle":null,"fillColor":null,"strokeWidth":null,"fillStyle":null,"zIndex":${zIndex++},"partId":"${partTitle}"}|`
      );
      break;
    }
  }
  return zIndex;
}

// ─── Pin filtering for multi-part symbols ───────────────────────────────────

function filterPinsForPart(
  pins: XpedSymbolPin[],
  partIndex: number,
  partsCount: number,
  hetero: string[],
): XpedSymbolPin[] {
  if (partsCount <= 1 || hetero.length === 0) return pins;
  return pins.filter(pin => {
    if (pin.pinNumbers.length === 0) return true;
    return partIndex < pin.pinNumbers.length || pin.pinNumbers.length > 0;
  });
}

// ─── Legacy: single-part symbol source (kept for backwards compat) ──────────

export function generateSymbolSource(
  symbol: XpedSymbol,
  partIndex: number = 0,
  partsCount: number = 1,
): string {
  const hex = '0123456789abcdef';
  let u = '';
  for (let i = 0; i < 32; i++) u += hex[Math.floor(Math.random() * 16)];
  return generateSymbolDocument(symbol, u);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function escapeJson(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
