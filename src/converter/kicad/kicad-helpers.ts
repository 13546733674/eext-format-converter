/**
 * KiCad s-expression helpers and EasyEDA → KiCad mappings.
 */
import { convertToMm } from '../constants';

export { convertToMm };

/** Mirror Y because EasyEDA and KiCad use opposite vertical orientations. */
export function mirrorY(y: number): number {
	return -y;
}

/** Convert EasyEDA coordinate to KiCad mm coordinate. */
export function toMm(value: number): number {
	return convertToMm(value);
}

/** Format a mm number for KiCad s-expression with reasonable precision. */
export function fmtMm(value: number): string {
	return toMm(value)
		.toFixed(4)
		.replace(/\.?0+$/, '');
}

/** Format a value that is already in millimetres. */
export function fmtRawMm(value: number): string {
	return value.toFixed(4).replace(/\.?0+$/, '');
}

/** Escape a string for KiCad s-expression. */
export function kicadEscape(value: string): string {
	return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Quote a string for s-expression. */
export function q(value: string): string {
	return `"${kicadEscape(value)}"`;
}

export const KICAD_PIN_TYPES: Record<string, string> = {
	'': 'unspecified',
	'Unspecified': 'unspecified',
	'Input': 'input',
	'Output': 'output',
	'I/O': 'bidirectional',
	'Bidirectional': 'bidirectional',
	'Power': 'power_in',
	'Passive': 'passive',
};

export const KICAD_PAD_SHAPES: Record<string, string> = {
	RECT: 'rect',
	ROUND: 'circle',
	OVAL: 'oval',
	ELLIPSE: 'oval',
	POLYGON: 'custom',
};

/** Map EasyEDA layer id/name to KiCad layer string(s). */
export function mapEeLayerToKicad(layerId: number | string): string[] {
	const id = typeof layerId === 'string' ? parseInt(layerId, 10) : layerId;
	if (id >= 19 && id <= 51) return ['In1.Cu'];
	switch (id) {
		case 1:
			return ['F.Cu'];
		case 2:
			return ['B.Cu'];
		case 3:
			return ['F.SilkS'];
		case 4:
			return ['B.SilkS'];
		case 5:
			return ['F.Paste'];
		case 6:
			return ['B.Paste'];
		case 7:
			return ['F.Mask'];
		case 8:
			return ['B.Mask'];
		case 9:
			return ['F.Fab'];
		case 10:
			return ['B.Fab'];
		case 11:
			return ['Edge.Cuts'];
		case 13:
			return ['F.SilkS'];
		case 14:
			return ['B.SilkS'];
		default:
			return ['F.Cu'];
	}
}

export function indent(level: number): string {
	return '  '.repeat(level);
}

/** Render a point as s-expression (x y). */
export function xy(x: number, y: number): string {
	return `(${fmtMm(x)} ${fmtMm(mirrorY(y))})`;
}

/** Render a point with rotation as s-expression (at x y r). */
export function at(x: number, y: number, rotation = 0): string {
	if (rotation === 0) return `(at ${fmtMm(x)} ${fmtMm(mirrorY(y))})`;
	return `(at ${fmtMm(x)} ${fmtMm(mirrorY(y))} ${rotation})`;
}
