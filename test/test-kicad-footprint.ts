import * as fs from 'fs';
import JSZip from 'jszip';
import * as path from 'path';

import { parseProFootprint } from '../src/converter/easyeda-pro/easyeda-pro-parser';
import { generateKicadFootprint } from '../src/converter/kicad/kicad-footprint-writer';

const DATA_DIR = path.resolve(__dirname, 'data');

async function main() {
	const data = fs.readFileSync(path.join(DATA_DIR, 'test-footprint-cc0805.elibz2'));
	const zip = await JSZip.loadAsync(data);
	const source = await zip.file('lib2.elibu')!.async('string');

	const fp = parseProFootprint(source);
	console.log('Footprint name:', fp.info.name);
	console.log('Bbox:', fp.bbox);
	console.log('Pads:', fp.pads.length);
	for (const pad of fp.pads) {
		console.log(
			`  num=${pad.number} shape=${pad.shape} center=(${pad.centerX}, ${pad.centerY}) size=(${pad.width}, ${pad.height}) holeRadius=${pad.holeRadius}`,
		);
	}

	const kicad = generateKicadFootprint(fp);
	console.log('\n=== Generated KiCad footprint (first 30 lines) ===');
	kicad
		.split('\n')
		.slice(0, 30)
		.forEach((l) => console.log(l));

	fs.writeFileSync(path.join(DATA_DIR, 'test-kicad-footprint-output.kicad_mod'), kicad);
	console.log('\nSaved to test/data/test-kicad-footprint-output.kicad_mod');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
