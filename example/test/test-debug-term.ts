import * as fs from 'fs';
import JSZip from 'jszip';
import * as path from 'path';

import { generateSymbolDocument } from '../../src/converter/pro-writer-symbol';
import { parseSymbolFile } from '../../src/converter/symbol-text-parser';

async function main() {
	const data = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', '参考格式', 'testsym.zip')));
	const zip = await JSZip.loadAsync(data);
	const content = await zip.file('sym/term.1')!.async('string');
	const symbol = parseSymbolFile(content, 'term.1');
	console.log('Name:', symbol.name, 'Zoom:', symbol.zoomLevel);
	console.log('Pins:', symbol.pins.length);
	for (const pin of symbol.pins) {
		console.log(`  P${pin.id}: (${pin.startX},${pin.startY})->(${pin.endX},${pin.endY}) nums=[${pin.pinNumbers.join(',')}] label="${pin.label}"`);
	}
	console.log('Graphics:', symbol.graphics.length);
	for (const g of symbol.graphics) {
		if (g.type === 'polyline' || g.type === 'polygon') {
			console.log(`  ${g.type}: ${g.points.map((p) => `(${p.x},${p.y})`).join(' ')}`);
		}
	}
	const s = (v: number) => Math.round(v * symbol.zoomLevel * 0.1 * 100) / 100;
	console.log('\nScale test: -254000 ->', s(-254000), ', -355600 ->', s(-355600));
	console.log('Pin tip scaled:', s(symbol.pins[0].startX), s(symbol.pins[0].startY));
}
main();
