/**
 * Parser for Xpedition HKP files — padstack libraries (*.PSK.HKP) and cell libraries (*.CEL.HKP).
 * All units are MM.
 */

// ─── Data types ─────────────────────────────────────────────────────────────

export interface XpedPad {
  name: string;
  shape: 'ROUND' | 'RECTANGLE' | 'OBLONG' | 'SQUARE' | 'OCTAGON' | 'CUSTOM';
  diameter?: number;
  width?: number;
  height?: number;
  offsetX: number;
  offsetY: number;
  polylinePoints?: { x: number; y: number }[];
}

export interface XpedHole {
  name: string;
  shape: 'ROUND' | 'SLOT' | 'RECTANGLE';
  diameter?: number;
  width?: number;
  height?: number;
  plated: boolean;
  positiveTol: number;
  negativeTol: number;
}

export interface XpedPadstack {
  name: string;
  type: 'VIA' | 'PIN_SMD' | 'PIN_THROUGH';
  topPad?: string;
  bottomPad?: string;
  internalPad?: string;
  topSoldermaskPad?: string;
  bottomSoldermaskPad?: string;
  topSolderpastePad?: string;
  bottomSolderpastePad?: string;
  holeName?: string;
  holeOffsetX: number;
  holeOffsetY: number;
}

export interface XpedPin {
  number: string;
  x: number;
  y: number;
  padstack: string;
  rotation: number;
}

export interface XpedOutlineShape {
  type: 'RECT_SHAPE' | 'POLYLINE_SHAPE' | 'POLYLINE_PATH' | 'CIRCLE_PATH' | 'RECT_PATH';
  points?: { x: number; y: number }[];
  width?: number;
  radius?: number;
  filled?: boolean;
}

export interface XpedCellOutline {
  kind: 'ASSEMBLY_OUTLINE' | 'PLACEMENT_OUTLINE' | 'SILKSCREEN_OUTLINE' | 'GRAPHIC';
  side?: string;
  height?: number;
  userLayer?: string;
  displayCondition?: string;
  shapes: XpedOutlineShape[];
}

export interface XpedCellText {
  textType: string;
  textValue?: string;
  x: number;
  y: number;
  textLayer?: string;
  displayCondition?: string;
  height?: number;
}

export interface XpedCell {
  name: string;
  packageGroup: string;
  mountType: 'SURFACE' | 'THROUGH' | 'MIXED';
  numberLayers: number;
  description: string;
  pins: XpedPin[];
  outlines: XpedCellOutline[];
  texts: XpedCellText[];
  properties: Record<string, string>;
}

// ─── Generic HKP line parser ────────────────────────────────────────────────

interface HkpSection {
  keyword: string;
  value: string;
  children: HkpSection[];
}

function parseHkpLines(content: string): HkpSection[] {
  const root: HkpSection[] = [];
  const stack: { section: HkpSection; indent: number }[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('!')) continue;

    // Skip leading whitespace before counting dots (handles both "  ..KEY" and "..KEY" formats)
    let pos = 0;
    while (pos < line.length && (line[pos] === ' ' || line[pos] === '\t')) pos++;

    let indent = 0;
    while (pos < line.length && line[pos] === '.') { indent++; pos++; }

    // Handle continuation lines: lines without dots that start with '('
    // belong to the previous XY section (multi-point coordinates)
    if (indent === 0) {
      const rest = line.substring(pos).trim();
      if (rest.startsWith('(') && stack.length > 0) {
        const last = stack[stack.length - 1].section;
        if (last.keyword === 'XY') {
          last.value += ' ' + rest;
        }
      }
      continue;
    }

    const trimmed = line.substring(pos).trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const keyword = parts[0];
    const value = parts.length > 1 ? trimmed.substring(keyword.length).trim() : '';

    const section: HkpSection = { keyword, value, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(section);
    } else {
      stack[stack.length - 1].section.children.push(section);
    }
    stack.push({ section, indent });
  }

  return root;
}

