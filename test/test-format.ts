/**
 * Verify output format matches EasyEDA Pro reference
 * Usage: npx tsx test/test-format.ts
 */
import * as fs from 'fs';
import * as path from 'path';

import { generateFootprintSource } from '../src/converter/easyeda-pro/easyeda-pro-footprint-writer';
import { parseCellFile, parsePadsFile } from '../src/converter/xpedition/hkp-parser';

const DATA = path.resolve(__dirname, 'data');
const psk = fs.readFileSync(path.join(DATA, 'PadstackDB.PSK.HKP'), 'utf-8');
const cel = fs.readFileSync(path.join(DATA, 'Sample.CEL.HKP'), 'utf-8');
const { pads, holes, padstacks } = parsePadsFile(psk);
const cells = parseCellFile(cel);
const padMap = new Map(pads.map((p) => [p.name, p]));
const holeMap = new Map(holes.map((h) => [h.name, h]));
const psMap = new Map(padstacks.map((ps) => [ps.name, ps]));
const bga = cells.find((c) => c.name === 'BGA17X17_256_1MM')!;
const source = generateFootprintSource(bga, psMap, padMap, holeMap, '0'.repeat(32));
const lines = source.split('\n');

// First PAD
console.log('\n=== First PAD ===');
const padLines = lines.filter((l) => l.includes('"type":"PAD"'));
if (padLines[0]) console.log(padLines[0].substring(0, 350));

// First FILL
console.log('\n=== First FILL ===');
const fillLines = lines.filter((l) => l.includes('"type":"FILL"'));
if (fillLines[0]) console.log(fillLines[0].substring(0, 350));

// First POLY
console.log('\n=== First POLY ===');
const polyLines = lines.filter((l) => l.includes('"type":"POLY"'));
if (polyLines[0]) console.log(polyLines[0].substring(0, 350));

// ATTR
console.log('\n=== ATTR elements ===');
lines.filter((l) => l.includes('"type":"ATTR"')).forEach((l) => console.log(l.substring(0, 250)));

// Summary
console.log('\n=== Summary ===');
console.log('Lines:', lines.length);
console.log('PAD:', padLines.length);
console.log('FILL:', fillLines.length);
console.log('POLY:', polyLines.length);
console.log('ATTR:', lines.filter((l) => l.includes('"type":"ATTR"')).length);
console.log('ELE_PLACEHOLDER:', lines.filter((l) => l.includes('ELE_PLACEHOLDER')).length);
console.log(
	'Boilerplate lines:',
	lines.filter((l) => l.includes('"type":"LAYER"') || l.includes('"type":"LAYER_PHYS"') || l.includes('"type":"PRIMITIVE"')).length,
);

// Verify no client field on PADs
if (padLines[0]) {
	const hasClient = padLines[0].includes('"client"');
	console.log('PAD has client field:', hasClient);
	const hasEllipse = padLines[0].includes('ELLIPSE');
	console.log('PAD uses ELLIPSE:', hasEllipse);
}
