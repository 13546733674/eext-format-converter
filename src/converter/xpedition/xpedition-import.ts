/**
 * Orchestrate the full import pipeline:
 *   ZIP → parse PSK/CEL/PDB/symbol files → convert to Pro V3 → .elibz2
 */
import JSZip from 'jszip';

import { generateFootprintSource } from '../easyeda-pro/easyeda-pro-footprint-writer';
import { generateSymbolDocument } from '../easyeda-pro/easyeda-pro-symbol-writer';
import type { ConverterImporter } from '../types';
import { parseCellFile, parsePadsFile } from './hkp-parser';
import type { XpedCell, XpedHole, XpedPad, XpedPadstack } from './hkp-parser';
import { parsePartsFile } from './parts-parser';
import type { XpedPart } from './parts-parser';
import { parseSymbolFile } from './symbol-text-parser';
import type { XpedSymbol } from './symbol-text-parser';

// ─── Result types ───────────────────────────────────────────────────────────

export interface ImportItemResult {
	name: string;
	status: 'ok' | 'warn' | 'fail' | 'skip';
	message?: string;
}

export interface ImportFootprintItem extends ImportItemResult {
	uuid: string;
	documentSource: string;
}

export interface ImportSymbolItem extends ImportItemResult {
	uuid: string;
	documentSource: string;
}

export interface ImportDeviceItem extends ImportItemResult {
	uuid: string;
	symbolUuid: string;
	footprintUuid: string;
}

