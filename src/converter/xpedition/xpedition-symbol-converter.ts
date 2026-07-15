/**
 * Symbol converter — EasyEDA symbol → Xpedition symbol text format.
 * Ported from convert_symbol.py
 */
import { getXpeditionPinType } from '../constants';
import { EasyedaSymbolImporter } from '../easyeda-pro/easyeda-pro-json-importer';
import type { EeSymbol, EeSymbolPin, EeSymbolSub } from '../easyeda-pro/easyeda-pro-models';
import type { SymbolPart } from './xpedition-models';
import {
	SymbolAnnotation,
	SymbolLabel,
	SymbolPin,
	SymbolPinGroup,
	SymbolPinPosition,
	SymbolShapeArc,
	SymbolShapeCircle,
	SymbolShapeLine,
	XpeditionSymbol,
} from './xpedition-models';

export class SymbolConverter {
	public static fromEeSymbol(sym: EeSymbol): SymbolConverter {
		const c = Object.create(SymbolConverter.prototype) as SymbolConverter;
		c._easyedaSymbol = sym;
		c._xpeditionSymbol = new XpeditionSymbol(sym.info.name);
		c._pinNameList = [];
		return c;
	}

	private _easyedaSymbol: EeSymbol;
	private _xpeditionSymbol: XpeditionSymbol;
	private _pinNameList: string[] = [];

	public constructor(easyedaCadData: any) {
		this._easyedaSymbol = new EasyedaSymbolImporter(easyedaCadData).getSymbol();
		this._xpeditionSymbol = new XpeditionSymbol(this._easyedaSymbol.info.name);
	}

	public convert(): XpeditionSymbol {
		const info = this._easyedaSymbol.info;
		this._xpeditionSymbol.refdes = info.prefix;
		this._xpeditionSymbol.value = info.mpn;
		this._xpeditionSymbol.mfgName = info.manufacturer;
		this._xpeditionSymbol.mpn = info.mpn;
		this._xpeditionSymbol.devName = info.name;
		this._xpeditionSymbol.name = info.name;

		if (this._easyedaSymbol.subs.length > 0) {
			for (let idx = 0; idx < this._easyedaSymbol.subs.length; idx++) {
				const subpart = this._easyedaSymbol.subs[idx];
				const partName = `${info.name}.${idx + 1}`;
				this._pinNameList = [];
				this._convertPinGroupsForSubpart(subpart, partName);
				this._convertShapesForSubpart(subpart, partName);
			}
		}

		return this._xpeditionSymbol;
	}

	public saveToFiles(): Record<string, string> {
		const result: Record<string, string> = {};
		const sym = this._xpeditionSymbol;

		const generateSymbolString = (part: SymbolPart, partName?: string): string => {
			let s = 'V 50\n';
			s += `K ${Math.floor(Math.random() * 9000000000) + 1000000000} ${sym.name}\n`;
			s += 'Y 1\n';
			s += 'Z 0\n';
			s += 'i 0\n';
			s += `U 0 0 10 0 5 0 ${sym.name}\n`;
			s += 'U 0 0 5 0 5 0 Copyright=EasyEDA to Xpedition\n';
			if (sym.mfgName) s += `U 0 0 5 0 5 0 Mfr_name=${sym.mfgName}\n`;
			if (sym.mpn) s += `U 0 0 5 0 5 0 Manufacturer_Part_Number=${sym.mpn}\n`;
			s += part.toString();
			s += `U 20 40 8 0 5 3 REFDES=${sym.refdes.toUpperCase()}\n`;
			s += 'U 20 30 8 0 5 0 TYPE=Type?\n';
			s += `U 20 30 8 0 5 0 VALUE=${sym.value}\n`;

			if (partName) {
				const hetero = Array.from(sym.parts.keys())
					.map((n) => `(${n.replace(/\./g, '_')})`)
					.join(',');
				s += `U 20 20 8 0 5 0 HETERO=${hetero}\n`;
			}

			s += 'E\n';
			return s;
		};

		if (sym.parts.size > 1) {
			const sortedKeys = Array.from(sym.parts.keys()).sort();
			for (const partName of sortedKeys) {
				const part = sym.parts.get(partName)!;
				result[partName] = generateSymbolString(part, partName);
			}
		} else if (sym.parts.size === 1) {
			const [partName, part] = Array.from(sym.parts.entries())[0];
			result[partName] = generateSymbolString(part);
		}

		return result;
	}

