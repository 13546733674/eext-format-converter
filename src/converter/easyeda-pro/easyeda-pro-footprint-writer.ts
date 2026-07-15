/**
 * Generate Pro V3 footprint document source from parsed Xpedition cell data.
 *
 * Converts Xpedition cell + padstack + pad + hole data into the `||` delimited
 * Pro V3 FOOTPRINT format used in lib2.elibu.
 * Matches format from 嘉立创符号+封装.txt reference (SOD-123).
 */
import type { XpedCell, XpedHole, XpedOutlineShape, XpedPad, XpedPadstack, XpedPin } from '../xpedition/hkp-parser';
import { generateFootprintBoilerplate, mmToEeUnit } from './easyeda-pro-layers';

// ─── Layer mapping ��─────────────────────────────────────────────────────────

const OUTLINE_LAYER_MAP: Record<string, number> = {
	ASSEMBLY_OUTLINE: 9,
	PLACEMENT_OUTLINE: 48,
	SILKSCREEN_OUTLINE: 3,
	GRAPHIC: 13,
};

// ─── Mutable state ──────────────────────────────────────────────────────────

let _elementId = 0;
let _ticket = 22; // After boilerplate (CANVAS is at ticket 22)
let _client = '';

function nextId(): string {
	return `e${++_elementId}`;
}
function nextTicket(): number {
	return ++_ticket;
}

function resetState(client: string): void {
	_elementId = 0;
	_ticket = 22;
	_client = client;
}

function generateUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

// ─── Pad shape conversion ───────────────────────────────────────────────────

// Build the defaultPad JSON string — ELLIPSE has no radius, RECT/OVAL has radius:0
function buildDefaultPad(pad: XpedPad): string {
	switch (pad.shape) {
		case 'ROUND': {
			const w = mmToEeUnit(pad.diameter || 0);
			return `{"padType":"ELLIPSE","width":${w},"height":${w}}`;
		}
		case 'SQUARE': {
			const w = mmToEeUnit(pad.width || pad.diameter || 0);
			return `{"padType":"RECT","width":${w},"height":${w},"radius":0}`;
		}
		case 'RECTANGLE': {
			const w = mmToEeUnit(pad.width || 0);
			const h = mmToEeUnit(pad.height || 0);
			return `{"padType":"RECT","width":${w},"height":${h},"radius":0}`;
		}
		case 'OBLONG': {
			const w = mmToEeUnit(pad.width || 0);
			const h = mmToEeUnit(pad.height || 0);
			return `{"padType":"OVAL","width":${w},"height":${h},"radius":0}`;
		}
		default:
			return '{"padType":"ELLIPSE","width":100,"height":100}';
	}
}

// Build hole JSON string — uses width/height, NOT radius
function buildHole(hole: XpedHole): string {
	if (hole.shape === 'SLOT') {
		const w = mmToEeUnit(hole.width || hole.diameter || 0);
		const h = mmToEeUnit(hole.height || hole.diameter || 0);
		return `{"holeType":"SLOT","width":${w},"height":${h}}`;
	}
	const d = mmToEeUnit(hole.diameter || 0);
	return `{"holeType":"ROUND","width":${d},"height":${d}}`;
}

// Build a fill path for soldermask/paste pads
function buildFillPath(pad: XpedPad, pin: XpedPin): string {
	const cx = mmToEeUnit(pin.x);
	const cy = mmToEeUnit(pin.y);

	switch (pad.shape) {
		case 'ROUND': {
			const r = mmToEeUnit((pad.diameter || 0) / 2);
			return `"CIRCLE",${cx},${cy},${r}`;
		}
		case 'SQUARE':
		case 'RECTANGLE':
		case 'OBLONG':
		default: {
			const w = mmToEeUnit(pad.width || pad.diameter || 0);
			const h = mmToEeUnit(pad.height || pad.diameter || pad.width || 0);
			const hw = w / 2;
			const hh = h / 2;
			return `${cx - hw},${cy - hh},"L",${cx + hw},${cy - hh},${cx + hw},${cy + hh},${cx - hw},${cy + hh},${cx - hw},${cy - hh}`;
		}
	}
}

// ─── Pin analysis (pre-calculate per-pin data) ──────────────────────────────

interface PinFillInfo {
	layerId: number;
	pad: XpedPad;
	pin: XpedPin;
}

interface PinInfo {
	pin: XpedPin;
	padstack: XpedPadstack;
	topPad: XpedPad | null | undefined;
	defaultPadStr: string;
	holeStr: string | null;
	fills: PinFillInfo[];
}

