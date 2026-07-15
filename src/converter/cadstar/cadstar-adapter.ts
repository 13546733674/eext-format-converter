/**
 * Adapt parsed Cadstar structures into the Xpedition-shaped intermediate model
 * so that the existing Pro writers (`generateFootprintSource` /
 * `generateSymbolDocument`) can be reused.
 */
import { generateFootprintSource } from '../easyeda-pro/easyeda-pro-footprint-writer';
import { generateSymbolDocument } from '../easyeda-pro/easyeda-pro-symbol-writer';
import type { XpedCell, XpedCellOutline, XpedHole, XpedOutlineShape, XpedPad, XpedPadstack, XpedPin } from '../xpedition/hkp-parser';
import type { XpedSymbol, XpedSymbolGraphic, XpedSymbolPin } from '../xpedition/symbol-text-parser';
import type {
	CadstarComponent,
	CadstarComponentPin,
	CadstarGraphic,
	CadstarPackage,
	CadstarPackagePin,
	CadstarPackageShape,
	CadstarPad,
	CadstarPart,
} from './cadstar-parser';

// ─── Pad / padstack / hole maps ──────────────────────────────────────────────

export interface CadstarPadMaps {
	pads: Map<string, XpedPad>;
	holes: Map<string, XpedHole>;
	padstacks: Map<string, XpedPadstack>;
}

export function buildCadstarPadMaps(cadstarPads: CadstarPad[]): CadstarPadMaps {
	const pads = new Map<string, XpedPad>();
	const holes = new Map<string, XpedHole>();
	const padstacks = new Map<string, XpedPadstack>();

	for (const pad of cadstarPads) {
		const xpedPad: XpedPad = {
			name: pad.name,
			shape: pad.shape,
			diameter: pad.diameter,
			width: pad.width,
			height: pad.height,
			offsetX: pad.offsetX,
			offsetY: pad.offsetY,
			polylinePoints: pad.polylinePoints,
		};
		pads.set(pad.name, xpedPad);

		let holeName: string | undefined;
		if (pad.holeDiameter !== undefined && pad.holeDiameter > 0) {
			holeName = `${pad.name}_hole`;
			holes.set(holeName, {
				name: holeName,
				shape: 'ROUND',
				diameter: pad.holeDiameter,
				plated: true,
				positiveTol: 0,
				negativeTol: 0,
			});
		} else if (pad.holeSlotWidth !== undefined && pad.holeSlotHeight !== undefined) {
			holeName = `${pad.name}_hole`;
			holes.set(holeName, {
				name: holeName,
				shape: 'SLOT',
				width: pad.holeSlotWidth,
				height: pad.holeSlotHeight,
				plated: true,
				positiveTol: 0,
				negativeTol: 0,
			});
		}

		const padstack: XpedPadstack = {
			name: pad.name,
			type: holeName ? 'PIN_THROUGH' : 'PIN_SMD',
			topPad: pad.name,
			bottomPad: holeName ? pad.name : undefined,
			holeName,
			holeOffsetX: 0,
			holeOffsetY: 0,
		};
		padstacks.set(pad.name, padstack);
	}

	return { pads, holes, padstacks };
}

// ─── Footprint adapter ───────────────────────────────────────────────────────

function adaptPackageShape(shape: CadstarPackageShape): XpedOutlineShape | null {
	switch (shape.type) {
		case 'RECT': {
			if (shape.points.length >= 2) {
				return { type: 'RECT_PATH', points: shape.points, width: shape.width ?? 0.1 };
			}
			break;
		}
		case 'LINE':
		case 'POLYLINE':
		case 'POLYGON': {
			if (shape.points.length >= 2) {
				return { type: 'POLYLINE_PATH', points: shape.points, width: shape.width ?? 0.1 };
			}
			break;
		}
		case 'CIRCLE': {
			if (shape.points.length >= 1) {
				return { type: 'CIRCLE_PATH', points: shape.points, radius: shape.radius ?? 0.1, width: shape.width ?? 0.1 };
			}
			break;
		}
		case 'ARC': {
			// Approximate arc as polyline; full arc conversion would need SVG path math.
			if (shape.points.length >= 3) {
				return { type: 'POLYLINE_PATH', points: shape.points, width: shape.width ?? 0.1 };
			}
			break;
		}
	}
	return null;
}

