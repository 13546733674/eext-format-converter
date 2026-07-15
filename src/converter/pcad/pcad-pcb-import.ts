/**
 * P-CAD ASCII PCB → EasyEDA Pro PCB importer.
 */
import JSZip from 'jszip';

import { buildEpro2Archive } from '../easyeda-pro/epro2-builder';
import { generatePcbDocumentSource } from '../pcb/easyeda-pro-pcb-writer';
import type { ConverterImporter, ImportResult } from '../types';
import { parsePcAdPcb } from './pcad-pcb-parser';

function looksLikePcAdPcb(content: string): boolean {
	const first = content.trim().slice(0, 300).toUpperCase();
	return first.includes('ACCEL_ASCII');
}

async function readInput(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
	if (typeof Blob !== 'undefined' && input instanceof Blob && typeof (input as Blob).arrayBuffer === 'function') {
		return await (input as Blob).arrayBuffer();
	}
	return input as ArrayBuffer;
}

export async function importPcAdPcb(
	input: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	if (onProgress) onProgress(0, 1, 'P-CAD PCB');

	const buffer = await readInput(input);
	let content = '';

	const asText = new TextDecoder('windows-1251', { fatal: false }).decode(buffer);
	if (looksLikePcAdPcb(asText)) {
		content = asText;
	} else {
		const zip = await JSZip.loadAsync(buffer);
		const candidates: string[] = [];
		zip.forEach((path) => {
			if (path.toLowerCase().endsWith('.pcb')) candidates.push(path);
		});
		for (const path of candidates) {
			const entry = zip.file(path);
			if (!entry) continue;
			const candidate = await entry.async('string');
			if (looksLikePcAdPcb(candidate)) {
				content = candidate;
				break;
			}
		}
	}

	if (!content) {
		return {
			devices: [{ name: 'P-CAD PCB', status: 'fail', message: '未识别到 P-CAD PCB 文件' }],
			footprints: [],
			symbols: [],
			blob: new Blob(),
		};
	}

	const board = parsePcAdPcb(content);
	const pcbSource = generatePcbDocumentSource(board);
	const epro2Blob = await buildEpro2Archive({
		projectName: board.name || 'P-CAD PCB Import',
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

export const pcadPcbImport: ConverterImporter = {
	name: 'pcad-pcb',
	displayName: 'Import P-CAD PCB',
	supportedExtensions: ['.zip', '.pcb'],
	importArchive: importPcAdPcb,
};