export interface ImportResult {
	devices: ImportItemResult[];
	footprints: ImportItemResult[];
	symbols: ImportItemResult[];
	blob: Blob;
	// Detailed items for direct import
	footprintItems?: ImportFootprintItem[];
	symbolItems?: ImportSymbolItem[];
	deviceItems?: ImportDeviceItem[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function genUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

/** Check if content looks like a valid Xpedition symbol file (starts with V line). */
function looksLikeSymbolFile(content: string): boolean {
	const firstLine = content.trim().split(/\r?\n/)[0]?.trim() || '';
	return /^V\s+\d+/.test(firstLine);
}

/** Track used names and generate unique names on collision. */
class UniqueNameTracker {
	private used = new Map<string, number>();

	public resolve(preferred: string): string {
		if (!this.used.has(preferred)) {
			this.used.set(preferred, 1);
			return preferred;
		}
		let idx = this.used.get(preferred)! + 1;
		let candidate: string;
		do {
			candidate = `${preferred}_${idx}`;
			idx++;
		} while (this.used.has(candidate));
		this.used.set(candidate, 1);
		this.used.set(preferred, idx);
		return candidate;
	}
}

// ─── Main import function ───────────────────────────────────────────────────

// eslint-disable-next-line complexity
export async function importXpeditionZip(
	zipFile: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	const result: ImportResult = {
		devices: [],
		footprints: [],
		symbols: [],
		blob: new Blob(),
		footprintItems: [],
		symbolItems: [],
		deviceItems: [],
	};

	// 1. Unzip
	let zipInput: any = zipFile;
	if (typeof Blob !== 'undefined' && zipFile instanceof Blob && typeof (zipFile as Blob).arrayBuffer === 'function') {
		zipInput = await (zipFile as Blob).arrayBuffer();
	}
	const zip = await JSZip.loadAsync(zipInput);

	// 2. Scan files by type
	const pskFiles: { name: string; content: string }[] = [];
	const celFiles: { name: string; content: string }[] = [];
	const pdbFiles: { name: string; content: string }[] = [];
	const symbolFiles: { name: string; content: string }[] = [];

	const fileEntries: string[] = [];
	zip.forEach((path) => {
		fileEntries.push(path);
	});

	for (const path of fileEntries) {
		const zipEntry = zip.file(path);
		if (!zipEntry) continue; // skip directories

		const lower = path.toLowerCase();

		// Skip clearly non-library files
		if (
			lower.endsWith('.json') ||
			lower.endsWith('.txt') ||
			lower.endsWith('.md') ||
			lower.endsWith('.xml') ||
			lower.endsWith('.csv') ||
			lower.endsWith('.log') ||
			lower.endsWith('.elibu') ||
			lower.endsWith('.elibz2') ||
			lower.endsWith('.zip')
		) {
			continue;
		}

		const content = await zipEntry.async('string');

		if (lower.endsWith('.psk.hkp')) {
			pskFiles.push({ name: path, content });
		} else if (lower.endsWith('.cel.hkp')) {
			celFiles.push({ name: path, content });
		} else if (lower.endsWith('.pdb.hkp')) {
			pdbFiles.push({ name: path, content });
		} else if (/\.\d+$/.test(lower) && looksLikeSymbolFile(content)) {
			// Symbol files have numeric suffixes like sym.1, sym.2
			// Validate content starts with "V <number>" before treating as symbol
			const fileName = path.split('/').pop() || path;
			symbolFiles.push({ name: fileName.replace(/\.\d+$/, ''), content });
		}
	}

	// 3. Parse all padstack files → global maps
	const pads = new Map<string, XpedPad>();
	const holes = new Map<string, XpedHole>();
	const padstacks = new Map<string, XpedPadstack>();

	for (const f of pskFiles) {
		try {
			const parsed = parsePadsFile(f.content);
			for (const p of parsed.pads) pads.set(p.name, p);
			for (const h of parsed.holes) holes.set(h.name, h);
			for (const ps of parsed.padstacks) padstacks.set(ps.name, ps);
		} catch (e) {
			console.warn(`[Import] Failed to parse padstack file ${f.name}:`, e);
		}
	}

	// 4. Parse all cell files — handle name collisions, skip empty cells
	const cellList: XpedCell[] = [];
	const cellNameTracker = new UniqueNameTracker();

	for (const f of celFiles) {
		try {
			const cells = parseCellFile(f.content);
			for (const cell of cells) {
				// Skip cells with no pins — they have no real content
				if (cell.pins.length === 0) {
					console.warn(`[Import] Skipping empty cell (no pins): ${cell.name}`);
					result.footprints.push({ name: cell.name, status: 'skip', message: '无引脚，跳过' });
					continue;
				}
				const uniqueName = cellNameTracker.resolve(cell.name);
				if (uniqueName !== cell.name) {
					console.warn(`[Import] Cell name collision: "${cell.name}" → "${uniqueName}"`);
				}
				cell.name = uniqueName;
				cellList.push(cell);
			}
		} catch (e) {
			console.warn(`[Import] Failed to parse cell file ${f.name}:`, e);
		}
	}

	// 5. Parse symbol files → group by name, validate content
	const symbolList: XpedSymbol[] = [];
	const symbolNameTracker = new UniqueNameTracker();
	const symbolNameGroups = new Map<string, { name: string; content: string }[]>();

	for (const f of symbolFiles) {
		if (!symbolNameGroups.has(f.name)) symbolNameGroups.set(f.name, []);
		symbolNameGroups.get(f.name)!.push(f);
	}

	for (const [name, files] of symbolNameGroups) {
		try {
			// Parse ALL files for this symbol group to handle multi-part correctly
			const parsedSymbols: XpedSymbol[] = [];
			for (const file of files) {
				try {
					const sym = parseSymbolFile(file.content, name);
					parsedSymbols.push(sym);
				} catch (e) {
					console.warn(`[Import] Failed to parse symbol file ${file.name}:`, e);
				}
			}

			if (parsedSymbols.length === 0) continue;

			// Merge multi-part info: use the first parsed symbol as base,
			// but collect pins and graphics from all parts
			const base = parsedSymbols[0];

			if (parsedSymbols.length > 1) {
				// Collect all unique pins across parts
				const allPins = new Map<string, (typeof base.pins)[0]>();
				for (const sym of parsedSymbols) {
					for (const pin of sym.pins) {
						const key = `${pin.endX},${pin.endY},${pin.startX},${pin.startY}`;
						if (!allPins.has(key)) {
							allPins.set(key, pin);
						} else {
							// Merge pin numbers from different parts
							const existing = allPins.get(key)!;
							for (const num of pin.pinNumbers) {
								if (!existing.pinNumbers.includes(num)) {
									existing.pinNumbers.push(num);
								}
							}
						}
					}
				}
				base.pins = Array.from(allPins.values());

				// Merge graphics
				const allGraphics = [...base.graphics];
				const graphicKeys = new Set(base.graphics.map((g) => `${g.x1},${g.y1},${g.x2},${g.y2}`));
				for (const sym of parsedSymbols.slice(1)) {
					for (const g of sym.graphics) {
						const key = `${g.x1},${g.y1},${g.x2},${g.y2}`;
						if (!graphicKeys.has(key)) {
							allGraphics.push(g);
							graphicKeys.add(key);
						}
					}
				}
				base.graphics = allGraphics;
			}

			// Skip symbols with no pins AND no graphics — empty content
			if (base.pins.length === 0 && base.graphics.length === 0) {
				console.warn(`[Import] Skipping empty symbol (no pins, no graphics): ${name}`);
				result.symbols.push({ name, status: 'skip', message: '无引脚且无图形，跳过' });
				continue;
			}

			// Resolve name collisions
			const uniqueName = symbolNameTracker.resolve(name);
			if (uniqueName !== name) {
				console.warn(`[Import] Symbol name collision: "${name}" → "${uniqueName}"`);
				base.name = uniqueName;
			}

			symbolList.push(base);
		} catch (e) {
			console.warn(`[Import] Failed to parse symbol ${name}:`, e);
		}
	}

	// 6. Parse parts files — deduplicate by name/number
	const allParts: XpedPart[] = [];
	const partNameTracker = new UniqueNameTracker();
	const seenPartNumbers = new Set<string>();

	for (const f of pdbFiles) {
		try {
			const parts = parsePartsFile(f.content);
			for (const part of parts) {
				// Skip parts with no symbol reference AND no cell reference
				if (!part.symbolRef && !part.topCell) {
					console.warn(`[Import] Skipping part with no symbol/cell reference: ${part.name || part.number}`);
					result.devices.push({ name: part.name || part.number, status: 'skip', message: '无符号和封装引用，跳过' });
					continue;
				}

				// Deduplicate by number
				const partKey = part.number || part.name;
				if (partKey && seenPartNumbers.has(partKey)) {
					const uniqueKey = partNameTracker.resolve(partKey + '_dup');
					part.number = uniqueKey;
					part.name = part.name || uniqueKey;
				} else if (partKey) {
					seenPartNumbers.add(partKey);
					partNameTracker.resolve(partKey);
				}

				allParts.push(part);
			}
		} catch (e) {
			console.warn(`[Import] Failed to parse parts file ${f.name}:`, e);
		}
	}

	// 7. Generate output
	const libLines: string[] = [];
	const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };

	let totalItems = cellList.length + symbolList.length + allParts.length;
	let doneItems = 0;

	const footprintUuidMap = new Map<string, string>();
	const symbolUuidMap = new Map<string, string>();

	// 7a. Generate footprint document sources
	for (const cell of cellList) {
		if (onProgress) onProgress(doneItems, totalItems, cell.name);
		try {
			const fpUuid = genUUID();
			const source = generateFootprintSource(cell, padstacks, pads, holes, fpUuid);
			libLines.push(source);

			footprintUuidMap.set(cell.name, fpUuid);
			deviceData.footprints[fpUuid] = {
				uuid: fpUuid,
				ticket: 1,
				updateTime: Date.now(),
				createTime: Date.now(),
				title: cell.name.toLowerCase(),
				display_title: cell.name,
				docType: 4,
			};

			result.footprints.push({ name: cell.name, status: 'ok' });
			result.footprintItems!.push({ name: cell.name, status: 'ok', uuid: fpUuid, documentSource: source });
		} catch (e) {
			result.footprints.push({ name: cell.name, status: 'fail', message: String(e) });
		}
		doneItems++;
	}

	// 7b. Generate symbol document sources
	for (const symbol of symbolList) {
		const symName = symbol.name;
		if (onProgress) onProgress(doneItems, totalItems, symName);
		try {
			const symUuid = genUUID();
			symbolUuidMap.set(symName, symUuid);

			const source = generateSymbolDocument(symbol, symUuid);
			libLines.push(source);

			deviceData.symbols[symUuid] = {
				uuid: symUuid,
				ticket: 1,
				updateTime: Date.now(),
				createTime: Date.now(),
				title: symName.toLowerCase(),
				display_title: symName,
				docType: 2,
			};

			result.symbols.push({ name: symName, status: 'ok' });
			result.symbolItems!.push({ name: symName, status: 'ok', uuid: symUuid, documentSource: source });
		} catch (e) {
			result.symbols.push({ name: symName, status: 'fail', message: String(e) });
		}
		doneItems++;
	}

	// 7c. Generate device entries
	for (const part of allParts) {
		if (onProgress) onProgress(doneItems, totalItems, part.name || part.number);
		try {
			const devUuid = genUUID();

			const symRefName = part.symbolRef.includes(':') ? part.symbolRef.split(':').pop()! : part.symbolRef;
			const symUuid = symbolUuidMap.get(symRefName) || '';

			const fpName = part.topCell;
			let fpUuid = footprintUuidMap.get(fpName) || '';

			const attributes: Record<string, string> = {
				'Manufacturer Part': part.name || part.number,
				'Designator': `${part.refPrefix || 'U'}?`,
				'Add into BOM': 'yes',
				'Convert to PCB': 'yes',
				'Name': `={Manufacturer Part}`,
			};

			if (fpUuid) {
				attributes['Footprint'] = fpUuid;
			} else if (fpName) {
				attributes['原封装'] = fpName;
			}

			if (symUuid) {
				attributes['Symbol'] = symUuid;
			}

			if (part.description) {
				attributes['Description'] = part.description;
			}

			for (const [key, val] of Object.entries(part.properties)) {
				attributes[key] = val;
			}

			deviceData.devices[devUuid] = {
				uuid: devUuid,
				attributes,
				ticket: 1,
				updateTime: Date.now(),
				createTime: Date.now(),
				title: (part.name || part.number).toLowerCase(),
				display_title: part.name || part.number,
				description: part.description,
				symbol_type: 2,
			};

			result.devices.push({
				name: part.name || part.number,
				status: fpUuid ? 'ok' : 'warn',
				message: fpUuid ? undefined : `封装 "${fpName}" 未找到`,
			});
			result.deviceItems!.push({
				name: part.name || part.number,
				status: fpUuid ? 'ok' : 'warn',
				message: fpUuid ? undefined : `封装 "${fpName}" 未找到`,
				uuid: devUuid,
				symbolUuid: symUuid,
				footprintUuid: fpUuid,
			});
		} catch (e) {
			result.devices.push({ name: part.name || part.number, status: 'fail', message: String(e) });
			result.deviceItems!.push({
				name: part.name || part.number,
				status: 'fail',
				message: String(e),
				uuid: '',
				symbolUuid: '',
				footprintUuid: '',
			});
		}
		doneItems++;
	}

	if (onProgress) onProgress(totalItems, totalItems, '');

	// 8. Multi-footprint device handling
	for (const part of allParts) {
		if (part.topCell && part.bottomCell && part.topCell !== part.bottomCell) {
			const devEntry = (Object.values(deviceData.devices) as any[]).find((d: any) => d.display_title === (part.name || part.number));
			if (devEntry) {
				const attrs = devEntry.attributes;
				attrs['原封装1'] = part.topCell;
				attrs['原封装2'] = part.bottomCell;
			}
		}
	}

	// 9. Package into .elibz2
	const lib2Content = libLines.join('\n');
	const device2Content = JSON.stringify(deviceData, null, 2);

	const outZip = new JSZip();
	outZip.file('lib2.elibu', lib2Content);
	outZip.file('device2.json', device2Content);

	result.blob = await outZip.generateAsync({ type: 'blob' });

	return result;
}

/** Regenerate elibz2 blob keeping only selected items (by UUID). */
export async function filterImportResult(result: ImportResult, selectedUuids: Set<string>): Promise<Blob> {
	// Resolve dependencies: selected devices pull in their symbol + footprint
	const selDevices = (result.deviceItems || []).filter((d) => selectedUuids.has(d.uuid));
	const neededSymUuids = new Set(selDevices.map((d) => d.symbolUuid).filter(Boolean));
	const neededFpUuids = new Set(selDevices.map((d) => d.footprintUuid).filter(Boolean));

	for (const s of result.symbolItems || []) {
		if (selectedUuids.has(s.uuid)) neededSymUuids.add(s.uuid);
	}
	for (const f of result.footprintItems || []) {
		if (selectedUuids.has(f.uuid)) neededFpUuids.add(f.uuid);
	}

	const selSymbols = (result.symbolItems || []).filter((s) => neededSymUuids.has(s.uuid));
	const selFootprints = (result.footprintItems || []).filter((f) => neededFpUuids.has(f.uuid));

	const libLines: string[] = [];
	const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };

