/**
 * Fabmaster ASCII PCB format parser.
 *
 * Reference: KiCad import format documentation.
 *   - Sections are delimited by '!' characters.
 *   - Row type prefix: A=header, J=metadata, S=data.
 *   - Units in MILS / MILLIMETERS / MICRONS / INCHES per section J row.
 *   - Y axis points upward; converted to downward Y.
 */
import {
	type PcbArc,
	type PcbBoard,
	type PcbComponent,
	type PcbLayerType,
	type PcbPad,
	type PcbPoint,
	type PcbPolygon,
	type PcbText,
	type PcbTrack,
	type PcbVia,
	createEmptyPcbBoard,
} from '../pcb/pcb-models';

// ─── Row / section tokenization ──────────────────────────────────────────────

interface FabRow {
	type: 'A' | 'J' | 'S';
	fields: string[];
}

interface FabSection {
	sectionType: string;
	headers: string[];
	unit: string;
	rows: FabRow[];
}

function splitRow(line: string): string[] {
	const fields: string[] = [];
	let current = '';
	let inQuote = false;
	for (const c of line) {
		if (c === '"') {
			inQuote = !inQuote;
		} else if (c === '!' && !inQuote) {
			fields.push(current);
			current = '';
		} else {
			current += c;
		}
	}
	fields.push(current);
	return fields;
}

function normalizeHeader(h: string): string {
	return h.toUpperCase().replace(/_/g, '');
}

function detectSectionType(headers: string[]): string {
	const h = headers.map(normalizeHeader);
	const [c1, c2, c3] = h;
	const matchers: { test: () => boolean; type: string }[] = [
		{ test: () => c1 === 'REFDES' && c2 === 'COMPCLASS', type: 'EXTRACT_REFDES' },
		{ test: () => c1 === 'NETNAME' && c2 === 'REFDES', type: 'EXTRACT_NETS' },
		{ test: () => c1 === 'CLASS' && c2 === 'SUBCLASS' && !c3, type: 'EXTRACT_BASIC_LAYERS' },
		{ test: () => c1 === 'GRAPHICDATANAME' && c2 === 'GRAPHICDATANUMBER', type: 'EXTRACT_GRAPHICS' },
		{ test: () => c1 === 'CLASS' && c2 === 'SUBCLASS' && c3 === 'GRAPHICDATANAME', type: 'EXTRACT_TRACES' },
		{ test: () => c1 === 'SYMNAME' && c2 === 'PINNAME' && c3 !== 'SYMMIRROR', type: 'FABMASTER_EXTRACT_PINS' },
		{ test: () => c1 === 'SYMNAME' && c2 === 'SYMMIRROR' && c3 === 'PINNAME', type: 'EXTRACT_PINS' },
		{ test: () => c1 === 'VIAX' && c2 === 'VIAY', type: 'EXTRACT_VIAS' },
		{ test: () => c1 === 'SUBCLASS' && c2 === 'PADSHAPENAME', type: 'EXTRACT_PAD_SHAPES' },
		{ test: () => c1 === 'PADNAME', type: 'EXTRACT_PADSTACKS' },
		{ test: () => c1 === 'LAYERSORT', type: 'EXTRACT_FULL_LAYERS' },
	];
	for (const m of matchers) {
		if (m.test()) return m.type;
	}
	return 'UNKNOWN';
}

function parseUnitFromJ(fields: string[]): string {
	for (let i = 1; i < fields.length; i++) {
		const u = fields[i].toUpperCase();
		if (['MILS', 'MILLIMETERS', 'MICRONS', 'INCHES'].includes(u)) return u;
	}
	return 'MILS';
}

