/**
 * Convert EasyEDA Pro symbol models into a KiCad .kicad_sym s-expression library.
 */
import type {
	EeSymbol,
	EeSymbolArc,
	EeSymbolCircle,
	EeSymbolLine,
	EeSymbolPath,
	EeSymbolPin,
	EeSymbolPolygon,
	EeSymbolPolyline,
	EeSymbolRectangle,
	EeSymbolSub,
} from '../easyeda-pro/easyeda-pro-models';
import { KICAD_PIN_TYPES, fmtMm, indent, mirrorY, q } from './kicad-helpers';

function pinType(eeType: string | number): string {
	if (typeof eeType === 'number') {
		const map = ['unspecified', 'input', 'output', 'bidirectional', 'power_in'];
		return map[eeType] ?? 'unspecified';
	}
	return KICAD_PIN_TYPES[eeType] ?? 'unspecified';
}

function parsePinPath(path: string): { x: number; y: number; length: number; angle: number } {
	// pinPath is like "Mx,yhL" or "Mx,yvL"
	const m = path.match(/M\s*([\d.\-]+)[,\s]+([\d.\-]+)/i);
	const h = path.match(/h\s*([\d.\-]+)/i);
	const v = path.match(/v\s*([\d.\-]+)/i);
	if (!m) return { x: 0, y: 0, length: 0, angle: 0 };
	const x = Number(m[1]);
	const y = Number(m[2]);
	if (h) {
		const len = Number(h[1]);
		return { x, y, length: Math.abs(len), angle: len >= 0 ? 0 : 180 };
	}
	if (v) {
		const len = Number(v[1]);
		return { x, y, length: Math.abs(len), angle: len >= 0 ? 90 : 270 };
	}
	return { x, y, length: 0, angle: 0 };
}

function renderPin(pin: EeSymbolPin): string {
	const { settings, name: pinName, number: pinNumber, pinPath } = pin;
	const pathInfo = parsePinPath(pinPath.path);
	const pos = `(at ${fmtMm(pathInfo.x)} ${fmtMm(mirrorY(pathInfo.y))} ${pathInfo.angle})`;
	const length = fmtMm(pathInfo.length);
	const ptype = pinType(settings.type);
	const nameText = q(pinName.text || '');
	const numText = q(pinNumber.text || '');
	const fontSize = pinName.fontSize || pinNumber.fontSize || 5;
	const nameEffects = `(effects (font (size ${fmtMm(fontSize)} ${fmtMm(fontSize)})))`;
	const numEffects = `(effects (font (size ${fmtMm(fontSize)} ${fmtMm(fontSize)})))`;
	return `${indent(3)}(pin ${ptype} line ${pos} (length ${length})\n${indent(4)}(name ${nameText} ${nameEffects})\n${indent(4)}(number ${numText} ${numEffects})\n${indent(3)})`;
}

function renderRectangle(rect: EeSymbolRectangle): string {
	return `${indent(3)}(rectangle (start ${fmtMm(rect.posX)} ${fmtMm(mirrorY(rect.posY))}) (end ${fmtMm(rect.posX + rect.width)} ${fmtMm(mirrorY(rect.posY + rect.height))})\n${indent(4)}(stroke (width ${fmtMm(Number(rect.strokeWidth) || 0)}) (type default) (color 0 0 0 0))\n${indent(4)}(fill (type ${rect.fillColor && rect.fillColor !== 'none' ? 'background' : 'none'}))\n${indent(3)})`;
}

function renderCircle(circle: EeSymbolCircle): string {
	return `${indent(3)}(circle (center ${fmtMm(circle.centerX)} ${fmtMm(mirrorY(circle.centerY))}) (radius ${fmtMm(circle.radius)})\n${indent(4)}(stroke (width ${fmtMm(Number(circle.strokeWidth) || 0)}) (type default) (color 0 0 0 0))\n${indent(4)}(fill (type ${circle.fillColor ? 'background' : 'none'}))\n${indent(3)})`;
}

function renderLine(line: EeSymbolLine): string {
	return `${indent(3)}(polyline\n${indent(4)}(pts (xy ${fmtMm(line.x1)} ${fmtMm(mirrorY(line.y1))}) (xy ${fmtMm(line.x2)} ${fmtMm(mirrorY(line.y2))}))\n${indent(4)}(stroke (width ${fmtMm(Number(line.strokeWidth) || 0)}) (type default) (color 0 0 0 0))\n${indent(4)}(fill (type none))\n${indent(3)})`;
}

