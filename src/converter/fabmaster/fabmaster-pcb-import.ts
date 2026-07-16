/**
 * Fabmaster ASCII PCB → EasyEDA Pro PCB importer.
 */
import JSZip from 'jszip';

import { generatePcbDocumentSource } from '../easyeda-pro/easyeda-pro-pcb-writer';
import { buildEpro2Archive } from '../easyeda-pro/epro2-builder';
import type { ConverterImporter, ImportResult } from '../types';
import { parseFabmasterPcb } from './fabmaster-pcb-parser';

function looksLikeFabmaster(content: string): boolean {
	const first = content.trim().slice(0, 200).toUpperCase();
	return first.includes('FABMASTER') || first.startsWith('A!') || /A!(REFDES|NETNAME|PADNAME|VIAX)/.test(first);
}

async function readInput(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
	if (typeof Blob !== 'undefined' && input instanceof Blob && typeof (input as Blob).arrayBuffer === 'function') {
		return await (input as Blob).arrayBuffer();
	}
	return input as ArrayBuffer;
}

export async function importFabmasterPcb(
	input: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	if (onProgress) onProgress(0, 1, 'Fabmaster PCB');

	const buffer = await readInput(input);
	let content = '';

	const asText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
	if (looksLikeFabmaster(asText)) {
		content = asText;
	} else {
		const zip = await JSZip.loadAsync(buffer);
		const candidates: string[] = [];
		zip.forEach((path) => {
			const lower = path.toLowerCase();
			if (lower.endsWith('.txt') || lower.endsWith('.fab') || lower.endsWith('.lst')) candidates.push(path);
		});
		for (const path of candidates) {
			const entry = zip.file(path);
			if (!entry) continue;
			const candidate = await entry.async('string');
			if (looksLikeFabmaster(candidate)) {
				content = candidate;
				break;
			}
		}
	}

	if (!content) {
		return {
			devices: [{ name: 'Fabmaster PCB', status: 'fail', message: '未识别到 Fabmaster PCB 文件' }],
			footprints: [],
			symbols: [],
			blob: new Blob(),
		};
	}

	const board = parseFabmasterPcb(content);
	const pcbSource = generatePcbDocumentSource(board);
	const epro2Blob = await buildEpro2Archive({
		projectName: board.name || 'Fabmaster PCB Import',
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

export const fabmasterPcbImport: ConverterImporter = {
	name: 'fabmaster-pcb',
	displayName: 'Import Fabmaster PCB',
	supportedExtensions: ['.zip', '.txt', '.fab'],
	importArchive: importFabmasterPcb,
};