	private _calcPinPosition(pin: EeSymbolPin): { points: [number, number, number, number]; side: number } {
		const path = pin.pinPath.path;
		let side = 0;
		const rotation = pin.settings.rotation;

		let x1: number;
		let y1: number;
		let x2: number;
		let y2: number;
		let pathList: string[];

		if (path.includes('h')) {
			if (path.includes(',')) {
				pathList = path.replace('M', '').replace('h', ',').split(',');
			} else {
				pathList = path.replace('M', '').replace('h', ' ').split(/\s+/).filter(Boolean);
			}
			x1 = parseFloat(pathList[0]);
			y1 = parseFloat(pathList[1]);
			x2 = parseFloat(pathList[0]) + parseFloat(pathList[2]);
			y2 = parseFloat(pathList[1]);

			if (x1 > x2) {
				side = 3; // right
				if (rotation === 90) {
					x2 = x1;
					y2 = y1 - parseFloat(pathList[2]);
					side = 0;
				} else if (rotation === 270) {
					x2 = x1;
					y2 = y1 + parseFloat(pathList[2]);
					side = 1;
				}
			} else {
				side = 2; // left
				if (rotation === 90) {
					x2 = x1;
					y2 = y1 + parseFloat(pathList[2]);
					side = 0;
				} else if (rotation === 270) {
					x2 = x1;
					y2 = y1 - parseFloat(pathList[2]);
					side = 1;
				}
			}
		} else {
			if (path.includes(',')) {
				pathList = path.replace('M', '').replace('v', ',').split(',');
			} else {
				pathList = path.replace('M', '').replace('v', ' ').split(/\s+/).filter(Boolean);
			}
			x1 = parseFloat(pathList[0]);
			y1 = parseFloat(pathList[1]);
			x2 = parseFloat(pathList[0]);
			y2 = parseFloat(pathList[1]) + parseFloat(pathList[2]);

			if (y1 > y2) {
				side = 1; // bottom
				if (rotation === 90) {
					x2 = x1 - parseFloat(pathList[2]);
					y2 = y1;
					side = 2;
				} else if (rotation === 180) {
					side = 0;
				} else if (rotation === 270) {
					x2 = x1 + parseFloat(pathList[2]);
					y2 = y1;
					side = 3;
				}
			} else {
				side = 0; // top
				if (rotation === 90) {
					x2 = x1 + parseFloat(pathList[2]);
					y2 = y1;
					side = 3;
				} else if (rotation === 180) {
					side = 1;
				} else if (rotation === 270) {
					x2 = x1 - parseFloat(pathList[2]);
					y2 = y1;
					side = 2;
				}
			}
		}

		// endX, endY, startX, startY
		return { points: [x2, y2, x1, y1], side };
	}

	private _calcRotationFromAngle(angle: number): number {
		if (angle === 90) return 1;
		if (angle === 180) return 2;
		if (angle === 270) return 3;
		return 0;
	}

	private _getAnchorFromSide(side: number): [number, number] {
		if (side === 0) return [2, 3];
		if (side === 1) return [8, 9];
		if (side === 2) return [2, 3];
		return [8, 9]; // side === 3
	}

	private _cubicBezierPoint(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] {
		const mt = 1 - t;
		const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
		const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
		return [x, y];
	}

	private _determinePinName(pin: EeSymbolPin): string {
		let pinName = pin.name.text;
		if (this._pinNameList.includes(pinName)) {
			let idx = 1;
			while (this._pinNameList.includes(`${pinName}_${idx}`)) idx++;
			pinName = `${pinName}_${idx}`;
		}
		this._pinNameList.push(pinName);
		return pinName;
	}

	private _convertPinGroupsForSubpart(subpart: EeSymbolSub, partName: string): void {
		const bbox = subpart.bbox;
		let index = 1;

		for (const pin of subpart.pins) {
			const { points, side } = this._calcPinPosition(pin);
			const symPos = new SymbolPinPosition(
				Math.round(points[2] - bbox.x),
				Math.round(bbox.y - points[3]),
				Math.round(points[0] - bbox.x),
				Math.round(bbox.y - points[1]),
			);
			const xpedPin = new SymbolPin(index, symPos, 0, side);

			const anchors = this._getAnchorFromSide(side);
			const labelRotation = this._calcRotationFromAngle(pin.name.rotation);
			const xpedLabel = new SymbolLabel(
				this._determinePinName(pin),
				Math.round(points[0] - bbox.x),
				Math.round(bbox.y - points[1]),
				labelRotation,
				anchors[0],
			);

			const numRotation = this._calcRotationFromAngle(pin.number.rotation);
			const xpedAnnotation = new SymbolAnnotation(
				`#=${pin.number.text}`,
				Math.round(points[2] - bbox.x),
				Math.round(bbox.y - points[3]),
				numRotation,
				anchors[1],
			);

			const pinGroup = new SymbolPinGroup(xpedPin, xpedLabel, [xpedAnnotation]);

			const pinType = getXpeditionPinType(pin.settings.type);
			if (pinType !== null) {
				pinGroup.addAnnotation(new SymbolAnnotation(`PINTYPE=${pinType}`, 0, 0, 0, 0, 0));
			}

			this._xpeditionSymbol.addPinGroup(pinGroup, partName);
			index++;
		}
	}

