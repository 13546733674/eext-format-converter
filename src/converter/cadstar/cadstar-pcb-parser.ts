/**
 * Cadstar CPA (PCB Archive) parser.
 *
 * Uses the generic Cadstar section tree parser and adds PCB-specific extraction.
 * Coordinates are hundredths of a micron; angles are in 1/1000 degree (version 9+).
 */
import { type PcbBoard, type PcbComponent, type PcbLayerType, type PcbPoint, createEmptyPcbBoard } from '../pcb/pcb-models';
import { type CadstarSection, parseCadstarSections } from './cadstar-parser';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCoord(token: string): PcbPoint {
	const m = token.match(/\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
	if (m) return { x: parseFloat(m[1]) * 1e-4, y: -parseFloat(m[2]) * 1e-4 };
	const parts = token.split(/\s+/).filter(Boolean);
	return { x: parseFloat(parts[0] ?? '0') * 1e-4, y: -(parseFloat(parts[1] ?? '0') * 1e-4) };
}

function parseNumber(token: string): number {
	return parseFloat(token) || 0;
}

const LAYER_KEYWORDS: [string[], PcbLayerType][] = [
	[['copper', 'top'], 'top'],
	[['copper', 'bottom'], 'bottom'],
	[['silk', 'top'], 'silkscreen_top'],
	[['silk', 'bottom'], 'silkscreen_bottom'],
	[['solder', 'top'], 'soldermask_top'],
	[['solder', 'bottom'], 'soldermask_bottom'],
	[['paste', 'top'], 'paste_top'],
	[['paste', 'bottom'], 'paste_bottom'],
	[['assembly', 'top'], 'assembly_top'],
	[['assembly', 'bottom'], 'assembly_bottom'],
];

function cadstarLayerToType(layerName: string): PcbLayerType {
	const lower = layerName.toLowerCase();
	if (lower.includes('outline') || lower.includes('rout')) return 'outline';
	for (const [keywords, type] of LAYER_KEYWORDS) {
		if (keywords.every((k) => lower.includes(k))) return type;
	}
	return 'other';
}

function parsePoints(args: string[]): PcbPoint[] {
	const pts: PcbPoint[] = [];
	for (const arg of args) {
		if (arg.startsWith('(')) pts.push(parseCoord(arg));
	}
	return pts;
}

// ─── Layer definitions ───────────────────────────────────────────────────────

function layerSubtypeToType(child: CadstarSection): PcbLayerType {
	for (const sc of child.children) {
		if (sc.keyword === 'LAYERSUBTYPE_SILKSCREEN') return 'silkscreen_top';
		if (sc.keyword === 'LAYERSUBTYPE_ASSEMBLY') return 'assembly_top';
		if (sc.keyword === 'LAYERSUBTYPE_SOLDERRESIST') return 'soldermask_top';
		if (sc.keyword === 'LAYERSUBTYPE_PASTE') return 'paste_top';
		if (sc.keyword === 'LAYERSUBTYPE_ROUT') return 'outline';
	}
	return 'other';
}

function parseLayerDefs(node: CadstarSection, board: PcbBoard): void {
	for (const child of node.children) {
		if (child.keyword !== 'LAYER') continue;
		const name = child.args[1] ?? '';
		let type: PcbLayerType = 'other';
		for (const c of child.children) {
			if (c.keyword === 'ELEC') type = 'top';
			else if (c.keyword === 'POWER') type = 'bottom';
			else if (c.keyword === 'NONELEC') type = layerSubtypeToType(c);
		}
		board.layers.push({ id: board.layers.length + 1, name, type });
	}
}

// ─── Component instances ─────────────────────────────────────────────────────

function parseComponent(node: CadstarSection, board: PcbBoard): void {
	const comp: PcbComponent = {
		refdes: '',
		footprint: '',
		x: 0,
		y: 0,
		rotation: 0,
		isFlipped: false,
		pads: [],
		shapes: [],
	};

	for (const child of node.children) {
		switch (child.keyword) {
			case 'COMP':
				comp.refdes = child.args[0] ?? '';
				break;
			case 'PT': {
				const pt = parseCoord(child.args[0] ?? '(0 0)');
				comp.x = pt.x;
				comp.y = pt.y;
				break;
			}
			case 'ORIENT':
				comp.rotation = parseNumber(child.args[0]) / 1000;
				break;
			case 'MIRROR':
				comp.isFlipped = true;
				break;
			case 'PART':
				comp.footprint = child.args[0] ?? '';
				break;
		}
	}

	// TODO: resolve SYMDEF geometry and terminals into comp.pads / comp.shapes
	// For now, emit a placeholder rectangle so the component position is visible.
	if (comp.refdes) {
		comp.shapes.push({
			type: 'text',
			x: comp.x,
			y: comp.y,
			text: comp.refdes,
			size: 1,
			rotation: 0,
			layer: 'silkscreen_top',
		});
	}

	board.components.push(comp);
}

// ─── Nets (tracks and vias) ──────────────────────────────────────────────────

function parseNet(node: CadstarSection, board: PcbBoard): void {
	let netName = '';
	for (const child of node.children) {
		if (child.keyword === 'SIGNAME') netName = child.args.join(' ');
	}
	for (const child of node.children) {
		if (child.keyword === 'TRUNK') {
			parseTrunk(child, board, netName);
		} else if (child.keyword === 'JPT' || child.keyword === 'VIA') {
			parseVia(child, board, netName);
		}
	}
}

function parseTrunk(node: CadstarSection, board: PcbBoard, netName: string): void {
	let width = 0.1;
	let layer: PcbLayerType = 'top';
	const pts: PcbPoint[] = [];
	for (const child of node.children) {
		if (child.keyword === 'WIDTH') width = parseNumber(child.args[0]) * 1e-4;
		else if (child.keyword === 'LAYER') layer = cadstarLayerToType(child.args[0] ?? '');
		else if (child.keyword === 'PT') pts.push(parseCoord(child.args[0] ?? '(0 0)'));
	}
	if (pts.length >= 2) board.tracks.push({ points: pts, width, layer, net: netName });
}

function parseVia(node: CadstarSection, board: PcbBoard, netName: string): void {
	let x = 0;
	let y = 0;
	let diameter = 0.5;
	for (const child of node.children) {
		if (child.keyword === 'PT') {
			const pt = parseCoord(child.args[0] ?? '(0 0)');
			x = pt.x;
			y = pt.y;
		} else if (child.keyword === 'VIACODE') {
			// via diameter could be looked up from CODEDEFS; placeholder
			diameter = 0.5;
		}
	}
	board.vias.push({ x, y, diameter, drill: diameter * 0.5, net: netName });
}

// ─── Copper / board outline / areas ──────────────────────────────────────────

function parseCopper(node: CadstarSection, board: PcbBoard): void {
	let netName = '';
	let layer: PcbLayerType = 'top';
	for (const child of node.children) {
		if (child.keyword === 'SIGNAME') netName = child.args.join(' ');
		else if (child.keyword === 'LAYER') layer = cadstarLayerToType(child.args[0] ?? '');
		else if (['OPENSHAPE', 'OUTLINE', 'SOLID', 'HATCHED'].includes(child.keyword)) {
			const pts = parsePoints(child.args);
			for (const c of child.children) {
				if (['OPENSHAPE', 'OUTLINE', 'SOLID', 'HATCHED'].includes(c.keyword)) {
					// nested cutouts ignored for now
				}
			}
			if (pts.length >= 3) board.polygons.push({ points: pts, layer, net: netName, isSolid: child.keyword !== 'OPENSHAPE' });
		}
	}
}

function parseBoardOutline(node: CadstarSection, board: PcbBoard): void {
	for (const child of node.children) {
		if (['OPENSHAPE', 'OUTLINE'].includes(child.keyword)) {
			const pts = parsePoints(child.args);
			if (pts.length >= 3) board.outline = pts;
		}
	}
}

// ─── Main parse ─────────────────────────────────────────────────────────────-

export function parseCadstarPcb(content: string): PcbBoard {
	const sections = parseCadstarSections(content);
	const board = createEmptyPcbBoard('cadstar_pcb');
	const symdefs = new Map<string, CadstarSection>();

	for (const sec of sections) {
		if (sec.keyword === 'HEADER') {
			for (const child of sec.children) {
				if (child.keyword === 'JOBTITLE') board.name = child.args.join(' ') || board.name;
			}
		} else if (sec.keyword === 'ASSIGNMENTS') {
			for (const child of sec.children) {
				if (child.keyword === 'LAYERDEFS') parseLayerDefs(child, board);
			}
		} else if (sec.keyword === 'LIBRARY') {
			for (const child of sec.children) {
				if (child.keyword === 'SYMDEF' && child.args[0]) symdefs.set(child.args[0], child);
			}
		} else if (sec.keyword === 'LAYOUT') {
			for (const child of sec.children) {
				if (child.keyword === 'COMPONENT') parseComponent(child, board);
				else if (child.keyword === 'NET') parseNet(child, board);
				else if (child.keyword === 'COPPER') parseCopper(child, board);
				else if (child.keyword === 'BOARD') parseBoardOutline(child, board);
			}
		}
	}

	return board;
}
