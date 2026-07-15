/**
 * gEDA / Lepton EDA PCB format parser.
 *
 * Reference: KiCad import format documentation.
 *   - Coordinates are integers in centimils (0.01 mil) for bracket `[` syntax,
 *     or in mil for parenthesis `(` syntax, or with explicit mm/mil suffix.
 *   - Y axis points upward; output is converted to mm with downward Y.
 */
import { type PcbBoard, type PcbComponent, type PcbLayerType, type PcbPad, type PcbPoint, createEmptyPcbBoard } from '../pcb/pcb-models';

// ─── Tokenizer ───────────────────────────────────────────────────────────────

interface GedaToken {
	type: 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'string' | 'number' | 'symbol';
	value: string;
}

function tokenizeGeda(content: string): GedaToken[] {
	const tokens: GedaToken[] = [];
	let i = 0;
	const len = content.length;

	while (i < len) {
		const c = content[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (c === '#') {
			while (i < len && content[i] !== '\n') i++;
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
		if (c === '[') {
			tokens.push({ type: 'lbracket', value: '[' });
			i++;
			continue;
		}
		if (c === ']') {
			tokens.push({ type: 'rbracket', value: ']' });
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
		while (i < len && !/[\s()\[\]"#]/.test(content[i])) {
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

interface GedaSexp {
	name: string;
	args: (string | GedaSexp)[];
	isBracket: boolean;
}

function parseGedaSexps(tokens: GedaToken[]): GedaSexp[] {
	const root: GedaSexp[] = [];
	const stack: GedaSexp[] = [];
	let current: GedaSexp | null = null;

	for (const tok of tokens) {
		if (tok.type === 'lparen' || tok.type === 'lbracket') {
			const node: GedaSexp = { name: '', args: [], isBracket: tok.type === 'lbracket' };
			if (current) {
				current.args.push(node);
				stack.push(current);
			} else {
				root.push(node);
				stack.push(node);
				current = node;
				continue;
			}
			current = node;
		} else if (tok.type === 'rparen' || tok.type === 'rbracket') {
			if (stack.length > 0) {
				current = stack.pop() ?? null;
			} else {
				current = null;
			}
		} else if (current) {
			current.args.push(tok.value);
		}
	}
	return root;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstString(node: GedaSexp | undefined): string {
	if (!node) return '';
	for (const a of node.args) {
		if (typeof a === 'string' && !/^-?\d+(\.\d+)?(mil|mm)?$/i.test(a)) return a;
	}
	return '';
}

function parseValue(v: string, isBracket: boolean): number {
	const lower = v.toLowerCase();
	if (lower.endsWith('mm')) {
		return parseFloat(lower.replace('mm', ''));
	}
	if (lower.endsWith('mil')) {
		return parseFloat(lower.replace('mil', '')) * 0.0254;
	}
	const n = parseFloat(v);
	if (isBracket) return n * 0.000254; // centimil to mm
	return n * 0.0254; // mil to mm
}

function flipY(y: number): number {
	return -y;
}

function parsePoint(x: string, y: string, isBracket: boolean): PcbPoint {
	return { x: parseValue(x, isBracket), y: flipY(parseValue(y, isBracket)) };
}

function parseFlags(flags: string): { square?: boolean; onsolder?: boolean } {
	const parts = flags
		.toLowerCase()
		.split(/[,\s]+/)
		.filter(Boolean);
	return { square: parts.includes('square'), onsolder: parts.includes('onsolder') };
}

function gedaLayerNameToType(name: string): PcbLayerType {
	const lower = name.toLowerCase();
	if (lower.includes('top') && lower.includes('copper')) return 'top';
	if (lower.includes('bottom') && lower.includes('copper')) return 'bottom';
	if (lower.includes('silk') && lower.includes('top')) return 'silkscreen_top';
	if (lower.includes('silk') && lower.includes('bottom')) return 'silkscreen_bottom';
	if (lower.includes('soldermask') && lower.includes('top')) return 'soldermask_top';
	if (lower.includes('soldermask') && lower.includes('bottom')) return 'soldermask_bottom';
	if (lower.includes('paste') && lower.includes('top')) return 'paste_top';
	if (lower.includes('paste') && lower.includes('bottom')) return 'paste_bottom';
	if (lower.includes('outline')) return 'outline';
	return 'other';
}

// ─── Element parsing ─────────────────────────────────────────────────────────

function parseElement(node: GedaSexp): PcbComponent | null {
	// Element [SFlags "Desc" "Name" "Value" MX MY TX TY TDir TScale TSFlags]
	// Element (NFlags "Desc" "Name" "Value" TX TY TDir TScale TNFlags)
	// Element ("Desc" "Name" TX TY TDir TScale TNFlags)
	const args = node.args.filter((a): a is string => typeof a === 'string');
	let idx = 0;
	if (args.length >= 1 && !/^-?\d/.test(args[0])) idx = 1; // skip flags

	const desc = args[idx++] ?? '';
	const name = args[idx++] ?? '';
	const value = args[idx] && !/^-?\d/.test(args[idx]) ? args[idx++] : '';
	let mx = 0;
	let my = 0;
	if (idx < args.length && /^-?\d/.test(args[idx])) mx = parseValue(args[idx++], node.isBracket);
	if (idx < args.length && /^-?\d/.test(args[idx])) my = flipY(parseValue(args[idx++], node.isBracket));

	const comp: PcbComponent = {
		refdes: name,
		footprint: desc,
		value,
		x: mx,
		y: my,
		rotation: 0,
		isFlipped: false,
		pads: [],
		shapes: [],
	};

	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'pin') parseElementPin(child, comp, node.isBracket);
		else if (kind === 'pad') parseElementPad(child, comp, node.isBracket);
		else if (kind === 'elementline') parseElementLine(child, comp, node.isBracket);
		else if (kind === 'elementarc') parseElementArc(child, comp, node.isBracket);
	}
	return comp;
}

function parseElementPin(node: GedaSexp, comp: PcbComponent, isBracket: boolean): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 6) return;
	const x = parseValue(a[0], isBracket);
	const y = flipY(parseValue(a[1], isBracket));
	const thickness = parseValue(a[2], isBracket);
	const drill = a.length >= 7 ? parseValue(a[5], isBracket) : parseValue(a[3], isBracket);
	const number = a.length >= 8 ? a[7].replace(/"/g, '') : '';
	const pad: PcbPad = {
		number,
		x: comp.x + x,
		y: comp.y + y,
		shape: 'round',
		width: thickness,
		height: thickness,
		holeDiameter: drill,
		isPlated: true,
		layer: 'top',
	};
	comp.pads.push(pad);
}

function parseElementPad(node: GedaSexp, comp: PcbComponent, isBracket: boolean): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 8) return;
	const x1 = parseValue(a[0], isBracket);
	const y1 = flipY(parseValue(a[1], isBracket));
	const x2 = parseValue(a[2], isBracket);
	const y2 = flipY(parseValue(a[3], isBracket));
	const thickness = parseValue(a[4], isBracket);
	const name = a.length >= 10 ? a[8].replace(/"/g, '') : '';
	const number = a.length >= 10 ? a[9].replace(/"/g, '') : a.length >= 9 ? a[8].replace(/"/g, '') : '';
	const flags = a.length >= 11 ? a[10] : '';
	const parsedFlags = parseFlags(flags);

	const cx = (x1 + x2) / 2;
	const cy = (y1 + y2) / 2;
	const dx = Math.abs(x2 - x1);
	const dy = Math.abs(y2 - y1);

	const pad: PcbPad = {
		number,
		name,
		x: comp.x + cx,
		y: comp.y + cy,
		shape: parsedFlags.square ? 'rect' : dx === 0 && dy === 0 ? 'round' : 'oval',
		width: dx === 0 ? thickness : Math.max(thickness, dx),
		height: dy === 0 ? thickness : Math.max(thickness, dy),
		isPlated: true,
		layer: parsedFlags.onsolder ? 'bottom' : 'top',
	};
	comp.pads.push(pad);
}

function parseElementLine(node: GedaSexp, comp: PcbComponent, isBracket: boolean): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 5) return;
	const p1 = parsePoint(a[0], a[1], isBracket);
	const p2 = parsePoint(a[2], a[3], isBracket);
	const width = parseValue(a[4], isBracket);
	comp.shapes.push({ type: 'track', points: [p1, p2], width, layer: 'silkscreen_top' });
}

function parseElementArc(node: GedaSexp, comp: PcbComponent, isBracket: boolean): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 7) return;
	const cx = parseValue(a[0], isBracket);
	const cy = flipY(parseValue(a[1], isBracket));
	const rx = parseValue(a[2], isBracket) / 2;
	const ry = parseValue(a[3], isBracket) / 2;
	const startAngle = parseFloat(a[4]);
	const deltaAngle = parseFloat(a[5]);
	const width = parseValue(a[6], isBracket);
	comp.shapes.push({
		type: 'arc',
		centerX: comp.x + cx,
		centerY: comp.y + cy,
		radius: (rx + ry) / 2,
		startAngle,
		endAngle: startAngle + deltaAngle,
		width,
		layer: 'silkscreen_top',
	});
}