function findChild(section: HkpSection, keyword: string): HkpSection | undefined {
  return section.children.find(c => c.keyword === keyword);
}

function findChildren(section: HkpSection, keyword: string): HkpSection[] {
  return section.children.filter(c => c.keyword === keyword);
}

function parseCoord(value: string): [number, number] {
  const m = value.match(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  const parts = value.split(/[\s,]+/).filter(Boolean);
  return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0];
}

function parseXYPoints(section: HkpSection): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const child of section.children) {
    if (child.keyword === 'XY') {
      // Parse multiple coordinate pairs from a single XY line
      const matches = child.value.matchAll(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g);
      for (const m of matches) {
        points.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
      }
    }
  }
  return points;
}

// ─── Padstack library parser ────────────────────────────────────────────────

export function parsePadsFile(content: string): { pads: XpedPad[]; holes: XpedHole[]; padstacks: XpedPadstack[] } {
  const sections = parseHkpLines(content);
  const pads: XpedPad[] = [];
  const holes: XpedHole[] = [];
  const padstacks: XpedPadstack[] = [];

  for (const sec of sections) {
    if (sec.keyword === 'PAD') {
      const pad: XpedPad = {
        name: unwrapQuotes(sec.value),
        shape: 'ROUND',
        offsetX: 0,
        offsetY: 0,
      };

      for (const child of sec.children) {
        if (child.keyword === 'ROUND') {
          pad.shape = 'ROUND';
          const diam = findChild(child, 'DIAMETER');
          if (diam) pad.diameter = parseFloat(diam.value);
        } else if (child.keyword === 'RECTANGLE') {
          pad.shape = 'RECTANGLE';
          const w = findChild(child, 'WIDTH');
          const h = findChild(child, 'HEIGHT');
          if (w) pad.width = parseFloat(w.value);
          if (h) pad.height = parseFloat(h.value);
        } else if (child.keyword === 'OBLONG') {
          pad.shape = 'OBLONG';
          const w = findChild(child, 'WIDTH');
          const h = findChild(child, 'HEIGHT');
          if (w) pad.width = parseFloat(w.value);
          if (h) pad.height = parseFloat(h.value);
        } else if (child.keyword === 'SQUARE') {
          pad.shape = 'SQUARE';
          const w = findChild(child, 'WIDTH');
          const diam = findChild(child, 'DIAMETER');
          if (w) pad.width = parseFloat(w.value);
          if (diam) pad.diameter = parseFloat(diam.value);
        } else if (child.keyword === 'OFFSET') {
          const [ox, oy] = parseCoord(child.value);
          pad.offsetX = ox;
          pad.offsetY = oy;
        } else if (child.keyword === 'POLYGON') {
          pad.shape = 'CUSTOM';
          pad.polylinePoints = parseXYPoints(child);
        }
      }
      pads.push(pad);
    } else if (sec.keyword === 'HOLE') {
      const hole: XpedHole = {
        name: unwrapQuotes(sec.value),
        shape: 'ROUND',
        plated: true,
        positiveTol: 0,
        negativeTol: 0,
      };

      for (const child of sec.children) {
        if (child.keyword === 'ROUND') {
          hole.shape = 'ROUND';
          const diam = findChild(child, 'DIAMETER');
          if (diam) hole.diameter = parseFloat(diam.value);
        } else if (child.keyword === 'SLOT') {
          hole.shape = 'SLOT';
          const w = findChild(child, 'WIDTH');
          const h = findChild(child, 'HEIGHT');
          if (w) hole.width = parseFloat(w.value);
          if (h) hole.height = parseFloat(h.value);
        } else if (child.keyword === 'RECTANGLE') {
          hole.shape = 'RECTANGLE';
          const w = findChild(child, 'WIDTH');
          const h = findChild(child, 'HEIGHT');
          if (w) hole.width = parseFloat(w.value);
          if (h) hole.height = parseFloat(h.value);
        } else if (child.keyword === 'HOLE_OPTIONS') {
          hole.plated = child.value.includes('PLATED');
        } else if (child.keyword === 'POSITIVE_TOLERANCE') {
          hole.positiveTol = parseFloat(child.value) || 0;
        } else if (child.keyword === 'NEGATIVE_TOLERANCE') {
          hole.negativeTol = parseFloat(child.value) || 0;
        }
      }
      holes.push(hole);
    } else if (sec.keyword === 'PADSTACK') {
      const ps: XpedPadstack = {
        name: unwrapQuotes(sec.value),
        type: 'PIN_SMD',
        holeOffsetX: 0,
        holeOffsetY: 0,
      };

      for (const child of sec.children) {
        if (child.keyword === 'PADSTACK_TYPE') {
          if (child.value === 'VIA') ps.type = 'VIA';
          else if (child.value === 'PIN_THROUGH') ps.type = 'PIN_THROUGH';
          else ps.type = 'PIN_SMD';
        } else if (child.keyword === 'TECHNOLOGY') {
          for (const tc of child.children) {
            if (tc.keyword === 'TOP_PAD') ps.topPad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'BOTTOM_PAD') ps.bottomPad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'INTERNAL_PAD') ps.internalPad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'TOP_SOLDERMASK_PAD') ps.topSoldermaskPad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'BOTTOM_SOLDERMASK_PAD') ps.bottomSoldermaskPad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'TOP_SOLDERPASTE_PAD') ps.topSolderpastePad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'BOTTOM_SOLDERPASTE_PAD') ps.bottomSolderpastePad = unwrapQuotes(tc.value);
            else if (tc.keyword === 'HOLE_NAME') {
              ps.holeName = unwrapQuotes(tc.value);
              for (const hc of tc.children) {
                if (hc.keyword === 'OFFSET') {
                  const [ox, oy] = parseCoord(hc.value);
                  ps.holeOffsetX = ox;
                  ps.holeOffsetY = oy;
                }
              }
            }
          }
        }
      }
      padstacks.push(ps);
    }
  }

  return { pads, holes, padstacks };
}

