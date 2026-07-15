/**
 * TinyCAD XML schematic → EasyEDA Pro project archive importer.
 */
import JSZip from 'jszip';

import { buildEpro2Archive } from '../easyeda-pro/epro2-builder';
import type { ConverterImporter, ImportResult } from '../types';
import { parseTinyCadDsn } from './tinycad-parser';
import { convertTinyCadSheetToProSources } from './tinycad-pro-adapter';

function looksLikeTinyCad(content: string): boolean {
	const trimmed = content.trim().slice(0, 300).toLowerCase();
	return trimmed.includes('<?xml') && trimmed.includes('<tinycadsheets>');
}

async function readInput(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
	if (typeof Blob !== 'undefined' && input instanceof Blob && typeof (input as Blob).arrayBuffer === 'function') {
		return await (input as Blob).arrayBuffer();
	}
	return input as ArrayBuffer;
}

export async function importTinyCad(
	input: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	if (onProgress) onProgress(0, 1, 'TinyCAD');

	const buffer = await readInput(input);
	let content = '';

	const asText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
	if (looksLikeTinyCad(asText)) {
		content = asText;
	} else {
		const zip = await JSZip.loadAsync(buffer);
		const candidates: string[] = [];
		zip.forEach((path) => {
			if (path.toLowerCase().endsWith('.dsn')) candidates.push(path);
		});
		for (const path of candidates) {
			const entry = zip.file(path);
			if (!entry) continue;
			const candidate = await entry.async('string');
			if (looksLikeTinyCad(candidate)) {
				content = candidate;
				break;
			}
		}
	}

	if (!content) {
		return {
			devices: [{ name: 'TinyCAD', status: 'fail', message: '未识别到 TinyCAD 文件' }],
			footprints: [],
			symbols: [],
			blob: new Blob(),
		};
	}

	const sheet = parseTinyCadDsn(content);
	const { symbolSources, schematicPageSources } = convertTinyCadSheetToProSources(sheet);
	const projectName = sheet.name || 'TinyCAD Import';
	const epro2Blob = await buildEpro2Archive({
		projectName,
		schematicPageSources,
		symbolSources,
	});

	if (onProgress) onProgress(1, 1, projectName);

	return {
		devices: [],
		footprints: [],
		symbols: [],
		blob: epro2Blob,
		isProjectArchive: true,
	};
}

export const tinycadImport: ConverterImporter = {
	name: 'tinycad',
	displayName: 'Import TinyCAD files',
	supportedExtensions: ['.zip', '.dsn'],
	importArchive: importTinyCad,
};
