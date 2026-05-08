/**
 * Diagnose BGA17X17_256_1MM conversion issues
 * Usage: npx ts-node test-bga.ts
 */
import * as path from 'path';
import * as fs from 'fs';
import { parsePadsFile, parseCellFile } from './src/converter/hkp-parser';
import { generateFootprintSource } from './src/converter/pro-writer-footprint';

const DATA = path.resolve(__dirname, '..', '..', '测试用例', 'xpedition_library_18files');
const psk = fs.readFileSync(path.join(DATA, 'PadstackDB.PSK.HKP'), 'utf-8');
const cel = fs.readFileSync(path.join(DATA, 'Sample.CEL.HKP'), 'utf-8');

const { pads, holes, padstacks } = parsePadsFile(psk);
const cells = parseCellFile(cel);

const padMap = new Map(pads.map(p => [p.name, p]));
const holeMap = new Map(holes.map(h => [h.name, h]));
const psMap = new Map(padstacks.map(ps => [ps.name, ps]));

const bga = cells.find(c => c.name === 'BGA17X17_256_1MM')!;
console.log('=== BGA Cell ===');
console.log('Name:', bga.name, 'Pins:', bga.pins.length, 'Outlines:', bga.outlines.length);

// Padstack resolution
const psName = bga.pins[0].padstack;
console.log('\nPadstack name:', JSON.stringify(psName), 'found:', psMap.has(psName));
const ps = psMap.get(psName);
if (ps) {
  console.log('  type:', ps.type, 'topPad:', ps.topPad, 'smPad:', ps.topSoldermaskPad);
  const tp = padMap.get(ps.topPad || '');
  console.log('  topPad obj:', tp ? `${tp.shape} d=${tp.diameter}` : 'NOT FOUND');
}

// Outlines detail
console.log('\n=== Outlines ===');
for (const o of bga.outlines) {
  console.log(`${o.kind} side=${o.side} shapes=${o.shapes.length}`);
  for (const s of o.shapes) {
    console.log(`  ${s.type} pts=${s.points?.length ?? 0} r=${s.radius} w=${s.width} filled=${s.filled}`);
  }
}

// Generate and count
const source = generateFootprintSource(bga, psMap, padMap, holeMap, '0'.repeat(32));
const lines = source.split('\n');
const padLines = lines.filter(l => l.includes('"type":"PAD"'));
const polyLines = lines.filter(l => l.includes('"type":"POLY"'));
const fillLines = lines.filter(l => l.includes('"type":"FILL"'));

console.log('\n=== Output ===');
console.log('Total lines:', lines.length);
console.log('PAD:', padLines.length, '(expected', bga.pins.length, ')');
console.log('POLY:', polyLines.length);
console.log('FILL:', fillLines.length);

// Show first/last PAD
if (padLines.length > 0) {
  console.log('\nFirst PAD:', padLines[0].substring(0, 200));
  console.log('Last PAD:', padLines[padLines.length - 1].substring(0, 200));
}

// Show all POLY/FILL
console.log('\nPOLY elements:');
for (const l of polyLines) {
  const layer = l.match(/"layerId":(\d+)/)?.[1];
  console.log(`  layer=${layer}`);
}

console.log('\nFILL elements:');
for (const l of fillLines) {
  const layer = l.match(/"layerId":(\d+)/)?.[1];
  console.log(`  layer=${layer}`);
}
