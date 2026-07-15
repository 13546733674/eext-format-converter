/**
 * Generate an EasyEDA Pro V3 PCB document source from the common PCB model.
 *
 * The output is the line-based `||` delimited format used by Pro editor sources.
 * This is intentionally structured so that runtime PCB insertion APIs can later
 * replace the generated-source path without changing the parsers.
 */
import { mmToEeUnit } from '../easyeda-pro/easyeda-pro-layers';
import type {
	PcbArc,
	PcbBoard,
	PcbCircle,
	PcbComponent,
	PcbHole,
	PcbLayerType,
	PcbPad,
	PcbPadShape,
	PcbPoint,
	PcbPolygon,
	PcbText,
	PcbTrack,
	PcbVia,
} from './pcb-models';

// ─── Layer mapping ───────────────────────────────────────────────────────────

const PCB_LAYER_ID: Record<PcbLayerType, number> = {
	top: 1,
	bottom: 2,
	silkscreen_top: 3,
	silkscreen_bottom: 4,
	soldermask_top: 5,
	soldermask_bottom: 6,
	paste_top: 7,
	paste_bottom: 8,
	assembly_top: 9,
	assembly_bottom: 10,
	outline: 11,
	inner: 12,
	other: 13,
};

// ─── State ───────────────────────────────────────────────────────────────────

let _elementId = 0;
let _ticket = 0;
let _client = '';

function resetState(client: string): void {
	_elementId = 0;
	_ticket = 0;
	_client = client;
}

function nextId(): string {
	return `e${++_elementId}`;
}

function nextTicket(): number {
	return ++_ticket;
}

function generateUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

// ─── Boilerplate ─────────────────────────────────────────────────────────────

