/**
 * Convert TinyCAD schematic data into EasyEDA Pro V3 document sources.
 */
import type {
	TinyCadBus,
	TinyCadJunction,
	TinyCadNetLabel,
	TinyCadPin,
	TinyCadPoint,
	TinyCadShape,
	TinyCadSheet,
	TinyCadSymbolDef,
	TinyCadSymbolInstance,
	TinyCadWire,
} from './tinycad-parser';

// TinyCAD internal units to EasyEDA Pro schematic units (0.01 inch).
// This scale produces reasonably sized symbols and wires; adjust if needed.
const TINYCAD_SCALE = 2.5;

function generateClient(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 16; i++) s += hex[Math.floor(Math.random() * 16)];
	return s;
}

function generateUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

function u(v: number): number {
	return Math.round(v * TINYCAD_SCALE * 100) / 100;
}

function convertPoint(p: TinyCadPoint): { x: number; y: number } {
	return { x: u(p.x), y: u(-p.y) };
}

function escapeJson(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tinycadPinRotationToEe(direction: number): number {
	switch (direction) {
		case 2:
			return 0; // right
		case 1:
			return 90; // up
		case 3:
			return 180; // left
		case 0:
		default:
			return 270; // down
	}
}

function tinycadInstanceRotationToEe(rotate: number): number {
	return ((rotate % 4) * 90) % 360;
}

// ─── Symbol document generation ──────────────────────────────────────────────

let _symTicket = 0;
let _symId = 0;

function resetSymState(): void {
	_symTicket = 0;
	_symId = 0;
}

function nextSymId(prefix = 'e'): string {
	return `${prefix}${++_symId}`;
}

function nextSymTicket(): number {
	return ++_symTicket;
}

function emitSymPin(lines: string[], pin: TinyCadPin, partId: string, zIndex: number): number {
	const p = convertPoint(pin.pos);
	const rotation = tinycadPinRotationToEe(pin.direction);
	const length = u(pin.length);
	const pinId = nextSymId('e');
	lines.push(
		`{"type":"PIN","ticket":${nextSymTicket()},"id":"${pinId}"}||{"display":true,"x":${p.x},"y":${p.y},"length":${length},"rotation":${rotation},"color":null,"pinShape":"NONE","zIndex":${zIndex},"locked":false,"partId":"${partId}"}|`,
	);
	if (pin.name) {
		const nameId = nextSymId('e');
		lines.push(
			`{"type":"ATTR","ticket":${nextSymTicket()},"id":"${nameId}"}||{"x":${p.x},"y":${p.y},"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_MIDDLE","value":"${escapeJson(pin.name)}","keyVisible":false,"valueVisible":${pin.show > 0 ? 'true' : 'false'},"key":"Pin Name","fillColor":null,"parentId":"${pinId}","zIndex":${zIndex + 1},"locked":false,"partId":"${partId}"}|`,
		);
	}
	if (pin.number) {
		const numId = nextSymId('e');
		lines.push(
			`{"type":"ATTR","ticket":${nextSymTicket()},"id":"${numId}"}||{"x":${p.x},"y":${p.y},"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_BOTTOM","value":"${escapeJson(pin.number)}","keyVisible":false,"valueVisible":${pin.show > 0 ? 'true' : 'false'},"key":"Pin Number","fillColor":null,"parentId":"${pinId}","zIndex":${zIndex + 2},"locked":false,"partId":"${partId}"}|`,
		);
	}
	const typeId = nextSymId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSymTicket()},"id":"${typeId}"}||{"x":${p.x},"y":${p.y},"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":null,"italic":null,"underline":null,"strikeout":null,"align":"LEFT_BOTTOM","value":"Undefined","keyVisible":false,"valueVisible":false,"key":"Pin Type","fillColor":null,"parentId":"${pinId}","zIndex":${zIndex + 3},"locked":false,"partId":"${partId}"}|`,
	);
	return zIndex + 4;
}

function emitSymShape(lines: string[], shape: TinyCadShape, partId: string, zIndex: number): number {
	switch (shape.type) {
		case 'rectangle': {
			const a = convertPoint(shape.a);
			const b = convertPoint(shape.b);
			const id = nextSymId('e');
			lines.push(
				`{"type":"RECT","ticket":${nextSymTicket()},"id":"${id}"}||{"x":${Math.min(a.x, b.x)},"y":${Math.min(a.y, b.y)},"width":${Math.abs(b.x - a.x)},"height":${Math.abs(b.y - a.y)},"strokeColor":null,"strokeStyle":null,"fillColor":"","strokeWidth":null,"fillStyle":null,"zIndex":${zIndex},"locked":false,"partId":"${partId}"}|`,
			);
			return zIndex + 1;
		}
		case 'polygon': {
			const id = nextSymId('e');
			const pts = shape.points
				.map((pt) => {
					const p = convertPoint(pt);
					return `{"x":${p.x},"y":${p.y},"hashed":0}`;
				})
				.join(',');
			lines.push(
				`{"type":"POLY","ticket":${nextSymTicket()},"id":"${id}"}||{"points":[${pts}],"strokeColor":null,"strokeStyle":null,"fillColor":"","strokeWidth":null,"fillStyle":null,"closed":false,"zIndex":${zIndex},"locked":false,"partId":"${partId}"}|`,
			);
			return zIndex + 1;
		}
		case 'label': {
			const p = convertPoint(shape.pos);
			const id = nextSymId('e');
			lines.push(
				`{"type":"TEXT","ticket":${nextSymTicket()},"id":"${id}"}||{"partId":"${partId}","groupId":"","locked":false,"zIndex":${zIndex},"x":${p.x},"y":${p.y},"rotation":0,"value":"${escapeJson(shape.text)}","color":null,"fillColor":null,"fontFamily":null,"fontSize":15,"strikeout":null,"underline":false,"italic":false,"fontWeight":false,"align":"CENTER_MIDDLE","version":"2.0"}|`,
			);
			return zIndex + 1;
		}
	}
}

export function generateTinyCadSymbolSource(def: TinyCadSymbolDef, uuid: string): { source: string; partId: string } {
	resetSymState();
	const client = generateClient();
	const partId = `pid${uuid.substring(0, 16)}`;
	const lines: string[] = [];
	const now = Date.now();

	lines.push(`{"type":"DOCHEAD"}||{"docType":"SYMBOL","client":"${client}","uuid":"${uuid}","updateTime":${now},"version":"${now}"}|`);
	lines.push(`{"type":"CANVAS","ticket":1,"id":"CANVAS"}||{"originX":0,"originY":0}|`);
	lines.push(`{"type":"PART","ticket":2,"id":"${partId}"}||{"title":"${escapeJson(def.name || def.refPrefix)}"}|`);

	_symTicket = 2;
	let zIndex = 3;

	const symbolAttrId = nextSymId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSymTicket()},"id":"${symbolAttrId}"}||{"x":null,"y":null,"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_BOTTOM","value":"${escapeJson(def.name || def.refPrefix)}","keyVisible":false,"valueVisible":false,"key":"Symbol","fillColor":null,"parentId":"${partId}","zIndex":${zIndex++},"locked":false,"partId":"${partId}"}|`,
	);

	const desAttrId = nextSymId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSymTicket()},"id":"${desAttrId}"}||{"x":null,"y":null,"rotation":0,"color":null,"fontFamily":null,"fontSize":null,"fontWeight":false,"italic":false,"underline":false,"strikeout":false,"align":"LEFT_BOTTOM","value":"${escapeJson(def.refPrefix)}?","keyVisible":false,"valueVisible":false,"key":"Designator","fillColor":null,"parentId":"${partId}","zIndex":${zIndex++},"locked":false,"partId":"${partId}"}|`,
	);

	for (const pin of def.pins) {
		zIndex = emitSymPin(lines, pin, partId, zIndex);
	}

	for (const shape of def.shapes) {
		zIndex = emitSymShape(lines, shape, partId, zIndex);
	}

	return { source: lines.join('\n'), partId };
}

// ─── Schematic page generation ───────────────────────────────────────────────

let _schTicket = 0;
let _schId = 0;

function resetSchState(): void {
	_schTicket = 0;
	_schId = 0;
}

function nextSchId(prefix = 'e'): string {
	return `${prefix}${++_schId}`;
}

function nextSchTicket(): number {
	return ++_schTicket;
}

function emitWire(lines: string[], wire: TinyCadWire, zIndex: number): void {
	const a = convertPoint(wire.a);
	const b = convertPoint(wire.b);
	const id = nextSchId('e');
	lines.push(
		`{"type":"WIRE","ticket":${nextSchTicket()},"id":"${id}"}||{"partId":"","groupId":"","locked":false,"zIndex":${zIndex},"dots":[[${a.x},${a.y},${b.x},${b.y}]],"strokeColor":null,"strokeStyle":0,"fillColor":"","strokeWidth":null,"fillStyle":1}|`,
	);
}

function emitBus(lines: string[], bus: TinyCadBus, zIndex: number): void {
	const a = convertPoint(bus.a);
	const b = convertPoint(bus.b);
	const id = nextSchId('e');
	lines.push(
		`{"type":"BUS","ticket":${nextSchTicket()},"id":"${id}"}||{"partId":"","groupId":"","locked":false,"zIndex":${zIndex},"dots":[[${a.x},${a.y},${b.x},${b.y}]],"strokeColor":null,"strokeStyle":0,"fillColor":"","strokeWidth":null,"fillStyle":1}|`,
	);
}

function emitNetLabel(lines: string[], label: TinyCadNetLabel, zIndex: number): void {
	const p = convertPoint(label.pos);
	const id = nextSchId('e');
	lines.push(
		`{"type":"TEXT","ticket":${nextSchTicket()},"id":"${id}"}||{"partId":"","groupId":"","locked":false,"zIndex":${zIndex},"x":${p.x},"y":${p.y},"rotation":0,"value":"${escapeJson(label.text)}","color":"#208000","fillColor":null,"fontFamily":null,"fontSize":15,"strikeout":null,"underline":false,"italic":false,"fontWeight":false,"align":"LEFT_MIDDLE","version":"2.0"}|`,
	);
}

function emitJunction(lines: string[], junction: TinyCadJunction, zIndex: number): void {
	const p = convertPoint(junction.pos);
	const id = nextSchId('e');
	const r = 2;
	lines.push(
		`{"type":"CIRCLE","ticket":${nextSchTicket()},"id":"${id}"}||{"partId":"","groupId":"","locked":false,"zIndex":${zIndex},"x":${p.x},"y":${p.y},"radius":${r},"strokeColor":"#000000","fillColor":"#000000","strokeWidth":0,"fillStyle":1}|`,
	);
}

function getInstanceRefDes(inst: TinyCadSymbolInstance): string {
	const refField = inst.fields.find((f) => f.description === 'Ref');
	return refField?.value ?? '';
}

function getInstanceName(inst: TinyCadSymbolInstance): string {
	const nameField = inst.fields.find((f) => f.description === 'Name');
	return nameField?.value ?? '';
}

function emitComponent(
	lines: string[],
	inst: TinyCadSymbolInstance,
	def: TinyCadSymbolDef | undefined,
	partId: string,
	symbolUuid: string,
	zIndex: number,
): number {
	const p = convertPoint(inst.pos);
	const rotation = tinycadInstanceRotationToEe(inst.rotation);
	const compId = nextSchId('e');
	lines.push(
		`{"type":"COMPONENT","ticket":${nextSchTicket()},"id":"${compId}"}||{"locked":false,"zIndex":${zIndex},"partId":"${partId}","groupId":"","x":${p.x},"y":${p.y},"rotation":${rotation},"isMirror":false,"attrs":{}}|`,
	);

	const refDes = getInstanceRefDes(inst);
	const name = getInstanceName(inst);
	const symbolAttrId = nextSchId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSchTicket()},"id":"${symbolAttrId}"}||{"groupId":"","locked":false,"zIndex":${zIndex + 0.1},"parentId":"${compId}","key":"Symbol","value":"${symbolUuid}","keyVisible":null,"valueVisible":null,"x":null,"y":null,"rotation":null,"color":null,"fillColor":null,"fontFamily":null,"fontSize":10,"strikeout":null,"underline":null,"italic":null,"fontWeight":null,"align":"LEFT_BOTTOM","version":"2.0"}|`,
	);

	const designatorAttrId = nextSchId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSchTicket()},"id":"${designatorAttrId}"}||{"groupId":"","locked":false,"zIndex":${zIndex + 0.2},"parentId":"${compId}","key":"Designator","value":"${escapeJson(refDes)}","keyVisible":null,"valueVisible":true,"x":${p.x - 10},"y":${p.y - 10},"rotation":null,"color":null,"fillColor":null,"fontFamily":null,"fontSize":null,"strikeout":null,"underline":null,"italic":null,"fontWeight":null,"align":null,"version":"2.0"}|`,
	);

	const nameAttrId = nextSchId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSchTicket()},"id":"${nameAttrId}"}||{"groupId":"","locked":false,"zIndex":${zIndex + 0.3},"parentId":"${compId}","key":"Name","value":"${escapeJson(name)}","keyVisible":false,"valueVisible":true,"x":${p.x + 10},"y":${p.y + 10},"rotation":0,"color":null,"fillColor":null,"fontFamily":null,"fontSize":null,"strikeout":null,"underline":null,"italic":null,"fontWeight":null,"align":null,"version":"2.0"}|`,
	);

	const deviceAttrId = nextSchId('e');
	lines.push(
		`{"type":"ATTR","ticket":${nextSchTicket()},"id":"${deviceAttrId}"}||{"groupId":"","locked":false,"zIndex":${zIndex + 0.4},"parentId":"${compId}","key":"Device","value":"${symbolUuid}","keyVisible":false,"valueVisible":false,"x":null,"y":null,"rotation":0,"color":null,"fillColor":null,"fontFamily":null,"fontSize":"10","strikeout":null,"underline":null,"italic":null,"fontWeight":null,"align":null,"version":"2.0"}|`,
	);

	return zIndex + 1;
}

