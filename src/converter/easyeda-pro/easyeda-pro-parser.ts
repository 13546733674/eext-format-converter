/**
 * Parser for EasyEDA Pro editor document source format.
 * Format: each line is \{header_json\}||\{data_json\}|
 */
import type { EeFootprint, EeFootprintBbox, EeSymbol, EeSymbolBbox, EeSymbolInfo, EeSymbolSub } from './easyeda-pro-models';

interface ProElement {
	type: string;
	id: string;
	ticket: number;
	data: Record<string, any>;
}

interface ProDoc {
	docType: string;
	docHead: any;
	canvas: any;
	parts: Map<string, any>;
	elements: ProElement[];
}

function parseLine(line: string): { header: any; data: any } | null {
	const clean = line.trim().replace(/\|$/, '');
	if (!clean) return null;
	const sep = clean.indexOf('||');
	if (sep < 0) return null;
	try {
		return {
			header: JSON.parse(clean.substring(0, sep)),
			data: JSON.parse(clean.substring(sep + 2)),
		};
	} catch {
		return null;
	}
}

function parseProSource(source: string): ProDoc {
	const lines = source.split(/\n/);
	let docHead: any = null;
	let canvas: any = null;
	const parts = new Map<string, any>();
	const elements: ProElement[] = [];

	for (const line of lines) {
		const parsed = parseLine(line);
		if (!parsed) continue;
		const { header, data } = parsed;
		switch (header.type) {
			case 'DOCHEAD':
				docHead = data;
				break;
			case 'CANVAS':
				canvas = data;
				break;
			case 'PART':
				parts.set(header.id, data);
				break;
			default:
				elements.push({ type: header.type, id: header.id, ticket: header.ticket, data });
		}
	}

	return { docType: docHead?.docType || '', docHead, canvas, parts, elements };
}

function buildPinPath(x: number, y: number, length: number, rotation: number): string {
	if (rotation === 90 || rotation === 270) {
		return `M${x},${y}v${rotation === 90 ? length : -length}`;
	}
	return `M${x},${y}h${rotation === 0 ? length : -length}`;
}

// eslint-disable-next-line complexity
export function parseProSymbol(source: string): EeSymbol {
	const doc = parseProSource(source);

	const attrsByParent = new Map<string, ProElement[]>();
	const nonAttrElements: ProElement[] = [];
	for (const elem of doc.elements) {
		if (elem.type === 'ATTR' && elem.data.parentId) {
			if (!attrsByParent.has(elem.data.parentId)) attrsByParent.set(elem.data.parentId, []);
			attrsByParent.get(elem.data.parentId)!.push(elem);
		} else {
			nonAttrElements.push(elem);
		}
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const elem of nonAttrElements) {
		const d = elem.data;
		switch (elem.type) {
			case 'PIN':
				minX = Math.min(minX, d.x);
				minY = Math.min(minY, d.y);
				maxX = Math.max(maxX, d.x);
				maxY = Math.max(maxY, d.y);
				break;
			case 'RECT':
				minX = Math.min(minX, d.dotX1, d.dotX2);
				minY = Math.min(minY, d.dotY1, d.dotY2);
				maxX = Math.max(maxX, d.dotX1, d.dotX2);
				maxY = Math.max(maxY, d.dotY1, d.dotY2);
				break;
			case 'CIRCLE':
				minX = Math.min(minX, d.centerX - d.radius);
				minY = Math.min(minY, d.centerY - d.radius);
				maxX = Math.max(maxX, d.centerX + d.radius);
				maxY = Math.max(maxY, d.centerY + d.radius);
				break;
			case 'ELLIPSE':
				minX = Math.min(minX, (d.centerX || 0) - (d.radiusX || 0));
				minY = Math.min(minY, (d.centerY || 0) - (d.radiusY || 0));
				maxX = Math.max(maxX, (d.centerX || 0) + (d.radiusX || 0));
				maxY = Math.max(maxY, (d.centerY || 0) + (d.radiusY || 0));
				break;
			case 'LINE':
				minX = Math.min(minX, d.x1 ?? d.dotX1 ?? 0, d.x2 ?? d.dotX2 ?? 0);
				minY = Math.min(minY, d.y1 ?? d.dotY1 ?? 0, d.y2 ?? d.dotY2 ?? 0);
				maxX = Math.max(maxX, d.x1 ?? d.dotX1 ?? 0, d.x2 ?? d.dotX2 ?? 0);
				maxY = Math.max(maxY, d.y1 ?? d.dotY1 ?? 0, d.y2 ?? d.dotY2 ?? 0);
				break;
		}
	}
	if (minX === Infinity) {
		minX = 0;
		minY = 0;
		maxX = 100;
		maxY = 100;
	}

	const bbox: EeSymbolBbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

	const firstPart = doc.parts.values().next().value;
	const info: EeSymbolInfo = {
		name: firstPart?.title?.replace(/\.\d+$/, '') || doc.docHead?.uuid || '',
		prefix: 'U',
		package: '',
		manufacturer: '',
		datasheet: '',
		lcscId: '',
		jlcId: '',
		mpn: '',
	};

	const symbol: EeSymbol = { info, bbox, subs: [] };

	const elementsByPart = new Map<string, ProElement[]>();
	for (const elem of nonAttrElements) {
		const pid = elem.data.partId || '';
		if (!elementsByPart.has(pid)) elementsByPart.set(pid, []);
		elementsByPart.get(pid)!.push(elem);
	}

	if (doc.parts.size === 0) {
		symbol.subs.push(buildSub('', nonAttrElements, attrsByParent, bbox));
	} else {
		for (const [partId, partData] of doc.parts) {
			const sub = buildSub(partId, elementsByPart.get(partId) || [], attrsByParent, bbox);
			sub.name = partData.title || partId;
			symbol.subs.push(sub);
		}
	}

	return symbol;
}

