/**
 * Generic Cadstar ASCII library parser.
 *
 * Cadstar library files are line-oriented and section-based. Sections start with
 * a keyword (often followed by a quoted name) and end with a matching END*
 * keyword, e.g.
 *
 *   PAD "CIRC1"
 *     SHAPE CIRCLE
 *     DIAMETER 0.6
 *   ENDPAD
 *
 * This parser builds a tree of sections. Higher-level extractors then pull out
 * pads, packages, components and parts.
 */

export interface CadstarSection {
	keyword: string;
	args: string[];
	children: CadstarSection[];
}

export interface CadstarPoint {
	x: number;
	y: number;
}

export type CadstarPadShape = 'ROUND' | 'SQUARE' | 'RECTANGLE' | 'OBLONG' | 'OCTAGON' | 'CUSTOM';

export interface CadstarPad {
	name: string;
	shape: CadstarPadShape;
	diameter?: number;
	width?: number;
	height?: number;
	offsetX: number;
	offsetY: number;
	polylinePoints?: CadstarPoint[];
	holeDiameter?: number;
	holeSlotWidth?: number;
	holeSlotHeight?: number;
}

export interface CadstarPackagePin {
	number: string;
	x: number;
	y: number;
	padName: string;
	rotation: number;
}

export interface CadstarPackageShape {
	kind: 'ASSEMBLY' | 'PLACEMENT' | 'SILKSCREEN' | 'GRAPHIC';
	type: 'RECT' | 'LINE' | 'CIRCLE' | 'ARC' | 'POLYLINE' | 'POLYGON';
	points: CadstarPoint[];
	width?: number;
	radius?: number;
}

export interface CadstarPackage {
	name: string;
	description?: string;
	pins: CadstarPackagePin[];
	shapes: CadstarPackageShape[];
	properties: Record<string, string>;
}

export interface CadstarComponentPin {
	id: number;
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	rotation: number;
	inverted: boolean;
	pinType: string;
	pinNumbers: string[];
	label: string;
	labelX: number;
	labelY: number;
	labelVisible: boolean;
	pinNumberVisible: boolean;
}

export type CadstarGraphic =
	| { type: 'polyline'; points: CadstarPoint[] }
	| { type: 'polygon'; points: CadstarPoint[] }
	| { type: 'rect'; x1: number; y1: number; x2: number; y2: number }
	| { type: 'circle'; cx: number; cy: number; radius: number }
	| { type: 'arc'; startX: number; startY: number; centerX: number; centerY: number; endX: number; endY: number };

export interface CadstarComponent {
	name: string;
	version: number;
	pins: CadstarComponentPin[];
	graphics: CadstarGraphic[];
	properties: Record<string, string>;
}

export interface CadstarPart {
	name: string;
	componentName: string;
	packageName: string;
	description?: string;
	properties: Record<string, string>;
}

// ─── Generic section tree parser ─────────────────────────────────────────────

function tokenizeLine(line: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	while (i < line.length) {
		// skip whitespace and commas
		while (i < line.length && /\s|,/.test(line[i])) i++;
		if (i >= line.length) break;
		if (line[i] === '"') {
			i++;
			const start = i;
			while (i < line.length && line[i] !== '"') i++;
			tokens.push(line.substring(start, i));
			if (line[i] === '"') i++;
		} else if (line[i] === '(') {
			// coordinate pair like (1.2 3.4) - keep as one token
			const start = i;
			i++;
			let depth = 1;
			while (i < line.length && depth > 0) {
				if (line[i] === '(') depth++;
				if (line[i] === ')') depth--;
				i++;
			}
			tokens.push(line.substring(start, i));
		} else {
			const start = i;
			while (i < line.length && !/\s|,/.test(line[i])) i++;
			tokens.push(line.substring(start, i));
		}
	}
	return tokens;
}