function parseSections(content: string): FabSection[] {
	const sections: FabSection[] = [];
	let current: FabSection | null = null;
	const lines = content.split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const fields = splitRow(line);
		const rowType = fields[0]?.toUpperCase() as FabRow['type'];
		if (!['A', 'J', 'S'].includes(rowType)) continue;

		if (rowType === 'A') {
			const headers = fields.slice(1);
			current = {
				sectionType: detectSectionType(headers),
				headers,
				unit: 'MILS',
				rows: [],
			};
			sections.push(current);
		} else if (current) {
			if (rowType === 'J') {
				current.unit = parseUnitFromJ(fields);
			} else {
				current.rows.push({ type: rowType, fields: fields.slice(1) });
			}
		}
	}
	return sections;
}

// ─── Unit scaling ────────────────────────────────────────────────────────────

function unitScale(unit: string): number {
	switch (unit.toUpperCase()) {
		case 'MILLIMETERS':
			return 1;
		case 'MICRONS':
			return 0.001;
		case 'INCHES':
			return 25.4;
		case 'MILS':
		default:
			return 0.0254;
	}
}

function toMm(value: string, scale: number): number {
	const n = parseFloat(value);
	return Number.isNaN(n) ? 0 : n * scale;
}

function flipY(y: number): number {
	return -y;
}

// ─── Layer mapping ───────────────────────────────────────────────────────────

const LAYER_RULES: { test: (s: string) => boolean; type: PcbLayerType }[] = [
	{ test: (s) => s === 'TOP' || s.includes('TOP_CONDUCTOR') || s.includes('F.CU'), type: 'top' },
	{ test: (s) => s === 'BOTTOM' || s.includes('BOTTOM_CONDUCTOR') || s.includes('B.CU'), type: 'bottom' },
	{ test: (s) => s.includes('OUTLINE') || s.includes('DESIGN_OUTLINE'), type: 'outline' },
	{ test: (s) => s.includes('SILK') || s.includes('DISPLAY'), type: 'silkscreen_top' },
	{ test: (s) => s.includes('MASK') || s.includes('MSK'), type: 'soldermask_top' },
	{ test: (s) => s.includes('PAST'), type: 'paste_top' },
	{ test: (s) => s.includes('ASSEMBLY'), type: 'assembly_top' },
];

function layerNameToType(name: string): PcbLayerType {
	const upper = name.toUpperCase();
	const bottomish = upper.includes('B') || upper.includes('BOTTOM');
	for (const rule of LAYER_RULES) {
		if (rule.test(upper)) {
			if (
				(rule.type === 'silkscreen_top' || rule.type === 'soldermask_top' || rule.type === 'paste_top' || rule.type === 'assembly_top') &&
				bottomish
			) {
				return rule.type.replace('_top', '_bottom') as PcbLayerType;
			}
			return rule.type;
		}
	}
	return 'other';
}

interface FabLayerInfo {
	name: string;
	sort: number;
	conductive: boolean;
}

function collectFullLayers(sections: FabSection[]): FabLayerInfo[] {
	const layers: FabLayerInfo[] = [];
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_FULL_LAYERS') continue;
		const h = sec.headers.map(normalizeHeader);
		const sortIdx = h.indexOf('LAYERSORT');
		const nameIdx = h.indexOf('LAYERSUBCLASS');
		const condIdx = h.indexOf('LAYERCONDUCTOR');
		for (const row of sec.rows) {
			const name = row.fields[nameIdx] ?? '';
			if (!name) continue;
			const sort = parseInt(row.fields[sortIdx] ?? '0', 10);
			const conductive = (row.fields[condIdx] ?? '').toUpperCase() === 'YES';
			layers.push({ name, sort, conductive });
		}
	}
	return layers;
}

function assignCopperLayerTypes(layers: FabLayerInfo[], map: Map<string, PcbLayerType>): void {
	const sorted = [...layers].sort((a, b) => a.sort - b.sort);
	const copper = sorted.filter((l) => l.conductive);
	for (let i = 0; i < copper.length; i++) {
		const name = copper[i].name;
		if (i === 0) map.set(name, 'top');
		else if (i === copper.length - 1) map.set(name, 'bottom');
		else map.set(name, 'inner');
	}
	for (const l of sorted) {
		if (!map.has(l.name)) map.set(l.name, layerNameToType(l.name));
	}
}