	private _convertShapesForSubpart(subpart: EeSymbolSub, partName: string): void {
		const bbox = subpart.bbox;
		this._xpeditionSymbol.setBbox(0, Math.round(bbox.width), Math.round(bbox.height), 0, partName);

		// Rectangles → 4 lines each
		for (const rect of subpart.rectangles) {
			const x = Math.round(rect.posX - bbox.x);
			const yBottom = Math.round(bbox.y - (rect.posY + rect.height));
			const xRight = Math.round(rect.posX + rect.width - bbox.x);
			const yTop = Math.round(bbox.y - rect.posY);

			this._xpeditionSymbol.addShape(new SymbolShapeLine(x, yBottom, xRight, yBottom), partName);
			this._xpeditionSymbol.addShape(new SymbolShapeLine(x, yTop, xRight, yTop), partName);
			this._xpeditionSymbol.addShape(new SymbolShapeLine(x, yBottom, x, yTop), partName);
			this._xpeditionSymbol.addShape(new SymbolShapeLine(xRight, yBottom, xRight, yTop), partName);
		}

		// Circles
		for (const circle of subpart.circles) {
			this._xpeditionSymbol.addShape(
				new SymbolShapeCircle(Math.round(circle.centerX - bbox.x), Math.round(bbox.y - circle.centerY), Math.round(circle.radius)),
				partName,
			);
		}

		// Polylines → line segments
		for (const polyline of subpart.polylines) {
			const pts = polyline.points.split(' ');
			for (let i = 0; i < pts.length - 3; i += 2) {
				const x1 = Math.round(parseFloat(pts[i]) - bbox.x);
				const y1 = Math.round(bbox.y - parseFloat(pts[i + 1]));
				const x2 = Math.round(parseFloat(pts[i + 2]) - bbox.x);
				const y2 = Math.round(bbox.y - parseFloat(pts[i + 3]));
				this._xpeditionSymbol.addShape(new SymbolShapeLine(x1, y1, x2, y2), partName);
			}
		}

		// Lines
		for (const line of subpart.lines) {
			this._xpeditionSymbol.addShape(
				new SymbolShapeLine(
					Math.round(line.x1 - bbox.x),
					Math.round(bbox.y - line.y1),
					Math.round(line.x2 - bbox.x),
					Math.round(bbox.y - line.y2),
				),
				partName,
			);
		}

		// Arcs → cubic bezier midpoint approximation
		for (const arc of subpart.arcs) {
			const pts = arc.path.replace('M', '').replace('C', '').split(/\s+/).filter(Boolean);
			if (pts.length >= 8) {
				const startPt: [number, number] = [Math.round(parseFloat(pts[0]) - bbox.x), Math.round(bbox.y - parseFloat(pts[1]))];
				const ctrl1: [number, number] = [Math.round(parseFloat(pts[2]) - bbox.x), Math.round(bbox.y - parseFloat(pts[3]))];
				const ctrl2: [number, number] = [Math.round(parseFloat(pts[4]) - bbox.x), Math.round(bbox.y - parseFloat(pts[5]))];
				const endPt: [number, number] = [Math.round(parseFloat(pts[6]) - bbox.x), Math.round(bbox.y - parseFloat(pts[7]))];
				const midPt = this._cubicBezierPoint(startPt, ctrl1, ctrl2, endPt, 0.5);

				this._xpeditionSymbol.addShape(
					new SymbolShapeArc(startPt[0], startPt[1], Math.round(midPt[0]), Math.round(midPt[1]), endPt[0], endPt[1]),
					partName,
				);
			}
		}

		// Ellipses → circles (using radiusX)
		for (const ellipse of subpart.ellipses) {
			this._xpeditionSymbol.addShape(
				new SymbolShapeCircle(Math.round(ellipse.centerX - bbox.x), Math.round(bbox.y - ellipse.centerY), Math.round(ellipse.radiusX)),
				partName,
			);
		}
	}
}
