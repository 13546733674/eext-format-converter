/**
 * Xpedition export — EasyEDA Pro library items → Xpedition Cell/Pads/Symbol text ZIP.
 */
import JSZip from 'jszip';

import { parseProFootprint, parseProSymbol } from '../easyeda-pro/easyeda-pro-parser';
import type { ConvertItem, ConverterExporter, ProDocumentType } from '../types';
import { FootprintConverter } from './xpedition-footprint-converter';
import { SymbolConverter } from './xpedition-symbol-converter';

function sanitize(name: string): string {
	return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_') || 'unnamed';
}

async function fetchDeviceSymbol(
	assoc: any,
	devLib: string,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	safeName: string,
	zip: JSZip,
	itemName: string,
): Promise<void> {
	const symUuid = assoc?.symbol?.uuid;
	const symLibUuid = assoc?.symbol?.libraryUuid || devLib;
	if (!symUuid || !symLibUuid) return;
	try {
		const symSource = await fetchFn('符号', symUuid, symLibUuid);
		if (!symSource) {
			console.warn(`[FormatConvert] Symbol data null for device ${itemName}`);
			return;
		}
		const sym = parseProSymbol(symSource);
		const converter = SymbolConverter.fromEeSymbol(sym);
		converter.convert();
		const files = converter.saveToFiles();
		for (const [partName, content] of Object.entries(files)) {
			zip.file(`${safeName}_${sanitize(partName)}`, content);
		}
	} catch (e) {
		console.warn(`[FormatConvert] Device symbol failed for ${itemName}:`, e);
	}
}

async function fetchDeviceFootprint(
	assoc: any,
	devLib: string,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	safeName: string,
	zip: JSZip,
	itemName: string,
): Promise<void> {
	const fpUuid = assoc?.footprint?.uuid;
	const fpLibUuid = assoc?.footprint?.libraryUuid || devLib;
	if (!fpUuid || !fpLibUuid) return;
	try {
		const fpSource = await fetchFn('封装', fpUuid, fpLibUuid);
		if (!fpSource) {
			console.warn(`[FormatConvert] Footprint data null for device ${itemName}`);
			return;
		}
		const fp = parseProFootprint(fpSource);
		const converter = FootprintConverter.fromEeFootprint(fp);
		converter.convert();
		zip.file(`${safeName}_Pads.hkp`, converter.savePadstacksToString());
		zip.file(`${safeName}_Cell.hkp`, converter.saveCellToString());
	} catch (e) {
		console.warn(`[FormatConvert] Device footprint failed for ${itemName}:`, e);
	}
}

async function processDeviceItem(
	item: ConvertItem,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	zip: JSZip,
): Promise<void> {
	const deviceSource = await fetchFn('器件', item.uuid, item.libraryUuid);
	if (!deviceSource) {
		console.warn(`[FormatConvert] Device data null for ${item.name}`);
		return;
	}

	let devData: any = null;
	try {
		devData = JSON.parse(deviceSource);
	} catch {
		return;
	}

	const assoc = devData.association || devData;
	const safeName = sanitize(item.name);
	const devLib = item.libraryUuid || '';

	await fetchDeviceSymbol(assoc, devLib, fetchFn, safeName, zip, item.name);
	await fetchDeviceFootprint(assoc, devLib, fetchFn, safeName, zip, item.name);
}

async function processFootprintItem(
	item: ConvertItem,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	zip: JSZip,
): Promise<void> {
	const source = await fetchFn(item.type, item.uuid, item.libraryUuid);
	if (!source) {
		console.warn(`[FormatConvert] Source null for ${item.name} (${item.type})`);
		return;
	}
	const fp = parseProFootprint(source);
	const converter = FootprintConverter.fromEeFootprint(fp);
	converter.convert();
	const safeName = sanitize(item.name);
	zip.file(`${safeName}_Pads.hkp`, converter.savePadstacksToString());
	zip.file(`${safeName}_Cell.hkp`, converter.saveCellToString());
}

async function processSymbolItem(
	item: ConvertItem,
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	zip: JSZip,
): Promise<void> {
	const source = await fetchFn(item.type, item.uuid, item.libraryUuid);
	if (!source) {
		console.warn(`[FormatConvert] Source null for ${item.name} (${item.type})`);
		return;
	}
	const sym = parseProSymbol(source);
	const converter = SymbolConverter.fromEeSymbol(sym);
	converter.convert();
	const files = converter.saveToFiles();
	for (const [partName, content] of Object.entries(files)) {
		zip.file(`${sanitize(partName)}`, content);
	}
}

export async function exportDocumentToXpedition(source: string, docType: ProDocumentType): Promise<{ filename: string; blob: Blob }> {
	const zip = new JSZip();
	if (docType === 'symbol') {
		const sym = parseProSymbol(source);
		const name = sanitize(sym.info.name || 'unnamed');
		const converter = SymbolConverter.fromEeSymbol(sym);
		converter.convert();
		const files = converter.saveToFiles();
		for (const [partName, content] of Object.entries(files)) {
			zip.file(`${name}_${sanitize(partName)}`, content);
		}
		return { filename: `${name}_xpedition.zip`, blob: await zip.generateAsync({ type: 'blob' }) };
	}
	const fp = parseProFootprint(source);
	const name = sanitize(fp.info.name || 'unnamed');
	const converter = FootprintConverter.fromEeFootprint(fp);
	converter.convert();
	zip.file(`${name}_Pads.hkp`, converter.savePadstacksToString());
	zip.file(`${name}_Cell.hkp`, converter.saveCellToString());
	return { filename: `${name}_xpedition.zip`, blob: await zip.generateAsync({ type: 'blob' }) };
}

export async function convertFromProEditor(
	items: ConvertItem[],
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
	const zip = new JSZip();
	const total = items.length;
	let done = 0;

	for (const item of items) {
		if (onProgress) onProgress(done, total, item.name);

		try {
			if (item.type === '器件') {
				await processDeviceItem(item, fetchFn, zip);
			} else if (item.type === '封装') {
				await processFootprintItem(item, fetchFn, zip);
			} else if (item.type === '符号') {
				await processSymbolItem(item, fetchFn, zip);
			}
		} catch (e) {
			console.warn(`[FormatConvert] Failed to convert ${item.name} (${item.type}):`, e);
		}

		done++;
	}

	if (onProgress) onProgress(total, total, '');
	return zip.generateAsync({ type: 'blob' });
}

export const xpeditionExport: ConverterExporter = {
	name: 'xpedition',
	displayName: 'Export Xpedition files',
	defaultFilename: 'asyeda2xpedition.zip',
	exportItems: convertFromProEditor,
};
