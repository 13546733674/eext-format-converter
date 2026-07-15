/**
 * P-CAD ASCII PCB format parser.
 *
 * Reference: KiCad import format documentation.
 *   - Encoding: windows-1251
 *   - Units: mil (thousandths of an inch) by default
 *   - Y axis points upward; converted to downward Y
 *   - Angles in tenths of a degree
 */
import {
	type PcbBoard,
	type PcbComponent,
	type PcbLayerType,
	type PcbPad,
	type PcbPoint,
	type PcbShape,
	createEmptyPcbBoard,
} from '../pcb/pcb-models';

// ─── Tokenizer ───────────────────────────────────────────────────────────────

interface PcadToken {
	type: 'lparen' | 'rparen' | 'string' | 'number' | 'symbol';
	value: string;
}

function tokenizePcad(content: string): PcadToken[] {
	const tokens: PcadToken[] = [];
	let i = 0;
	const len = content.length;

	while (i < len) {
		const c = content[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (c === '(') {
			tokens.push({ type: 'lparen', value: '(' });
			i++;
			continue;
		}
		if (c === ')') {
			tokens.push({ type: 'rparen', value: ')' });
			i++;
			continue;
		}
		if (c === '"') {
			let s = '';
			i++;
			while (i < len && content[i] !== '"') {
				if (content[i] === '\\' && i + 1 < len) {
					s += content[i + 1];
					i += 2;
				} else {
					s += content[i];
					i++;
				}
			}
			i++;
			tokens.push({ type: 'string', value: s });
			continue;
		}
		let word = '';
		while (i < len && !/[\s()"]/.test(content[i])) {
			word += content[i];
			i++;
		}
		if (!word) continue;
		if (/^-?\d+(\.\d+)?(mil|mm)?$/i.test(word)) {
			tokens.push({ type: 'number', value: word });
		} else {
			tokens.push({ type: 'symbol', value: word });
		}
	}
	return tokens;
}

// ─── S-expression parser ─────────────────────────────────────────────────────

interface PcadSexp {
	name: string;
	args: (string | PcadSexp)[];
}

function parsePcadSexps(tokens: PcadToken[]): PcadSexp[] {
	const root: PcadSexp[] = [];
	const stack: PcadSexp[] = [];
	let current: PcadSexp | null = null;

	for (const tok of tokens) {
		if (tok.type === 'lparen') {
			const node: PcadSexp = { name: '', args: [] };
			if (current) {
				current.args.push(node);
				stack.push(current);
			} else {
				root.push(node);
			}
			current = node;
		} else if (tok.type === 'rparen') {
			current = stack.pop() ?? null;
		} else if (current) {
			current.args.push(tok.value);
		}
	}
	return root;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstString(node: PcadSexp | undefined): string {
	if (!node) return '';
	for (const a of node.args) {
		if (typeof a === 'string' && !/^-?\d/.test(a)) return a;
	}
	return '';
}

function firstNumber(node: PcadSexp | undefined): number {
	if (!node) return 0;
	for (const a of node.args) {
		if (typeof a === 'string') {
			const n = parseFloat(a);
			if (!Number.isNaN(n)) return n;
		}
	}
	return 0;
}

function parseValue(v: string): number {
	const lower = v.toLowerCase();
	if (lower.endsWith('mm')) return parseFloat(lower.replace('mm', ''));
	if (lower.endsWith('mil')) return parseFloat(lower.replace('mil', '')) * 0.0254;
	return parseFloat(v) * 0.0254;
}

function flipY(y: number): number {
	return -y;
}

function parsePoint(x: string, y: string): PcbPoint {
	return { x: parseValue(x), y: flipY(parseValue(y)) };
}

// ─── Pattern / pad style parsing ─────────────────────────────────────────────

interface PcadPattern {
	name: string;
	pads: PcbPad[];
	shapes: PcbShape[];
}

interface PcadPadStyle {
	name: string;
	holeDiam: number;
	isPlated: boolean;
	shape: 'round' | 'rect' | 'oval';
	width: number;
	height: number;
}

function parsePadShape(node: PcadSexp): Pick<PcadPadStyle, 'shape' | 'width' | 'height'> {
	const type = firstString(node).toLowerCase();
	let w = 0;
	let h = 0;
	for (const child of node.args) {
		if (typeof child !== 'string' && child.name.toLowerCase() === 'shapewidth') w = parseValue(child.args[0] as string);
		if (typeof child !== 'string' && child.name.toLowerCase() === 'shapeheight') h = parseValue(child.args[0] as string);
	}
	const shape = type === 'rect' ? 'rect' : type === 'oval' || type === 'rndrect' ? 'oval' : 'round';
	return { shape, width: w, height: h };
}

function parsePadStyleDef(node: PcadSexp): PcadPadStyle {
	const name = firstString(node);
	let holeDiam = 0;
	let isPlated = true;
	let topShape = parsePadShape(node);
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'holediam') holeDiam = parseValue(child.args[0] as string);
		else if (kind === 'isholeplated' && (child.args[0] as string).toLowerCase() === 'false') isPlated = false;
		else if (kind === 'padshape') topShape = parsePadShape(child);
	}
	return { name, holeDiam, isPlated, ...topShape };
}

function parsePatternGraphics(node: PcadSexp): PcbShape[] {
	const shapes: PcbShape[] = [];
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'line') {
			const pts: PcbPoint[] = [];
			let width = 0.1;
			for (const c of child.args) {
				if (typeof c !== 'string' && c.name.toLowerCase() === 'pt') pts.push(parsePoint(c.args[0] as string, c.args[1] as string));
				if (typeof c !== 'string' && c.name.toLowerCase() === 'width') width = parseValue(c.args[0] as string);
			}
			if (pts.length >= 2) shapes.push({ type: 'track', points: pts, width, layer: 'silkscreen_top' });
		} else if (kind === 'arc' || kind === 'triplepointarc') {
			let width = 0.1;
			let cx = 0;
			let cy = 0;
			let radius = 0;
			let startAngle = 0;
			let endAngle = 0;
			for (const c of child.args) {
				if (typeof c === 'string') continue;
				const ck = c.name.toLowerCase();
				if (ck === 'pt') {
					cx = parseValue(c.args[0] as string);
					cy = flipY(parseValue(c.args[1] as string));
				} else if (ck === 'width') width = parseValue(c.args[0] as string);
				else if (ck === 'startangle') startAngle = firstNumber(c) / 10;
				else if (ck === 'sweepangle') endAngle = startAngle + firstNumber(c) / 10;
				else if (ck === 'radius') radius = parseValue(c.args[0] as string);
			}
			shapes.push({ type: 'arc', centerX: cx, centerY: cy, radius, startAngle, endAngle, width, layer: 'silkscreen_top' });
		}
	}
	return shapes;
}

