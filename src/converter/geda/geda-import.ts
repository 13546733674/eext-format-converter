/**
 * gEDA / Lepton EDA PCB → EasyEDA Pro PCB importer.
 */
import JSZip from 'jszip';

import { generatePcbDocumentSource } from '../easyeda-pro/easyeda-pro-pcb-writer';
import { buildEpro2Archive } from '../easyeda-pro/epro2-builder';
import type { ConverterImporter, ImportResult } from '../types';
import { parseGedaPcb } from './geda-pcb-parser';

function looksLikeGedaPcb(content: string): boolean {
	const trimmed = content.trim().slice(0, 300).toLowerCase();
	return trimmed.includes('pcb[') || trimmed.includes('pcb(') || /fileversion\[\d+\]/i.test(content);
}

async function readInput(zipFile: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
	if (typeof Blob !== 'undefined' && zipFile instanceof Blob && typeof (zipFile as Blob).arrayBuffer === 'function') {
		return await (zipFile as Blob).arrayBuffer();
	}
	return zipFile as ArrayBuffer;
}

export async function importGedaPcb(
	input: File | Blob | ArrayBuffer,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	if (onProgress) onProgress(0, 1, 'gEDA PCB');

	const buffer = await readInput(input);
	let content = '';

	// Try as a plain text file first
	const asText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
	if (looksLikeGedaPcb(asText)) {
		content = asText;
	} else {
		// Otherwise treat as ZIP and look for .pcb files
		const zip = await JSZip.loadAsync(buffer);
		const candidates: string[] = [];
		zip.forEach((path) => {
			const lower = path.toLowerCase();
			if (lower.endsWith('.pcb')) candidates.push(path);
		});
		for (const path of candidates) {
			const entry = zip.file(path);
			if (!entry) continue;
			const candidate = await entry.async('string');
			if (looksLikeGedaPcb(candidate)) {
				content = candidate;
				break;
			}
		}
	}

	if (!content) {
		return {
			devices: [{ name: 'gEDA PCB', status: 'fail', message: '未识别到 gEDA PCB 文件' }],
			footprints: [],
			symbols: [],
			blob: new Blob(),
		};
	}

	const board = parseGedaPcb(content);
	const pcbSource = generatePcbDocumentSource(board);
	const epro2Blob = await buildEpro2Archive({
		projectName: board.name || 'gEDA PCB Import',
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

export const gedaImport: ConverterImporter = {
	name: 'geda',
	displayName: 'Import gEDA PCB',
	supportedExtensions: ['.zip', '.pcb'],
	importArchive: importGedaPcb,
};
