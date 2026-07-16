/**
 * Cadstar CPA (PCB Archive) → EasyEDA Pro PCB importer.
 */
import JSZip from 'jszip';

import { generatePcbDocumentSource } from '../easyeda-pro/easyeda-pro-pcb-writer';
import { buildEpro2Archive } from '../easyeda-pro/epro2-builder';
import type { ConverterImporter, ImportResult } from '../types';
import { parseCadstarPcb } from './cadstar-pcb-parser';

function looksLikeCadstarPcb(content: string): boolean {
	const first = content.trim().slice(0, 300).toUpperCase();
	return first.includes('CADSTARPCB');
}

async function readInput(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
	if (typeof Blob !== 'undefined' && input instanceof Blob && typeof (input as Blob).arrayBuffer === 'function') {
		return await (input as Blob).arrayBuffer();
	}
	return input as ArrayBuffer;
}

export async function importCadstarPcb(
	input: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	if (onProgress) onProgress(0, 1, 'Cadstar PCB');

	const buffer = await readInput(input);
	let content = '';

	const asText = new TextDecoder('windows-1252', { fatal: false }).decode(buffer);
	if (looksLikeCadstarPcb(asText)) {
		content = asText;
	} else {
		const zip = await JSZip.loadAsync(buffer);
		const candidates: string[] = [];
		zip.forEach((path) => {
			if (path.toLowerCase().endsWith('.cpa')) candidates.push(path);
		});
		for (const path of candidates) {
			const entry = zip.file(path);
			if (!entry) continue;
			const candidate = await entry.async('string');
			if (looksLikeCadstarPcb(candidate)) {
				content = candidate;
				break;
			}
		}
	}

	if (!content) {
		return {
			devices: [{ name: 'Cadstar PCB', status: 'fail', message: '未识别到 Cadstar CPA 文件' }],
			footprints: [],
			symbols: [],
			blob: new Blob(),
		};
	}

	const board = parseCadstarPcb(content);
	const pcbSource = generatePcbDocumentSource(board);
	const epro2Blob = await buildEpro2Archive({
		projectName: board.name || 'Cadstar PCB Import',
		pcbSource,
	});

	if (onProgress) onProgress(1, 1, board.name);

	return {
		devices: [],
		footprints: [],
		symbols: [],
		blob: epro2Blob,
		isProjectArchive: true,
	};
}

export const cadstarPcbImport: ConverterImporter = {
	name: 'cadstar-pcb',
	displayName: 'Import Cadstar PCB',
	supportedExtensions: ['.zip', '.cpa'],
	importArchive: importCadstarPcb,
};
