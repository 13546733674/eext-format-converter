/**
 * Common PCB intermediate model used by all legacy-format PCB importers.
 * All coordinates are stored in millimetres; angles in degrees.
 */

export interface PcbPoint {
	x: number;
	y: number;
}

export type PcbLayerType =
	| 'top'
	| 'bottom'
	| 'inner'
	| 'soldermask_top'
	| 'soldermask_bottom'
	| 'paste_top'
	| 'paste_bottom'
	| 'silkscreen_top'
	| 'silkscreen_bottom'
	| 'assembly_top'
	| 'assembly_bottom'
	| 'outline'
	| 'other';

export interface PcbLayer {
	id: number;
	name: string;
	type: PcbLayerType;
}

export type PcbPadShape = 'round' | 'rect' | 'oval' | 'polygon';

export interface PcbPad {
	number: string;
	name?: string;
	x: number;
	y: number;
	shape: PcbPadShape;
	width: number;
	height: number;
	rotation?: number;
	holeDiameter?: number;
	holeLength?: number;
	slotAngle?: number;
	isPlated?: boolean;
	layer: PcbLayerType;
	net?: string;
	polygonPoints?: PcbPoint[];
}

export interface PcbVia {
	x: number;
	y: number;
	diameter: number;
	drill?: number;
	net?: string;
}

export interface PcbHole {
	x: number;
	y: number;
	diameter: number;
}

export interface PcbTrack {
	points: PcbPoint[];
	width: number;
	layer: PcbLayerType;
	net?: string;
}

export interface PcbArc {
	centerX: number;
	centerY: number;
	radius: number;
	startAngle: number;
	endAngle: number;
	width: number;
	layer: PcbLayerType;
	net?: string;
}

export interface PcbCircle {
	centerX: number;
	centerY: number;
	radius: number;
	width: number;
	layer: PcbLayerType;
	net?: string;
}

export interface PcbPolygon {
	points: PcbPoint[];
	layer: PcbLayerType;
	net?: string;
	isSolid?: boolean;
}

export interface PcbText {
	x: number;
	y: number;
	text: string;
	size: number;
	rotation?: number;
	layer: PcbLayerType;
}

export interface PcbComponent {
	refdes: string;
	footprint?: string;
	value?: string;
	x: number;
	y: number;
	rotation?: number;
	isFlipped?: boolean;
	pads: PcbPad[];
	shapes: PcbShape[];
}

export type PcbShape =
	| { type: 'track'; points: PcbPoint[]; width: number; layer: PcbLayerType }
	| { type: 'arc'; centerX: number; centerY: number; radius: number; startAngle: number; endAngle: number; width: number; layer: PcbLayerType }
	| { type: 'circle'; centerX: number; centerY: number; radius: number; width: number; layer: PcbLayerType }
	| { type: 'polygon'; points: PcbPoint[]; layer: PcbLayerType }
	| { type: 'text'; x: number; y: number; text: string; size: number; rotation?: number; layer: PcbLayerType };

export interface PcbBoard {
	name: string;
	width?: number;
	height?: number;
	layers: PcbLayer[];
	outline: PcbPoint[];
	components: PcbComponent[];
	standalonePads: PcbPad[];
	vias: PcbVia[];
	holes: PcbHole[];
	tracks: PcbTrack[];
	arcs: PcbArc[];
	circles: PcbCircle[];
	polygons: PcbPolygon[];
	texts: PcbText[];
	nets: Map<string, string[]>;
}

export function createEmptyPcbBoard(name: string): PcbBoard {
	return {
		name,
		layers: [],
		outline: [],
		components: [],
		standalonePads: [],
		vias: [],
		holes: [],
		tracks: [],
		arcs: [],
		circles: [],
		polygons: [],
		texts: [],
		nets: new Map(),
	};
}
