/**
 * Parser for Xpedition symbol text files (*.1, *.2, etc.) — V54 format.
 *
 * Key format (per spec):
 *   V VersionNumber
 *   K UnixTimestamp SymbolName
 *   F Case
 *   Y SymbolType (1=Module, 2=Composite, 3=Pin, 4=Annotate, 5=Border)
 *   D DrawX1 DrawY1 DrawX2 DrawY2  (bbox)
 *   Z ZoomLevel  (coordinates are in ZoomLevel × 0.0254mm units)
 *   U OriginX OriginY Size Rotation Origin Visibility KEY=VALUE
 *   P ID StartX StartY EndX EndY Unknown1 Rotation Inverted
 *   A OriginX OriginY Size Rotation Origin Visibility KEY=VALUE  (pin attribute)
 *   L OriginX OriginY Size Rotation Origin Visibility Unknown1 Unknown2 PinName
 *   l PointNumber StartX StartY path1X path1Y ...  (polyline)
 *   b StartX StartY EndX EndY  (rectangle)
 *   c PositionX PositionY Radius  (circle)
 *   a StartX StartY CenterX CenterY EndX EndY  (arc)
 *   T OriginX OriginY Size Rotation Origin Text  (text)
 *   E  (end)
 */

// ─── Data types ──────────────────────────────────────────────────────────────

export interface XpedSymbolPin {
	id: number;
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	rotation: number;
	inverted: number;
	pinType: string;
	pinNumbers: string[];
	label: string;
	labelX: number;
	labelY: number;
	labelSize: number;
	labelRotation: number;
	labelOrigin: number;
	labelVisible: boolean;
	pinNumberVisible: boolean;
}

export type XpedSymbolGraphic =
	| { type: 'polyline'; points: { x: number; y: number }[] }
	| { type: 'polygon'; points: { x: number; y: number }[] }
	| { type: 'rect'; x1: number; y1: number; x2: number; y2: number }
	| { type: 'circle'; cx: number; cy: number; radius: number }
	| { type: 'arc'; startX: number; startY: number; centerX: number; centerY: number; endX: number; endY: number };

export interface XpedSymbolText {
	x: number;
	y: number;
	size: number;
	rotation: number;
	origin: number;
	text: string;
}

export interface XpedSymbol {
	name: string;
	version: number;
	symbolType: number;
	bbox: { x1: number; y1: number; x2: number; y2: number };
	zoomLevel: number;
	pins: XpedSymbolPin[];
	graphics: XpedSymbolGraphic[];
	texts: XpedSymbolText[];
	properties: Record<string, string>;
	partsCount: number;
	hetero: string[];
	footprint: string;
}

// ─── Pin number expansion ────────────────────────────────────────────────────

function expandPinNumbers(value: string): string[] {
	// Handle range notation like [1:50] or [1:50:2] (start:end or start:end:step)
	const rangeMatch = value.match(/^\[(\d+)\s*:\s*(\d+)(?:\s*:\s*(\d+))?\]$/);
	if (rangeMatch) {
		const start = parseInt(rangeMatch[1], 10);
		const end = parseInt(rangeMatch[2], 10);
		const step = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 1;
		const result: string[] = [];
		for (let i = start; i <= end; i += step) {
			result.push(String(i));
		}
		return result;
	}
	return value.split(',').map((s) => s.trim());
}

