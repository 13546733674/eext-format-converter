/**
 * Footprint converter — EasyEDA footprint → Xpedition Cell/Pads HKP.
 * Ported from convert_footprint.py
 */
import { applyVerticalMirror, eeUnitToTh, mapEasyedaLayerToXpedition } from '../constants';
import { EasyedaFootprintImporter } from '../easyeda-pro/easyeda-pro-json-importer';
import type { EeFootprint } from '../easyeda-pro/easyeda-pro-models';
import {
	AssemblyOutline,
	CirclePath,
	OblongPad,
	PinSMDPadStack,
	PinThroughPadStack,
	PlacementOutline,
	PolygonPad,
	PolylinePath,
	PolylineShape,
	RectanglePad,
	RoundHole,
	RoundPad,
	SilkscreenOutline,
	SlotHole,
	SolderMask,
	SolderPaste,
	XpeditionCell,
	XpeditionPin,
} from './xpedition-models';

export class FootprintConverter {
	public static fromEeFootprint(fp: EeFootprint): FootprintConverter {
		const c = Object.create(FootprintConverter.prototype) as FootprintConverter;
		c._easyedaFootprint = fp;
		c._cell = new XpeditionCell(fp.info.name);
		c._pads = new Map();
		c._padstacks = new Map();
		return c;
	}

	private _easyedaFootprint: EeFootprint;
	private _pads = new Map<string, any>();
	private _padstacks = new Map<string, any>();
	private _cell: XpeditionCell;

	public constructor(easyedaCpCadData: any) {
		this._easyedaFootprint = new EasyedaFootprintImporter(easyedaCpCadData).getFootprint();
		this._cell = new XpeditionCell(this._easyedaFootprint.info.name);
	}

	public convert(): void {
		this._convertPadstacks();
		this._convertShapes();
	}

	public savePadstacksToString(): string {
		let s = '.FILETYPE PADSTACK_LIBRARY\n.VERSION "VB99.0"\n.SCHEMA_VERSION 13\n.CREATOR "EasyEDA to Xpedition Converter"\n\n.UNITS TH\n\n';
		for (const pad of this._pads.values()) s += pad.toString() + '\n';
		for (const padstack of this._padstacks.values()) s += padstack.toString() + '\n';
		return s;
	}

	public saveCellToString(): string {
		let s = '.FILETYPE CELL_LIBRARY\n.VERSION "1.01.01"\n.CREATOR "EasyEDA to Xpedition Converter"\n\n.UNITS TH\n\n';
		s += `.PACKAGE_CELL "${this._cell.name}"\n`;
		s += ` ..NUMBER_LAYERS ${this._cell.numberLayers}\n`;
		s += ` ..PACKAGE_GROUP ${this._cell.packageGroup}\n`;
		s += ` ..MOUNT_TYPE ${this._cell.mountType}\n`;

		for (const pin of this._cell.pins) s += pin.toString();
		for (const o of this._cell.silkscreenOutlines) s += o.toString();
		for (const o of this._cell.assemblyOutlines) s += o.toString();
		for (const m of this._cell.solderMasks) s += m.toString();
		for (const p of this._cell.solderPastes) s += p.toString();
		for (const o of this._cell.placementOutlines) s += o.toString();
		for (const t of this._cell.texts) s += t + '\n';

		return s;
	}

	private _getEasyedaLayerName(layerId: number | string): string {
		const id = Number(layerId);
		for (const layer of this._easyedaFootprint.info.layers) {
			if (layer.layerId === id) return layer.layerName;
		}
		return String(layerId);
	}