function applyBasicLayers(sections: FabSection[], map: Map<string, PcbLayerType>): void {
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_BASIC_LAYERS') continue;
		const h = sec.headers.map(normalizeHeader);
		const nameIdx = h.indexOf('SUBCLASS');
		for (const row of sec.rows) {
			const name = row.fields[nameIdx] ?? '';
			if (!name || map.has(name)) continue;
			map.set(name, layerNameToType(name));
		}
	}
}

function buildLayerTypeMap(sections: FabSection[]): Map<string, PcbLayerType> {
	const map = new Map<string, PcbLayerType>();
	assignCopperLayerTypes(collectFullLayers(sections), map);
	applyBasicLayers(sections, map);
	return map;
}

function resolveLayer(name: string, map: Map<string, PcbLayerType>): PcbLayerType {
	return map.get(name) ?? layerNameToType(name);
}

// ─── Padstacks ───────────────────────────────────────────────────────────────

interface FabPadstack {
	name: string;
	shape: 'round' | 'rect' | 'oval';
	width: number;
	height: number;
	holeDiameter: number;
	isPlated: boolean;
}

function parsePadShape(shape: string): 'round' | 'rect' | 'oval' {
	const s = shape.toUpperCase();
	if (s === 'RECTANGLE' || s === 'SQUARE') return 'rect';
	if (s.startsWith('OBLONG') || s === 'ROUNDED_RECT') return 'oval';
	if (s === 'CIRCLE' || s === 'ROUND') return 'round';
	if (s === 'OCTAGON') return 'rect';
	return 'round';
}

function applyDrillRow(ps: FabPadstack, row: string[], shapeIdx: number, wIdx: number, hIdx: number, nameIdx: number, scale: number): void {
	const drillHit = parseFloat(row[shapeIdx] ?? '0');
	let dx = toMm(row[wIdx] ?? '0', scale);
	let dy = toMm(row[hIdx] ?? '0', scale);
	if (dx <= 0 && dy <= 0 && drillHit > 0) {
		dx = drillHit * scale;
		dy = drillHit * scale;
	}
	ps.holeDiameter = dx > 0 ? dx : dy;
	ps.isPlated = (row[nameIdx] ?? '').toUpperCase().startsWith('P');
}

function applyShapeRow(ps: FabPadstack, row: string[], shapeIdx: number, wIdx: number, hIdx: number, scale: number): void {
	ps.shape = parsePadShape(row[shapeIdx] ?? '');
	ps.width = toMm(row[wIdx] ?? '0', scale);
	ps.height = toMm(row[hIdx] ?? '0', scale);
}

function parsePadstacks(sections: FabSection[]): Map<string, FabPadstack> {
	const padstacks = new Map<string, FabPadstack>();
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_PADSTACKS') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const idx = (name: string) => h.indexOf(name);
		const nameIdx = idx('PADNAME');
		const layerIdx = idx('LAYER');
		const shapeIdx = idx('PADSHAPE1');
		const wIdx = idx('PADWIDTH');
		const hIdx = idx('PADHGHT');
		const drillNameIdx = idx('PADSHAPENAME');

		for (const row of sec.rows) {
			const name = row.fields[nameIdx] ?? '';
			if (!name) continue;
			const layer = row.fields[layerIdx] ?? '';
			let ps = padstacks.get(name);
			if (!ps) {
				ps = { name, shape: 'round', width: 0, height: 0, holeDiameter: 0, isPlated: true };
				padstacks.set(name, ps);
			}
			const upperLayer = layer.toUpperCase();
			if (upperLayer.startsWith('~DRILL')) {
				applyDrillRow(ps, row.fields, shapeIdx, wIdx, hIdx, drillNameIdx, scale);
			} else if (!upperLayer.startsWith('~') && ps.width <= 0) {
				applyShapeRow(ps, row.fields, shapeIdx, wIdx, hIdx, scale);
			}
		}
	}
	return padstacks;
}

// ─── Components / pins / vias ────────────────────────────────────────────────

