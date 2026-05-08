/**
 * EasyEDA data models for parsing raw CAD data.
 * Ported from easyeda/parameters_easyeda.py
 */

// ─── Helpers ────────────────────────���────────────────────────────────────────

function parseBoolOrStr(v: string | boolean | undefined, fallback: boolean = false): boolean | string {
  if (v === undefined || v === '') return fallback;
  if (v === 'show') return true;
  return v as boolean;
}

function emptyStrOrNum(v: string | number | undefined, fb: number = 0): number {
  if (v === undefined || v === '') return fb;
  return Number(v);
}

function parseFontSize(v: string | number | undefined): number {
  if (typeof v === 'string' && v.includes('pt')) return parseFloat(v.replace('pt', ''));
  return Number(v) || 7;
}

function parseFillColor(v: string | boolean | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (!v || v === '') return false;
  return v.toLowerCase() !== 'none';
}

function emptyStrLock(v: string | boolean | undefined): boolean {
  if (v === undefined || v === '') return false;
  return !!v;
}

// ─── Symbol Models ───────────────────────────────────────────────────────────

export interface EeSymbolBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function makeEeSymbolBbox(data: Record<string, any>): EeSymbolBbox {
  return {
    x: parseFloat(data.x ?? '0'),
    y: parseFloat(data.y ?? '0'),
    width: parseFloat(data.width ?? '0'),
    height: parseFloat(data.height ?? '0'),
  };
}

export interface EeSymbolInfo {
  name: string;
  prefix: string;
  package: string;
  manufacturer: string;
  datasheet: string;
  lcscId: string;
  jlcId: string;
  mpn: string;
}

export interface EeSymbolPinSettings {
  isDisplayed: boolean;
  type: number;
  spicePinNumber: string;
  posX: number;
  posY: number;
  rotation: number;
  id: string;
  isLocked: boolean;
}

export function makeEeSymbolPinSettings(fields: string[]): EeSymbolPinSettings {
  const pinTypes = [0, 1, 2, 3, 4];
  const rawType = Number(fields[1] ?? 0);
  return {
    isDisplayed: fields[0] === 'show' ? true : !!fields[0],
    type: pinTypes.includes(rawType) ? rawType : 0,
    spicePinNumber: fields[2] ?? '',
    posX: Number(fields[3] ?? 0),
    posY: Number(fields[4] ?? 0),
    rotation: fields[5] === '' ? 0 : Number(fields[5]),
    id: fields[6] ?? '',
    isLocked: fields[7] === '' ? false : !!fields[7],
  };
}

export interface EeSymbolPinDot { dotX: number; dotY: number }

export interface EeSymbolPinPath { path: string; color: string }

export function makeEeSymbolPinPath(rawPath: string, color: string): EeSymbolPinPath {
  return { path: rawPath.replace(/v/g, 'h'), color };
}

export interface EeSymbolPinName {
  isDisplayed: boolean;
  posX: number;
  posY: number;
  rotation: number;
  text: string;
  textAnchor: string;
  font: string;
  fontSize: number;
}

const PIN_NAME_FIELDS = ['isDisplayed', 'posX', 'posY', 'rotation', 'text', 'textAnchor', 'font', 'fontSize'];

export function makeEeSymbolPinName(fields: string[]): EeSymbolPinName {
  return {
    isDisplayed: fields[0] === 'show' ? true : !!fields[0],
    posX: Number(fields[1] ?? 0),
    posY: Number(fields[2] ?? 0),
    rotation: fields[3] === '' ? 0 : Number(fields[3]),
    text: fields[4] ?? '',
    textAnchor: fields[5] ?? '',
    font: fields[6] ?? '',
    fontSize: parseFontSize(fields[7]),
  };
}

export interface EeSymbolPinNumber {
  isDisplayed: boolean;
  posX: number;
  posY: number;
  rotation: number;
  text: string;
  textAnchor: string;
  font: string;
  fontSize: number;
}

export function makeEeSymbolPinNumber(fields: string[]): EeSymbolPinNumber {
  return {
    isDisplayed: fields[0] === 'show' ? true : !!fields[0],
    posX: Number(fields[1] ?? 0),
    posY: Number(fields[2] ?? 0),
    rotation: fields[3] === '' ? 0 : Number(fields[3]),
    text: fields[4] ?? '',
    textAnchor: fields[5] ?? '',
    font: fields[6] ?? '',
    fontSize: parseFontSize(fields[7]),
  };
}

export interface EeSymbolPinDotBis { isDisplayed: boolean; circleX: number; circleY: number }
export interface EeSymbolPinClock { isDisplayed: boolean; path: string }