function parsePatternDef(node: PcadSexp, padStyles: Map<string, PcadPadStyle>): PcadPattern {
	const pattern: PcadPattern = { name: firstString(node), pads: [], shapes: [] };
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'pad') {
			const pad = parsePatternPad(child);
			const style = padStyles.get(pad.padStyleName);
			if (style) {
				pad.shape = style.shape;
				pad.width = style.width;
				pad.height = style.height;
				pad.holeDiameter = style.holeDiam;
				pad.isPlated = style.isPlated;
			}
			pattern.pads.push(pad);
		} else if (kind === 'patterngraphics' || kind === 'graphics') {
			for (const s of parsePatternGraphics(child)) pattern.shapes.push(s);
		}
	}
	return pattern;
}

function parsePatternPad(node: PcadSexp): PcbPad & { padStyleName: string } {
	let number = '';
	let padStyleName = '';
	let x = 0;
	let y = 0;
	let rotation = 0;
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'padnum') number = String(child.args[0]);
		else if (kind === 'padstyleref') padStyleName = firstString(child);
		else if (kind === 'pt') {
			x = parseValue(child.args[0] as string);
			y = flipY(parseValue(child.args[1] as string));
		} else if (kind === 'rotation') rotation = firstNumber(child) / 10;
	}
	return {
		number,
		x,
		y,
		shape: 'round',
		width: 1,
		height: 1,
		rotation,
		holeDiameter: 0,
		isPlated: true,
		layer: 'top',
		padStyleName,
	};
}

// ─── Component placement ─────────────────────────────────────────────────────