// ─── Cell library parser ────────────────────────────────────────────────────

export function parseCellFile(content: string): XpedCell[] {
  const sections = parseHkpLines(content);
  const cells: XpedCell[] = [];

  for (const sec of sections) {
    if (sec.keyword === 'PACKAGE_CELL') {
      const cell: XpedCell = {
        name: unwrapQuotes(sec.value),
        packageGroup: 'DISCRETE_CHIP',
        mountType: 'SURFACE',
        numberLayers: 3,
        description: '',
        pins: [],
        outlines: [],
        texts: [],
        properties: {},
      };

      let currentOutline: XpedCellOutline | null = null;

      for (const child of sec.children) {
        if (child.keyword === 'PACKAGE_GROUP') {
          cell.packageGroup = child.value;
        } else if (child.keyword === 'MOUNT_TYPE') {
          cell.mountType = child.value as any;
        } else if (child.keyword === 'NUMBER_LAYERS') {
          cell.numberLayers = parseInt(child.value) || 3;
        } else if (child.keyword === 'DESCRIPTION') {
          cell.description = unwrapQuotes(child.value);
        } else if (child.keyword === 'PIN') {
          cell.pins.push(parsePin(child));
        } else if (['ASSEMBLY_OUTLINE', 'PLACEMENT_OUTLINE', 'SILKSCREEN_OUTLINE', 'GRAPHIC'].includes(child.keyword)) {
          currentOutline = parseOutline(child);
          cell.outlines.push(currentOutline);
        } else if (child.keyword === 'TEXT') {
          const text = parseText(child);
          if (text) cell.texts.push(text);
        }
      }

      cells.push(cell);
    }
  }

  return cells;
}