	for (const fp of selFootprints) {
		libLines.push(fp.documentSource);
		deviceData.footprints[fp.uuid] = {
			uuid: fp.uuid,
			ticket: 1,
			updateTime: Date.now(),
			createTime: Date.now(),
			title: fp.name.toLowerCase(),
			display_title: fp.name,
			docType: 4,
		};
	}
	for (const sym of selSymbols) {
		libLines.push(sym.documentSource);
		deviceData.symbols[sym.uuid] = {
			uuid: sym.uuid,
			ticket: 1,
			updateTime: Date.now(),
			createTime: Date.now(),
			title: sym.name.toLowerCase(),
			display_title: sym.name,
			docType: 2,
		};
	}
	for (const dev of selDevices) {
		const attrs: Record<string, string> = {
			'Manufacturer Part': dev.name,
			'Designator': 'U?',
			'Add into BOM': 'yes',
			'Convert to PCB': 'yes',
			'Name': '={Manufacturer Part}',
		};
		if (dev.footprintUuid) attrs['Footprint'] = dev.footprintUuid;
		if (dev.symbolUuid) attrs['Symbol'] = dev.symbolUuid;
		deviceData.devices[dev.uuid] = {
			uuid: dev.uuid,
			attributes: attrs,
			ticket: 1,
			updateTime: Date.now(),
			createTime: Date.now(),
			title: dev.name.toLowerCase(),
			display_title: dev.name,
			symbol_type: 2,
		};
	}

	const outZip = new JSZip();
	outZip.file('lib2.elibu', libLines.join('\n'));
	outZip.file('device2.json', JSON.stringify(deviceData, null, 2));
	return outZip.generateAsync({ type: 'blob' });
}

export const xpeditionImport: ConverterImporter = {
	name: 'xpedition',
	displayName: 'Import Xpedition files',
	supportedExtensions: ['.zip'],
	importArchive: importXpeditionZip,
};
