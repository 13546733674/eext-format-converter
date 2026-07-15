/**
 * Cadstar library archive → EasyEDA Pro `.elibz2` importer.
 *
 * Expects a ZIP containing Cadstar ASCII library files:
 *   .pad  - pad definitions
 *   .pkg  - package (footprint) definitions
 *   .cmp  - component (symbol) definitions
 *   .ptf / .prt - part definitions linking component + package
 */
import JSZip from 'jszip';

import {
	type BuilderDevice,
	type BuilderFootprint,
	type BuilderSymbol,
	buildImportResult,
	finalizeImportResult,
	genUUID,
} from '../easyeda-pro/easyeda-pro-import-builder';
import type { ConverterImporter, ImportResult } from '../types';
import { buildCadstarPadMaps, generateCadstarFootprintSource, generateCadstarSymbolDocument } from './cadstar-adapter';
import { parseCadstarComponents, parseCadstarPackages, parseCadstarPads, parseCadstarParts } from './cadstar-parser';

export async function importCadstarZip(
	zipFile: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	let zipInput: any = zipFile;
	if (typeof Blob !== 'undefined' && zipFile instanceof Blob && typeof (zipFile as Blob).arrayBuffer === 'function') {
		zipInput = await (zipFile as Blob).arrayBuffer();
	}
	const zip = await JSZip.loadAsync(zipInput);

	const padFiles: string[] = [];
	const pkgFiles: string[] = [];
	const cmpFiles: string[] = [];
	const partFiles: string[] = [];

	zip.forEach((path) => {
		const lower = path.toLowerCase();
		if (lower.endsWith('.pad')) padFiles.push(path);
		else if (lower.endsWith('.pkg')) pkgFiles.push(path);
		else if (lower.endsWith('.cmp')) cmpFiles.push(path);
		else if (lower.endsWith('.ptf') || lower.endsWith('.prt')) partFiles.push(path);
	});

	const allPads = parseCadstarPads(await concatFiles(zip, padFiles));
	const allPackages = parseCadstarPackages(await concatFiles(zip, pkgFiles));
	const allComponents = parseCadstarComponents(await concatFiles(zip, cmpFiles));
	const allParts = parseCadstarParts(await concatFiles(zip, partFiles));

	const padMaps = buildCadstarPadMaps(allPads);

	const packageNameToUuid = new Map<string, string>();
	const componentNameToUuid = new Map<string, string>();

	const footprintItems: BuilderFootprint[] = [];
	const symbolItems: BuilderSymbol[] = [];

	const totalItems = allPackages.length + allComponents.length + allParts.length;
	let doneItems = 0;

	for (const pkg of allPackages) {
		if (onProgress) onProgress(doneItems, totalItems, pkg.name);
		try {
			const uuid = genUUID();
			packageNameToUuid.set(pkg.name, uuid);
			footprintItems.push({
				uuid,
				name: pkg.name,
				documentSource: generateCadstarFootprintSource(pkg, padMaps, uuid),
			});
		} catch (e) {
			footprintItems.push({
				uuid: genUUID(),
				name: pkg.name,
				documentSource: '',
				status: 'fail',
				message: String(e),
			});
		}
		doneItems++;
	}

	for (const comp of allComponents) {
		if (onProgress) onProgress(doneItems, totalItems, comp.name);
		try {
			const uuid = genUUID();
			componentNameToUuid.set(comp.name, uuid);
			symbolItems.push({
				uuid,
				name: comp.name,
				documentSource: generateCadstarSymbolDocument(comp, uuid),
			});
		} catch (e) {
			symbolItems.push({
				uuid: genUUID(),
				name: comp.name,
				documentSource: '',
				status: 'fail',
				message: String(e),
			});
		}
		doneItems++;
	}

	const deviceItems: BuilderDevice[] = [];
	for (const part of allParts) {
		if (onProgress) onProgress(doneItems, totalItems, part.name);
		const symbolUuid = componentNameToUuid.get(part.componentName) ?? '';
		const footprintUuid = packageNameToUuid.get(part.packageName) ?? '';
		const attrs: Record<string, string> = {
			...part.properties,
		};
		if (part.description) attrs['Description'] = part.description;
		deviceItems.push({
			uuid: genUUID(),
			name: part.name,
			symbolUuid,
			footprintUuid,
			attributes: attrs,
			description: part.description,
			status: footprintUuid ? 'ok' : 'warn',
			message: footprintUuid ? undefined : `封装 "${part.packageName}" 未找到`,
		});
		doneItems++;
	}

	const result = buildImportResult({
		footprints: footprintItems,
		symbols: symbolItems,
		devices: deviceItems,
	});
	return finalizeImportResult(result);
}

async function concatFiles(zip: JSZip, paths: string[]): Promise<string> {
	const parts: string[] = [];
	for (const path of paths) {
		const entry = zip.file(path);
		if (!entry) continue;
		parts.push(await entry.async('string'));
	}
	return parts.join('\n');
}

export const cadstarImport: ConverterImporter = {
	name: 'cadstar',
	displayName: 'Import Cadstar files',
	supportedExtensions: ['.zip'],
	importArchive: importCadstarZip,
};