// ─── Parser ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export function parseSymbolFile(content: string, fileName: string): XpedSymbol {
	const lines = content.split(/\r?\n/);
	const symbol: XpedSymbol = {
		name: '',
		version: 0,
		symbolType: 0,
		bbox: { x1: 0, y1: 0, x2: 0, y2: 0 },
		zoomLevel: 1,
		pins: [],
		graphics: [],
		texts: [],
		properties: {},
		partsCount: 1,
		hetero: [],
		footprint: '',
	};

	// Extract symbol name from filename
	const dotMatch = fileName.match(/^(.+?)(?:\.\d+)?$/);
	symbol.name = dotMatch ? dotMatch[1] : fileName;

	let currentPin: XpedSymbolPin | null = null;
	let nextLineIsPolygonClose = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		// Handle '+' continuation for polygon close marker
		if (line.startsWith('+')) {
			if (nextLineIsPolygonClose && symbol.graphics.length > 0) {
				const lastG = symbol.graphics[symbol.graphics.length - 1];
				if (lastG.type === 'polyline') {
					(lastG as any).type = 'polygon';
				}
			}
			nextLineIsPolygonClose = false;
			continue;
		}

		// Handle '|' continuation lines (skip for now — style properties)
		if (line.startsWith('|')) {
			nextLineIsPolygonClose = false;
			continue;
		}

		nextLineIsPolygonClose = false;

		const cmd = line.charAt(0);
		const rest = line.substring(1).trim();
		const parts = rest.split(/\s+/);

		switch (cmd) {
			case 'V': {
				symbol.version = parseInt(parts[0], 10) || 0;
				break;
			}
			case 'K': {
				// K UnixTimestamp SymbolName
				if (parts.length >= 2) {
					symbol.name = parts.slice(1).join('_');
				}
				break;
			}
			case 'F': {
				// F Case
				if (parts.length >= 1) {
					symbol.footprint = parts[0];
				}
				break;
			}
			case 'Y': {
				symbol.symbolType = parseInt(parts[0], 10) || 0;
				break;
			}
			case 'D': {
				// D DrawX1 DrawY1 DrawX2 DrawY2
				if (parts.length >= 4) {
					symbol.bbox.x1 = parseFloat(parts[0]);
					symbol.bbox.y1 = parseFloat(parts[1]);
					symbol.bbox.x2 = parseFloat(parts[2]);
					symbol.bbox.y2 = parseFloat(parts[3]);
				}
				break;
			}
			case 'Z': {
				symbol.zoomLevel = parseFloat(parts[0]) || 1;
				break;
			}
			case 'U': {
				// U OriginX OriginY Size Rotation Origin Visibility KEY=VALUE
				const keyVal = rest.match(/(\S+)=(.*)/);
				if (keyVal) {
					const key = keyVal[1];
					const val = keyVal[2];
					symbol.properties[key] = val;
					if (key === 'HETERO') {
						symbol.hetero = val.split(',').map((s) => s.trim());
					}
					if (key === 'PARTS') {
						symbol.partsCount = parseInt(val, 10) || 1;
					}
				}
				break;
			}
			case 'P': {
				// P ID StartX StartY EndX EndY Unknown1 Rotation Inverted
				if (parts.length >= 8) {
					currentPin = {
						id: parseInt(parts[0], 10),
						startX: parseFloat(parts[1]),
						startY: parseFloat(parts[2]),
						endX: parseFloat(parts[3]),
						endY: parseFloat(parts[4]),
						rotation: parseInt(parts[6], 10),
						inverted: parseInt(parts[7], 10),
						pinType: '',
						pinNumbers: [],
						label: '',
						labelX: 0,
						labelY: 0,
						labelSize: 0,
						labelRotation: 0,
						labelOrigin: 0,
						labelVisible: true,
						pinNumberVisible: false,
					};
					symbol.pins.push(currentPin);
				}
				break;
			}
			case 'A': {
				// A OriginX OriginY Size Rotation Origin Visibility KEY=VALUE
				const aKeyVal = rest.match(/(\S+)=(.*)/);
				if (aKeyVal && currentPin) {
					if (aKeyVal[1] === 'PINTYPE') {
						currentPin.pinType = aKeyVal[2];
					} else if (aKeyVal[1] === '#') {
						currentPin.pinNumbers = expandPinNumbers(aKeyVal[2]);
						// Visibility is parts[5]: 0=hidden, nonzero=visible
						if (parts.length > 5) {
							currentPin.pinNumberVisible = parseInt(parts[5], 10) !== 0;
						}
					}
				}
				break;
			}
			case 'L': {
				// L OriginX OriginY Size Rotation Origin ??? Visibility Unknown2 PinName
				// 9+ fields: fields 0-4 fixed, field 6=visibility, field 8+=pin name
				if (parts.length >= 9 && currentPin) {
					currentPin.labelX = parseFloat(parts[0]);
					currentPin.labelY = parseFloat(parts[1]);
					currentPin.labelSize = parseFloat(parts[2]);
					currentPin.labelRotation = parseFloat(parts[3]) || 0;
					currentPin.labelOrigin = parseInt(parts[4], 10) || 0;
					currentPin.labelVisible = parseInt(parts[6], 10) !== 0;
					currentPin.label = parts.slice(8).join(' ');
				} else if (parts.length >= 7 && currentPin) {
					currentPin.labelX = parseFloat(parts[0]);
					currentPin.labelY = parseFloat(parts[1]);
					currentPin.labelSize = parseFloat(parts[2]);
					currentPin.labelRotation = parseFloat(parts[3]) || 0;
					currentPin.labelOrigin = parseInt(parts[4], 10) || 0;
					currentPin.labelVisible = parseInt(parts[5], 10) !== 0;
					currentPin.label = parts.slice(6).join(' ');
				}
				break;
			}
			case 'l': {
				// l PointNumber StartX StartY path1X path1Y ...
				if (parts.length >= 3) {
					const pointCount = parseInt(parts[0], 10);
					const coords: number[] = [];
					for (let i = 1; i < parts.length; i++) {
						coords.push(parseFloat(parts[i]));
					}
					const points: { x: number; y: number }[] = [];
					for (let i = 0; i + 1 < coords.length; i += 2) {
						points.push({ x: coords[i], y: coords[i + 1] });
					}
					if (points.length >= 2) {
						symbol.graphics.push({ type: 'polyline', points });
						// Next line might be '+ 0' indicating polygon
						nextLineIsPolygonClose = pointCount >= 3;
					}
				}
				break;
			}
			case 'b': {
				// b StartX StartY EndX EndY
				if (parts.length >= 4) {
					symbol.graphics.push({
						type: 'rect',
						x1: parseFloat(parts[0]),
						y1: parseFloat(parts[1]),
						x2: parseFloat(parts[2]),
						y2: parseFloat(parts[3]),
					});
				}
				break;
			}
			case 'c': {
				// c PositionX PositionY Radius
				if (parts.length >= 3) {
					symbol.graphics.push({
						type: 'circle',
						cx: parseFloat(parts[0]),
						cy: parseFloat(parts[1]),
						radius: parseFloat(parts[2]),
					});
				}
				break;
			}
			case 'a': {
				// a StartX StartY CenterX CenterY EndX EndY
				if (parts.length >= 6) {
					symbol.graphics.push({
						type: 'arc',
						startX: parseFloat(parts[0]),
						startY: parseFloat(parts[1]),
						centerX: parseFloat(parts[2]),
						centerY: parseFloat(parts[3]),
						endX: parseFloat(parts[4]),
						endY: parseFloat(parts[5]),
					});
				}
				break;
			}
			case 'T': {
				// T OriginX OriginY Size Rotation Origin Text
				if (parts.length >= 6) {
					symbol.texts.push({
						x: parseFloat(parts[0]),
						y: parseFloat(parts[1]),
						size: parseFloat(parts[2]),
						rotation: parseFloat(parts[3]) || 0,
						origin: parseInt(parts[4], 10) || 0,
						text: parts.slice(5).join(' '),
					});
				}
				break;
			}
			case 'E':
				currentPin = null;
				break;
		}
	}

	return symbol;
}

/**
 * Group symbol files by name prefix. Files like "sym.1", "sym.2" belong to same symbol.
 * Returns a map of symbol name → XpedSymbol (first file found is used).
 */
export function groupSymbolFiles(files: { name: string; content: string }[]): Map<string, XpedSymbol> {
	const groups = new Map<string, XpedSymbol[]>();

	for (const file of files) {
		const baseName = file.name.replace(/\.\d+$/, '');
		if (!groups.has(baseName)) groups.set(baseName, []);
		groups.get(baseName)!.push(parseSymbolFile(file.content, file.name));
	}

	const result = new Map<string, XpedSymbol>();
	for (const [name, syms] of groups) {
		if (syms.length > 0) result.set(name, syms[0]);
	}

	return result;
}