function generatePcbBoilerplate(uuid: string, title: string, client: string): string {
	const lines: string[] = [];
	const now = Date.now();
	const docHeadLine = `{"type":"DOCHEAD"}||{"docType":"PCB","client":"${client}","uuid":"${uuid}","updateTime":${now},"version":"${now}","editVersion":"3.2.127","user":{}}|`;

	lines.push(docHeadLine);
	lines.push(`{"type":"META","ticket":1,"id":"META"}||{"title":"${title}","description":"","tags":[],"source":""}|`);
	lines.push(docHeadLine);

	const layerEntries: [number, string, string, string, string, number][] = [
		[1, 'TOP', 'Top Layer', '#FF0000', '#7F0000', 1],
		[2, 'BOTTOM', 'Bottom Layer', '#0000FF', '#00007F', 1],
		[3, 'TOP_SILK', 'Top Silkscreen Layer', '#FFCC00', '#7F6600', 1],
		[4, 'BOT_SILK', 'Bottom Silkscreen Layer', '#66CC33', '#336619', 1],
		[7, 'TOP_PASTE_MASK', 'Top Paste Mask Layer', '#808080', '#404040', 1],
		[8, 'BOT_PASTE_MASK', 'Bottom Paste Mask Layer', '#800000', '#400000', 1],
		[5, 'TOP_SOLDER_MASK', 'Top Solder Mask Layer', '#800080', '#400040', 1],
		[6, 'BOT_SOLDER_MASK', 'Bottom Solder Mask Layer', '#AA00FF', '#55007F', 1],
		[13, 'DOCUMENT', 'Document Layer', '#FFFFFF', '#7F7F7F', 1],
		[11, 'OUTLINE', 'Board Outline Layer', '#FF00FF', '#7F007F', 1],
		[12, 'MULTI', 'Multi-Layer', '#C0C0C0', '#606060', 1],
		[9, 'TOP_ASSEMBLY', 'Top Assembly Layer', '#33CC99', '#19664C', 1],
		[10, 'BOT_ASSEMBLY', 'Bottom Assembly Layer', '#5555FF', '#2A2A7F', 1],
	];

	let t = 0;
	for (const [layerId, layerType, layerName, activeColor, inactiveColor, inactiveTrans] of layerEntries) {
		t++;
		lines.push(
			`{"type":"LAYER","ticket":${t},"id":"[\\"LAYER\\",${layerId}]","client":"${client}"}||{"layerType":"${layerType}","layerName":"${layerName}","use":true,"show":true,"locked":false,"activeColor":"${activeColor}","activateTransparency":1,"inactiveColor":"${inactiveColor}","inactiveTransparency":${inactiveTrans}}|`,
		);
	}

	const firstT = t + 1;
	const activeT = t + 2;
	const canvasT = activeT + 1;
	lines.push(`{"type":"ACTIVE_LAYER","ticket":${activeT},"id":"ACTIVE_LAYER","firstTicket":${firstT},"client":"${client}"}||{"layerId":1}|`);
	lines.push(
		`{"type":"CANVAS","ticket":${canvasT},"id":"CANVAS","client":"${client}"}||{"originX":0,"originY":0,"unit":"mm","gridXSize":10,"gridYSize":10,"snapXSize":0.393701,"snapYSize":0.393701,"gridType":"NONE","multiGridType":"NONE","highlightValue":0.5}|`,
	);

	resetState(client);
	_ticket = canvasT;
	return lines.join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function layerId(layer: PcbLayerType): number {
	return PCB_LAYER_ID[layer] ?? 13;
}

function u(v: number): number {
	return mmToEeUnit(v);
}

function pointArray(pts: PcbPoint[]): (number | string)[] {
	const out: (number | string)[] = [];
	for (let i = 0; i < pts.length; i++) {
		if (i > 0) out.push('L');
		out.push(u(pts[i].x));
		out.push(u(pts[i].y));
	}
	return out;
}

function pointsString(pts: PcbPoint[]): string {
	return pts.map((p) => `${u(p.x)} ${u(p.y)}`).join(' ');
}

function escapeJson(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildDefaultPad(pad: PcbPad): string {
	const shapeMap: Record<PcbPadShape, string> = {
		round: 'ELLIPSE',
		rect: 'RECT',
		oval: 'OVAL',
		polygon: 'RECT',
	};
	const padType = shapeMap[pad.shape] ?? 'ELLIPSE';
	return `{"padType":"${padType}","width":${u(pad.width)},"height":${u(pad.height)},"radius":0}`;
}

function buildHole(pad: PcbPad): string | null {
	if (!pad.holeDiameter || pad.holeDiameter <= 0) return null;
	if (pad.holeLength && pad.holeLength > 0) {
		return `{"holeType":"SLOT","width":${u(pad.holeDiameter)},"height":${u(pad.holeLength)}}`;
	}
	const d = u(pad.holeDiameter);
	return `{"holeType":"ROUND","width":${d},"height":${d}}`;
}

function emitPlaceholder(dataType: string, max: number, lines: string[]): void {
	lines.push(
		`{"type":"ELE_PLACEHOLDER","ticket":${nextTicket()},"id":"ph_${dataType.toLowerCase()}","client":"${_client}"}||{"dataType":"${dataType}","max":${max}}|`,
	);
}

// ─── Element emitters ────────────────────────────────────────────────────────

function emitPad(pad: PcbPad, lines: string[], groupId = 0): void {
	const id = nextId();
	const hole = buildHole(pad);
	lines.push(
		`{"type":"PAD","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":${groupId},"netName":"${escapeJson(pad.net ?? '')}","layerId":${layerId(pad.layer)},"num":"${escapeJson(pad.number)}","centerX":${u(pad.x)},"centerY":${u(pad.y)},"padAngle":${pad.rotation ?? 0},"hole":${hole ?? 'null'},"defaultPad":${buildDefaultPad(pad)},"specialPad":[],"padOffsetX":0,"padOffsetY":0,"relativeAngle":0,"plated":${pad.isPlated ?? true},"padType":"NORMAL","topSolderExpansion":null,"bottomSolderExpansion":null,"topPasteExpansion":null,"bottomPasteExpansion":null,"locked":false,"zIndex":-1,"connectMode":null,"spokeSpace":null,"spokeWidth":null,"spokeAngle":null,"unusedInnerLayers":[],"padLen":0,"attrsMap":{}}|`,
	);
}

function emitVia(via: PcbVia, lines: string[]): void {
	const id = nextId();
	lines.push(
		`{"type":"VIA","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"centerX":${u(via.x)},"centerY":${u(via.y)},"diameter":${u(via.diameter)},"net":"${escapeJson(via.net ?? '')}","radius":${u(via.diameter / 2)},"locked":false,"zIndex":${_elementId}}|`,
	);
}

function emitHole(hole: PcbHole, lines: string[]): void {
	const id = nextId();
	lines.push(
		`{"type":"HOLE","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"centerX":${u(hole.x)},"centerY":${u(hole.y)},"radius":${u(hole.diameter / 2)},"locked":false,"zIndex":${_elementId}}|`,
	);
}

function emitTrack(track: PcbTrack, lines: string[]): void {
	if (track.points.length < 2) return;
	const id = nextId();
	lines.push(
		`{"type":"TRACK","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"strokeWidth":${u(track.width)},"layerId":${layerId(track.layer)},"net":"${escapeJson(track.net ?? '')}","points":"${pointsString(track.points)}","locked":false,"zIndex":${_elementId}}|`,
	);
}

function emitArc(arc: PcbArc, lines: string[]): void {
	const id = nextId();
	const sx = u(arc.centerX + arc.radius * Math.cos((arc.startAngle * Math.PI) / 180));
	const sy = u(arc.centerY + arc.radius * Math.sin((arc.startAngle * Math.PI) / 180));
	const ex = u(arc.centerX + arc.radius * Math.cos((arc.endAngle * Math.PI) / 180));
	const ey = u(arc.centerY + arc.radius * Math.sin((arc.endAngle * Math.PI) / 180));
	const large = Math.abs(arc.endAngle - arc.startAngle) > 180 ? 1 : 0;
	const sweep = arc.endAngle > arc.startAngle ? 1 : 0;
	const path = `M ${sx} ${sy} A ${u(arc.radius)} ${u(arc.radius)} 0 ${large} ${sweep} ${ex} ${ey}`;
	lines.push(
		`{"type":"ARC","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"strokeWidth":${u(arc.width)},"layerId":${layerId(arc.layer)},"net":"${escapeJson(arc.net ?? '')}","path":"${path}","helperDots":"","locked":false,"zIndex":${_elementId}}|`,
	);
}

function emitCircle(circle: PcbCircle, lines: string[]): void {
	const id = nextId();
	lines.push(
		`{"type":"CIRCLE","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"centerX":${u(circle.centerX)},"centerY":${u(circle.centerY)},"radius":${u(circle.radius)},"strokeWidth":${u(circle.width)},"layerId":${layerId(circle.layer)},"net":"${escapeJson(circle.net ?? '')}","locked":false,"zIndex":${_elementId}}|`,
	);
}

function emitPolygon(poly: PcbPolygon, lines: string[]): void {
	if (poly.points.length < 3) return;
	const id = nextId();
	const path = pointArray(poly.points);
	lines.push(
		`{"type":"POLY","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"groupId":0,"netName":"${escapeJson(poly.net ?? '')}","layerId":${layerId(poly.layer)},"width":0,"path":${JSON.stringify(path)},"locked":false,"zIndex":${_elementId},"polyType":"${poly.isSolid ? 'SOLID' : 'NORMAL'}"}|`,
	);
}

function emitText(text: PcbText, lines: string[]): void {
	const id = nextId();
	lines.push(
		`{"type":"TEXT","ticket":${nextTicket()},"id":"${id}","client":"${_client}"}||{"type":"","centerX":${u(text.x)},"centerY":${u(text.y)},"strokeWidth":1,"rotation":${text.rotation ?? 0},"mirror":"","layerId":${layerId(text.layer)},"net":"","fontSize":"${u(text.size)}","text":"${escapeJson(text.text)}","textPath":"","isDisplayed":true,"locked":false,"zIndex":${_elementId}}|`,
	);
}

function emitComponentShapes(comp: PcbComponent, lines: string[]): void {
	for (const shape of comp.shapes) {
		switch (shape.type) {
			case 'track':
				emitTrack({ points: shape.points, width: shape.width, layer: shape.layer, net: '' }, lines);
				break;
			case 'arc':
				emitArc(shape, lines);
				break;
			case 'circle':
				emitCircle(shape, lines);
				break;
			case 'polygon':
				emitPolygon({ points: shape.points, layer: shape.layer, net: '', isSolid: false }, lines);
				break;
			case 'text':
				emitText(shape, lines);
				break;
		}
	}
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generatePcbDocumentSource(board: PcbBoard, uuid?: string): string {
	const contentClient = generateUUID();
	const docUuid = uuid ?? generateUUID();
	const lines: string[] = [generatePcbBoilerplate(docUuid, board.name, contentClient)];

	const allPads: PcbPad[] = [...board.standalonePads];
	for (const comp of board.components) {
		for (const pad of comp.pads) {
			allPads.push({
				...pad,
				x: comp.x + pad.x,
				y: comp.y + pad.y,
				rotation: (pad.rotation ?? 0) + (comp.rotation ?? 0),
				net: pad.net,
			});
		}
	}

	const orderedEmitters: { type: string; count: number; emit: () => void }[] = [
		{
			type: 'POLY',
			count: board.outline.length >= 3 ? 1 : 0,
			emit: () => emitPolygon({ points: board.outline, layer: 'outline', net: '', isSolid: false }, lines),
		},
		{ type: 'POLY', count: board.polygons.length, emit: () => board.polygons.forEach((p) => emitPolygon(p, lines)) },
		{ type: 'TRACK', count: board.tracks.length, emit: () => board.tracks.forEach((t) => emitTrack(t, lines)) },
		{ type: 'ARC', count: board.arcs.length, emit: () => board.arcs.forEach((a) => emitArc(a, lines)) },
		{ type: 'CIRCLE', count: board.circles.length, emit: () => board.circles.forEach((c) => emitCircle(c, lines)) },
		{ type: 'VIA', count: board.vias.length, emit: () => board.vias.forEach((v) => emitVia(v, lines)) },
		{ type: 'HOLE', count: board.holes.length, emit: () => board.holes.forEach((h) => emitHole(h, lines)) },
		{ type: 'PAD', count: allPads.length, emit: () => allPads.forEach((p) => emitPad(p, lines)) },
		{ type: 'TEXT', count: board.texts.length, emit: () => board.texts.forEach((t) => emitText(t, lines)) },
	];

	for (const comp of board.components) {
		orderedEmitters.push({
			type: 'TRACK',
			count: comp.shapes.filter((s) => s.type === 'track').length,
			emit: () => emitComponentShapes(comp, lines),
		});
	}

	for (const group of orderedEmitters) {
		if (group.count <= 0) continue;
		emitPlaceholder(group.type, group.count, lines);
		group.emit();
	}

	return lines.join('\n');
}