function pinKey(refdes: string, symName: string): string {
	return `${refdes || symName}::${symName}`;
}

function createPadFromPin(row: string[], h: string[], scale: number, ps: FabPadstack | undefined): PcbPad {
	const idx = (name: string) => h.indexOf(name);
	const mirrorIdx = idx('SYMMIRROR');
	const pinNameIdx = idx('PINNAME');
	const pinNumIdx = idx('PINNUMBER');
	const xIdx = idx('PINX');
	const yIdx = idx('PINY');
	const rotIdx = idx('PINROTATION');
	const mirrored = (row[mirrorIdx] ?? '').toUpperCase() === 'YES';
	const x = toMm(row[xIdx] ?? '0', scale);
	const y = flipY(toMm(row[yIdx] ?? '0', scale));
	const rotation = parseFloat(row[rotIdx] ?? '0');
	return {
		number: row[pinNumIdx] ?? '',
		name: row[pinNameIdx] ?? '',
		x,
		y,
		shape: ps?.shape ?? 'round',
		width: ps?.width ?? 1,
		height: ps?.height ?? 1,
		rotation,
		holeDiameter: ps?.holeDiameter,
		isPlated: ps?.isPlated ?? true,
		layer: mirrored ? 'bottom' : 'top',
	};
}

function parsePins(sections: FabSection[], padstacks: Map<string, FabPadstack>): Map<string, PcbComponent> {
	const comps = new Map<string, PcbComponent>();
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_PINS') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const idx = (name: string) => h.indexOf(name);
		const symIdx = idx('SYMNAME');
		const padIdx = idx('PADSTACKNAME');
		const refIdx = idx('REFDES');

		for (const row of sec.rows) {
			const refdes = row.fields[refIdx] ?? row.fields[symIdx] ?? '';
			const symName = row.fields[symIdx] ?? '';
			const key = pinKey(refdes, symName);
			let comp = comps.get(key);
			if (!comp) {
				comp = {
					refdes,
					footprint: symName,
					x: 0,
					y: 0,
					rotation: 0,
					isFlipped: false,
					pads: [],
					shapes: [],
				};
				comps.set(key, comp);
			}
			const ps = padstacks.get(row.fields[padIdx] ?? '');
			const pad = createPadFromPin(row.fields, h, scale, ps);
			comp.pads.push(pad);
			if (pad.layer === 'bottom') comp.isFlipped = true;
		}
	}
	return comps;
}

function applyRefdesToComponents(sections: FabSection[], comps: Map<string, PcbComponent>): void {
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_REFDES') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const idx = (name: string) => h.indexOf(name);
		const refIdx = idx('REFDES');
		const symIdx = idx('SYMNAME');
		const mirrorIdx = idx('SYMMIRROR');
		const rotIdx = idx('SYMROTATE');
		const xIdx = idx('SYMX');
		const yIdx = idx('SYMY');
		const valIdx = idx('COMPVALUE');

		for (const row of sec.rows) {
			const refdes = row.fields[refIdx] ?? '';
			const symName = row.fields[symIdx] ?? '';
			const key = pinKey(refdes, symName);
			let comp = comps.get(key);
			if (!comp) {
				comp = {
					refdes,
					footprint: symName,
					x: 0,
					y: 0,
					rotation: 0,
					isFlipped: false,
					pads: [],
					shapes: [],
				};
				comps.set(key, comp);
			}
			comp.value = row.fields[valIdx] ?? comp.value;
			comp.x = toMm(row.fields[xIdx] ?? '0', scale);
			comp.y = flipY(toMm(row.fields[yIdx] ?? '0', scale));
			comp.rotation = parseFloat(row.fields[rotIdx] ?? '0');
			comp.isFlipped = (row.fields[mirrorIdx] ?? '').toUpperCase() === 'YES';
		}
	}
}

