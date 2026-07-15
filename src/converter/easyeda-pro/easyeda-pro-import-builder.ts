/**
 * Shared helper that builds a Pro `.elibz2` ImportResult from parsed
 * footprint/symbol/device data. All importers use this instead of duplicating
 * the `lib2.elibu` + `device2.json` packaging logic.
 */
import JSZip from 'jszip';

import type { ImportDeviceItem, ImportFootprintItem, ImportItemResult, ImportResult, ImportSymbolItem } from '../types';

export interface BuilderFootprint {
	uuid: string;
	name: string;
	documentSource: string;
	status?: ImportItemResult['status'];
	message?: string;
}

export interface BuilderSymbol {
	uuid: string;
	name: string;
	documentSource: string;
	status?: ImportItemResult['status'];
	message?: string;
}

export interface BuilderDevice {
	uuid: string;
	name: string;
	symbolUuid?: string;
	footprintUuid?: string;
	attributes?: Record<string, string>;
	description?: string;
	status?: ImportItemResult['status'];
	message?: string;
}

function genUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

export function buildImportResult(options: { footprints: BuilderFootprint[]; symbols: BuilderSymbol[]; devices: BuilderDevice[] }): ImportResult {
	const { footprints, symbols, devices } = options;

	const libLines: string[] = [];
	const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };

	for (const fp of footprints) {
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

	for (const sym of symbols) {
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

	for (const dev of devices) {
		const attrs: Record<string, string> = {
			'Manufacturer Part': dev.name,
			'Designator': 'U?',
			'Add into BOM': 'yes',
			'Convert to PCB': 'yes',
			'Name': '={Manufacturer Part}',
			...(dev.attributes || {}),
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
			description: dev.description,
			symbol_type: 2,
		};
	}

	const outZip = new JSZip();
	outZip.file('lib2.elibu', libLines.join('\n'));
	outZip.file('device2.json', JSON.stringify(deviceData, null, 2));

	const footprintItems: ImportFootprintItem[] = footprints.map((fp) => ({
		name: fp.name,
		status: fp.status ?? 'ok',
		message: fp.message,
		uuid: fp.uuid,
		documentSource: fp.documentSource,
	}));

	const symbolItems: ImportSymbolItem[] = symbols.map((sym) => ({
		name: sym.name,
		status: sym.status ?? 'ok',
		message: sym.message,
		uuid: sym.uuid,
		documentSource: sym.documentSource,
	}));

	const deviceItems: ImportDeviceItem[] = devices.map((dev) => ({
		name: dev.name,
		status: dev.status ?? (dev.footprintUuid ? 'ok' : 'warn'),
		message: dev.message ?? (dev.footprintUuid ? undefined : `封装未找到`),
		uuid: dev.uuid,
		symbolUuid: dev.symbolUuid ?? '',
		footprintUuid: dev.footprintUuid ?? '',
	}));

	const toSummary = (items: ImportItemResult[]): ImportItemResult[] => items.map((i) => ({ name: i.name, status: i.status, message: i.message }));

	return {
		devices: toSummary(deviceItems),
		footprints: toSummary(footprintItems),
		symbols: toSummary(symbolItems),
		blob: new Blob(),
		footprintItems,
		symbolItems,
		deviceItems,
	};
}

/**
 * Finalize an ImportResult by building the ZIP blob. Some importers build the
 * result incrementally; this helper attaches the real blob.
 */
export async function finalizeImportResult(result: ImportResult): Promise<ImportResult> {
	const footprintSources = result.footprintItems?.map((f) => f.documentSource) ?? [];
	const symbolSources = result.symbolItems?.map((s) => s.documentSource) ?? [];

	const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };
	for (const fp of result.footprintItems ?? []) {
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
	for (const sym of result.symbolItems ?? []) {
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
	for (const dev of result.deviceItems ?? []) {
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
	outZip.file('lib2.elibu', [...footprintSources, ...symbolSources].join('\n'));
	outZip.file('device2.json', JSON.stringify(deviceData, null, 2));
	result.blob = await outZip.generateAsync({ type: 'blob' });
	return result;
}

export { genUUID };