export interface EeSymbolPin {
  settings: EeSymbolPinSettings;
  pinDot: EeSymbolPinDot;
  pinPath: EeSymbolPinPath;
  name: EeSymbolPinName;
  number: EeSymbolPinNumber;
  dot: EeSymbolPinDotBis;
  clock: EeSymbolPinClock;
}

export interface EeSymbolRectangle {
  posX: number; posY: number; rx: number | null; ry: number | null;
  width: number; height: number;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: string; id: string; isLocked: boolean;
}

export interface EeSymbolCircle {
  centerX: number; centerY: number; radius: number;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: boolean; id: string; isLocked: boolean;
}

export interface EeSymbolArc {
  path: string; helperDots: string;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: boolean; id: string; isLocked: boolean;
}

export interface EeSymbolEllipse {
  centerX: number; centerY: number; radiusX: number; radiusY: number;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: boolean; id: string; isLocked: boolean;
}

export interface EeSymbolLine {
  x1: number; y1: number; x2: number; y2: number;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: string; id: string; isLocked: boolean;
}

export interface EeSymbolPolyline {
  points: string;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: boolean; id: string; isLocked: boolean;
}

export interface EeSymbolPolygon extends EeSymbolPolyline {}

export interface EeSymbolPath {
  paths: string;
  strokeColor: string; strokeWidth: string; strokeStyle: string;
  fillColor: boolean; id: string; isLocked: boolean;
}

export interface EeSymbolSub {
  name: string;
  bbox: EeSymbolBbox;
  pins: EeSymbolPin[];
  rectangles: EeSymbolRectangle[];
  circles: EeSymbolCircle[];
  arcs: EeSymbolArc[];
  ellipses: EeSymbolEllipse[];
  polylines: EeSymbolPolyline[];
  polygons: EeSymbolPolygon[];
  paths: EeSymbolPath[];
  lines: EeSymbolLine[];
}

export interface EeSymbol {
  info: EeSymbolInfo;
  bbox: EeSymbolBbox;
  subs: EeSymbolSub[];
}

// ─── Footprint Models ────────────────────────────────────────────────────────

export interface EeFootprintBbox { x: number; y: number; width: number; height: number }

export interface EeFootprintLayer {
  layerId: number; layerName: string; layerColer: string;
  isVisible: boolean; isActive: boolean; isConfig: boolean;
}

export interface EeFootprintInfo {
  name: string;
  fpType: string;
  model3dName: string;
  layers: EeFootprintLayer[];
}

export interface EeFootprintPad {
  shape: string;
  centerX: number; centerY: number;
  width: number; height: number;
  layerId: number; net: string; number: string;
  holeRadius: number; points: string;
  rotation: number; id: string;
  holeLength: number; holePoint: string;
  isPlated: boolean; isLocked: boolean;
}

export interface EeFootprintTrack {
  strokeWidth: number; layerId: number;
  net: string; points: string; id: string; isLocked: boolean;
}

export interface EeFootprintHole {
  centerX: number; centerY: number; radius: number; id: string; isLocked: boolean;
}

export interface EeFootprintVia {
  centerX: number; centerY: number; diameter: number;
  net: string; radius: number; id: string; isLocked: boolean;
}

export interface EeFootprintCircle {
  cx: number; cy: number; radius: number;
  strokeWidth: number; layerId: number; id: string; isLocked: boolean;
}

export interface EeFootprintRectangle {
  x: number; y: number; width: number; height: number;
  strokeWidth: number; id: string; layerId: number; isLocked: boolean;
}

export interface EeFootprintArc {
  strokeWidth: number; layerId: number; net: string;
  path: string; helperDots: string; id: string; isLocked: boolean;
}

export interface EeFootprintText {
  type: string; centerX: number; centerY: number;
  strokeWidth: number; rotation: number; miror: string;
  layerId: number; net: string; fontSize: number;
  text: string; textPath: string; isDisplayed: boolean;
  id: string; isLocked: boolean;
}

export interface EeFootprintCopperArea {
  strokeWidth: number; layerId: number; net: string; points: string;
  clearanceWidth: number; fillStyle: string; id: string;
  thermal: string; isKeepIsland: boolean; copperZone: any[]; isLocked: boolean;
}

export interface EeFootprintSolidRegion {
  layerId: number; net: string; points: string;
  type: string; id: string; isLocked: boolean;
}

export interface EeFootprint {
  info: EeFootprintInfo;
  bbox: EeFootprintBbox;
  pads: EeFootprintPad[];
  tracks: EeFootprintTrack[];
  holes: EeFootprintHole[];
  vias: EeFootprintVia[];
  circles: EeFootprintCircle[];
  arcs: EeFootprintArc[];
  rectangles: EeFootprintRectangle[];
  texts: EeFootprintText[];
  copperAreas: EeFootprintCopperArea[];
  solidRegions: EeFootprintSolidRegion[];
}