function analyzePins(cell: XpedCell, padstacks: Map<string, XpedPadstack>, pads: Map<string, XpedPad>, holes: Map<string, XpedHole>): PinInfo[] {
	const hasThPins = cell.pins.some((pin) => {
		const ps = padstacks.get(pin.padstack);
		return ps && ps.type === 'PIN_THROUGH';
	});

	const result: PinInfo[] = [];

	for (const pin of cell.pins) {
		const ps = padstacks.get(pin.padstack);
		if (!ps) continue;

		const topPadName = ps.topPad;
		const topPad = topPadName ? pads.get(topPadName) : null;

		let holeStr: string | null = null;
		if (ps.type === 'PIN_THROUGH' && ps.holeName) {
			const hole = holes.get(ps.holeName);
			if (hole) {
				holeStr = buildHole(hole);
			}
		}

		const defaultPadStr = topPad ? buildDefaultPad(topPad) : '{"padType":"ELLIPSE","width":100,"height":100}';
		const fills: PinFillInfo[] = [];

		// Soldermask FILL
		if (ps.topSoldermaskPad) {
			const smPad = pads.get(ps.topSoldermaskPad);
			if (smPad) fills.push({ layerId: 50, pad: smPad, pin });
		}
		if (ps.bottomSoldermaskPad && hasThPins) {
			const smPad = pads.get(ps.bottomSoldermaskPad);
			if (smPad) fills.push({ layerId: 50, pad: smPad, pin });
		}
		// Solderpaste FILL
		if (ps.topSolderpastePad && ps.type === 'PIN_SMD') {
			const spPad = pads.get(ps.topSolderpastePad);
			if (spPad) fills.push({ layerId: 51, pad: spPad, pin });
		}

		result.push({ pin, padstack: ps, topPad, defaultPadStr, holeStr, fills });
	}

	return result;
}

// ─── Main conversion ────────────────────────────────────────────────────────

export function generateFootprintSource(
	cell: XpedCell,
	padstacks: Map<string, XpedPadstack>,
	pads: Map<string, XpedPad>,
	holes: Map<string, XpedHole>,
	uuid: string,
): string {
	const contentClient = generateUUID();
	resetState(contentClient);

	// Get boilerplate (DOCHEAD → META → DOCHEAD → LAYER → ACTIVE_LAYER → CANVAS)
	const boilerplate = generateFootprintBoilerplate(uuid, cell.name, contentClient);
	const lines: string[] = [boilerplate];

	const hasThPins = cell.pins.some((pin) => {
		const ps = padstacks.get(pin.padstack);
		return ps && ps.type === 'PIN_THROUGH';
	});
	const primaryLayerId = hasThPins ? 12 : 1;

	// Pre-calculate all pin data and fills
	const pinInfos = analyzePins(cell, padstacks, pads, holes);
	const totalFills = pinInfos.reduce((sum, info) => sum + info.fills.length, 0);

	// Count outline shapes
	const outlineShapes: { shape: XpedOutlineShape; layerId: number }[] = [];
	for (const outline of cell.outlines) {
		const layerId = OUTLINE_LAYER_MAP[outline.kind] ?? 13;
		for (const shape of outline.shapes) {
			outlineShapes.push({ shape, layerId });
		}
	}

	// ─── Output: ELE_PLACEHOLDER before each group ──────────────────────────

	// 1. FILL group (soldermask + paste pads)
	if (totalFills > 0) {
		lines.push(
			`{"type":"ELE_PLACEHOLDER","ticket":${nextTicket()},"id":"placeholder1","client":"${_client}"}||{"dataType":"FILL","max":${totalFills}}|`,
		);
		for (const info of pinInfos) {
			for (const fill of info.fills) {
				const id = nextId();
				const zIdx = _elementId;
				lines.push(
					`{"type":"FILL","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"","layerId":${fill.layerId},"width":0.2,"fillStyle":"SOLID","path":[[${buildFillPath(fill.pad, fill.pin)}]],"locked":false,"zIndex":${zIdx},"isBridgingCopper":false,"networkList":[],"refs":[]}|`,
				);
			}
		}
	}

	// 2. POLY group (outlines)
	if (outlineShapes.length > 0) {
		lines.push(
			`{"type":"ELE_PLACEHOLDER","ticket":${nextTicket()},"id":"placeholder2","client":"${_client}"}||{"dataType":"POLY","max":${outlineShapes.length}}|`,
		);
		for (const { shape, layerId } of outlineShapes) {
			emitOutlineShape(shape, layerId, lines);
		}
	}

	// 3. PAD group
	if (pinInfos.length > 0) {
		lines.push(
			`{"type":"ELE_PLACEHOLDER","ticket":${nextTicket()},"id":"placeholder3","client":"${_client}"}||{"dataType":"PAD","max":${pinInfos.length}}|`,
		);
		for (const info of pinInfos) {
			const id = nextId();
			const eeX = mmToEeUnit(info.pin.x);
			const eeY = mmToEeUnit(info.pin.y);
			lines.push(
				`{"type":"PAD","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"","layerId":${primaryLayerId},"num":"${info.pin.number}","centerX":${eeX},"centerY":${eeY},"padAngle":${info.pin.rotation},"hole":${info.holeStr ?? 'null'},"defaultPad":${info.defaultPadStr},"specialPad":[],"padOffsetX":0,"padOffsetY":0,"relativeAngle":0,"plated":true,"padType":"NORMAL","topSolderExpansion":null,"bottomSolderExpansion":null,"topPasteExpansion":null,"bottomPasteExpansion":null,"locked":false,"zIndex":-1,"connectMode":null,"spokeSpace":null,"spokeWidth":null,"spokeAngle":null,"unusedInnerLayers":[],"padLen":0,"attrsMap":{}}|`,
			);
		}
	}

	// 4. ATTR group
	lines.push(`{"type":"ELE_PLACEHOLDER","ticket":${nextTicket()},"id":"placeholder4","client":"${_client}"}||{"dataType":"ATTR","max":2}|`);
	const attrFpId = nextId();
	lines.push(
		`{"type":"ATTR","ticket":${nextTicket()},"id":"${attrFpId}","client":"${_client}"}||{"groupId":0,"parentId":"","layerId":3,"x":null,"y":null,"key":"Footprint","value":"${cell.name}","keyVisible":false,"valueVisible":false,"fontFamily":"default","fontSize":67.5,"strokeWidth":6,"bold":false,"italic":false,"origin":"LEFT_BOTTOM","angle":0,"reverse":false,"expansion":0,"mirror":false,"locked":false,"zIndex":${_elementId}}|`,
	);
	const attrDesId = nextId();
	lines.push(
		`{"type":"ATTR","ticket":${nextTicket()},"id":"${attrDesId}","client":"${_client}"}||{"groupId":0,"parentId":"","layerId":3,"x":null,"y":null,"key":"Designator","value":"U?","keyVisible":false,"valueVisible":false,"fontFamily":"default","fontSize":67.5,"strokeWidth":6,"bold":false,"italic":false,"origin":"LEFT_BOTTOM","angle":0,"reverse":false,"expansion":0,"mirror":false,"locked":false,"zIndex":${_elementId}}|`,
	);

	return lines.join('\n');
}

