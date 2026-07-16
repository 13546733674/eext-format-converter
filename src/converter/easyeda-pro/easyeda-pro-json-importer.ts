/**
 * EasyEDA data importers — parse raw CAD JSON into structured models.
 * Ported from easyeda/easyeda_importer.py
 */
import type {
	EeFootprint,
	EeFootprintLayer,
	EeSymbol,
	EeSymbolBbox,
	EeSymbolInfo,
	EeSymbolPinClock,
	EeSymbolPinDot,
	EeSymbolPinDotBis,
	EeSymbolSub,
} from './easyeda-pro-models';
import { makeEeSymbolPinName, makeEeSymbolPinNumber, makeEeSymbolPinPath, makeEeSymbolPinSettings } from './easyeda-pro-models';

// ─── Symbol designator handlers ──────────────────────────────────────────────

function addPin(pinData: string, sub: EeSymbolSub): void {
	const segments = pinData.split('^^');
	const eeSegs = segments.map((s) => s.split('~'));

	const settings = makeEeSymbolPinSettings(eeSegs[0].slice(1));
	const pinDot: EeSymbolPinDot = { dotX: parseFloat(eeSegs[1][0]), dotY: parseFloat(eeSegs[1][1]) };
	const pinPath = makeEeSymbolPinPath(eeSegs[2][0], eeSegs[2][1]);
	const name = makeEeSymbolPinName(eeSegs[3]);
	const number = makeEeSymbolPinNumber(eeSegs[4]);
	const dot: EeSymbolPinDotBis = {
		isDisplayed: eeSegs[5][0] === 'show',
		circleX: parseFloat(eeSegs[5][1]),
		circleY: parseFloat(eeSegs[5][2]),
	};
	const clock: EeSymbolPinClock = { isDisplayed: eeSegs[6][0] === 'show', path: eeSegs[6][1] };

	sub.pins.push({ settings, pinDot, pinPath, name, number, dot, clock });
}

function zipToObj<T>(fields: string[], data: string[]): T {
	const obj: any = {};
	for (let i = 0; i < fields.length; i++) {
		obj[fields[i]] = data[i] ?? '';
	}
	return obj as T;
}

const RECT_FIELDS = ['posX', 'posY', 'rx', 'ry', 'width', 'height', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];
const CIRCLE_FIELDS = ['centerX', 'centerY', 'radius', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];
const ARC_FIELDS = ['path', 'helperDots', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];
const ELLIPSE_FIELDS = ['centerX', 'centerY', 'radiusX', 'radiusY', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];
const LINE_FIELDS = ['x1', 'y1', 'x2', 'y2', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];
const POLYLINE_FIELDS = ['points', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];
const PATH_FIELDS = ['paths', 'strokeColor', 'strokeWidth', 'strokeStyle', 'fillColor', 'id', 'isLocked'];

function parseFill(v: string | undefined): boolean {
	if (!v || v === '') return false;
	return v.toLowerCase() !== 'none';
}

function emptyLock(v: string | undefined): boolean {
	return v !== undefined && v !== '';
}

