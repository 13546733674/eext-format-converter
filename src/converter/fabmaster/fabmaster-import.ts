/**
 * Fabmaster ASCII → EasyEDA Pro `.elibz2` importer.
 *
 * Fabmaster files are typically flat ASCII exports containing component,
 * footprint and netlist information. This module currently provides the
 * importer shell and registers with the converter registry; the geometry
 * parser will be expanded once sample files are available.
 */
import JSZip from 'jszip';

import { buildImportResult, finalizeImportResult, genUUID } from '../easyeda-pro/easyeda-pro-import-builder';
import type { ConverterImporter, ImportResult } from '../types';

function looksLikeFabmaster(content: string): boolean {
	const first = content.trim().slice(0, 200).toUpperCase();
	return first.includes('FABMASTER') || first.includes('NETLIST') || first.includes('COMPONENT');
}

export async function importFabmasterZip(
	zipFile: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	let zipInput: any = zipFile;
	if (typeof Blob !== 'undefined' && zipFile instanceof Blob && typeof (zipFile as Blob).arrayBuffer === 'function') {
		zipInput = await (zipFile as Blob).arrayBuffer();
	}
	const zip = await JSZip.loadAsync(zipInput);

	const files: string[] = [];
	zip.forEach((path) => {
		const lower = path.toLowerCase();
		if (lower.endsWith('.txt') || lower.endsWith('.fab') || lower.endsWith('.lst')) {
			files.push(path);
		}
	});

	let recognized = false;
	for (const path of files) {
		const entry = zip.file(path);
		if (!entry) continue;
		const content = await entry.async('string');
		if (looksLikeFabmaster(content)) {
			recognized = true;
			break;
		}
	}

	if (onProgress) onProgress(0, 1, recognized ? 'Fabmaster archive' : 'scanning');

	const warnMessage = recognized ? 'Fabmaster 解析器已识别文件，几何转换即将实现' : '未识别到 Fabmaster 文件（*.txt / *.fab / *.lst）';

	const result = buildImportResult({
		footprints: [],
		symbols: [],
		devices: [
			{
				uuid: genUUID(),
				name: 'Fabmaster import placeholder',
				status: 'warn',
				message: warnMessage,
			},
		],
	});

	return finalizeImportResult(result);
}

export const fabmasterImport: ConverterImporter = {
	name: 'fabmaster',
	displayName: 'Import Fabmaster files',
	supportedExtensions: ['.zip'],
	importArchive: importFabmasterZip,
};