// eslint-disable-next-line complexity
function buildSub(partId: string, elements: ProElement[], attrsByParent: Map<string, ProElement[]>, bbox: EeSymbolBbox): EeSymbolSub {
	const sub: EeSymbolSub = {
		name: partId,
		bbox: { ...bbox },
		pins: [],
		rectangles: [],
		circles: [],
		arcs: [],
		ellipses: [],
		polylines: [],
		polygons: [],
		paths: [],
		lines: [],
	};

	for (const elem of elements) {
		if (elem.data.partId && partId && elem.data.partId !== partId) continue;
		const d = elem.data;

		switch (elem.type) {
			case 'PIN': {
				const path = buildPinPath(d.x, d.y, d.length, d.rotation || 0);
				const pinAttrs = attrsByParent.get(elem.id) || [];
				const nameAttr = pinAttrs.find((a) => a.data.key === 'Pin Name');
				const numAttr = pinAttrs.find((a) => a.data.key === 'Pin Number');
				const typeAttr = pinAttrs.find((a) => a.data.key === 'Pin Type');

				sub.pins.push({
					settings: {
						isDisplayed: d.display ?? true,
						type: typeAttr?.data.value || '',
						spicePinNumber: '',
						posX: d.x,
						posY: d.y,
						rotation: d.rotation || 0,
						id: elem.id,
						isLocked: d.locked || false,
					},
					pinDot: { dotX: d.x, dotY: d.y },
					pinPath: { path, color: d.color || '' },
					name: {
						isDisplayed: nameAttr?.data.valueVisible ?? true,
						posX: nameAttr?.data.x || 0,
						posY: nameAttr?.data.y || 0,
						rotation: nameAttr?.data.rotation || 0,
						text: nameAttr?.data.value || '',
						textAnchor: nameAttr?.data.align || '',
						font: nameAttr?.data.fontFamily || '',
						fontSize: nameAttr?.data.fontSize ? parseFloat(nameAttr.data.fontSize) : 0,
					},
					number: {
						isDisplayed: numAttr?.data.valueVisible ?? true,
						posX: numAttr?.data.x || 0,
						posY: numAttr?.data.y || 0,
						rotation: numAttr?.data.rotation || 0,
						text: numAttr?.data.value || '',
						textAnchor: numAttr?.data.align || '',
						font: numAttr?.data.fontFamily || '',
						fontSize: numAttr?.data.fontSize ? parseFloat(numAttr.data.fontSize) : 0,
					},
					dot: { isDisplayed: false, circleX: 0, circleY: 0 },
					clock: { isDisplayed: false, path: '' },
				});
				break;
			}
			case 'RECT':
				sub.rectangles.push({
					posX: Math.min(d.dotX1, d.dotX2),
					posY: Math.min(d.dotY1, d.dotY2),
					rx: d.radiusX || null,
					ry: d.radiusY || null,
					width: Math.abs(d.dotX2 - d.dotX1),
					height: Math.abs(d.dotY2 - d.dotY1),
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillColor ?? '',
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'CIRCLE':
				sub.circles.push({
					centerX: d.centerX,
					centerY: d.centerY,
					radius: d.radius,
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillStyle !== undefined && d.fillStyle !== null ? String(d.fillStyle) !== 'none' : false,
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'ELLIPSE':
				sub.ellipses.push({
					centerX: d.centerX || 0,
					centerY: d.centerY || 0,
					radiusX: d.radiusX || 0,
					radiusY: d.radiusY || 0,
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillColor ?? '',
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'LINE':
				sub.lines.push({
					x1: d.x1 ?? d.dotX1 ?? 0,
					y1: d.y1 ?? d.dotY1 ?? 0,
					x2: d.x2 ?? d.dotX2 ?? 0,
					y2: d.y2 ?? d.dotY2 ?? 0,
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillColor ?? '',
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'ARC':
				sub.arcs.push({
					path: d.path || d.d || '',
					helperDots: '',
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillStyle !== undefined && d.fillStyle !== null ? String(d.fillStyle) !== 'none' : false,
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'POLYLINE':
				sub.polylines.push({
					points: d.points || '',
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillStyle !== undefined && d.fillStyle !== null ? String(d.fillStyle) !== 'none' : false,
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'POLYGON':
				sub.polygons.push({
					points: d.points || '',
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillStyle !== undefined && d.fillStyle !== null ? String(d.fillStyle) !== 'none' : false,
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
			case 'PATH':
				sub.paths.push({
					paths: d.paths || d.d || '',
					strokeColor: d.strokeColor ?? '',
					strokeWidth: d.strokeWidth ?? '',
					strokeStyle: d.strokeStyle ?? '',
					fillColor: d.fillStyle !== undefined && d.fillStyle !== null ? String(d.fillStyle) !== 'none' : false,
					id: elem.id,
					isLocked: d.locked || false,
				});
				break;
		}
	}

	return sub;
}

// ─── Footprint parser ────────────────────────────────────────────────────────

// Pro V3 FOOTPRINT source stores lengths in mils; the internal EeFootprint model
// uses the standard EasyEDA unit (0.01 inch), so divide mil values by 10.
function fromProUnit(v: number | undefined): number {
	return (v ?? 0) / 10;
}

function convertPointsString(points: string | undefined): string {
	if (!points) return '';
	return points
		.replace(/-?\d+(?:\.\d+)?/g, (m) => String(fromProUnit(parseFloat(m))))
		.replace(/\s+/g, ' ')
		.trim();
}

function pathArrayToString(path: any): string {
	if (!path) return '';
	if (Array.isArray(path)) return path.map((v) => (typeof v === 'number' ? v : String(v))).join(' ');
	return String(path);
}

// eslint-disable-next-line complexity
export function parseProFootprint(source: string): EeFootprint {
	const doc = parseProSource(source);

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const elem of doc.elements) {
		const d = elem.data;
		switch (elem.type) {
			case 'PAD': {
				const cx = fromProUnit(d.x ?? d.centerX ?? 0);
				const cy = fromProUnit(d.y ?? d.centerY ?? 0);
				const padW = fromProUnit(d.defaultPad?.width ?? d.width ?? d.outerDiameter ?? 0);
				const padH = fromProUnit(d.defaultPad?.height ?? d.height ?? d.outerDiameter ?? 0);
				minX = Math.min(minX, cx - padW / 2);
				minY = Math.min(minY, cy - padH / 2);
				maxX = Math.max(maxX, cx + padW / 2);
				maxY = Math.max(maxY, cy + padH / 2);
				break;
			}
			case 'RECT':
				minX = Math.min(minX, fromProUnit(d.dotX1 ?? d.x ?? 0), fromProUnit(d.dotX2 ?? (d.x ?? 0) + (d.width ?? 0)));
				minY = Math.min(minY, fromProUnit(d.dotY1 ?? d.y ?? 0), fromProUnit(d.dotY2 ?? (d.y ?? 0) + (d.height ?? 0)));
				maxX = Math.max(maxX, fromProUnit(d.dotX1 ?? d.x ?? 0), fromProUnit(d.dotX2 ?? (d.x ?? 0) + (d.width ?? 0)));
				maxY = Math.max(maxY, fromProUnit(d.dotY1 ?? d.y ?? 0), fromProUnit(d.dotY2 ?? (d.y ?? 0) + (d.height ?? 0)));
				break;
			case 'CIRCLE':
				minX = Math.min(minX, fromProUnit(d.centerX - d.radius));
				minY = Math.min(minY, fromProUnit(d.centerY - d.radius));
				maxX = Math.max(maxX, fromProUnit(d.centerX + d.radius));
				maxY = Math.max(maxY, fromProUnit(d.centerY + d.radius));
				break;
			case 'TRACK':
			case 'LINE':
				if (d.points) {
					const pts = String(d.points)
						.split(/[\s,]+/)
						.map(Number)
						.filter((n) => !isNaN(n));
					for (let i = 0; i < pts.length; i += 2) {
						minX = Math.min(minX, fromProUnit(pts[i]));
						minY = Math.min(minY, fromProUnit(pts[i + 1]));
						maxX = Math.max(maxX, fromProUnit(pts[i]));
						maxY = Math.max(maxY, fromProUnit(pts[i + 1]));
					}
				}
				break;
			case 'POLY': {
				const pts = pathArrayToString(d.path)
					.split(/[\s,]+/)
					.map(Number)
					.filter((n) => !isNaN(n));
				for (let i = 0; i < pts.length; i += 2) {
					minX = Math.min(minX, fromProUnit(pts[i]));
					minY = Math.min(minY, fromProUnit(pts[i + 1]));
					maxX = Math.max(maxX, fromProUnit(pts[i]));
					maxY = Math.max(maxY, fromProUnit(pts[i + 1]));
				}
				break;
			}
		}
	}
	if (minX === Infinity) {
		minX = 0;
		minY = 0;
		maxX = 100;
		maxY = 100;
	}

	const bbox: EeFootprintBbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	const hasThHole = doc.elements.some(
		(e) => e.type === 'PAD' && ((e.data.hole?.width ?? 0) > 0 || e.data.holeRadius > 0 || e.data.holeDiameter > 0),
	);

	const footprintAttr = doc.elements.find((e) => e.type === 'ATTR' && e.data.key === 'Footprint');
	const meta = doc.elements.find((e) => e.type === 'META');
	const footprintName = footprintAttr?.data.value || meta?.data.title || doc.docHead?.uuid || '';

	const footprint: EeFootprint = {
		info: { name: footprintName, fpType: hasThHole ? 'tht' : 'smd', model3dName: '', layers: [] },
		bbox,
		pads: [],
		tracks: [],
		holes: [],
		vias: [],
		circles: [],
		arcs: [],
		rectangles: [],
		texts: [],
		polygons: [],
		copperAreas: [],
		solidRegions: [],
	};

	for (const elem of doc.elements) {
		const d = elem.data;
		switch (elem.type) {
			case 'PAD': {
				const padShape = d.defaultPad?.padType || d.shape || (d.holeRadius ? 'ROUND' : 'RECT');
				const holeW = d.hole?.width;
				const holeH = d.hole?.height;
				const legacyHoleRadius = d.holeRadius ?? (d.holeDiameter ? d.holeDiameter / 2 : 0);
				const holeRadius = holeW ? fromProUnit(holeW) / 2 : fromProUnit(legacyHoleRadius);
				footprint.pads.push({
					shape: padShape,
					centerX: fromProUnit(d.x ?? d.centerX ?? 0),
					centerY: fromProUnit(d.y ?? d.centerY ?? 0),
					width: fromProUnit(d.defaultPad?.width ?? d.width ?? d.outerDiameter ?? 0),
					height: fromProUnit(d.defaultPad?.height ?? d.height ?? d.outerDiameter ?? 0),
					layerId: d.layerId ?? d.layer ?? 0,
					net: d.net ?? '',
					number: String(d.num ?? d.number ?? d.padNumber ?? ''),
					holeRadius,
					points: convertPointsString(d.points),
					rotation: d.rotation ?? 0,
					id: elem.id,
					holeLength: holeH ? fromProUnit(holeH) : fromProUnit(d.holeLength ?? 0),
					holePoint: convertPointsString(d.holePoint),
					isPlated: d.isPlated ?? true,
					isLocked: d.locked ?? false,
				});
				break;
			}
			case 'TRACK':
				footprint.tracks.push({
					strokeWidth: fromProUnit(d.strokeWidth ?? 0),
					layerId: d.layerId ?? d.layer ?? 0,
					net: d.net ?? '',
					points: convertPointsString(d.points),
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'HOLE':
				footprint.holes.push({
					centerX: fromProUnit(d.centerX ?? d.x ?? 0),
					centerY: fromProUnit(d.centerY ?? d.y ?? 0),
					radius: fromProUnit(d.radius ?? (d.diameter ? d.diameter / 2 : 0)),
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'VIA':
				footprint.vias.push({
					centerX: fromProUnit(d.centerX ?? d.x ?? 0),
					centerY: fromProUnit(d.centerY ?? d.y ?? 0),
					diameter: fromProUnit(d.diameter ?? 0),
					net: d.net ?? '',
					radius: fromProUnit(d.radius ?? 0),
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'CIRCLE':
				footprint.circles.push({
					cx: fromProUnit(d.centerX ?? 0),
					cy: fromProUnit(d.centerY ?? 0),
					radius: fromProUnit(d.radius ?? 0),
					strokeWidth: fromProUnit(d.strokeWidth ?? 0),
					layerId: d.layerId ?? d.layer ?? 0,
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'RECT':
				footprint.rectangles.push({
					x: fromProUnit(d.dotX1 ?? d.x ?? 0),
					y: fromProUnit(d.dotY1 ?? d.y ?? 0),
					width: fromProUnit(d.width ?? Math.abs((d.dotX2 ?? 0) - (d.dotX1 ?? d.x ?? 0))),
					height: fromProUnit(d.height ?? Math.abs((d.dotY2 ?? 0) - (d.dotY1 ?? d.y ?? 0))),
					strokeWidth: fromProUnit(d.strokeWidth ?? 0),
					id: elem.id,
					layerId: d.layerId ?? d.layer ?? 0,
					isLocked: d.locked ?? false,
				});
				break;
			case 'ARC':
				footprint.arcs.push({
					strokeWidth: fromProUnit(d.strokeWidth ?? 0),
					layerId: d.layerId ?? d.layer ?? 0,
					net: d.net ?? '',
					path: convertPointsString(d.path ?? d.d ?? ''),
					helperDots: '',
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'TEXT':
				footprint.texts.push({
					type: d.type ?? '',
					centerX: fromProUnit(d.x ?? d.centerX ?? 0),
					centerY: fromProUnit(d.y ?? d.centerY ?? 0),
					strokeWidth: fromProUnit(d.strokeWidth ?? 0),
					rotation: d.rotation ?? 0,
					miror: d.mirror ?? '',
					layerId: d.layerId ?? d.layer ?? 0,
					net: d.net ?? '',
					fontSize: fromProUnit(d.fontSize ?? 0),
					text: d.text ?? d.value ?? '',
					textPath: d.textPath ?? '',
					isDisplayed: d.display ?? d.isDisplayed ?? true,
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'POLY':
				footprint.polygons.push({
					points: convertPointsString(pathArrayToString(d.path)),
					strokeWidth: fromProUnit(d.width ?? d.strokeWidth ?? 0),
					layerId: d.layerId ?? d.layer ?? 0,
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
			case 'COPPERAREA':
				footprint.copperAreas.push({
					strokeWidth: fromProUnit(d.strokeWidth ?? 0),
					layerId: d.layerId ?? d.layer ?? 0,
					net: d.net ?? '',
					points: convertPointsString(d.points),
					clearanceWidth: fromProUnit(d.clearanceWidth ?? 0),
					fillStyle: d.fillStyle ?? '',
					id: elem.id,
					thermal: d.thermal ?? '',
					isKeepIsland: d.isKeepIsland ?? false,
					copperZone: d.copperZone ?? '',
					isLocked: d.locked ?? false,
				});
				break;
			case 'SOLIDREGION':
				footprint.solidRegions.push({
					layerId: d.layerId ?? d.layer ?? 0,
					net: d.net ?? '',
					points: convertPointsString(d.points),
					type: d.type ?? '',
					id: elem.id,
					isLocked: d.locked ?? false,
				});
				break;
		}
	}

	return footprint;
}
