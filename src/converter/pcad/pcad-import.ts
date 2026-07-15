/**
 * P-CAD library / design → EasyEDA Pro `.elibz2` importer.
 *
 * P-CAD libraries are ASCII files containing .Pattern (footprint), .Symbol and
 * .Component sections. This module currently provides the importer shell and
 * registers with the converter registry; full geometry parsing will be added
 * once sample libraries are available.
 */
import JSZip from 'jszip';

import { buildImportResult, finalizeImportResult, genUUID } from '../easyeda-pro/easyeda-pro-import-builder';
import type { ConverterImporter, ImportResult } from '../types';

function looksLikePcad(content: string): boolean {
	const first = content.trim().slice(0, 300).toUpperCase();
	return first.includes('.LIB') || first.includes('.PATTERN') || first.includes('.SYMBOL') || first.includes('.COMPONENT');
}

export async function importPcAdZip(
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
		if (lower.endsWith('.lib') || lower.endsWith('.sch') || lower.endsWith('.pcb') || lower.endsWith('.txt')) {
			files.push(path);
		}
	});

	let recognized = false;
	for (const path of files) {
		const entry = zip.file(path);
		if (!entry) continue;
		const content = await entry.async('string');
		if (looksLikePcad(content)) {
			recognized = true;
			break;
		}
	}

	if (onProgress) onProgress(0, 1, recognized ? 'P-CAD archive' : 'scanning');

	const warnMessage = recognized ? 'P-CAD 解析器已识别文件，几何转换即将实现' : '未识别到 P-CAD 文件（*.lib / *.sch / *.pcb）';

	const result = buildImportResult({
		footprints: [],
		symbols: [],
		devices: [
			{
				uuid: genUUID(),
				name: 'P-CAD import placeholder',
				status: 'warn',
				message: warnMessage,
			},
		],
	});

	return finalizeImportResult(result);
}

export const pcadImport: ConverterImporter = {
	name: 'pcad',
	displayName: 'Import P-CAD files',
	supportedExtensions: ['.zip'],
	importArchive: importPcAdZip,
};