function parsePatternPlacement(node: PcadSexp, patterns: Map<string, PcadPattern>): PcbComponent | null {
	let patternName = '';
	let refdes = '';
	let x = 0;
	let y = 0;
	let rotation = 0;
	let flipped = false;
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'patternref') patternName = firstString(child);
		else if (kind === 'refdesref') refdes = firstString(child);
		else if (kind === 'pt') {
			x = parseValue(child.args[0] as string);
			y = flipY(parseValue(child.args[1] as string));
		} else if (kind === 'rotation') rotation = firstNumber(child) / 10;
		else if (kind === 'isflipped') flipped = (child.args[0] as string).toLowerCase() === 'true';
	}

	const pattern = patterns.get(patternName);
	const comp: PcbComponent = {
		refdes,
		footprint: patternName,
		x,
		y,
		rotation,
		isFlipped: flipped,
		pads: pattern ? pattern.pads.map((p) => applyPlacementTransform(p, x, y, rotation, flipped)) : [],
		shapes: pattern ? pattern.shapes.map((s) => applyShapeTransform(s, x, y, rotation, flipped)) : [],
	};
	return comp;
}

function applyPlacementTransform(pad: PcbPad, dx: number, dy: number, rotation: number, flipped: boolean): PcbPad {
	let x = pad.x;
	let y = pad.y;
	if (flipped) x = -x;
	if (rotation !== 0) {
		const rad = (rotation * Math.PI) / 180;
		const rx = x * Math.cos(rad) - y * Math.sin(rad);
		const ry = x * Math.sin(rad) + y * Math.cos(rad);
		x = rx;
		y = ry;
	}
	return {
		...pad,
		x: dx + x,
		y: dy + y,
		rotation: (pad.rotation ?? 0) + (flipped ? -rotation : rotation),
		layer: flipped ? flipLayer(pad.layer) : pad.layer,
	};
}

function applyShapeTransform(shape: PcbShape, dx: number, dy: number, rotation: number, flipped: boolean): PcbShape {
	const layer = flipped ? flipLayer(shape.layer) : shape.layer;
	const apply = (p: PcbPoint): PcbPoint => {
		let x = p.x;
		let y = p.y;
		if (flipped) x = -x;
		if (rotation !== 0) {
			const rad = (rotation * Math.PI) / 180;
			const rx = x * Math.cos(rad) - y * Math.sin(rad);
			const ry = x * Math.sin(rad) + y * Math.cos(rad);
			x = rx;
			y = ry;
		}
		return { x: dx + x, y: dy + y };
	};
	switch (shape.type) {
		case 'track':
			return { ...shape, points: shape.points.map(apply), layer };
		case 'arc':
			return { ...shape, centerX: dx + shape.centerX, centerY: dy + shape.centerY, layer };
		case 'circle':
			return { ...shape, centerX: dx + shape.centerX, centerY: dy + shape.centerY, layer };
		case 'polygon':
			return { ...shape, points: shape.points.map(apply), layer };
		case 'text':
			return { ...shape, x: dx + shape.x, y: dy + shape.y, layer };
	}
}

function flipLayer(layer: PcbLayerType): PcbLayerType {
	switch (layer) {
		case 'top':
			return 'bottom';
		case 'bottom':
			return 'top';
		case 'silkscreen_top':
			return 'silkscreen_bottom';
		case 'silkscreen_bottom':
			return 'silkscreen_top';
		case 'soldermask_top':
			return 'soldermask_bottom';
		case 'soldermask_bottom':
			return 'soldermask_top';
		case 'paste_top':
			return 'paste_bottom';
		case 'paste_bottom':
			return 'paste_top';
		case 'assembly_top':
			return 'assembly_bottom';
		case 'assembly_bottom':
			return 'assembly_top';
		default:
			return layer;
	}
}

// ─── Layer contents ──────────────────────────────────────────────────────────

function parseLayerContents(node: PcadSexp, board: PcbBoard): void {
	let layer: PcbLayerType = 'other';
	for (const child of node.args) {
		if (typeof child !== 'string' && child.name.toLowerCase() === 'layernumref') {
			const num = parseInt(child.args[0] as string, 10);
			layer = num === 1 ? 'top' : num === 2 ? 'bottom' : 'other';
		}
	}
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'line') parseLayerLine(child, board, layer);
		else if (kind === 'arc' || kind === 'triplepointarc') parseLayerArc(child, board, layer);
		else if (kind === 'text') parseLayerText(child, board, layer);
		else if (kind === 'boardoutlineobj') parseBoardOutline(child, board);
	}
}

function parseLayerLine(node: PcadSexp, board: PcbBoard, layer: PcbLayerType): void {
	let width = 0.1;
	const pts: PcbPoint[] = [];
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'pt') pts.push(parsePoint(child.args[0] as string, child.args[1] as string));
		else if (kind === 'width') width = parseValue(child.args[0] as string);
	}
	if (pts.length >= 2) board.tracks.push({ points: pts, width, layer, net: '' });
}