// ─── Layer / via / board-level parsing ───────────────────────────────────────

function parseVia(node: GedaSexp, board: PcbBoard, isBracket: boolean): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 6) return;
	board.vias.push({
		x: parseValue(a[0], isBracket),
		y: flipY(parseValue(a[1], isBracket)),
		diameter: parseValue(a[2], isBracket),
		drill: parseValue(a[5], isBracket),
		net: '',
	});
}

function parseLayer(node: GedaSexp, board: PcbBoard): void {
	const layerName = firstString(node);
	const layerType = gedaLayerNameToType(layerName);
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		const kind = child.name.toLowerCase();
		if (kind === 'line') parseLayerLine(child, board, layerType);
		else if (kind === 'arc') parseLayerArc(child, board, layerType);
		else if (kind === 'polygon') parseLayerPolygon(child, board, layerType);
	}
}

function parseLayerLine(node: GedaSexp, board: PcbBoard, layer: PcbLayerType): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 5) return;
	const p1 = parsePoint(a[0], a[1], node.isBracket);
	const p2 = parsePoint(a[2], a[3], node.isBracket);
	const width = parseValue(a[4], node.isBracket);
	board.tracks.push({ points: [p1, p2], width, layer, net: '' });
}

function parseLayerArc(node: GedaSexp, board: PcbBoard, layer: PcbLayerType): void {
	const a = node.args.filter((x): x is string => typeof x === 'string');
	if (a.length < 7) return;
	const cx = parseValue(a[0], node.isBracket);
	const cy = flipY(parseValue(a[1], node.isBracket));
	const rx = parseValue(a[2], node.isBracket) / 2;
	const ry = parseValue(a[3], node.isBracket) / 2;
	const startAngle = parseFloat(a[4]);
	const deltaAngle = parseFloat(a[5]);
	const width = parseValue(a[6], node.isBracket);
	board.arcs.push({ centerX: cx, centerY: cy, radius: (rx + ry) / 2, startAngle, endAngle: startAngle + deltaAngle, width, layer, net: '' });
}