function parsePoints(points: string): Array<[number, number]> {
	const nums = points
		.replace(/,/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.map(Number)
		.filter((n) => !isNaN(n));
	const result: Array<[number, number]> = [];
	for (let i = 0; i < nums.length; i += 2) {
		result.push([nums[i], nums[i + 1]]);
	}
	return result;
}

function renderPolyline(pl: EeSymbolPolyline | EeSymbolPolygon, closed: boolean): string {
	const pts = parsePoints(pl.points);
	if (pts.length < 2) return '';
	return `${indent(3)}(polyline\n${indent(4)}(pts ${pts.map((p) => `(xy ${fmtMm(p[0])} ${fmtMm(mirrorY(p[1]))})`).join(' ')})\n${indent(4)}(stroke (width ${fmtMm(Number(pl.strokeWidth) || 0)}) (type default) (color 0 0 0 0))\n${indent(4)}(fill (type ${closed && pl.fillColor ? 'background' : 'none'}))\n${indent(3)})`;
}

function renderArc(arc: EeSymbolArc): string {
	// Fallback: draw a small circle placeholder; real arc conversion from SVG path needs more work.
	return `${indent(3)}(arc (start 0 0) (mid ${fmtMm(0.5)} 0) (end 1 0)\n${indent(4)}(stroke (width ${fmtMm(Number(arc.strokeWidth) || 0)}) (type default) (color 0 0 0 0))\n${indent(4)}(fill (type none))\n${indent(3)})`;
}

function renderPath(path: EeSymbolPath): string {
	const pts = parsePoints(path.paths || path.paths);
	if (pts.length < 2) return '';
	return `${indent(3)}(polyline\n${indent(4)}(pts ${pts.map((p) => `(xy ${fmtMm(p[0])} ${fmtMm(mirrorY(p[1]))})`).join(' ')})\n${indent(4)}(stroke (width ${fmtMm(Number(path.strokeWidth) || 0)}) (type default) (color 0 0 0 0))\n${indent(4)}(fill (type ${path.fillColor ? 'background' : 'none'}))\n${indent(3)})`;
}

function renderSub(symbolName: string, sub: EeSymbolSub, unitIndex: number): string {
	const unit = unitIndex + 1;
	const lines: string[] = [`${indent(2)}(symbol "${symbolName}_${unit}_0"`];

	for (const pin of sub.pins) lines.push(renderPin(pin));
	for (const rect of sub.rectangles) lines.push(renderRectangle(rect));
	for (const circle of sub.circles) lines.push(renderCircle(circle));
	for (const line of sub.lines) lines.push(renderLine(line));
	for (const pl of sub.polylines) {
		const r = renderPolyline(pl, false);
		if (r) lines.push(r);
	}
	for (const pg of sub.polygons) {
		const r = renderPolyline(pg, true);
		if (r) lines.push(r);
	}
	for (const arc of sub.arcs) lines.push(renderArc(arc));
	for (const path of sub.paths) {
		const r = renderPath(path);
		if (r) lines.push(r);
	}

	lines.push(`${indent(2)})`);
	return lines.join('\n');
}

function renderSymbol(symbol: EeSymbol): string {
	const name = symbol.info.name || 'unnamed';
	const prefix = symbol.info.prefix || 'U';
	const lines: string[] = [
		`  (symbol ${q(name)}`,
		`    (pin_numbers)`,
		`    (pin_names (offset 1.016))`,
		`    (in_bom yes)`,
		`    (on_board yes)`,
		`    (property "Reference" ${q(prefix)} (id 0) (at 0 ${fmtMm(2.54)} 0)`,
		`      (effects (font (size 1.27 1.27)) (justify bottom))`,
		`    )`,
		`    (property "Value" ${q(name)} (id 1) (at 0 ${fmtMm(-2.54)} 0)`,
		`      (effects (font (size 1.27 1.27)) (justify top))`,
		`    )`,
	];

	if (symbol.subs.length === 0) {
		lines.push(
			renderSub(
				name,
				{
					...symbol.subs[0],
					pins: [],
					rectangles: [],
					circles: [],
					arcs: [],
					ellipses: [],
					polylines: [],
					polygons: [],
					paths: [],
					lines: [],
					name: '',
					bbox: symbol.bbox,
				},
				0,
			),
		);
	} else {
		for (let i = 0; i < symbol.subs.length; i++) {
			lines.push(renderSub(name, symbol.subs[i], i));
		}
	}

	lines.push('  )');
	return lines.join('\n');
}

export function generateKicadSymbolLibrary(symbols: EeSymbol[]): string {
	const lines: string[] = ['(kicad_symbol_lib', `  (version 20211014)`, `  (generator "eext-format-convert")`];
	for (const symbol of symbols) {
		lines.push(renderSymbol(symbol));
	}
	lines.push(')');
	return lines.join('\n');
}