	// eslint-disable-next-line complexity
	private _convertPadstacks(): void {
		const bbox = this._easyedaFootprint.bbox;

		for (const pad of this._easyedaFootprint.pads) {
			const width = eeUnitToTh(pad.width);
			const largeWidth = width + 8;
			const height = eeUnitToTh(pad.height);
			const largeHeight = height + 8;
			const padName = `${pad.shape}_${width}x${height}`;

			let xpedPad: any;
			let largePad: any;

			const shapeUpper = pad.shape.toUpperCase();
			if (shapeUpper === 'RECT') {
				xpedPad = new RectanglePad(padName, width, height);
				largePad = new RectanglePad(`${padName}L`, largeWidth, largeHeight);
			} else if (shapeUpper === 'ROUND') {
				xpedPad = new RoundPad(padName, width);
				largePad = new RoundPad(`${padName}L`, largeWidth);
			} else if (shapeUpper === 'OVAL' || shapeUpper === 'ELLIPSE') {
				xpedPad = new OblongPad(padName, width, height);
				largePad = new OblongPad(`${padName}L`, largeWidth, largeHeight);
			} else if (shapeUpper === 'POLYGON') {
				const points: [number, number][] = [];
				const pts = (pad.points ?? '').replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(Number);
				for (let i = 0; i < pts.length; i += 2) {
					points.push([eeUnitToTh(pts[i]), eeUnitToTh(pts[i + 1])]);
				}
				xpedPad = new PolygonPad(padName, points);
				const largePoints = points.map(([px, py]) => [px * (largeWidth / width), py * (largeHeight / height)] as [number, number]);
				largePad = new PolygonPad(`${padName}L`, largePoints);
			} else {
				throw new Error(`Unsupported pad shape: ${pad.shape}`);
			}

			if (!this._pads.has(padName)) {
				this._pads.set(padName, xpedPad);
				this._pads.set(`${padName}L`, largePad);
			}

			// Holes & padstacks
			const holePoints = pad.holePoint ?? '';
			let xpedPadstack: any;

			if (pad.holeRadius > 0 || holePoints) {
				let xpedHole: any;
				if (holePoints) {
					const hx = pad.centerX;
					const hy = pad.centerY;
					const normPts: [number, number][] = [];
					const rawPts = holePoints.replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(Number);
					for (let i = 0; i < rawPts.length; i += 2) {
						normPts.push([eeUnitToTh(rawPts[i] - hx), eeUnitToTh(rawPts[i + 1] - hy)]);
					}

					const holeWidth = Math.max(...normPts.map((p) => p[0])) - Math.min(...normPts.map((p) => p[0]));
					const holeHeight = Math.max(...normPts.map((p) => p[1])) - Math.min(...normPts.map((p) => p[1]));
					const holeLength = Math.round(Math.max(holeWidth, holeHeight) * 10000) / 10000;
					const holeRadius = Math.round(eeUnitToTh(pad.holeRadius) * 10000) / 10000;

					let slotWidth: number;
					let slotHeight: number;
					if (holeHeight > holeWidth) {
						slotWidth = holeRadius * 2;
						slotHeight = holeLength + holeRadius * 2;
					} else {
						slotWidth = holeLength + holeRadius * 2;
						slotHeight = holeRadius * 2;
					}

					xpedHole = new SlotHole(`HOLE_${holeRadius * 2}x${holeLength}`, slotWidth, slotHeight, pad.isPlated);
				} else {
					xpedHole = new RoundHole(
						`HOLE_${Math.round(eeUnitToTh(pad.holeRadius * 2) * 10000) / 10000}`,
						eeUnitToTh(pad.holeRadius * 2),
						pad.isPlated,
					);
				}

				const padstackName = `${padName}_TH`;
				xpedPadstack = new PinThroughPadStack(padstackName);
				xpedPadstack.setPads({
					topPad: xpedPad,
					bottomPad: xpedPad,
					internalPad: xpedPad,
					topSoldermaskPad: largePad,
					bottomSoldermaskPad: largePad,
					hole: xpedHole,
				});

				if (!this._pads.has(xpedHole.name)) {
					this._pads.set(xpedHole.name, xpedHole);
				}
				if (!this._padstacks.has(padstackName)) {
					this._padstacks.set(padstackName, xpedPadstack);
				}
			} else {
				const padstackName = `${padName}_SMD`;
				xpedPadstack = new PinSMDPadStack(padstackName);
				xpedPadstack.setPads({
					topPad: xpedPad,
					bottomPad: xpedPad,
					topSolderpastePad: xpedPad,
					bottomSolderpastePad: xpedPad,
					topSoldermaskPad: largePad,
					bottomSoldermaskPad: largePad,
				});
				if (!this._padstacks.has(padstackName)) {
					this._padstacks.set(padstackName, xpedPadstack);
				}
			}

			// Pin position
			const x = eeUnitToTh(pad.centerX) - eeUnitToTh(bbox.x);
			let y = eeUnitToTh(pad.centerY) - eeUnitToTh(bbox.y);
			y = applyVerticalMirror(y);
			this._cell.addPin(new XpeditionPin(pad.number, x, y, xpedPadstack, pad.rotation));
		}

		// Handle standalone holes
		for (const hole of this._easyedaFootprint.holes) {
			const holeName = `HOLE_${Math.round(eeUnitToTh(hole.radius * 2) * 10000) / 10000}`;
			let xpedHole: any;
			if (!this._pads.has(holeName)) {
				xpedHole = new RoundHole(holeName, eeUnitToTh(hole.radius * 2), false);
				this._pads.set(holeName, xpedHole);
			} else {
				xpedHole = this._pads.get(holeName);
			}

			const padName = `ROUND_${Math.round(eeUnitToTh(hole.radius * 2) * 10000) / 10000}`;
			let xpedPad: any;
			if (!this._pads.has(padName)) {
				xpedPad = new RoundPad(padName, eeUnitToTh(hole.radius * 2));
				this._pads.set(padName, xpedPad);
			} else {
				xpedPad = this._pads.get(padName);
			}

			const padstackName = `${holeName}_TH`;
			let xpedPadstack: any;
			if (!this._padstacks.has(padstackName)) {
				xpedPadstack = new PinThroughPadStack(padstackName);
				xpedPadstack.setPads({
					topPad: xpedPad,
					bottomPad: xpedPad,
					internalPad: xpedPad,
					hole: xpedHole,
				});
				this._padstacks.set(padstackName, xpedPadstack);
			} else {
				xpedPadstack = this._padstacks.get(padstackName);
			}

			const pinNumber = this._cell.getPinCount() + 1;
			const x = eeUnitToTh(hole.centerX) - eeUnitToTh(bbox.x);
			let y = eeUnitToTh(hole.centerY) - eeUnitToTh(bbox.y);
			y = applyVerticalMirror(y);
			this._cell.addPin(new XpeditionPin(pinNumber, x, y, xpedPadstack, 0));
		}

		// Determine mount type
		const keys = Array.from(this._padstacks.keys());
		if (keys.every((k) => k.includes('SMD'))) this._cell.mountType = 'SURFACE';
		else if (keys.every((k) => k.includes('TH'))) this._cell.mountType = 'THROUGH';
		else this._cell.mountType = 'MIXED';
	}

