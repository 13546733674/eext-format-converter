/**
 * TinyCAD XML (.dsn) schematic parser.
 *
 * TinyCAD stores designs as XML with:
 *   - `<SYMBOLDEF>` symbol definitions containing shapes/pins
 *   - `<SYMBOL>` placements referencing symbol definitions
 *   - `<WIRE>`, `<BUS>`, `<JUNCTION>`, `<LABEL>` connectivity
 */

export interface TinyCadPoint {
	x: number;
	y: number;
}

export interface TinyCadPin {
	pos: TinyCadPoint;
	number: string;
	name: string;
	direction: number; // 0=down,1=up,2=right,3=left
	length: number;
	which: number;
	show: number;
}

export interface TinyCadField {
	description: string;
	value: string;
	show: string;
	pos: TinyCadPoint;
}

export type TinyCadShape =
	| { type: 'rectangle'; a: TinyCadPoint; b: TinyCadPoint; style: string; fill: string }
	| { type: 'polygon'; pos: TinyCadPoint; points: TinyCadPoint[]; style: string; fill: string }
	| { type: 'label'; pos: TinyCadPoint; text: string; direction: number; font: string; color: string; style: string };

export interface TinyCadSymbolDef {
	id: string;
	name: string;
	refPrefix: string;
	description: string;
	ppp: number;
	shapes: TinyCadShape[];
	pins: TinyCadPin[];
}

export interface TinyCadSymbolInstance {
	defId: string;
	pos: TinyCadPoint;
	rotation: number;
	scaleX: number;
	scaleY: number;
	fields: TinyCadField[];
}

export interface TinyCadWire {
	a: TinyCadPoint;
	b: TinyCadPoint;
}

export interface TinyCadBus {
	a: TinyCadPoint;
	b: TinyCadPoint;
}

export interface TinyCadJunction {
	pos: TinyCadPoint;
}

export interface TinyCadNetLabel {
	pos: TinyCadPoint;
	text: string;
	direction: number;
}

export interface TinyCadSheet {
	name: string;
	width: number;
	height: number;
	symbolDefs: TinyCadSymbolDef[];
	symbolInstances: TinyCadSymbolInstance[];
	wires: TinyCadWire[];
	buses: TinyCadBus[];
	junctions: TinyCadJunction[];
	netLabels: TinyCadNetLabel[];
}

function parsePoint(raw: string): TinyCadPoint {
	const [x, y] = raw.split(',').map((v) => parseFloat(v.trim()));
	return { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y };
}

function childText(el: Element, tag: string): string {
	const child = el.querySelector(tag);
	return child?.textContent?.trim() ?? '';
}

function attrNumber(el: Element, name: string, fallback = 0): number {
	const v = parseFloat(el.getAttribute(name) ?? '');
	return isNaN(v) ? fallback : v;
}

function attrString(el: Element, name: string, fallback = ''): string {
	return el.getAttribute(name) ?? fallback;
}

function parseSymbolDef(el: Element): TinyCadSymbolDef {
	const shapes: TinyCadShape[] = [];
	const pins: TinyCadPin[] = [];

	const innerTinyCad = el.querySelector(':scope > TinyCAD');
	if (innerTinyCad) {
		for (const child of Array.from(innerTinyCad.children)) {
			const tag = child.tagName.toUpperCase();
			if (tag === 'RECTANGLE') {
				shapes.push({
					type: 'rectangle',
					a: parsePoint(attrString(child, 'a', '0,0')),
					b: parsePoint(attrString(child, 'b', '0,0')),
					style: attrString(child, 'style', '0'),
					fill: attrString(child, 'fill', '0'),
				});
			} else if (tag === 'POLYGON') {
				const pos = parsePoint(attrString(child, 'pos', '0,0'));
				const points: TinyCadPoint[] = [];
				for (const pt of Array.from(child.querySelectorAll('POINT'))) {
					points.push(parsePoint(attrString(pt, 'pos', '0,0')));
				}
				shapes.push({
					type: 'polygon',
					pos,
					points,
					style: attrString(child, 'style', '0'),
					fill: attrString(child, 'fill', '0'),
				});
			} else if (tag === 'LABEL') {
				shapes.push({
					type: 'label',
					pos: parsePoint(attrString(child, 'pos', '0,0')),
					text: child.textContent?.trim() ?? '',
					direction: attrNumber(child, 'direction', 0),
					font: attrString(child, 'font', '0'),
					color: attrString(child, 'color', '000000'),
					style: attrString(child, 'style', '0'),
				});
			} else if (tag === 'PIN') {
				pins.push({
					pos: parsePoint(attrString(child, 'pos', '0,0')),
					number: attrString(child, 'number', ''),
					name: child.textContent?.trim() ?? '',
					direction: attrNumber(child, 'direction', 0),
					length: attrNumber(child, 'length', 10),
					which: attrNumber(child, 'which', 0),
					show: attrNumber(child, 'show', 0),
				});
			}
		}
	}

	return {
		id: attrString(el, 'id', ''),
		name: childText(el, 'NAME'),
		refPrefix: childText(el, 'REF'),
		description: childText(el, 'DESCRIPTION'),
		ppp: parseInt(childText(el, 'PPP') || '1', 10) || 1,
		shapes,
		pins,
	};
}