export function generateTinyCadSchematicPageSource(
	sheet: TinyCadSheet,
	symbolPartMap: Map<string, { uuid: string; partId: string; def: TinyCadSymbolDef }>,
	pageUuid: string,
): string {
	resetSchState();
	const client = generateClient();
	const lines: string[] = [];
	const now = Date.now();

	lines.push(`{"type":"DOCHEAD"}||{"docType":"SCH_PAGE","client":"${client}","uuid":"${pageUuid}","updateTime":${now},"version":"${now}"}|`);
	lines.push(`{"type":"CANVAS","ticket":1,"id":"CANVAS"}||{"originX":0,"originY":0}|`);

	_schTicket = 1;
	let zIndex = 2;

	// Wires
	for (const wire of sheet.wires) {
		emitWire(lines, wire, zIndex++);
	}

	// Buses
	for (const bus of sheet.buses) {
		emitBus(lines, bus, zIndex++);
	}

	// Junctions
	for (const junction of sheet.junctions) {
		emitJunction(lines, junction, zIndex++);
	}

	// Net labels
	for (const label of sheet.netLabels) {
		emitNetLabel(lines, label, zIndex++);
	}

	// Symbol instances
	for (const inst of sheet.symbolInstances) {
		const mapped = symbolPartMap.get(inst.defId);
		if (!mapped) continue;
		zIndex = emitComponent(lines, inst, mapped.def, mapped.partId, mapped.uuid, zIndex);
	}

	return lines.join('\n');
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export interface TinyCadConversionResult {
	symbolSources: string[];
	schematicPageSources: string[];
}

export function convertTinyCadSheetToProSources(sheet: TinyCadSheet): TinyCadConversionResult {
	const symbolSources: string[] = [];
	const symbolPartMap = new Map<string, { uuid: string; partId: string; def: TinyCadSymbolDef }>();

	for (const def of sheet.symbolDefs) {
		const uuid = generateUUID();
		const { source, partId } = generateTinyCadSymbolSource(def, uuid);
		symbolSources.push(source);
		symbolPartMap.set(def.id, { uuid, partId, def });
	}

	const schematicPageSources: string[] = [generateTinyCadSchematicPageSource(sheet, symbolPartMap, generateUUID())];

	return { symbolSources, schematicPageSources };
}