// ─── Outline shape output ───────────────────────────────────────────────────

function emitOutlineShape(shape: XpedOutlineShape, layerId: number, lines: string[]): void {
	switch (shape.type) {
		case 'RECT_SHAPE': {
			if (shape.points && shape.points.length >= 2) {
				const id = nextId();
				const zIdx = _elementId;
				const [p1, p2] = shape.points;
				const x1 = mmToEeUnit(p1.x);
				const y1 = mmToEeUnit(p1.y);
				const x2 = mmToEeUnit(p2.x);
				const y2 = mmToEeUnit(p2.y);
				const pathStr = `[${x1},${y1},"L",${x2},${y1},${x2},${y2},${x1},${y2},${x1},${y1}]`;
				lines.push(
					`{"type":"POLY","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"","layerId":${layerId},"width":2,"path":${pathStr},"locked":false,"zIndex":${zIdx},"polyType":"NORMAL"}|`,
				);
			}
			break;
		}
		case 'POLYLINE_SHAPE':
		case 'POLYLINE_PATH': {
			if (shape.points && shape.points.length >= 2) {
				const id = nextId();
				const zIdx = _elementId;
				const width = shape.width ? mmToEeUnit(shape.width) : 2;
				const pathParts: (number | string)[] = [];
				for (let i = 0; i < shape.points.length; i++) {
					const p = shape.points[i];
					if (i > 0) pathParts.push('L');
					pathParts.push(mmToEeUnit(p.x));
					pathParts.push(mmToEeUnit(p.y));
				}
				lines.push(
					`{"type":"POLY","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"","layerId":${layerId},"width":${width},"path":${JSON.stringify(pathParts)},"locked":false,"zIndex":${zIdx},"polyType":"NORMAL"}|`,
				);
			}
			break;
		}
		case 'CIRCLE_PATH': {
			const id = nextId();
			const zIdx = _elementId;
			const width = shape.width ? mmToEeUnit(shape.width) : 2;
			const radius = mmToEeUnit(shape.radius || 0);
			let cx = 0;
			let cy = 0;
			if (shape.points && shape.points.length >= 1) {
				cx = mmToEeUnit(shape.points[0].x);
				cy = mmToEeUnit(shape.points[0].y);
			}
			lines.push(
				`{"type":"POLY","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"","layerId":${layerId},"width":${width},"path":["CIRCLE",${cx},${cy},${radius}],"locked":false,"zIndex":${zIdx},"polyType":"NORMAL"}|`,
			);
			break;
		}
		case 'RECT_PATH': {
			if (shape.points && shape.points.length >= 2) {
				const id = nextId();
				const zIdx = _elementId;
				const width = shape.width ? mmToEeUnit(shape.width) : 2;
				const [p1, p2] = shape.points;
				const x1 = mmToEeUnit(p1.x);
				const y1 = mmToEeUnit(p1.y);
				const x2 = mmToEeUnit(p2.x);
				const y2 = mmToEeUnit(p2.y);
				const pathStr = `[${x1},${y1},"L",${x2},${y1},${x2},${y2},${x1},${y2},${x1},${y1}]`;
				lines.push(
					`{"type":"POLY","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"","layerId":${layerId},"width":${width},"path":${pathStr},"locked":false,"zIndex":${zIdx},"polyType":"NORMAL"}|`,
				);
			}
			break;
		}
	}
}
