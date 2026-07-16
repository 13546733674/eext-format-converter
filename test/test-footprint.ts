/**
 * Test footprint conversion: Xpedition cell/padstack → EasyEDA Professional
 * Usage: npx tsx test/test-footprint.ts
 */
import * as fs from 'fs';
import JSZip from 'jszip';
import * as path from 'path';

import { generateFootprintSource } from '../src/converter/easyeda-pro/easyeda-pro-footprint-writer.ts';
import { parseCellFile, parsePadsFile } from '../src/converter/xpedition/hkp-parser.ts';
import type { XpedHole, XpedPad, XpedPadstack } from '../src/converter/xpedition/hkp-parser.ts';

const DATA_DIR = path.resolve(__dirname, 'data');

function genUUID(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
	return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

// Create a synthetic SMD padstack + pad for the CC0805 test
function addSyntheticPadstack(padMap: Map<string, XpedPad>, holeMap: Map<string, XpedHole>, psMap: Map<string, XpedPadstack>): void {
	const padName = 'SMD_Rect_150x130';
	const pad: XpedPad = {
		name: padName,
		shape: 'RECTANGLE',
		width: 1.5,
		height: 1.3,
		offsetX: 0,
		offsetY: 0,
	};
	padMap.set(padName, pad);

	// Soldermask pad (larger)
	const smPad: XpedPad = {
		name: padName + '_SM',
		shape: 'RECTANGLE',
		width: 1.7,
		height: 1.5,
		offsetX: 0,
		offsetY: 0,
	};
	padMap.set(smPad.name, smPad);

	// Paste pad (same as pad)
	const spPad: XpedPad = {
		name: padName + '_SP',
		shape: 'RECTANGLE',
		width: 1.5,
		height: 1.3,
		offsetX: 0,
		offsetY: 0,
	};
	padMap.set(spPad.name, spPad);

	const ps: XpedPadstack = {
		name: 'SR150X130',
		type: 'PIN_SMD',
		topPad: padName,
		bottomPad: padName,
		internalPad: undefined,
		topSoldermaskPad: smPad.name,
		bottomSoldermaskPad: smPad.name,
		topSolderpastePad: spPad.name,
		bottomSolderpastePad: spPad.name,
		holeOffsetX: 0,
		holeOffsetY: 0,
	};
	psMap.set('SR150X130', ps);
}

async function testCC0805() {
	console.log('=== CC0805 SMD Footprint Conversion ===\n');

	// Parse real data
	const padContent = fs.readFileSync(path.join(DATA_DIR, 'PadstackDB.PSK.HKP'), 'utf-8');
	const cellContent = fs.readFileSync(path.join(DATA_DIR, 'Sample.CEL.HKP'), 'utf-8');

	const { pads, holes, padstacks } = parsePadsFile(padContent);
	const padMap = new Map(pads.map((p) => [p.name, p]));
	const holeMap = new Map(holes.map((h) => [h.name, h]));
	const psMap = new Map(padstacks.map((ps) => [ps.name, ps]));

	// Add missing SMD padstack
	addSyntheticPadstack(padMap, holeMap, psMap);

	const cells = parseCellFile(cellContent);
	const cell = cells[0];

	console.log(`Cell: ${cell.name}, ${cell.pins.length} pins, ${cell.outlines.length} outlines`);
	for (const pin of cell.pins) {
		const ps = psMap.get(pin.padstack);
		console.log(`  PIN ${pin.number}: (${pin.x}, ${pin.y}) padstack=${pin.padstack} found=${!!ps}`);
	}

	// Convert
	const uuid = genUUID();
	const source = generateFootprintSource(cell, psMap, padMap, holeMap, uuid);

	// Parse and display output
	const lines = source.split('\n');
	console.log(`\nTotal output lines: ${lines.length}`);

	// Count element types
	const padLines = lines.filter((l) => l.includes('"type":"PAD"'));
	const polyLines = lines.filter((l) => l.includes('"type":"POLY"'));
	const fillLines = lines.filter((l) => l.includes('"type":"FILL"'));
	const attrLines = lines.filter((l) => l.includes('"type":"ATTR"'));
	console.log(`PAD: ${padLines.length}, POLY: ${polyLines.length}, FILL: ${fillLines.length}, ATTR: ${attrLines.length}`);

	// Show PAD details
	console.log('\nPAD elements:');
	for (const line of padLines) {
		const num = line.match(/"num":"([^"]*)"/)?.[1];
		const cx = line.match(/"centerX":([^,]*)/)?.[1];
		const cy = line.match(/"centerY":([^,]*)/)?.[1];
		const layer = line.match(/"layerId":([^,]*)/)?.[1];
		const padType = line.match(/"padType":"([^"]*)"/)?.[1];
		const hole = line.match(/"hole":(null|{[^}]*})/)?.[1];
		console.log(`  num=${num} center=(${cx}, ${cy}) layer=${layer} shape=${padType} hole=${hole?.substring(0, 30)}`);
	}

	// Show POLY details
	console.log('\nPOLY elements:');
	for (const line of polyLines) {
		const layer = line.match(/"layerId":([^,]*)/)?.[1];
		const path = line.match(/"path":\[([^\]]{0,80})/)?.[1];
		console.log(`  layer=${layer} path=${path}...`);
	}

	// Show FILL details
	console.log('\nFILL elements:');
	for (const line of fillLines) {
		const layer = line.match(/"layerId":([^,]*)/)?.[1];
		const path = line.match(/"path":\[([^\]]{0,80})/)?.[1];
		console.log(`  layer=${layer} path=${path}...`);
	}

	// Save output
	const outZip = new JSZip();
	outZip.file('lib2.elibu', source);
	const outBuffer = await outZip.generateAsync({ type: 'nodebuffer' });
	const outputFile = path.join(DATA_DIR, 'test-footprint-cc0805.elibz2');
	fs.writeFileSync(outputFile, new Uint8Array(outBuffer));
	console.log(`\nSaved: ${outputFile} (${(outBuffer.length / 1024).toFixed(1)} KB)`);
}

testCC0805().catch((e) => {
	console.error('Test failed:', e);
	process.exit(1);
});