export function parseCadstarSections(content: string): CadstarSection[] {
	const lines = content.split(/\r?\n/);
	const root: CadstarSection[] = [];
	const stack: CadstarSection[] = [];

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith('!') || line.startsWith('#') || line.startsWith('*')) continue;

		const tokens = tokenizeLine(line);
		if (tokens.length === 0) continue;
		const keyword = tokens[0].toUpperCase();

		if (keyword.startsWith('END') && stack.length > 0) {
			const section = stack.pop()!;
			if (stack.length === 0) {
				root.push(section);
			} else {
				stack[stack.length - 1].children.push(section);
			}
			continue;
		}

		const section: CadstarSection = { keyword, args: tokens.slice(1), children: [] };

		// Some sections are single-line and do not have an END* terminator.
		// Heuristic: keywords that are clearly leaf entries end immediately.
		const singleLine = [
			'PIN',
			'LINE',
			'RECT',
			'CIRCLE',
			'ARC',
			'POLYLINE',
			'POLYGON',
			'SHAPE',
			'DIAMETER',
			'WIDTH',
			'HEIGHT',
			'OFFSET',
			'HOLE',
			'PROPERTY',
			'TEXT',
		].includes(keyword);

		if (singleLine) {
			if (stack.length === 0) {
				root.push(section);
			} else {
				stack[stack.length - 1].children.push(section);
			}
		} else {
			stack.push(section);
		}
	}

	// any unclosed sections become root-level
	while (stack.length > 0) {
		const section = stack.pop()!;
		root.push(section);
	}

	return root;
}

function getName(section: CadstarSection): string {
	return section.args[0] ?? '';
}