function addRectangle(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(RECT_FIELDS, parts);
	sub.rectangles.push({
		posX: parseFloat(d.posX ?? '0'),
		posY: parseFloat(d.posY ?? '0'),
		rx: d.rx || null,
		ry: d.ry || null,
		width: parseFloat(d.width ?? '0'),
		height: parseFloat(d.height ?? '0'),
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: d.fillColor ?? '',
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addCircle(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(CIRCLE_FIELDS, parts);
	sub.circles.push({
		centerX: parseFloat(d.centerX ?? '0'),
		centerY: parseFloat(d.centerY ?? '0'),
		radius: parseFloat(d.radius ?? '0'),
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: parseFill(d.fillColor),
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addArc(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(ARC_FIELDS, parts);
	sub.arcs.push({
		path: d.path ?? '',
		helperDots: d.helperDots ?? '',
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: parseFill(d.fillColor),
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addEllipse(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(ELLIPSE_FIELDS, parts);
	sub.ellipses.push({
		centerX: parseFloat(d.centerX ?? '0'),
		centerY: parseFloat(d.centerY ?? '0'),
		radiusX: parseFloat(d.radiusX ?? '0'),
		radiusY: parseFloat(d.radiusY ?? '0'),
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: parseFill(d.fillColor),
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addLine(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(LINE_FIELDS, parts);
	sub.lines.push({
		x1: parseFloat(d.x1 ?? '0'),
		y1: parseFloat(d.y1 ?? '0'),
		x2: parseFloat(d.x2 ?? '0'),
		y2: parseFloat(d.y2 ?? '0'),
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: d.fillColor ?? '',
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addPolyline(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(POLYLINE_FIELDS, parts);
	sub.polylines.push({
		points: d.points ?? '',
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: parseFill(d.fillColor),
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addPolygon(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(POLYLINE_FIELDS, parts);
	sub.polygons.push({
		points: d.points ?? '',
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: parseFill(d.fillColor),
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

function addPath(data: string, sub: EeSymbolSub): void {
	const parts = data.split('~').slice(1);
	const d = zipToObj<any>(PATH_FIELDS, parts);
	sub.paths.push({
		paths: d.paths ?? '',
		strokeColor: d.strokeColor ?? '',
		strokeWidth: d.strokeWidth ?? '',
		strokeStyle: d.strokeStyle ?? '',
		fillColor: parseFill(d.fillColor),
		id: d.id ?? '',
		isLocked: emptyLock(d.isLocked),
	});
}

const SYMBOL_HANDLERS: Record<string, (data: string, sub: EeSymbolSub) => void> = {
	P: addPin,
	R: addRectangle,
	E: addEllipse,
	C: addCircle,
	A: addArc,
	PL: addPolyline,
	PG: addPolygon,
	PT: addPath,
	L: addLine,
};

// ─── Symbol Importer ─────────────────────────────────────────────────────────

export class EasyedaSymbolImporter {
	public output: EeSymbol;

	public constructor(easyedaCpCadData: any) {
		// Normalize: if data doesn't have dataStr, assume it IS the dataStr
		const normalized = easyedaCpCadData.dataStr
			? easyedaCpCadData
			: { dataStr: easyedaCpCadData, lcsc: easyedaCpCadData.lcsc || {}, subparts: easyedaCpCadData.subparts || [] };
		this.output = this.extractEasyedaData(normalized);
	}

	public getSymbol(): EeSymbol {
		return this.output;
	}

	// eslint-disable-next-line complexity
	private extractEasyedaData(eeData: any): EeSymbol {
		const dataStr = eeData.dataStr;
		if (!dataStr || !dataStr.head) {
			throw new Error('Invalid symbol data: missing dataStr.head');
		}
		const cPara = dataStr.head.c_para || {};
		const info: EeSymbolInfo = {
			name: cPara.name ?? '',
			prefix: cPara.pre ?? '',
			package: cPara.package ?? '',
			manufacturer: cPara.Manufacturer ?? '',
			datasheet: eeData.lcsc?.url ?? '',
			lcscId: eeData.lcsc?.number ?? '',
			jlcId: cPara['JLCPCB Part Class'] ?? '',
			mpn: cPara['Manufacturer Part'] ?? '',
		};

		const bbox: EeSymbolBbox = {
			x: parseFloat(dataStr.head.x ?? '0'),
			y: parseFloat(dataStr.head.y ?? '0'),
			width: parseFloat(dataStr.BBox?.width ?? '0'),
			height: parseFloat(dataStr.BBox?.height ?? '0'),
		};

		const symbol: EeSymbol = { info, bbox, subs: [] };

		// Handle multi-part symbols
		if (eeData.subparts && eeData.subparts.length > 0) {
			for (const sub of eeData.subparts) {
				const subDataStr = sub.dataStr || sub;
				const newSub: EeSymbolSub = {
					name: sub.title ?? '',
					bbox: {
						x: parseFloat(subDataStr.BBox?.x ?? '0'),
						y: parseFloat(subDataStr.BBox?.y ?? '0'),
						width: parseFloat(subDataStr.BBox?.width ?? '0'),
						height: parseFloat(subDataStr.BBox?.height ?? '0'),
					},
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

				for (const line of subDataStr.shape ?? []) {
					const desig = line.split('~')[0];
					const handler = SYMBOL_HANDLERS[desig];
					if (handler) handler(line, newSub);
				}
				symbol.subs.push(newSub);
			}
		} else if (dataStr.shape?.length > 0) {
			// Single-part symbol
			const newSub: EeSymbolSub = {
				name: `${info.name}.1`,
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

			for (const line of dataStr.shape) {
				const desig = line.split('~')[0];
				const handler = SYMBOL_HANDLERS[desig];
				if (handler) handler(line, newSub);
			}
			symbol.subs.push(newSub);
		}

		return symbol;
	}
}

// ─── Footprint Importer ──────────────────────────────────────────────────────

const PAD_FIELDS = [
	'shape',
	'centerX',
	'centerY',
	'width',
	'height',
	'layerId',
	'net',
	'number',
	'holeRadius',
	'points',
	'rotation',
	'id',
	'holeLength',
	'holePoint',
	'isPlated',
	'isLocked',
];
const TRACK_FIELDS = ['strokeWidth', 'layerId', 'net', 'points', 'id', 'isLocked'];
const HOLE_FIELDS = ['centerX', 'centerY', 'radius', 'id', 'isLocked'];
const VIA_FIELDS = ['centerX', 'centerY', 'diameter', 'net', 'radius', 'id', 'isLocked'];
const FCIRCLE_FIELDS = ['cx', 'cy', 'radius', 'strokeWidth', 'layerId', 'id', 'isLocked'];
const FRECT_FIELDS = ['x', 'y', 'width', 'height', 'strokeWidth', 'id', 'layerId', 'isLocked'];
const FARC_FIELDS = ['strokeWidth', 'layerId', 'net', 'path', 'helperDots', 'id', 'isLocked'];
const FTEXT_FIELDS = [
	'type',
	'centerX',
	'centerY',
	'strokeWidth',
	'rotation',
	'miror',
	'layerId',
	'net',
	'fontSize',
	'text',
	'textPath',
	'isDisplayed',
	'id',
	'isLocked',
];
const COPPER_FIELDS = [
	'strokeWidth',
	'layerId',
	'net',
	'points',
	'clearanceWidth',
	'fillStyle',
	'id',
	'thermal',
	'isKeepIsland',
	'copperZone',
	'isLocked',
];
const SOLID_FIELDS = ['layerId', 'net', 'points', 'type', 'id', 'isLocked'];

export class EasyedaFootprintImporter {
	public output: EeFootprint;

	public constructor(easyedaCpCadData: any) {
		// Normalize: if data doesn't have packageDetail, assume it IS the dataStr
		let pkgDetail: any;
		let isSmd: boolean;
		if (easyedaCpCadData.packageDetail) {
			pkgDetail = easyedaCpCadData.packageDetail;
			isSmd = !!easyedaCpCadData.SMT && !pkgDetail.title?.includes('-TH_');
		} else {
			pkgDetail = { dataStr: easyedaCpCadData, title: '' };
			isSmd = true;
		}
		if (!pkgDetail.dataStr || !pkgDetail.dataStr.head) {
			throw new Error('Invalid footprint data: missing dataStr.head');
		}
		this.output = this.extractEasyedaData(pkgDetail.dataStr, pkgDetail.dataStr.head.c_para || {}, isSmd);
	}

	public getFootprint(): EeFootprint {
		return this.output;
	}

	// eslint-disable-next-line complexity
	private extractEasyedaData(eeDataStr: any, eeDataInfo: any, isSmd: boolean): EeFootprint {
		// Parse layers
		const layers: EeFootprintLayer[] = [];
		for (const line of eeDataStr.layers ?? []) {
			const fields = line.split('~');
			if (fields.length >= 6 && /\d/.test(fields[0])) {
				layers.push({
					layerId: parseInt(fields[0], 10),
					layerName: fields[1],
					layerColer: fields[2],
					isVisible: !!fields[3],
					isActive: !!fields[4],
					isConfig: !!fields[5],
				});
			}
		}

		const footprint: EeFootprint = {
			info: {
				name: eeDataInfo.package ?? '',
				fpType: isSmd ? 'smd' : 'tht',
				model3dName: eeDataInfo['3DModel'] ?? '',
				layers,
			},
			bbox: {
				x: parseFloat(eeDataStr.head.x ?? '0'),
				y: parseFloat(eeDataStr.head.y ?? '0'),
				width: parseFloat(eeDataStr.BBox?.width ?? '0'),
				height: parseFloat(eeDataStr.BBox?.height ?? '0'),
			},
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

		for (const line of eeDataStr.shape ?? []) {
			const desig = line.split('~')[0];
			const fields = line.split('~').slice(1);

			if (desig === 'PAD') {
				const d = zipToObj<any>(PAD_FIELDS, fields.slice(0, 18));
				footprint.pads.push({
					shape: d.shape ?? '',
					centerX: parseFloat(d.centerX ?? '0'),
					centerY: parseFloat(d.centerY ?? '0'),
					width: parseFloat(d.width ?? '0'),
					height: parseFloat(d.height ?? '0'),
					layerId: parseInt(d.layerId ?? '0', 10),
					net: d.net ?? '',
					number: d.number ?? '',
					holeRadius: parseFloat(d.holeRadius ?? '0'),
					points: d.points ?? '',
					rotation: d.rotation === '' ? 0 : parseFloat(d.rotation ?? '0'),
					id: d.id ?? '',
					holeLength: parseFloat(d.holeLength ?? '0'),
					holePoint: d.holePoint ?? '',
					isPlated: !!d.isPlated,
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'TRACK') {
				const d = zipToObj<any>(TRACK_FIELDS, fields);
				footprint.tracks.push({
					strokeWidth: parseFloat(d.strokeWidth ?? '0'),
					layerId: parseInt(d.layerId ?? '0', 10),
					net: d.net ?? '',
					points: d.points ?? '',
					id: d.id ?? '',
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'HOLE') {
				const d = zipToObj<any>(HOLE_FIELDS, fields);
				footprint.holes.push({
					centerX: parseFloat(d.centerX ?? '0'),
					centerY: parseFloat(d.centerY ?? '0'),
					radius: parseFloat(d.radius ?? '0'),
					id: d.id ?? '',
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'VIA') {
				const d = zipToObj<any>(VIA_FIELDS, fields);
				footprint.vias.push({
					centerX: parseFloat(d.centerX ?? '0'),
					centerY: parseFloat(d.centerY ?? '0'),
					diameter: parseFloat(d.diameter ?? '0'),
					net: d.net ?? '',
					radius: parseFloat(d.radius ?? '0'),
					id: d.id ?? '',
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'CIRCLE') {
				const d = zipToObj<any>(FCIRCLE_FIELDS, fields);
				footprint.circles.push({
					cx: parseFloat(d.cx ?? '0'),
					cy: parseFloat(d.cy ?? '0'),
					radius: parseFloat(d.radius ?? '0'),
					strokeWidth: parseFloat(d.strokeWidth ?? '0'),
					layerId: parseInt(d.layerId ?? '0', 10),
					id: d.id ?? '',
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'ARC') {
				const d = zipToObj<any>(FARC_FIELDS, fields);
				footprint.arcs.push({
					strokeWidth: parseFloat(d.strokeWidth ?? '0'),
					layerId: parseInt(d.layerId ?? '0', 10),
					net: d.net ?? '',
					path: d.path ?? '',
					helperDots: d.helperDots ?? '',
					id: d.id ?? '',
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'RECT') {
				const d = zipToObj<any>(FRECT_FIELDS, fields);
				footprint.rectangles.push({
					x: parseFloat(d.x ?? '0'),
					y: parseFloat(d.y ?? '0'),
					width: parseFloat(d.width ?? '0'),
					height: parseFloat(d.height ?? '0'),
					strokeWidth: parseFloat(d.strokeWidth ?? '0'),
					id: d.id ?? '',
					layerId: parseInt(d.layerId ?? '0', 10),
					isLocked: d.isLocked === '' ? false : !!parseFloat(d.isLocked),
				});
			} else if (desig === 'TEXT') {
				const d = zipToObj<any>(FTEXT_FIELDS, fields);
				footprint.texts.push({
					type: d.type ?? '',
					centerX: parseFloat(d.centerX ?? '0'),
					centerY: parseFloat(d.centerY ?? '0'),
					strokeWidth: parseFloat(d.strokeWidth ?? '0'),
					rotation: d.rotation === '' ? 0 : parseFloat(d.rotation ?? '0'),
					miror: d.miror ?? '',
					layerId: parseInt(d.layerId ?? '0', 10),
					net: d.net ?? '',
					fontSize: parseFloat(d.fontSize ?? '0'),
					text: d.text ?? '',
					textPath: d.textPath ?? '',
					isDisplayed: d.isDisplayed === '' ? true : !!d.isDisplayed,
					id: d.id ?? '',
					isLocked: d.isLocked === '' ? false : !!d.isLocked,
				});
			} else if (desig === 'COPPERAREA') {
				const d = zipToObj<any>(COPPER_FIELDS, fields);
				footprint.copperAreas.push({
					strokeWidth: parseFloat(d.strokeWidth ?? '0'),
					layerId: parseInt(d.layerId ?? '0', 10),
					net: d.net ?? '',
					points: d.points ?? '',
					clearanceWidth: parseFloat(d.clearanceWidth ?? '0'),
					fillStyle: d.fillStyle ?? '',
					id: d.id ?? '',
					thermal: d.thermal ?? '',
					isKeepIsland: !!d.isKeepIsland,
					copperZone: [],
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			} else if (desig === 'SOLIDREGION') {
				const d = zipToObj<any>(SOLID_FIELDS, fields);
				footprint.solidRegions.push({
					layerId: parseInt(d.layerId ?? '0', 10),
					net: d.net ?? '',
					points: d.points ?? '',
					type: d.type ?? '',
					id: d.id ?? '',
					isLocked: d.isLocked !== '' ? !!d.isLocked : false,
				});
			}
		}

		return footprint;
	}
}