function parseVias(sections: FabSection[], padstacks: Map<string, FabPadstack>): PcbVia[] {
	const vias: PcbVia[] = [];
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_VIAS') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const idx = (name: string) => h.indexOf(name);
		const xIdx = idx('VIAX');
		const yIdx = idx('VIAY');
		const padIdx = idx('PADSTACKNAME');
		const netIdx = idx('NETNAME');
		for (const row of sec.rows) {
			const x = toMm(row.fields[xIdx] ?? '0', scale);
			const y = flipY(toMm(row.fields[yIdx] ?? '0', scale));
			const ps = padstacks.get(row.fields[padIdx] ?? '');
			const diameter = ps?.width ?? 0.5;
			const drill = ps?.holeDiameter ?? diameter * 0.5;
			vias.push({ x, y, diameter, drill, net: row.fields[netIdx] ?? '' });
		}
	}
	return vias;
}

// ─── Graphic primitives ──────────────────────────────────────────────────────

function makePoint(x: number, y: number): PcbPoint {
	return { x, y };
}

function parseAngle(cx: number, cy: number, px: number, py: number): number {
	return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

interface PrimitiveResult {
	tracks: PcbTrack[];
	arcs: PcbArc[];
	polygons: PcbPolygon[];
	circles: { centerX: number; centerY: number; radius: number; width: number }[];
}

function parseLine(nums: number[]): PcbTrack | null {
	if (nums.length < 5) return null;
	return { points: [makePoint(nums[0], nums[1]), makePoint(nums[2], nums[3])], width: nums[4], layer: 'top', net: '' };
}

function parseArc(data: string[], nums: number[]): PcbArc | null {
	if (nums.length < 9) return null;
	const [sx, sy, ex, ey, cx, cy, radius, width] = nums;
	const ccw = (data[8] ?? '').toUpperCase().startsWith('COUNTER');
	let startAngle = parseAngle(cx, cy, sx, sy);
	let endAngle = parseAngle(cx, cy, ex, ey);
	if (ccw) {
		if (endAngle < startAngle) endAngle += 360;
	} else {
		if (startAngle < endAngle) startAngle += 360;
	}
	return { centerX: cx, centerY: cy, radius, startAngle, endAngle, width, layer: 'top', net: '' };
}

function parseRectangle(nums: number[]): PcbPolygon | null {
	if (nums.length < 4) return null;
	const [x1, y1, x2, y2] = nums;
	return {
		points: [makePoint(x1, y1), makePoint(x2, y1), makePoint(x2, y2), makePoint(x1, y2)],
		layer: 'top',
		net: '',
		isSolid: nums[4] === 1,
	};
}

function parseFigRectangle(nums: number[]): PcbPolygon | null {
	if (nums.length < 4) return null;
	const [cx, cy, w, h] = nums;
	const w2 = w / 2;
	const h2 = h / 2;
	return {
		points: [makePoint(cx - w2, cy - h2), makePoint(cx + w2, cy - h2), makePoint(cx + w2, cy + h2), makePoint(cx - w2, cy + h2)],
		layer: 'top',
		net: '',
		isSolid: nums[4] === 1,
	};
}

function parsePrimitive(data: string[], scale: number): PrimitiveResult {
	const tracks: PcbTrack[] = [];
	const arcs: PcbArc[] = [];
	const polygons: PcbPolygon[] = [];
	const circles: { centerX: number; centerY: number; radius: number; width: number }[] = [];

	const type = (data[0] ?? '').toUpperCase();
	const rawNums = data.slice(1).map((v) => toMm(v, scale));
	const nums = applyYFlip(type, rawNums);

	if (type === 'LINE') {
		const t = parseLine(nums);
		if (t) tracks.push(t);
	} else if (type === 'ARC') {
		const a = parseArc(data, nums);
		if (a) arcs.push(a);
	} else if (type === 'CIRCLE' && nums.length >= 5) {
		circles.push({ centerX: nums[0], centerY: nums[1], radius: nums[2] / 2, width: nums[4] });
	} else if (type === 'RECTANGLE') {
		const p = parseRectangle(nums);
		if (p) polygons.push(p);
	} else if (type === 'FIG_RECTANGLE' || type === 'SQUARE') {
		const p = parseFigRectangle(nums);
		if (p) polygons.push(p);
	}

	return { tracks, arcs, polygons, circles };
}

function applyYFlip(type: string, nums: number[]): number[] {
	const flipped = [...nums];
	const flipAt = (indices: number[]) => {
		for (const i of indices) {
			if (i < flipped.length) flipped[i] = -flipped[i];
		}
	};
	switch (type) {
		case 'LINE':
			flipAt([1, 3]);
			break;
		case 'ARC':
			flipAt([1, 3, 5]);
			break;
		case 'CIRCLE':
			flipAt([1]);
			break;
		case 'RECTANGLE':
			flipAt([1, 3]);
			break;
		case 'FIG_RECTANGLE':
		case 'SQUARE':
			flipAt([1]);
			break;
	}
	return flipped;
}

function parseText(data: string[], scale: number): PcbText | null {
	if (data.length < 7) return null;
	const x = toMm(data[0], scale);
	const y = flipY(toMm(data[1], scale));
	const rotation = parseFloat(data[2]);
	const size = toMm(data[5].split(/\s+/)[0], scale) || 1;
	const text = data[6] ?? '';
	if (Number.isNaN(x) || Number.isNaN(y)) return null;
	return { x, y, text, size, rotation, layer: 'silkscreen_top' };
}

// ─── Traces / graphics ───────────────────────────────────────────────────────

function parseTraces(sections: FabSection[], layerMap: Map<string, PcbLayerType>): { tracks: PcbTrack[]; arcs: PcbArc[]; polygons: PcbPolygon[] } {
	const tracks: PcbTrack[] = [];
	const arcs: PcbArc[] = [];
	const polygons: PcbPolygon[] = [];

	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_TRACES') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const idx = (name: string) => h.indexOf(name);
		const classIdx = idx('CLASS');
		const layerIdx = idx('SUBCLASS');
		const gdIdx = idx('GRAPHICDATANAME');
		const netIdx = idx('NETNAME');
		const dataStart = idx('GRAPHICDATA1');

		for (const row of sec.rows) {
			const recClass = (row.fields[classIdx] ?? '').toUpperCase();
			if (['REF DES', 'DEVICE TYPE', 'COMPONENT VALUE', 'TOLERANCE'].includes(recClass)) continue;
			const layer = resolveLayer(row.fields[layerIdx] ?? '', layerMap);
			const net = row.fields[netIdx] ?? '';
			const data = [row.fields[gdIdx] ?? '', ...row.fields.slice(dataStart)];
			const primitive = parsePrimitive(data, scale);
			for (const t of primitive.tracks) tracks.push({ ...t, layer, net });
			for (const a of primitive.arcs) arcs.push({ ...a, layer, net });
			for (const p of primitive.polygons) polygons.push({ ...p, layer, net });
		}
	}
	return { tracks, arcs, polygons };
}

