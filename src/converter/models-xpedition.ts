/**
 * Xpedition output data models with text serialization.
 * Ported from xpedition/ module (pads, padstacks, holes, shapes, cell, symbol).
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function indent(level: number): string {
  return ' '.repeat(level - 1) + '.'.repeat(level);
}

function fmt(n: number, decimals = 4): string {
  return n.toFixed(decimals);
}

// ─── Pads ────────────────────────────────────────────────────────────────────

export abstract class XpeditionPad {
  name: string;
  offset: [number, number] = [0, 0];
  padOptions = 'USER_GENERATED_NAME';
  abstract shape: string;

  constructor(name: string, offset: [number, number] = [0, 0]) {
    this.name = name;
    this.offset = offset;
  }

  toString(): string {
    let s = `.PAD "${this.name}"\n`;
    s += `..PAD_OPTIONS ${this.padOptions}\n`;
    s += `..OFFSET (${this.offset[0]}, ${this.offset[1]})\n`;
    s += `..${this.shape}\n`;
    s += this.body();
    return s;
  }

  protected abstract body(): string;
}

export class RectanglePad extends XpeditionPad {
  shape = 'RECTANGLE';
  width: number;
  height: number;
  constructor(name: string, width: number, height: number, offset: [number, number] = [0, 0]) {
    super(name, offset);
    this.width = width;
    this.height = height;
  }
  protected body(): string {
    return `...WIDTH ${this.width}\n...HEIGHT ${this.height}\n`;
  }
}

export class RoundPad extends XpeditionPad {
  shape = 'ROUND';
  diameter: number;
  constructor(name: string, diameter: number, offset: [number, number] = [0, 0]) {
    super(name, offset);
    this.diameter = diameter;
  }
  protected body(): string {
    return `...DIAMETER ${Math.round(this.diameter)}\n`;
  }
}

export class OblongPad extends XpeditionPad {
  shape = 'OBLONG';
  width: number;
  height: number;
  constructor(name: string, width: number, height: number, offset: [number, number] = [0, 0]) {
    super(name, offset);
    this.width = width;
    this.height = height;
  }
  protected body(): string {
    return `...WIDTH ${this.width}\n...HEIGHT ${this.height}\n`;
  }
}

export class PolygonPad extends XpeditionPad {
  shape = 'CUSTOM';
  points: [number, number][];
  constructor(name: string, points: [number, number][], offset: [number, number] = [0, 0]) {
    super(name, offset);
    this.points = points;
  }
  protected body(): string {
    const pts = this.points.map(p => `(${p[0]}, ${p[1]})`).join(' ');
    return `...POLYLINE_SHAPE\n....XY ${pts}\n....SHAPE_OPTIONS FILLED\n`;
  }
}

// ─── Holes ───────────────────────────────────────────────────────────────────

export abstract class XpeditionHole {
  name: string;
  plated: boolean;
  drillType: string;
  tol: [number, number];
  abstract shape: string;

  constructor(name: string, plated = false, drillType = 'DRILLED', tol: [number, number] = [0, 0]) {
    this.name = name;
    this.plated = plated;
    this.drillType = drillType;
    this.tol = tol;
  }

  toString(): string {
    const platedStr = this.plated ? 'PLATED' : 'NON_PLATED';
    let s = `.Hole "${this.name}"\n`;
    s += `..POSITIVE_TOLERANCE ${this.tol[0]}\n`;
    s += `..NEGATIVE_TOLERANCE ${this.tol[1]}\n`;
    s += `..HOLE_OPTIONS ${platedStr} ${this.drillType} USER_GENERATED_NAME\n`;
    s += `..${this.shape}\n`;
    s += this.body();
    return s;
  }

  protected abstract body(): string;
}

export class RoundHole extends XpeditionHole {
  shape = 'ROUND';
  diameter: number;
  constructor(name: string, diameter: number, plated = false, drillType = 'DRILLED', tol: [number, number] = [0, 0]) {
    super(name, plated, drillType, tol);
    this.diameter = diameter;
  }
  protected body(): string {
    return `...DIAMETER ${Math.round(this.diameter)}\n`;
  }
}

export class SlotHole extends XpeditionHole {
  shape = 'SLOT';
  width: number;
  height: number;
  constructor(name: string, width: number, height: number, plated = false, drillType = 'DRILLED', tol: [number, number] = [0, 0]) {
    super(name, plated, drillType, tol);
    this.width = width;
    this.height = height;
  }
  protected body(): string {
    return `...WIDTH ${this.width}\n...HEIGHT ${this.height}\n`;
  }
}

// ─── Padstacks ───────────────────────────────────────────────────────────────

export class PadStackPads {
  topPad: XpeditionPad | null = null;
  bottomPad: XpeditionPad | null = null;
  internalPad: XpeditionPad | null = null;
  topSolderpastePad: XpeditionPad | null = null;
  bottomSolderpastePad: XpeditionPad | null = null;
  topSoldermaskPad: XpeditionPad | null = null;
  bottomSoldermaskPad: XpeditionPad | null = null;
  hole: XpeditionHole | null = null;
  holeOffset: [number, number] = [0, 0];
}

export abstract class XpeditionPadStack {
  name: string;
  abstract padstackType: string;
  technology = 'Default';
  pads: PadStackPads;

  constructor(name: string) {
    this.name = name;
    this.pads = new PadStackPads();
  }

  setPads(opts: Partial<PadStackPads>): void {
    Object.assign(this.pads, opts);
  }

  toString(): string {
    let s = `.PADSTACK "${this.name}"\n`;
    s += `..PADSTACK_TYPE ${this.padstackType}\n`;
    s += `..TECHNOLOGY "(${this.technology})"\n`;
    s += '...TECHNOLOGY_OPTIONS NONE\n';
    const p = this.pads;
    if (p.topPad) s += `...TOP_PAD "${p.topPad.name}"\n`;
    if (p.topSolderpastePad) s += `...TOP_SOLDERPASTE_PAD "${p.topSolderpastePad.name}"\n`;
    if (p.topSoldermaskPad) s += `...TOP_SOLDERMASK_PAD "${p.topSoldermaskPad.name}"\n`;
    if (p.bottomPad) s += `...BOTTOM_PAD "${p.bottomPad.name}"\n`;
    if (p.bottomSolderpastePad) s += `...BOTTOM_SOLDERPASTE_PAD "${p.bottomSolderpastePad.name}"\n`;
    if (p.bottomSoldermaskPad) s += `...BOTTOM_SOLDERMASK_PAD "${p.bottomSoldermaskPad.name}"\n`;
    s += this.stackBody();
    return s;
  }

  protected abstract stackBody(): string;
}

export class PinSMDPadStack extends XpeditionPadStack {
  padstackType = 'PIN_SMD';
  protected stackBody(): string { return ''; }
}

export class PinThroughPadStack extends XpeditionPadStack {
  padstackType = 'PIN_THROUGH';
  protected stackBody(): string {
    let s = '';
    const p = this.pads;
    if (p.internalPad) s += `...INTERNAL_PAD "${p.internalPad.name}"\n`;
    if (p.hole) {
      s += `...HOLE_NAME "${p.hole.name}"\n`;
      s += `....OFFSET ${p.holeOffset}\n`;
    }
    return s;
  }
}

// ─── Footprint Pin ───────────────────────────────────────────────────────────

export class XpeditionPin {
  number: number | string;
  x: number;
  y: number;
  padstack: XpeditionPadStack;
  rotation: number;

  constructor(number: number | string, x: number, y: number, padstack: XpeditionPadStack, rotation = 0) {
    this.number = number;
    this.x = x;
    this.y = y;
    this.padstack = padstack;
    this.rotation = rotation;
  }

  toString(): string {
    let s = ` ..PIN "${this.number}"\n`;
    s += `  ...XY (${fmt(this.x)}, ${fmt(this.y)})\n`;
    s += `  ...PADSTACK "${this.padstack.name}"\n`;
    s += `  ...ROTATION ${Math.round(this.rotation)}\n`;
    s += '  ...PIN_OPTIONS NONE\n';
    return s;
  }
}

// ─── Footprint Shapes ────────────────────────────────────────────────────────

export abstract class XpeditionShape {
  level = 3;
  abstract shape: string;

  indent(): string {
    return ' '.repeat(this.level - 1) + '.'.repeat(this.level);
  }

  abstract toString(): string;
  abstract move(dx: number, dy: number): void;
}

export class PolylineShape extends XpeditionShape {
  shape = 'POLYLINE_SHAPE';
  points: [number, number][];
  filled: boolean;

  constructor(points: [number, number][], filled = true, level = 3) {
    super();
    this.points = points;
    this.filled = filled;
    this.level = level;
  }

  move(dx: number, dy: number): void {
    this.points = this.points.map(([x, y]) => [x + dx, y + dy]);
  }

  toString(): string {
    if (this.points.length === 0) return '';
    const ind = this.indent();
    let s = `${ind}POLYLINE_SHAPE\n`;
    s += `${ind}.XY (${fmt(this.points[0][0])}, ${fmt(this.points[0][1])})`;
    for (let i = 1; i < this.points.length; i++) {
      s += `\n${ind} (${fmt(this.points[i][0])}, ${fmt(this.points[i][1])})`;
    }
    s += `\n${ind}.SHAPE_OPTIONS ${this.filled ? 'FILLED' : 'NOT_FILLED'}\n`;
    return s;
  }
}

export class CirclePath extends XpeditionShape {
  shape = 'CIRCLE_PATH';
  centerX: number;
  centerY: number;
  radius: number;
  width: number;

  constructor(centerX: number, centerY: number, radius: number, width: number, level = 3) {
    super();
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.width = width;
    this.level = level;
  }

  move(dx: number, dy: number): void {
    this.centerX += dx;
    this.centerY += dy;
  }

  toString(): string {
    const ind = this.indent();
    let s = `${ind}CIRCLE_PATH\n`;
    s += `${ind}.WIDTH ${this.width}\n`;
    s += `${ind}.XY (${fmt(this.centerX)}, ${fmt(this.centerY)})\n`;
    s += `${ind}.RADIUS ${this.radius}\n`;
    return s;
  }
}

export class PolylinePath extends XpeditionShape {
  shape = 'POLYLINE_PATH';
  points: [number, number][];
  width: number;

  constructor(points: [number, number][], width = 0, level = 3) {
    super();
    this.points = points;
    this.width = width;
    this.level = level;
  }

  move(dx: number, dy: number): void {
    this.points = this.points.map(([x, y]) => [x + dx, y + dy]);
  }

  toString(): string {
    if (this.points.length === 0) return '';
    const ind = this.indent();
    let s = `${ind}POLYLINE_PATH\n`;
    s += `${ind}.WIDTH ${this.width}\n`;
    s += `${ind}.XY (${fmt(this.points[0][0])}, ${fmt(this.points[0][1])})`;
    for (let i = 1; i < this.points.length; i++) {
      s += `\n${ind} (${fmt(this.points[i][0])}, ${fmt(this.points[i][1])})`;
    }
    s += '\n';
    return s;
  }
}

// ─── Footprint Outlines ──────────────────────────────────────────────────────

export class AssemblyOutline {
  shape: XpeditionShape;
  constructor(shape: XpeditionShape) {
    this.shape = shape;
    this.shape.level = 3;
  }
  toString(): string {
    return ' ..ASSEMBLY_OUTLINE\n' + this.shape.toString();
  }
}

export class SilkscreenOutline {
  shape: XpeditionShape;
  side: string;
  constructor(shape: XpeditionShape, side = 'MNT_SIDE') {
    this.shape = shape;
    this.side = side;
    this.shape.level = 3;
  }
  toString(): string {
    return ` ..SILKSCREEN_OUTLINE\n  ...SIDE ${this.side}\n${this.shape.toString()}`;
  }
}

export class SolderMask {
  shape: XpeditionShape;
  side: string;
  constructor(shape: XpeditionShape, side = 'MNT_SIDE') {
    this.shape = shape;
    this.side = side;
    this.shape.level = 3;
  }
  toString(): string {
    return ` ..SOLDER_MASK\n  ...SIDE ${this.side}\n${this.shape.toString()}`;
  }
}

export class SolderPaste {
  shape: XpeditionShape;
  side: string;
  constructor(shape: XpeditionShape, side = 'MNT_SIDE') {
    this.shape = shape;
    this.side = side;
    this.shape.level = 3;
  }
  toString(): string {
    return ` ..SOLDER_PASTE\n  ...SIDE ${this.side}\n${this.shape.toString()}`;
  }
}

export class PlacementOutline {
  shape: XpeditionShape;
  height: number;
  constructor(shape: XpeditionShape, height = 0) {
    this.shape = shape;
    this.height = height;
    this.shape.level = 3;
  }
  toString(): string {
    let s = ' ..PLACEMENT_OUTLINE\n';
    s += `  ...HEIGHT ${fmt(this.height)}\n`;
    s += '  ...UNDERSIDE_SPACE 0\n';
    s += '  ...SIDE MNT_SIDE\n';
    s += '  ...DISPLAY_WIDTH 0\n';
    s += this.shape.toString();
    return s;
  }
}

// ─── Footprint Cell ──────────────────────────────────────────────────────────

export class XpeditionCell {
  name: string;
  numberLayers = 2;
  packageGroup = 'General';
  mountType = 'SURFACE';
  pins: XpeditionPin[] = [];
  assemblyOutlines: AssemblyOutline[] = [];
  silkscreenOutlines: SilkscreenOutline[] = [];
  solderMasks: SolderMask[] = [];
  solderPastes: SolderPaste[] = [];
  placementOutlines: PlacementOutline[] = [];
  texts: string[] = [];

  constructor(name: string) {
    this.name = name;
    this._addDefaultTexts();
  }

  private _addDefaultTexts(): void {
    this.texts.push(
      ' ..TEXT "RefDes"\n  ...TEXT_TYPE REF_DES\n   ...DISPLAY_ATTR\n   ....XY (0, 0)\n   ....TEXT_LYR SILKSCREEN_MNT_SIDE\n   ....HORZ_JUST CENTER\n   ....VERT_JUST CENTER\n   ....HEIGHT 50\n   ....WIDTH 312\n   ....STROKE_WIDTH 3\n   ....ROTATION 0\n   ....FONT "vf_std"\n   ....TEXT "TEXT_ASPECT_RATIO" "0.900"\n   .....TEXT_TYPE PROPERTY_PAIR\n   ....TEXT_OPTIONS NONE',
      ' ..TEXT "Type" "DEV"\n  ...TEXT_TYPE PROPERTY_PAIR',
      ' ..TEXT "DEV" "DEV"\n  ...TEXT_TYPE PROPERTY_PAIR',
      ' ..TEXT "TOL" "TOL"\n  ...TEXT_TYPE PROPERTY_PAIR',
      ' ..TEXT "RefDes2"\n  ...TEXT_TYPE REF_DES\n   ...DISPLAY_ATTR\n   ....XY (0, 0)\n   ....TEXT_LYR ASSEMBLY\n   ....HORZ_JUST CENTER\n   ....VERT_JUST CENTER\n   ....HEIGHT 50\n   ....WIDTH 364\n   ....STROKE_WIDTH 3\n   ....ROTATION 0\n   ....FONT "vf_std"\n   ....TEXT "TEXT_ASPECT_RATIO" "0.900"\n   .....TEXT_TYPE PROPERTY_PAIR\n   ....TEXT_OPTIONS NONE',
    );
  }

  addPin(pin: XpeditionPin): void { this.pins.push(pin); }
  addAssemblyOutline(o: AssemblyOutline): void { this.assemblyOutlines.push(o); }
  addSilkscreenOutline(o: SilkscreenOutline): void { this.silkscreenOutlines.push(o); }
  addSolderMask(m: SolderMask): void { this.solderMasks.push(m); }
  addSolderPaste(p: SolderPaste): void { this.solderPastes.push(p); }
  addPlacementOutline(o: PlacementOutline): void { this.placementOutlines.push(o); }
  getPinCount(): number { return this.pins.length; }
}

// ─── Symbol Pin ──────────────────────────────────────────────────────────────

export class SymbolPinPosition {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  constructor(startX: number, startY: number, endX: number, endY: number) {
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
  }
}

export class SymbolPin {
  number: number;
  pos: SymbolPinPosition;
  rotation: number;
  side: number;
  inverted: number;
  constructor(number: number, pos: SymbolPinPosition, rotation = 0, side = 0, inverted = 0) {
    this.number = number;
    this.pos = pos;
    this.rotation = rotation;
    this.side = side;
    this.inverted = inverted;
  }
  toString(): string {
    return `P ${this.number} ${this.pos.endX} ${this.pos.endY} ${this.pos.startX} ${this.pos.startY} ${this.rotation} ${this.side} ${this.inverted}\n`;
  }
}

export class SymbolLabel {
  label: string;
  x: number;
  y: number;
  rotation: number;
  anchor: number;
  visible: number;
  textSize = 8;
  scope = 0;
  logicSense = 0;
  constructor(label: string, x: number, y: number, rotation = 0, anchor = 2, visible = 1) {
    this.label = label;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.anchor = anchor;
    this.visible = visible;
  }
  toString(): string {
    return `L ${this.x} ${this.y} ${this.textSize} ${this.rotation} ${this.anchor} ${this.scope} ${this.visible} ${this.logicSense} ${this.label}\n`;
  }
}

export class SymbolAnnotation {
  annotation: string;
  x: number;
  y: number;
  rotation: number;
  anchor: number;
  visible: number;
  textSize = 8;
  constructor(annotation: string, x: number, y: number, rotation = 0, anchor = 3, visible = 3) {
    this.annotation = annotation;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.anchor = anchor;
    this.visible = visible;
  }
  toString(): string {
    return `A ${this.x} ${this.y} ${this.textSize} ${this.rotation} ${this.anchor} ${this.visible} ${this.annotation}\n`;
  }
}

export class SymbolPinGroup {
  pin: SymbolPin;
  label: SymbolLabel;
  annotations: SymbolAnnotation[];
  constructor(pin: SymbolPin, label: SymbolLabel, annotations: SymbolAnnotation[]) {
    this.pin = pin;
    this.label = label;
    this.annotations = annotations;
  }
  addAnnotation(a: SymbolAnnotation): void { this.annotations.push(a); }
  toString(): string {
    let s = this.pin.toString();
    s += this.label.toString();
    for (const a of this.annotations) s += a.toString();
    return s;
  }
}

// ─── Symbol Shapes ───────────────────────────────────────────────────────────

export abstract class SymbolShapeBase {
  color = 2;
  abstract toString(): string;
  abstract move(dx: number, dy: number): void;
}

export class SymbolShapeLine extends SymbolShapeBase {
  x1: number; y1: number; x2: number; y2: number;
  constructor(x1: number, y1: number, x2: number, y2: number) {
    super();
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
  }
  move(dx: number, dy: number): void {
    this.x1 += dx; this.y1 += dy; this.x2 += dx; this.y2 += dy;
  }
  toString(): string {
    return `l ${this.color} ${this.x1} ${this.y1} ${this.x2} ${this.y2}\n|GRPHSTL -1 0 0 1\n`;
  }
}

export class SymbolShapeCircle extends SymbolShapeBase {
  x: number; y: number; radius: number;
  constructor(x: number, y: number, radius: number) {
    super();
    this.x = x; this.y = y; this.radius = radius;
  }
  move(dx: number, dy: number): void { this.x += dx; this.y += dy; }
  toString(): string {
    return `c ${this.x} ${this.y} ${this.radius}\n|GRPHSTL_EXT01 255 -1 0 1 1\n`;
  }
}

export class SymbolShapeArc extends SymbolShapeBase {
  startX: number; startY: number;
  midX: number; midY: number;
  endX: number; endY: number;
  constructor(sx: number, sy: number, mx: number, my: number, ex: number, ey: number) {
    super();
    this.startX = sx; this.startY = sy;
    this.midX = mx; this.midY = my;
    this.endX = ex; this.endY = ey;
  }
  move(dx: number, dy: number): void {
    this.startX += dx; this.startY += dy;
    this.midX += dx; this.midY += dy;
    this.endX += dx; this.endY += dy;
  }
  toString(): string {
    return `a ${this.startX} ${this.startY} ${this.midX} ${this.midY} ${this.endX} ${this.endY}\n|GRPHSTL_EXT01 255 -1 0 1 1\n`;
  }
}

// ─── Symbol Part & Symbol ────────────────────────────────────────────────────

export class SymbolPart {
  name: string;
  pinGroups: SymbolPinGroup[] = [];
  shapes: SymbolShapeBase[] = [];
  bbox: [number, number, number, number] = [0, 0, 0, 0];

  constructor(name: string) { this.name = name; }

  addPinGroup(g: SymbolPinGroup): void { this.pinGroups.push(g); }
  addShape(s: SymbolShapeBase): void { this.shapes.push(s); }
  setBbox(x: number, width: number, height: number, y: number): void {
    this.bbox = [x, width, height, y];
  }

  toString(): string {
    let s = `D ${this.bbox[0]} ${this.bbox[1]} ${this.bbox[2]} ${this.bbox[3]}\n`;
    for (const pg of this.pinGroups) s += pg.toString();
    for (const sh of this.shapes) s += sh.toString();
    return s;
  }
}

export class XpeditionSymbol {
  name: string;
  devName = '';
  mfgName = '';
  mpn = '';
  refdes = 'U?';
  value = 'Value?';
  parts: Map<string, SymbolPart> = new Map();
  pinGroups: SymbolPinGroup[] = [];
  shapes: SymbolShapeBase[] = [];
  bbox: [number, number, number, number] = [0, 0, 0, 0];

  constructor(name: string) { this.name = name; }

  private _getOrCreate(partName: string): SymbolPart {
    let part = this.parts.get(partName);
    if (!part) { part = new SymbolPart(partName); this.parts.set(partName, part); }
    return part;
  }

  addPinGroup(g: SymbolPinGroup, partName?: string): void {
    if (partName) this._getOrCreate(partName).addPinGroup(g);
    else this.pinGroups.push(g);
  }

  addShape(s: SymbolShapeBase, partName?: string): void {
    if (partName) this._getOrCreate(partName).addShape(s);
    else this.shapes.push(s);
  }

  setBbox(x: number, width: number, height: number, y: number, partName?: string): void {
    if (partName) this._getOrCreate(partName).setBbox(x, width, height, y);
    else this.bbox = [x, width, height, y];
  }
}