function parseLayerArc(node: PcadSexp, board: PcbBoard, layer: PcbLayerType): void {
	let width = 0.1;
	let cx = 0;
	let cy = 0;
	let radius = 0;
	let startAngle = 0;
	let endAngle = 0;
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'pt') {
			cx = parseValue(child.args[0] as string);
			cy = flipY(parseValue(child.args[1] as string));
		} else if (kind === 'width') width = parseValue(child.args[0] as string);
		else if (kind === 'startangle') startAngle = firstNumber(child) / 10;
		else if (kind === 'sweepangle') endAngle = startAngle + firstNumber(child) / 10;
		else if (kind === 'radius') radius = parseValue(child.args[0] as string);
	}
	board.arcs.push({ centerX: cx, centerY: cy, radius, startAngle, endAngle, width, layer, net: '' });
}

function parseLayerText(node: PcadSexp, board: PcbBoard, layer: PcbLayerType): void {
	let x = 0;
	let y = 0;
	let text = '';
	let size = 1;
	let rotation = 0;
	for (const child of node.args) {
		if (typeof child === 'string') {
			if (!text && !/^-?\d/.test(child)) text = child;
			continue;
		}
		const kind = child.name.toLowerCase();
		if (kind === 'pt') {
			x = parseValue(child.args[0] as string);
			y = flipY(parseValue(child.args[1] as string));
		} else if (kind === 'rotation') rotation = firstNumber(child) / 10;
		else if (kind === 'height') size = parseValue(child.args[0] as string);
	}
	board.texts.push({ x, y, text, size, rotation, layer });
}

function parseBoardOutline(node: PcadSexp, board: PcbBoard): void {
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		if (child.name.toLowerCase() === 'poly') {
			const pts: PcbPoint[] = [];
			for (const c of child.args) {
				if (typeof c !== 'string' && c.name.toLowerCase() === 'pt') {
					pts.push(parsePoint(c.args[0] as string, c.args[1] as string));
				}
			}
			if (pts.length >= 3) board.outline = pts;
		}
	}
}

// ─── Main parse ──────────────────────────────────────────────────────────────

function parseLibrary(node: PcadSexp, patterns: Map<string, PcadPattern>, padStyles: Map<string, PcadPadStyle>): void {
	for (const c of node.args) {
		if (typeof c === 'string') continue;
		const k = c.name.toLowerCase();
		if (k === 'patterndef' || k === 'patterndefextended') {
			const p = parsePatternDef(c, padStyles);
			patterns.set(p.name, p);
		} else if (k === 'padstyledef') {
			const s = parsePadStyleDef(c);
			padStyles.set(s.name, s);
		}
	}
}

function parseMultiLayer(node: PcadSexp, patterns: Map<string, PcadPattern>, board: PcbBoard): void {
	for (const mc of node.args) {
		if (typeof mc === 'string') continue;
		if (mc.name.toLowerCase() === 'pattern') {
			const comp = parsePatternPlacement(mc, patterns);
			if (comp) board.components.push(comp);
		}
	}
}

function parsePcbDesign(node: PcadSexp, patterns: Map<string, PcadPattern>, board: PcbBoard): void {
	for (const c of node.args) {
		if (typeof c === 'string') continue;
		const k = c.name.toLowerCase();
		if (k === 'multilayer') {
			parseMultiLayer(c, patterns, board);
		} else if (k === 'layercontents') {
			parseLayerContents(c, board);
		}
	}
}

export function parsePcAdPcb(content: string): PcbBoard {
	const tokens = tokenizePcad(content);
	const sexps = parsePcadSexps(tokens);
	const board = createEmptyPcbBoard('pcad_pcb');
	const patterns = new Map<string, PcadPattern>();
	const padStyles = new Map<string, PcadPadStyle>();

	for (const node of sexps) {
		if (node.name.toUpperCase() !== 'ACCEL_ASCII') continue;
		board.name = firstString(node) || board.name;
		for (const child of node.args) {
			if (typeof child === 'string') continue;
			const kind = child.name.toLowerCase();
			if (kind === 'library') {
				parseLibrary(child, patterns, padStyles);
			} else if (kind === 'pcbdesign') {
				parsePcbDesign(child, patterns, board);
			}
		}
	}

	return board;
}