function parseGraphics(
	sections: FabSection[],
	layerMap: Map<string, PcbLayerType>,
): { tracks: PcbTrack[]; arcs: PcbArc[]; polygons: PcbPolygon[]; circles: PcbCircle[]; texts: PcbText[] } {
	const tracks: PcbTrack[] = [];
	const arcs: PcbArc[] = [];
	const polygons: PcbPolygon[] = [];
	const circles: PcbCircle[] = [];
	const texts: PcbText[] = [];

	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_GRAPHICS') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const idx = (name: string) => h.indexOf(name);
		const gdIdx = idx('GRAPHICDATANAME');
		const layerIdx = idx('SUBCLASS');
		const refIdx = idx('REFDES');
		const dataStart = idx('GRAPHICDATA1');

		for (const row of sec.rows) {
			const refdes = row.fields[refIdx] ?? '';
			if (refdes) continue;
			const gd = row.fields[gdIdx] ?? '';
			const layer = resolveLayer(row.fields[layerIdx] ?? '', layerMap);
			const data = [gd, ...row.fields.slice(dataStart)];
			if (gd.toUpperCase() === 'TEXT') {
				const t = parseText(data, scale);
				if (t) texts.push({ ...t, layer });
				continue;
			}
			const primitive = parsePrimitive(data, scale);
			for (const t of primitive.tracks) tracks.push({ ...t, layer });
			for (const a of primitive.arcs) arcs.push({ ...a, layer });
			for (const p of primitive.polygons) polygons.push({ ...p, layer });
			for (const c of primitive.circles) circles.push({ ...c, layer, net: '' });
		}
	}
	return { tracks, arcs, polygons, circles, texts };
}

