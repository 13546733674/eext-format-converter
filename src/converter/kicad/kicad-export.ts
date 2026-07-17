/**
 * KiCad export — EasyEDA Pro library items → KiCad .kicad_mod / .kicad_sym ZIP.
 */
import JSZip from 'jszip';

import type { EeFootprint, EeSymbol } from '../easyeda-pro/easyeda-pro-models';
import { parseProFootprint, parseProSymbol } from '../easyeda-pro/easyeda-pro-parser';
import type { ConvertItem, ConverterExporter, ProDocumentType } from '../types';
import { generateKicadFootprint } from './kicad-footprint-writer';
import { generateKicadSymbolLibrary } from './kicad-symbol-writer';

function sanitize(name: string): string {
	return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_') || 'unnamed';
}

async function fetchDeviceSymbol(
	assoc: any,
	devLib: string,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	symbols: EeSymbol[],
	symbolNames: Set<string>,
	itemName: string,
): Promise<void> {
	const symUuid = assoc?.symbol?.uuid;
	const symLibUuid = assoc?.symbol?.libraryUuid || devLib;
	if (!symUuid || !symLibUuid) return;
	try {
		const symSource = await fetchFn('符号', symUuid, symLibUuid);
		if (!symSource) return;
		const sym = parseProSymbol(symSource);
		if (!symbolNames.has(sym.info.name)) {
			symbols.push(sym);
			symbolNames.add(sym.info.name);
		}
	} catch (e) {
		console.warn(`[KiCadExport] Device symbol failed for ${itemName}:`, e);
	}
}

async function fetchDeviceFootprint(
	assoc: any,
	devLib: string,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	footprints: EeFootprint[],
	footprintNames: Set<string>,
	itemName: string,
): Promise<void> {
	const fpUuid = assoc?.footprint?.uuid;
	const fpLibUuid = assoc?.footprint?.libraryUuid || devLib;
	if (!fpUuid || !fpLibUuid) return;
	try {
		const fpSource = await fetchFn('封装', fpUuid, fpLibUuid);
		if (!fpSource) return;
		const fp = parseProFootprint(fpSource);
		if (!footprintNames.has(fp.info.name)) {
			footprints.push(fp);
			footprintNames.add(fp.info.name);
		}
	} catch (e) {
		console.warn(`[KiCadExport] Device footprint failed for ${itemName}:`, e);
	}
}

async function processDeviceItem(
	item: ConvertItem,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	symbols: EeSymbol[],
	symbolNames: Set<string>,
	footprints: EeFootprint[],
	footprintNames: Set<string>,
): Promise<void> {
	const deviceSource = await fetchFn('器件', item.uuid, item.libraryUuid);
	if (!deviceSource) {
		console.warn(`[KiCadExport] Device data null for ${item.name}`);
		return;
	}

	let devData: any = null;
	try {
		devData = JSON.parse(deviceSource);
	} catch {
		return;
	}

	const assoc = devData.association || devData;
	const devLib = item.libraryUuid || '';

	await fetchDeviceSymbol(assoc, devLib, fetchFn, symbols, symbolNames, item.name);
	await fetchDeviceFootprint(assoc, devLib, fetchFn, footprints, footprintNames, item.name);
}

async function processFootprintItem(
	item: ConvertItem,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	footprints: EeFootprint[],
	footprintNames: Set<string>,
): Promise<void> {
	const source = await fetchFn(item.type, item.uuid, item.libraryUuid);
	if (!source) {
		console.warn(`[KiCadExport] Source null for ${item.name}`);
		return;
	}
	const fp = parseProFootprint(source);
	if (!footprintNames.has(fp.info.name)) {
		footprints.push(fp);
		footprintNames.add(fp.info.name);
	}
}

async function processSymbolItem(
	item: ConvertItem,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	symbols: EeSymbol[],
	symbolNames: Set<string>,
): Promise<void> {
	const source = await fetchFn(item.type, item.uuid, item.libraryUuid);
	if (!source) {
		console.warn(`[KiCadExport] Source null for ${item.name}`);
		return;
	}
	const sym = parseProSymbol(source);
	if (!symbolNames.has(sym.info.name)) {
		symbols.push(sym);
		symbolNames.add(sym.info.name);
	}
}

export function exportDocumentToKicad(source: string, docType: ProDocumentType): { filename: string; content: string } {
	if (docType === 'symbol') {
		const sym = parseProSymbol(source);
		const name = sanitize(sym.info.name || 'unnamed');
		return { filename: `${name}.kicad_sym`, content: generateKicadSymbolLibrary([sym]) };
	}
	const fp = parseProFootprint(source);
	const name = sanitize(fp.info.name || 'unnamed');
	return { filename: `${name}.kicad_mod`, content: generateKicadFootprint(fp) };
}

export async function exportItemsToKicad(
	items: ConvertItem[],
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
	const zip = new JSZip();
	const total = items.length;
	let done = 0;

	const footprints: EeFootprint[] = [];
	const symbols: EeSymbol[] = [];
	const symbolNames = new Set<string>();
	const footprintNames = new Set<string>();

	for (const item of items) {
		if (onProgress) onProgress(done, total, item.name);

		try {
			if (item.type === '器件') {
				await processDeviceItem(item, fetchFn, symbols, symbolNames, footprints, footprintNames);
			} else if (item.type === '封装') {
				await processFootprintItem(item, fetchFn, footprints, footprintNames);
			} else if (item.type === '符号') {
				await processSymbolItem(item, fetchFn, symbols, symbolNames);
			}
		} catch (e) {
			console.warn(`[KiCadExport] Failed to convert ${item.name} (${item.type}):`, e);
		}

		done++;
	}

	// Generate one symbol library containing all symbols
	if (symbols.length > 0) {
		zip.file('asyeda.kicad_sym', generateKicadSymbolLibrary(symbols));
	}

	// Generate one footprint file per footprint
	for (const fp of footprints) {
		const safeName = sanitize(fp.info.name);
		zip.file(`${safeName}.kicad_mod`, generateKicadFootprint(fp));
	}

	if (onProgress) onProgress(total, total, '');
	return zip.generateAsync({ type: 'blob' });
}

export const kicadExport: ConverterExporter = {
	name: 'kicad',
	displayName: 'Export KiCad files',
	defaultFilename: 'asyeda2kicad.zip',
	exportItems: exportItemsToKicad,
};
