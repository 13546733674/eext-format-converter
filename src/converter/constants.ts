/**
 * Shared constants for EasyEDA → Xpedition conversion.
 */

// ─── Unit conversions ────────────────────────────────────────────────────────

export function eeUnitToTh(value: number): number {
	return Math.round(value * 10 * 100) / 100;
}

export function convertToMm(dim: number): number {
	return dim * 10 * 0.0254;
}

export function applyVerticalMirror(y: number): number {
	return -y;
}

// ─── Enums ───────────────────────────────────────────────────────────────────

export const enum Side {
	TOP = 0,
	BOTTOM = 1,
	LEFT = 2,
	RIGHT = 3,
}

export const enum Rotation {
	R0 = 0,
	R90 = 1,
	R180 = 2,
	R270 = 3,
}

export const enum EasyedaPinType {
	UNSPECIFIED = 0,
	INPUT = 1,
	OUTPUT = 2,
	BIDIRECTIONAL = 3,
	POWER = 4,
}

// ─── Layer mapping ───────────────────────────────────────────────────────────

export const LAYER_MAP: Record<string, string> = {
	TopLayer: 'TOP',
	BottomLayer: 'BOTTOM',
	TopSilkLayer: 'SILKSCREEN_OUTLINE',
	BottomSilkLayer: 'SILKSCREEN_OUTLINE',
	TopPasteMaskLayer: 'SOLDER_PASTE',
	BottomPasteMaskLayer: 'SOLDER_PASTE',
	TopSolderMaskLayer: 'SOLDER_MASK',
	BottomSolderMaskLayer: 'SOLDER_MASK',
	'Multi-Layer': 'MULTI_LAYER',
	TopAssembly: 'ASSEMBLY_OUTLINE',
	BottomAssembly: 'ASSEMBLY_OUTLINE',
	ComponentShapeLayer: 'ASSEMBLY_OUTLINE',
};

export function mapEasyedaLayerToXpedition(layerName: string): string {
	return LAYER_MAP[layerName] ?? `UNKNOWN_LAYER_${layerName}`;
}

// ─── Pin type mapping ────────────────────────────────────────────────────────

const EE_PIN_TYPES = ['Undefined', 'Input', 'Output', 'I/O', 'Power'];

const PIN_TYPE_MAP: Record<string, string> = {
	Input: 'Input',
	Output: 'Ouput',
	'I/O': 'BI',
};

export function getXpeditionPinType(eePinType: string | number): string | null {
	let str = eePinType as string;
	if (typeof eePinType === 'number') {
		str = EE_PIN_TYPES[eePinType] ?? 'Undefined';
	}
	if (!EE_PIN_TYPES.includes(str)) str = 'Undefined';
	return PIN_TYPE_MAP[str] ?? null;
}

// ─── Mount types ─────────────────────────────────────────────────────────────

export const MOUNT_SURFACE = 'SURFACE';
export const MOUNT_THROUGH = 'THROUGH';
export const MOUNT_MIXED = 'MIXED';

// ─── Symbol designator handlers ──────────────────────────────────────────────

export const SYMBOL_DESIGNATORS = ['P', 'R', 'E', 'C', 'A', 'PL', 'PG', 'PT', 'L'] as const;

// ─── Footprint designators ───────────────────────────────────────────────────

export const FOOTPRINT_DESIGNATORS = [
	'PAD',
	'TRACK',
	'HOLE',
	'VIA',
	'CIRCLE',
	'ARC',
	'RECT',
	'TEXT',
	'SVGNODE',
	'COPPERAREA',
	'SOLIDREGION',
] as const;