function adaptPackagePin(pin: CadstarPackagePin): XpedPin {
	return {
		number: pin.number,
		x: pin.x,
		y: pin.y,
		padstack: pin.padName,
		rotation: pin.rotation,
	};
}

export function adaptPackageToXpedCell(pkg: CadstarPackage): XpedCell {
	const outlines: XpedCellOutline[] = [];
	const shapes: XpedOutlineShape[] = [];
	for (const shape of pkg.shapes) {
		const adapted = adaptPackageShape(shape);
		if (adapted) shapes.push(adapted);
	}
	if (shapes.length > 0) {
		outlines.push({ kind: 'SILKSCREEN_OUTLINE', shapes });
	}

	return {
		name: pkg.name,
		packageGroup: pkg.properties['Package Group'] ?? '',
		mountType: 'SURFACE',
		numberLayers: 2,
		description: pkg.description ?? '',
		pins: pkg.pins.map(adaptPackagePin),
		outlines,
		texts: [],
		properties: pkg.properties,
	};
}

export function generateCadstarFootprintSource(pkg: CadstarPackage, padMaps: CadstarPadMaps, uuid: string): string {
	const cell = adaptPackageToXpedCell(pkg);
	return generateFootprintSource(cell, padMaps.padstacks, padMaps.pads, padMaps.holes, uuid);
}

// ─── Symbol adapter ──────────────────────────────────────────────────────────

function adaptComponentPin(pin: CadstarComponentPin): XpedSymbolPin {
	return {
		id: pin.id,
		startX: pin.startX,
		startY: pin.startY,
		endX: pin.endX,
		endY: pin.endY,
		rotation: pin.rotation,
		inverted: pin.inverted ? 1 : 0,
		pinType: pin.pinType,
		pinNumbers: pin.pinNumbers,
		label: pin.label,
		labelX: pin.labelX,
		labelY: pin.labelY,
		labelSize: 1.0,
		labelRotation: 0,
		labelOrigin: 0,
		labelVisible: pin.labelVisible,
		pinNumberVisible: pin.pinNumberVisible,
	};
}

function adaptComponentGraphic(g: CadstarGraphic): XpedSymbolGraphic | null {
	switch (g.type) {
		case 'polyline':
			return { type: 'polyline', points: g.points };
		case 'polygon':
			return { type: 'polygon', points: g.points };
		case 'rect':
			return { type: 'rect', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 };
		case 'circle':
			return { type: 'circle', cx: g.cx, cy: g.cy, radius: g.radius };
		case 'arc':
			return { type: 'arc', startX: g.startX, startY: g.startY, centerX: g.centerX, centerY: g.centerY, endX: g.endX, endY: g.endY };
	}
}

export function adaptComponentToXpedSymbol(comp: CadstarComponent): XpedSymbol {
	return {
		name: comp.name,
		version: comp.version,
		symbolType: 1,
		bbox: { x1: 0, y1: 0, x2: 0, y2: 0 },
		zoomLevel: 1,
		pins: comp.pins.map(adaptComponentPin),
		graphics: comp.graphics.map(adaptComponentGraphic).filter((g): g is XpedSymbolGraphic => g !== null),
		texts: [],
		properties: comp.properties,
		partsCount: 1,
		hetero: [],
		footprint: comp.properties['Footprint'] ?? '',
	};
}

export function generateCadstarSymbolDocument(comp: CadstarComponent, uuid: string): string {
	const symbol = adaptComponentToXpedSymbol(comp);
	return generateSymbolDocument(symbol, uuid);
}

// ─── Device adapter ──────────────────────────────────────────────────────────

export interface CadstarDeviceMapping {
	name: string;
	componentName: string;
	packageName: string;
	symbolUuid: string;
	footprintUuid: string;
	description?: string;
	properties: Record<string, string>;
}

export function buildCadstarDeviceMappings(
	parts: CadstarPart[],
	componentNameToUuid: Map<string, string>,
	packageNameToUuid: Map<string, string>,
): CadstarDeviceMapping[] {
	return parts.map((part) => ({
		name: part.name,
		componentName: part.componentName,
		packageName: part.packageName,
		description: part.description,
		properties: part.properties,
		symbolUuid: componentNameToUuid.get(part.componentName) ?? '',
		footprintUuid: packageNameToUuid.get(part.packageName) ?? '',
	}));
}
