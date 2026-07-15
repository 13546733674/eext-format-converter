/**
 * Allegro library / board → EasyEDA Pro `.elibz2` importer.
 *
 * Allegro data is usually converted to ASCII by the `extracta` utility before
 * import. This module currently provides the importer shell and registers with
 * the converter registry; full geometry parsing will be added once sample
 * extracta outputs are available.
 */
import JSZip from 'jszip';

import { buildImportResult, finalizeImportResult, genUUID } from '../easyeda-pro/easyeda-pro-import-builder';
import type { ConverterImporter, ImportResult } from '../types';

function looksLikeAllegro(content: string): boolean {
	const first = content.trim().slice(0, 300).toUpperCase();
	return first.includes('ALLEGRO') || first.includes('EXTRACTA') || first.includes('SYMBOL') || first.includes('PACKAGE');
}

export async function importAllegroZip(
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
		if (
			lower.endsWith('.txt') ||
			lower.endsWith('.brd') ||
			lower.endsWith('.dra') ||
			lower.endsWith('.pad') ||
			lower.endsWith('.psm') ||
			lower.endsWith('.ssm')
		) {
			files.push(path);
		}
	});

	let recognized = false;
	for (const path of files) {
		const entry = zip.file(path);
		if (!entry) continue;
		const content = await entry.async('string').catch(() => '');
		if (looksLikeAllegro(content)) {
			recognized = true;
			break;
		}
	}

	if (onProgress) onProgress(0, 1, recognized ? 'Allegro archive' : 'scanning');

	const warnMessage = recognized
		? 'Allegro 解析器已识别文件，几何转换即将实现'
		: '未识别到 Allegro 文件（*.txt / *.brd / *.dra / *.pad / *.psm / *.ssm）';

	const result = buildImportResult({
		footprints: [],
		symbols: [],
		devices: [
			{
				uuid: genUUID(),
				name: 'Allegro import placeholder',
				status: 'warn',
				message: warnMessage,
			},
		],
	});

	return finalizeImportResult(result);
}

export const allegroImport: ConverterImporter = {
	name: 'allegro',
	displayName: 'Import Allegro files',
	supportedExtensions: ['.zip'],
	importArchive: importAllegroZip,
};