function parseCoord(token: string): { x: number; y: number } {
	const m = token.match(/\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
	if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
	const parts = token.split(/\s+/).filter(Boolean);
	return { x: parseFloat(parts[0]) || 0, y: parseFloat(parts[1]) || 0 };
}

function parseNumber(token: string): number {
	return parseFloat(token) || 0;
}

function parsePoints(args: string[]): CadstarPoint[] {
	const points: CadstarPoint[] = [];
	for (const arg of args) {
		if (arg.startsWith('(')) {
			points.push(parseCoord(arg));
		}
	}
	return points;
}

// ─── Pad parser ──────────────────────────────────────────────────────────────

function parsePadShape(arg: string | undefined): CadstarPadShape {
	const shape = (arg ?? 'ROUND').toUpperCase();
	if (shape === 'CIRCLE' || shape === 'ROUND') return 'ROUND';
	if (shape === 'SQUARE') return 'SQUARE';
	if (shape === 'RECTANGLE' || shape === 'RECT') return 'RECTANGLE';
	if (shape === 'OBLONG') return 'OBLONG';
	if (shape === 'OCTAGON') return 'OCTAGON';
	if (shape === 'POLYGON') return 'CUSTOM';
	return 'ROUND';
}

function parsePadHole(pad: CadstarPad, child: CadstarSection): void {
	const holeShape = (child.args[0] ?? 'ROUND').toUpperCase();
	if (holeShape === 'SLOT') {
		pad.holeSlotWidth = parseNumber(child.args[1]);
		pad.holeSlotHeight = parseNumber(child.args[2]);
	} else {
		pad.holeDiameter = parseNumber(child.args[1]);
	}
}

function applyPadChild(pad: CadstarPad, child: CadstarSection): void {
	switch (child.keyword) {
		case 'SHAPE':
			pad.shape = parsePadShape(child.args[0]);
			break;
		case 'DIAMETER':
			pad.diameter = parseNumber(child.args[0]);
			break;
		case 'WIDTH':
			pad.width = parseNumber(child.args[0]);
			break;
		case 'HEIGHT':
			pad.height = parseNumber(child.args[0]);
			break;
		case 'OFFSET': {
			if (child.args.length >= 2) {
				pad.offsetX = parseNumber(child.args[0]);
				pad.offsetY = parseNumber(child.args[1]);
			}
			break;
		}
		case 'POLYGON':
		case 'POINTS':
			pad.polylinePoints = parsePoints(child.args);
			break;
		case 'HOLE':
			parsePadHole(pad, child);
			break;
	}
}

export function parseCadstarPads(content: string): CadstarPad[] {
	const sections = parseCadstarSections(content);
	const pads: CadstarPad[] = [];

	for (const sec of sections) {
		if (sec.keyword !== 'PAD') continue;
		const pad: CadstarPad = {
			name: getName(sec),
			shape: 'ROUND',
			offsetX: 0,
			offsetY: 0,
		};

		for (const child of sec.children) {
			applyPadChild(pad, child);
		}

		pads.push(pad);
	}

	return pads;
}

// ─── Package (footprint) parser ──────────────────────────────────────────────

function parsePackagePin(sec: CadstarSection): CadstarPackagePin | null {
	// PIN "1" (x y) ROTATION r PAD "padname"
	const number = getName(sec);
	let x = 0;
	let y = 0;
	let rotation = 0;
	let padName = '';
	for (const child of sec.children) {
		switch (child.keyword) {
			case 'POSITION': {
				const pt = parseCoord(child.args[0] ?? '(0 0)');
				x = pt.x;
				y = pt.y;
				break;
			}
			case 'ROTATION':
				rotation = parseNumber(child.args[0]);
				break;
			case 'PAD':
				padName = getName(child);
				break;
		}
	}
	if (!number) return null;
	return { number, x, y, padName, rotation };
}

function parsePackageShape(sec: CadstarSection): CadstarPackageShape | null {
	const kind: CadstarPackageShape['kind'] = 'GRAPHIC';
	switch (sec.keyword) {
		case 'LINE': {
			const pts = parsePoints(sec.args);
			return {
				kind,
				type: 'LINE',
				points: pts,
				width: parseNumber(sec.args.find((a) => a.startsWith('WIDTH'))?.replace('WIDTH', '') ?? '0.1'),
			};
		}
		case 'RECT': {
			const pts = parsePoints(sec.args);
			if (pts.length >= 2) return { kind, type: 'RECT', points: [pts[0], pts[1]] };
			break;
		}
		case 'CIRCLE': {
			const pts = parsePoints(sec.args);
			const radius = parseNumber(sec.args.find((a) => a.toUpperCase().startsWith('RADIUS'))?.replace(/radius/i, '') ?? '0');
			return { kind, type: 'CIRCLE', points: pts, radius };
		}
		case 'ARC': {
			const pts = parsePoints(sec.args);
			if (pts.length >= 3) return { kind, type: 'ARC', points: [pts[0], pts[1], pts[2]] };
			break;
		}
		case 'POLYLINE': {
			return { kind, type: 'POLYLINE', points: parsePoints(sec.args) };
		}
		case 'POLYGON': {
			return { kind, type: 'POLYGON', points: parsePoints(sec.args) };
		}
	}
	return null;
}

export function parseCadstarPackages(content: string): CadstarPackage[] {
	const sections = parseCadstarSections(content);
	const packages: CadstarPackage[] = [];

	for (const sec of sections) {
		if (sec.keyword !== 'PACKAGE') continue;
		const pkg: CadstarPackage = {
			name: getName(sec),
			pins: [],
			shapes: [],
			properties: {},
		};

		for (const child of sec.children) {
			switch (child.keyword) {
				case 'DESCRIPTION':
					pkg.description = child.args.join(' ');
					break;
				case 'PROPERTY': {
					const key = getName(child);
					const val = child.args.slice(1).join(' ');
					pkg.properties[key] = val;
					break;
				}
				case 'PIN': {
					const pin = parsePackagePin(child);
					if (pin) pkg.pins.push(pin);
					break;
				}
				case 'LINE':
				case 'RECT':
				case 'CIRCLE':
				case 'ARC':
				case 'POLYLINE':
				case 'POLYGON': {
					const shape = parsePackageShape(child);
					if (shape) pkg.shapes.push(shape);
					break;
				}
			}
		}

		packages.push(pkg);
	}

	return packages;
}

// ─── Component (symbol) parser ───────────────────────────────────────────────

function expandPinNumbers(value: string): string[] {
	const rangeMatch = value.match(/^\[(\d+)\s*:\s*(\d+)(?:\s*:\s*(\d+))?\]$/);
	if (rangeMatch) {
		const start = parseInt(rangeMatch[1], 10);
		const end = parseInt(rangeMatch[2], 10);
		const step = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 1;
		const result: string[] = [];
		for (let i = start; i <= end; i += step) result.push(String(i));
		return result;
	}
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseComponentPin(sec: CadstarSection): CadstarComponentPin | null {
	const id = parseInt(getName(sec), 10) || 0;
	let startX = 0;
	let startY = 0;
	let endX = 0;
	let endY = 0;
	let rotation = 0;
	let inverted = false;
	let pinType = '';
	let pinNumbers: string[] = [];
	let label = '';
	let labelX = 0;
	let labelY = 0;
	let labelVisible = true;
	let pinNumberVisible = true;

	for (const child of sec.children) {
		switch (child.keyword) {
			case 'START': {
				const pt = parseCoord(child.args[0] ?? '(0 0)');
				startX = pt.x;
				startY = pt.y;
				break;
			}
			case 'END': {
				const pt = parseCoord(child.args[0] ?? '(0 0)');
				endX = pt.x;
				endY = pt.y;
				break;
			}
			case 'ROTATION':
				rotation = parseNumber(child.args[0]);
				break;
			case 'INVERTED':
				inverted = true;
				break;
			case 'PINTYPE':
				pinType = child.args.join(' ');
				break;
			case 'NUMBERS':
				pinNumbers = expandPinNumbers(child.args.join(' '));
				break;
			case 'NUMBER_VISIBLE':
				pinNumberVisible = parseNumber(child.args[0]) !== 0;
				break;
			case 'LABEL': {
				label = getName(child);
				const pt = parseCoord(child.args[1] ?? '(0 0)');
				labelX = pt.x;
				labelY = pt.y;
				labelVisible = parseNumber(child.args[2] ?? '1') !== 0;
				break;
			}
		}
	}

	return {
		id,
		startX,
		startY,
		endX,
		endY,
		rotation,
		inverted,
		pinType,
		pinNumbers,
		label,
		labelX,
		labelY,
		labelVisible,
		pinNumberVisible,
	};
}

function parseComponentGraphic(sec: CadstarSection): CadstarGraphic | null {
	switch (sec.keyword) {
		case 'POLYLINE': {
			const pts = parsePoints(sec.args);
			return pts.length >= 2 ? { type: 'polyline', points: pts } : null;
		}
		case 'POLYGON': {
			const pts = parsePoints(sec.args);
			return pts.length >= 3 ? { type: 'polygon', points: pts } : null;
		}
		case 'RECT': {
			const pts = parsePoints(sec.args);
			if (pts.length >= 2) return { type: 'rect', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y };
			break;
		}
		case 'CIRCLE': {
			const pts = parsePoints(sec.args);
			const radius = parseNumber(sec.args.find((a) => a.toUpperCase().startsWith('RADIUS'))?.replace(/radius/i, '') ?? '0');
			if (pts.length >= 1) return { type: 'circle', cx: pts[0].x, cy: pts[0].y, radius };
			break;
		}
		case 'ARC': {
			const pts = parsePoints(sec.args);
			if (pts.length >= 3) {
				return { type: 'arc', startX: pts[0].x, startY: pts[0].y, centerX: pts[1].x, centerY: pts[1].y, endX: pts[2].x, endY: pts[2].y };
			}
			break;
		}
	}
	return null;
}

export function parseCadstarComponents(content: string): CadstarComponent[] {
	const sections = parseCadstarSections(content);
	const components: CadstarComponent[] = [];

	for (const sec of sections) {
		if (sec.keyword !== 'COMPONENT') continue;
		const comp: CadstarComponent = {
			name: getName(sec),
			version: 54,
			pins: [],
			graphics: [],
			properties: {},
		};

		for (const child of sec.children) {
			switch (child.keyword) {
				case 'VERSION':
					comp.version = parseInt(child.args[0], 10) || 54;
					break;
				case 'PROPERTY': {
					const key = getName(child);
					comp.properties[key] = child.args.slice(1).join(' ');
					break;
				}
				case 'PIN': {
					const pin = parseComponentPin(child);
					if (pin) comp.pins.push(pin);
					break;
				}
				case 'POLYLINE':
				case 'POLYGON':
				case 'RECT':
				case 'CIRCLE':
				case 'ARC': {
					const g = parseComponentGraphic(child);
					if (g) comp.graphics.push(g);
					break;
				}
			}
		}

		components.push(comp);
	}

	return components;
}

// ─── Part parser ─────────────────────────────────────────────────────────────

export function parseCadstarParts(content: string): CadstarPart[] {
	const sections = parseCadstarSections(content);
	const parts: CadstarPart[] = [];

	for (const sec of sections) {
		if (sec.keyword !== 'PART') continue;
		const part: CadstarPart = {
			name: getName(sec),
			componentName: '',
			packageName: '',
			properties: {},
		};

		for (const child of sec.children) {
			switch (child.keyword) {
				case 'COMPONENT':
					part.componentName = getName(child);
					break;
				case 'PACKAGE':
					part.packageName = getName(child);
					break;
				case 'DESCRIPTION':
					part.description = child.args.join(' ');
					break;
				case 'PROPERTY': {
					const key = getName(child);
					part.properties[key] = child.args.slice(1).join(' ');
					break;
				}
			}
		}

		if (part.componentName && part.packageName) {
			parts.push(part);
		}
	}

	return parts;
}