function parseLayerPolygon(node: GedaSexp, board: PcbBoard, layer: PcbLayerType): void {
	const pts: PcbPoint[] = [];
	for (const arg of node.args) {
		if (typeof arg === 'string') continue;
		const a = arg.args.filter((x): x is string => typeof x === 'string');
		if (a.length >= 2) pts.push(parsePoint(a[0], a[1], node.isBracket));
	}
	if (pts.length >= 3) board.polygons.push({ points: pts, layer, net: '', isSolid: true });
}

// ─── Netlist parsing ─────────────────────────────────────────────────────────

function parseNetlist(node: GedaSexp, board: PcbBoard): void {
	for (const child of node.args) {
		if (typeof child === 'string') continue;
		if (child.name.toLowerCase() !== 'net') continue;
		const netName = firstString(child);
		const refs: string[] = [];
		for (const c of child.args) {
			if (typeof c === 'string') continue;
			if (c.name.toLowerCase() === 'connect') {
				const a = c.args.filter((x): x is string => typeof x === 'string');
				if (a.length > 0) refs.push(a[0].replace(/"/g, ''));
			}
		}
		board.nets.set(netName, refs);
	}
}

// ─── Main parse ──────────────────────────────────────────────────────────────

export function parseGedaPcb(content: string): PcbBoard {
	const tokens = tokenizeGeda(content);
	const sexps = parseGedaSexps(tokens);
	const board = createEmptyPcbBoard('geda_pcb');

	for (const node of sexps) {
		const name = node.name.toLowerCase();
		if (name === 'pcb') {
			board.name = firstString(node) || board.name;
			const nums = node.args.filter((a): a is string => typeof a === 'string' && /^-?\d/.test(a));
			if (nums.length >= 2) {
				board.width = parseValue(nums[0], node.isBracket);
				board.height = parseValue(nums[1], node.isBracket);
			}
		} else if (name === 'element') {
			const comp = parseElement(node);
			if (comp) board.components.push(comp);
		} else if (name === 'via') {
			parseVia(node, board, node.isBracket);
		} else if (name === 'layer') {
			parseLayer(node, board);
		} else if (name === 'netlist') {
			parseNetlist(node, board);
		}
	}

	return board;
}