	private _addShape(shape: any, layerName: string): void {
		const xpLayer = mapEasyedaLayerToXpedition(layerName);
		if (xpLayer.includes('UNKNOWN_LAYER')) return;

		if (xpLayer === 'SILKSCREEN_OUTLINE') {
			const side = layerName.includes('Top') ? 'MNT_SIDE' : 'OPP_SIDE';
			this._cell.addSilkscreenOutline(new SilkscreenOutline(shape, side));
		} else if (xpLayer === 'ASSEMBLY_OUTLINE') {
			this._cell.addAssemblyOutline(new AssemblyOutline(shape));
		} else if (xpLayer === 'SOLDER_PASTE') {
			const side = layerName.includes('Top') ? 'MNT_SIDE' : 'OPP_SIDE';
			this._cell.addSolderPaste(new SolderPaste(shape, side));
		} else if (xpLayer === 'SOLDER_MASK') {
			const side = layerName.includes('Top') ? 'MNT_SIDE' : 'OPP_SIDE';
			this._cell.addSolderMask(new SolderMask(shape, side));
		}
	}

	private _convertShapes(): void {
		const bbox = this._easyedaFootprint.bbox;

		// Rectangles
		for (const rect of this._easyedaFootprint.rectangles) {
			const layerName = this._getEasyedaLayerName(rect.layerId);
			const cx = eeUnitToTh(rect.x) - eeUnitToTh(bbox.x);
			let cy = eeUnitToTh(rect.y) - eeUnitToTh(bbox.y);
			cy = applyVerticalMirror(cy);
			const w = eeUnitToTh(rect.width);
			const h = eeUnitToTh(rect.height);
			const points: [number, number][] = [
				[cx - w / 2, cy + h / 2],
				[cx + w / 2, cy + h / 2],
				[cx + w / 2, cy - h / 2],
				[cx - w / 2, cy - h / 2],
			];
			this._addShape(new PolylineShape(points), layerName);
		}

		// Circles
		for (const circle of this._easyedaFootprint.circles) {
			const layerName = this._getEasyedaLayerName(circle.layerId);
			const cx = eeUnitToTh(circle.cx) - eeUnitToTh(bbox.x);
			let cy = eeUnitToTh(circle.cy) - eeUnitToTh(bbox.y);
			cy = applyVerticalMirror(cy);
			const r = eeUnitToTh(circle.radius);
			const w = eeUnitToTh(circle.strokeWidth);
			this._addShape(new CirclePath(cx, cy, r, w), layerName);
		}

		// Tracks
		for (const track of this._easyedaFootprint.tracks) {
			const layerName = this._getEasyedaLayerName(track.layerId);
			const points: [number, number][] = [];
			const pts = (track.points ?? '').replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(Number);
			for (let i = 0; i < pts.length; i += 2) {
				const px = eeUnitToTh(pts[i]) - eeUnitToTh(bbox.x);
				let py = eeUnitToTh(pts[i + 1]) - eeUnitToTh(bbox.y);
				py = applyVerticalMirror(py);
				points.push([px, py]);
			}
			const w = eeUnitToTh(track.strokeWidth);
			this._addShape(new PolylinePath(points, w), layerName);
		}

		// Solid regions
		for (const region of this._easyedaFootprint.solidRegions) {
			const layerName = this._getEasyedaLayerName(region.layerId);
			const points = this._parseSvgPoints(region.points, bbox);
			this._addShape(new PolylineShape(points), layerName);
		}

		// Copper areas
		for (const area of this._easyedaFootprint.copperAreas) {
			const layerName = this._getEasyedaLayerName(area.layerId);
			const points = this._parseSvgPoints(area.points, bbox);
			this._addShape(new PolylineShape(points), layerName);
		}

		// Placement outline
		const growSize = 10;
		const bw = eeUnitToTh(bbox.width / 2);
		const bh = eeUnitToTh(bbox.height / 2);
		const placementPoints: [number, number][] = [
			[-bw - growSize, applyVerticalMirror(-bh - growSize)],
			[bw + growSize, applyVerticalMirror(-bh - growSize)],
			[bw + growSize, applyVerticalMirror(bh + growSize)],
			[-bw - growSize, applyVerticalMirror(bh + growSize)],
		];
		this._cell.addPlacementOutline(new PlacementOutline(new PolylineShape(placementPoints, false)));
	}

	private _parseSvgPoints(pointString: string, bbox: any): [number, number][] {
		const points: [number, number][] = [];
		if (!pointString) return points;
		const cleaned = pointString.replace(/[MLHVCSQTAZmlhvcsqtaz]/g, ' ');
		const nums = cleaned.replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(Number);
		for (let i = 0; i < nums.length; i += 2) {
			const px = eeUnitToTh(nums[i]) - eeUnitToTh(bbox.x);
			let py = eeUnitToTh(nums[i + 1]) - eeUnitToTh(bbox.y);
			py = applyVerticalMirror(py);
			points.push([px, py]);
		}
		return points;
	}
}