function parsePin(section: HkpSection): XpedPin {
  const pin: XpedPin = {
    number: unwrapQuotes(section.value),
    x: 0,
    y: 0,
    padstack: '',
    rotation: 0,
  };

  for (const child of section.children) {
    if (child.keyword === 'XY') {
      const [x, y] = parseCoord(child.value);
      pin.x = x;
      pin.y = y;
    } else if (child.keyword === 'PADSTACK') {
      pin.padstack = unwrapQuotes(child.value);
    } else if (child.keyword === 'ROTATION') {
      pin.rotation = parseFloat(child.value) || 0;
    }
  }

  return pin;
}

function parseOutline(section: HkpSection): XpedCellOutline {
  const kind = section.keyword as XpedCellOutline['kind'];
  const outline: XpedCellOutline = {
    kind,
    shapes: [],
  };

  for (const child of section.children) {
    if (child.keyword === 'SIDE') outline.side = child.value;
    else if (child.keyword === 'HEIGHT') outline.height = parseFloat(child.value);
    else if (child.keyword === 'USER_LYR') outline.userLayer = unwrapQuotes(child.value);
    else if (child.keyword === 'DISPLAY_CONDITION') outline.displayCondition = child.value;
    else if (child.keyword === 'RECT_SHAPE') {
      const pts = parseXYPoints(child);
      if (pts.length >= 2) {
        outline.shapes.push({
          type: 'RECT_SHAPE',
          points: pts,
        });
      }
    } else if (child.keyword === 'POLYLINE_SHAPE' || child.keyword === 'POLYLINE_PATH') {
      const pts = parseXYPoints(child);
      const wSec = findChild(child, 'WIDTH');
      outline.shapes.push({
        type: child.keyword as XpedOutlineShape['type'],
        points: pts,
        width: wSec ? parseFloat(wSec.value) : undefined,
      });
    } else if (child.keyword === 'CIRCLE_PATH') {
      const radiusSec = findChild(child, 'RADIUS');
      const wSec = findChild(child, 'WIDTH');
      outline.shapes.push({
        type: 'CIRCLE_PATH',
        radius: radiusSec ? parseFloat(radiusSec.value) : 0,
        points: parseXYPoints(child),
        width: wSec ? parseFloat(wSec.value) : undefined,
      });
    } else if (child.keyword === 'RECT_PATH') {
      const wSec = findChild(child, 'WIDTH');
      const pts = parseXYPoints(child);
      outline.shapes.push({
        type: 'RECT_PATH',
        points: pts,
        width: wSec ? parseFloat(wSec.value) : 0,
      });
    }
  }

  return outline;
}

function parseText(section: HkpSection): XpedCellText | null {
  const textType = section.value ? unwrapQuotes(section.value) : '';
  if (!textType && section.keyword === 'TEXT') {
    // TEXT "key" "value" format → property pair
    const parts = section.value.split(/\s+/);
    if (parts.length >= 2) {
      return {
        textType: 'PROPERTY_PAIR',
        textValue: unwrapQuotes(parts[1]),
        x: 0, y: 0,
      };
    }
    return null;
  }

  const result: XpedCellText = {
    textType: section.keyword === 'TEXT' ? unwrapQuotes(section.value) : textType,
    x: 0, y: 0,
  };

  for (const child of section.children) {
    if (child.keyword === 'DISPLAY_ATTR') {
      for (const dc of child.children) {
        if (dc.keyword === 'XY') {
          const [x, y] = parseCoord(dc.value);
          result.x = x;
          result.y = y;
        } else if (dc.keyword === 'HEIGHT') {
          result.height = parseFloat(dc.value) || 0;
        }
      }
    } else if (child.keyword === 'HEIGHT') {
      result.height = parseFloat(child.value) || 0;
    }
  }

  return result;
}

function unwrapQuotes(s: string): string {
  if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
    return s.substring(1, s.length - 1);
  }
  return s;
}