// ─── Nets ────────────────────────────────────────────────────────────────────

function parseNets(sections: FabSection[]): Map<string, string> {
	const pinToNet = new Map<string, string>();
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_NETS') continue;
		const h = sec.headers.map(normalizeHeader);
		const netIdx = h.indexOf('NETNAME');
		const refIdx = h.indexOf('REFDES');
		const pinIdx = h.indexOf('PINNUMBER');
		for (const row of sec.rows) {
			const net = row.fields[netIdx] ?? '';
			const ref = row.fields[refIdx] ?? '';
			const pin = row.fields[pinIdx] ?? '';
			if (!net || !ref || !pin) continue;
			pinToNet.set(`${ref}::${pin}`, net);
		}
	}
	return pinToNet;
}

function assignNets(comps: Map<string, PcbComponent>, pinToNet: Map<string, string>): void {
	for (const comp of comps.values()) {
		for (const pad of comp.pads) {
			const net = pinToNet.get(`${comp.refdes}::${pad.number}`);
			if (net) pad.net = net;
		}
	}
}

// ─── Board outline ───────────────────────────────────────────────────────────

function parseBoardOutline(sections: FabSection[]): PcbPoint[] {
	const pts: PcbPoint[] = [];
	for (const sec of sections) {
		if (sec.sectionType !== 'EXTRACT_TRACES' && sec.sectionType !== 'EXTRACT_GRAPHICS') continue;
		const scale = unitScale(sec.unit);
		const h = sec.headers.map(normalizeHeader);
		const layerIdx = h.indexOf('SUBCLASS');
		const gdIdx = h.indexOf('GRAPHICDATANAME');
		const dataStart = h.indexOf('GRAPHICDATA1');
		for (const row of sec.rows) {
			const layerName = row.fields[layerIdx] ?? '';
			if (!['OUTLINE', 'DESIGN_OUTLINE'].includes(layerName.toUpperCase())) continue;
			const data = [row.fields[gdIdx] ?? '', ...row.fields.slice(dataStart)];
			if ((data[0] ?? '').toUpperCase() !== 'LINE') continue;
			const nums = data.slice(1).map((v) => toMm(v, scale));
			if (nums.length >= 4) {
				pts.push(makePoint(nums[0], flipY(nums[1])), makePoint(nums[2], flipY(nums[3])));
			}
		}
	}
	return pts;
}

// ─── Main parse ──────────────────────────────────────────────────────────────

export function parseFabmasterPcb(content: string): PcbBoard {
	const sections = parseSections(content);
	const board = createEmptyPcbBoard('fabmaster_pcb');
	const layerMap = buildLayerTypeMap(sections);
	const padstacks = parsePadstacks(sections);
	const comps = parsePins(sections, padstacks);
	applyRefdesToComponents(sections, comps);
	board.components = Array.from(comps.values());
	board.vias = parseVias(sections, padstacks);
	const pinToNet = parseNets(sections);
	assignNets(comps, pinToNet);

	const traces = parseTraces(sections, layerMap);
	board.tracks = traces.tracks;
	board.arcs = traces.arcs;
	board.polygons.push(...traces.polygons);

	const graphics = parseGraphics(sections, layerMap);
	board.tracks.push(...graphics.tracks);
	board.arcs.push(...graphics.arcs);
	board.polygons.push(...graphics.polygons);
	board.texts.push(...graphics.texts);
	for (const c of graphics.circles) board.circles.push(c);

	board.outline = parseBoardOutline(sections);
	return board;
}
