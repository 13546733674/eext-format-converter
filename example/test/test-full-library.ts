/**
 * Full library test: Convert complete Xpedition library (18 files) → EasyEDA Pro .elibz2
 * Usage: npx ts-node test-full-library.ts
 */
import * as fs from 'fs';
import JSZip from 'jszip';
import * as path from 'path';

import { parseCellFile, parsePadsFile } from '../../src/converter/hkp-parser';
import type { XpedCell, XpedHole, XpedPad, XpedPadstack } from '../../src/converter/hkp-parser';
import { parsePartsFile } from '../../src/converter/parts-parser';
import type { XpedPart } from '../../src/converter/parts-parser';
import { generateFootprintSource } from '../../src/converter/pro-writer-footprint';
import { generateSymbolDocument } from '../../src/converter/pro-writer-symbol';
import { parseSymbolFile } from '../../src/converter/symbol-text-parser';

const DATA_DIR = path.resolve(__dirname, '..', '..', '测试用例', 'xpedition_library_18files');
const REF_DIR = path.resolve(__dirname, '..', '..', '参考格式');

function genUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

async function main() {
	console.log('=== Full Xpedition Library Conversion Test ===\n');

	// 1. Parse padstack library
	const pskPath = path.join(DATA_DIR, 'PadstackDB.PSK.HKP');
	const pskContent = fs.readFileSync(pskPath, 'utf-8');
	const { pads, holes, padstacks } = parsePadsFile(pskContent);

	const padMap = new Map(pads.map((p) => [p.name, p]));
	const holeMap = new Map(holes.map((h) => [h.name, h]));
	const psMap = new Map(padstacks.map((ps) => [ps.name, ps]));
	console.log(`PSK: ${pads.length} pads, ${holes.length} holes, ${padstacks.length} padstacks`);

	// 2. Parse all cell libraries
	const celFiles = fs.readdirSync(DATA_DIR).filter((f) => f.toUpperCase().endsWith('.CEL.HKP'));
	const allCells: XpedCell[] = [];
	for (const celFile of celFiles) {
		const content = fs.readFileSync(path.join(DATA_DIR, celFile), 'utf-8');
		const cells = parseCellFile(content);
		console.log(`CEL ${celFile}: ${cells.length} cells`);
		allCells.push(...cells);
	}
	console.log(`Total cells: ${allCells.length}`);

	// 3. Parse all PDB files
	const pdbFiles = fs.readdirSync(DATA_DIR).filter((f) => f.toUpperCase().endsWith('.PDB.HKP'));
	const allParts: XpedPart[] = [];
	for (const pdbFile of pdbFiles) {
		const content = fs.readFileSync(path.join(DATA_DIR, pdbFile), 'utf-8');
		const parts = parsePartsFile(content);
		console.log(`PDB ${pdbFile}: ${parts.length} parts`);
		allParts.push(...parts);
	}
	console.log(`Total parts: ${allParts.length}`);

	// 4. Parse symbol files
	const symBaseDir = path.join(DATA_DIR, 'SymbolLibs');
	const symbolFiles: { name: string; content: string }[] = [];
	function collectSymbols(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				collectSymbols(fullPath);
			} else if (/\.\d+$/.test(entry.name)) {
				const content = fs.readFileSync(fullPath, 'utf-8');
				if (/^V\s+\d+/.test(content.trim())) {
					const baseName = entry.name.replace(/\.\d+$/, '');
					symbolFiles.push({ name: baseName, content });
				}
			}
		}
	}
	if (fs.existsSync(symBaseDir)) {
		collectSymbols(symBaseDir);
	}
	console.log(`Symbol files: ${symbolFiles.length}`);

	// 5. Generate output
	const libLines: string[] = [];
	const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };

	let fpOk = 0,
		fpFail = 0,
		fpSkip = 0;
	let symOk = 0,
		symFail = 0,
		symSkip = 0;

	// 5a. Footprints — build name→uuid map
	const cellNameToUuid = new Map<string, string>();
	for (const cell of allCells) {
		if (cell.pins.length === 0) {
			fpSkip++;
			continue;
		}
		try {
			const uuid = genUUID();
			const source = generateFootprintSource(cell, psMap, padMap, holeMap, uuid);
			libLines.push(source);
			deviceData.footprints[uuid] = {
				uuid,
				ticket: 1,
				updateTime: Date.now(),
				createTime: Date.now(),
				title: cell.name.toLowerCase(),
				display_title: cell.name,
				docType: 4,
			};
			cellNameToUuid.set(cell.name, uuid);
			fpOk++;
		} catch (e: any) {
			console.log(`  FAIL footprint ${cell.name}: ${e.message}`);
			fpFail++;
		}
	}

	// 5b. Symbols — build name→uuid map
	const symNameToUuid = new Map<string, string>();
	const symGroups = new Map<string, { name: string; content: string }[]>();
	for (const f of symbolFiles) {
		if (!symGroups.has(f.name)) symGroups.set(f.name, []);
		symGroups.get(f.name)!.push(f);
	}
	for (const [name, files] of symGroups) {
		try {
			const symbols = files.map((f) => parseSymbolFile(f.content, name)).filter((s) => s.pins.length > 0 || s.graphics.length > 0);
			if (symbols.length === 0) {
				symSkip++;
				continue;
			}
			const base = symbols[0];
			const uuid = genUUID();
			const source = generateSymbolDocument(base, uuid);
			libLines.push(source);
			deviceData.symbols[uuid] = {
				uuid,
				ticket: 1,
				updateTime: Date.now(),
				createTime: Date.now(),
				title: name.toLowerCase(),
				display_title: name,
				docType: 2,
			};
			symNameToUuid.set(name, uuid);
			symOk++;
		} catch (e: any) {
			console.log(`  FAIL symbol ${name}: ${e.message}`);
			symFail++;
		}
	}

	// 5c. Devices — link Symbol and Footprint by UUID
	for (const part of allParts) {
		const uuid = genUUID();
		const symRefName = part.symbolRef.includes(':') ? part.symbolRef.split(':').pop()! : part.symbolRef;
		const symUuid = symNameToUuid.get(symRefName) || '';
		const fpUuid = cellNameToUuid.get(part.topCell) || '';
		deviceData.devices[uuid] = {
			uuid,
			ticket: 1,
			updateTime: Date.now(),
			createTime: Date.now(),
			title: (part.name || part.number).toLowerCase(),
			display_title: part.name || part.number,
			description: part.description,
			attributes: {
				'Manufacturer Part': part.name || part.number,
				'Designator': `${part.refPrefix || 'U'}?`,
				'Add into BOM': 'yes',
				'Convert to PCB': 'yes',
				'Name': `={Manufacturer Part}`,
				...(symUuid ? { 'Symbol': symUuid } : {}),
				...(fpUuid ? { 'Footprint': fpUuid } : {}),
			},
			symbol_type: 2,
		};
	}

	// 6. Package
	const outZip = new JSZip();
	outZip.file('lib2.elibu', libLines.join('\n\n'));
	outZip.file('device2.json', JSON.stringify(deviceData, null, 2));
	const buffer = await outZip.generateAsync({ type: 'nodebuffer' });
	const outFile = path.join(REF_DIR, 'test-full-library.elibz2');
	fs.writeFileSync(outFile, new Uint8Array(buffer));

	console.log(`\n=== Results ===`);
	console.log(`Footprints: ${fpOk} ok, ${fpFail} fail, ${fpSkip} skip (no pins)`);
	console.log(`Symbols: ${symOk} ok, ${symFail} fail, ${symSkip} skip (empty)`);
	console.log(`Devices: ${Object.keys(deviceData.devices).length}`);
	console.log(`Output: ${outFile} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
	console.error('Failed:', e);
	process.exit(1);
});