function parseSymbolInstance(el: Element): TinyCadSymbolInstance {
	const fields: TinyCadField[] = [];
	for (const field of Array.from(el.querySelectorAll(':scope > FIELD'))) {
		fields.push({
			description: childText(field, 'DESCRIPTION'),
			value: childText(field, 'VALUE'),
			show: attrString(field, 'show', '0'),
			pos: parsePoint(attrString(field, 'pos', '0,0')),
		});
	}
	return {
		defId: attrString(el, 'id', ''),
		pos: parsePoint(attrString(el, 'pos', '0,0')),
		rotation: attrNumber(el, 'rotate', 0),
		scaleX: attrNumber(el, 'scale_x', 1),
		scaleY: attrNumber(el, 'scale_y', 1),
		fields,
	};
}

export function parseTinyCadDsn(xmlText: string): TinyCadSheet {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, 'application/xml');
	const parserError = doc.querySelector('parsererror');
	if (parserError) {
		throw new Error('TinyCAD XML parse error: ' + parserError.textContent);
	}

	const root = doc.querySelector('TinyCADSheets > TinyCAD');
	if (!root) {
		throw new Error('TinyCAD: missing <TinyCADSheets><TinyCAD> root');
	}

	const sheetName = childText(root, 'NAME') || 'Sheet 1';
	const details = root.querySelector('DETAILS');
	const sizeEl = details?.querySelector('Size');
	const width = parseFloat(sizeEl?.getAttribute('width') ?? '1485');
	const height = parseFloat(sizeEl?.getAttribute('height') ?? '1050');

	const symbolDefs: TinyCadSymbolDef[] = [];
	for (const def of Array.from(root.querySelectorAll(':scope > SYMBOLDEF'))) {
		symbolDefs.push(parseSymbolDef(def));
	}

	const symbolInstances: TinyCadSymbolInstance[] = [];
	for (const sym of Array.from(root.querySelectorAll(':scope > SYMBOL'))) {
		symbolInstances.push(parseSymbolInstance(sym));
	}

	const wires: TinyCadWire[] = [];
	for (const wire of Array.from(root.querySelectorAll(':scope > WIRE'))) {
		wires.push({
			a: parsePoint(attrString(wire, 'a', '0,0')),
			b: parsePoint(attrString(wire, 'b', '0,0')),
		});
	}

	const buses: TinyCadBus[] = [];
	for (const bus of Array.from(root.querySelectorAll(':scope > BUS'))) {
		buses.push({
			a: parsePoint(attrString(bus, 'a', '0,0')),
			b: parsePoint(attrString(bus, 'b', '0,0')),
		});
	}

	const junctions: TinyCadJunction[] = [];
	for (const junc of Array.from(root.querySelectorAll(':scope > JUNCTION'))) {
		junctions.push({
			pos: parsePoint(attrString(junc, 'pos', '0,0')),
		});
	}

	const netLabels: TinyCadNetLabel[] = [];
	for (const label of Array.from(root.querySelectorAll(':scope > LABEL'))) {
		netLabels.push({
			pos: parsePoint(attrString(label, 'pos', '0,0')),
			text: label.textContent?.trim() ?? '',
			direction: attrNumber(label, 'direction', 0),
		});
	}

	return {
		name: sheetName,
		width,
		height,
		symbolDefs,
		symbolInstances,
		wires,
		buses,
		junctions,
		netLabels,
	};
}
