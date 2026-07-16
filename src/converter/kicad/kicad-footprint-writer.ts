/**
 * Convert an EasyEDA Pro footprint model into a KiCad .kicad_mod s-expression.
 */
import type {
	EeFootprint,
	EeFootprintArc,
	EeFootprintCircle,
	EeFootprintHole,
	EeFootprintPad,
	EeFootprintPolygon,
	EeFootprintRectangle,
	EeFootprintText,
	EeFootprintTrack,
} from '../easyeda-pro/easyeda-pro-models';
import { KICAD_PAD_SHAPES, at, fmtMm, fmtRawMm, indent, mapEeLayerToKicad, mirrorY, q, toMm, xy } from './kicad-helpers';

function isThroughHolePad(pad: EeFootprintPad): boolean {
	return pad.holeRadius > 0 || (pad.shape.toUpperCase() === 'ROUND' && pad.holeRadius > 0);
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

function renderPad(pad: EeFootprintPad): string {
	const number = q(pad.number || '');
	const padType = isThroughHolePad(pad) ? 'thru_hole' : 'smd';
	const shape = KICAD_PAD_SHAPES[pad.shape.toUpperCase()] ?? 'rect';
	const pos = at(pad.centerX, pad.centerY, pad.rotation || 0);
	const size = `(size ${fmtMm(pad.width)} ${fmtMm(pad.height)})`;

	let layers: string[];
	if (padType === 'thru_hole') {
		layers = ['*.Cu', '*.Mask'];
	} else if (pad.layerId === 2) {
		layers = ['B.Cu', 'B.Paste', 'B.Mask'];
	} else {
		layers = ['F.Cu', 'F.Paste', 'F.Mask'];
	}
	const layersStr = `(layers ${layers.map(q).join(' ')})`;

	let drill = '';
	if (isThroughHolePad(pad)) {
		if (pad.holeLength > 0 && pad.holePoint) {
			// Oblong/slot hole
			drill = `(drill oval ${fmtMm(pad.holeRadius * 2)} ${fmtMm(pad.holeLength)})`;
		} else {
			drill = `(drill ${fmtMm(pad.holeRadius * 2)})`;
		}
	}

	let polygon = '';
	if (shape === 'custom' && pad.points) {
		const pts = parsePoints(pad.points);
		if (pts.length > 2) {
			polygon = `\n${indent(2)}  (primitives\n${indent(3)}(gr_poly\n${indent(4)}(pts ${pts.map((p) => xy(p[0], p[1])).join(' ')})\n${indent(4)})\n${indent(2)}  )`;
		}
	}

	return `${indent(1)}(pad ${number} ${padType} ${shape} ${pos}\n${indent(2)}${size}\n${indent(2)}${drill ? `${drill}\n${indent(2)}` : ''}${layersStr}${polygon}\n${indent(1)})`;
}

function renderTrack(track: EeFootprintTrack): string {
	const pts = parsePoints(track.points);
	if (pts.length < 2) return '';
	const layer = mapEeLayerToKicad(track.layerId)[0] ?? 'F.SilkS';
	const width = fmtMm(track.strokeWidth || 0.1);
	const lines: string[] = [];
	for (let i = 0; i < pts.length - 1; i++) {
		lines.push(
			`${indent(1)}(fp_line (start ${fmtMm(pts[i][0])} ${fmtMm(mirrorY(pts[i][1]))}) (end ${fmtMm(pts[i + 1][0])} ${fmtMm(mirrorY(pts[i + 1][1]))})\n${indent(2)}(stroke (width ${width}) (type default))\n${indent(2)}(layer ${q(layer)})\n${indent(1)})`,
		);
	}
	return lines.join('\n');
}

function renderRectangle(rect: EeFootprintRectangle): string {
	const layer = mapEeLayerToKicad(rect.layerId)[0] ?? 'F.SilkS';
	const width = fmtMm(rect.strokeWidth || 0.1);
	return `${indent(1)}(fp_rect (start ${fmtMm(rect.x)} ${fmtMm(mirrorY(rect.y))}) (end ${fmtMm(rect.x + rect.width)} ${fmtMm(mirrorY(rect.y + rect.height))})\n${indent(2)}(stroke (width ${width}) (type default))\n${indent(2)}(fill none)\n${indent(2)}(layer ${q(layer)})\n${indent(1)})`;
}

function renderCircle(circle: EeFootprintCircle): string {
	const layer = mapEeLayerToKicad(circle.layerId)[0] ?? 'F.SilkS';
	const width = fmtMm(circle.strokeWidth || 0.1);
	return `${indent(1)}(fp_circle (center ${fmtMm(circle.cx)} ${fmtMm(mirrorY(circle.cy))}) (end ${fmtMm(circle.cx + circle.radius)} ${fmtMm(mirrorY(circle.cy))})\n${indent(2)}(stroke (width ${width}) (type default))\n${indent(2)}(fill none)\n${indent(2)}(layer ${q(layer)})\n${indent(1)})`;
}

function renderHole(hole: EeFootprintHole): string {
	const pos = at(hole.centerX, hole.centerY);
	return `${indent(1)}(pad "" np_thru_hole circle ${pos}\n${indent(2)}(size ${fmtMm(hole.radius * 2)} ${fmtMm(hole.radius * 2)})\n${indent(2)}(drill ${fmtMm(hole.radius * 2)})\n${indent(2)}(layers *.Cu *.Mask)\n${indent(1)})`;
}

function renderPolygon(poly: EeFootprintPolygon): string {
	const pts = parsePoints(poly.points);
	if (pts.length < 3) return '';
	const layer = mapEeLayerToKicad(poly.layerId)[0] ?? 'F.SilkS';
	const width = fmtMm(poly.strokeWidth || 0.1);
	return `${indent(1)}(fp_poly\n${indent(2)}(pts ${pts.map((p) => xy(p[0], p[1])).join(' ')})\n${indent(2)}(stroke (width ${width}) (type default))\n${indent(2)}(fill none)\n${indent(2)}(layer ${q(layer)})\n${indent(1)})`;
}

function renderText(text: EeFootprintText): string {
	if (!text.isDisplayed) return '';
	const layer = mapEeLayerToKicad(text.layerId)[0] ?? 'F.SilkS';
	const content = q(text.text || '');
	const type = text.type === 'reference' ? 'reference' : text.type === 'value' ? 'value' : 'user';
	const rotation = text.rotation || 0;
	return `${indent(1)}(fp_text ${type} ${content} (at ${fmtMm(text.centerX)} ${fmtMm(mirrorY(text.centerY))} ${rotation})\n${indent(2)}(layer ${q(layer)})\n${indent(2)}(effects (font (size ${fmtMm(text.fontSize || 1)} ${fmtMm(text.fontSize || 1)}) (thickness ${fmtMm((text.fontSize || 1) * 0.15)})))\n${indent(1)})`;
}

function renderArc(arc: EeFootprintArc): string {
	// Best-effort arc rendering from SVG path; fallback to fp_line if parsing fails.
	const layer = mapEeLayerToKicad(arc.layerId)[0] ?? 'F.SilkS';
	const width = fmtMm(arc.strokeWidth || 0.1);
	const path = arc.path || arc.helperDots || '';
	const m = path.match(/M\s*([\d.\-]+)[,\s]+([\d.\-]+)/i);
	const end = path.match(/[A-Z]\s*([\d.\-]+)[,\s]+([\d.\-]+)\s*$/);
	if (!m || !end) return '';
	const sx = Number(m[1]);
	const sy = Number(m[2]);
	const ex = Number(end[1]);
	const ey = Number(end[2]);
	// midpoint as rough arc center
	const cx = (sx + ex) / 2;
	const cy = (sy + ey) / 2;
	return `${indent(1)}(fp_arc (start ${fmtMm(sx)} ${fmtMm(mirrorY(sy))}) (mid ${fmtMm(cx)} ${fmtMm(mirrorY(cy))}) (end ${fmtMm(ex)} ${fmtMm(mirrorY(ey))})\n${indent(2)}(stroke (width ${width}) (type default))\n${indent(2)}(layer ${q(layer)})\n${indent(1)})`;
}

export function generateKicadFootprint(footprint: EeFootprint): string {
	const name = q(footprint.info.name || 'unnamed');
	const isSmd = footprint.info.fpType === 'smd';
	const attr = isSmd ? '(attr smd)' : '(attr through_hole)';

	const lines: string[] = [`(footprint ${name}`, `  (version 20221018)`, `  (generator "eext-format-convert")`, `  (layer "F.Cu")`, `  ${attr}`];

	lines.push(`${indent(1)}(fp_text reference "REF**" (at 0 ${fmtRawMm(-toMm(footprint.bbox.height) / 2 - 1.27)}) (layer "F.SilkS")`);
	lines.push(`${indent(2)}(effects (font (size 1 1) (thickness 0.15)))`);
	lines.push(`${indent(1)})`);

	lines.push(`${indent(1)}(fp_text value ${name} (at 0 ${fmtRawMm(toMm(footprint.bbox.height) / 2 + 1.27)}) (layer "F.Fab")`);
	lines.push(`${indent(2)}(effects (font (size 1 1) (thickness 0.15)))`);
	lines.push(`${indent(1)})`);

	for (const pad of footprint.pads) lines.push(renderPad(pad));
	for (const track of footprint.tracks) {
		const rendered = renderTrack(track);
		if (rendered) lines.push(rendered);
	}
	for (const rect of footprint.rectangles) lines.push(renderRectangle(rect));
	for (const circle of footprint.circles) lines.push(renderCircle(circle));
	for (const hole of footprint.holes) lines.push(renderHole(hole));
	for (const poly of footprint.polygons) {
		const rendered = renderPolygon(poly);
		if (rendered) lines.push(rendered);
	}
	for (const text of footprint.texts) {
		const rendered = renderText(text);
		if (rendered) lines.push(rendered);
	}
	for (const arc of footprint.arcs) {
		const rendered = renderArc(arc);
		if (rendered) lines.push(rendered);
	}

	lines.push(')');
	return lines.join('\n');
}
