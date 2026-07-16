import * as fs from 'fs';
import JSZip from 'jszip';
import * as path from 'path';

async function main() {
	const buf = fs.readFileSync(path.join(__dirname, 'data', 'test-full-library.elibz2'));
	const zip = await JSZip.loadAsync(new Uint8Array(buf));
	const jsonStr = await zip.file('device2.json')!.async('string');
	const data = JSON.parse(jsonStr);
	const devices = Object.values(data.devices) as any[];
	let linked = 0;
	let noSym = 0;
	let noFp = 0;
	for (const d of devices) {
		if (!d.attributes.Symbol) noSym++;
		if (!d.attributes.Footprint) noFp++;
		if (d.attributes.Symbol && d.attributes.Footprint) linked++;
	}
	console.log('Total devices:', devices.length);
	console.log('Has Symbol+Footprint:', linked);
	console.log('No Symbol:', noSym);
	console.log('No Footprint:', noFp);
	for (const d of devices) {
		if (d.attributes.Symbol && d.attributes.Footprint) {
			console.log('Example:', d.display_title, 'Sym:', d.attributes.Symbol.substring(0, 8), 'Fp:', d.attributes.Footprint.substring(0, 8));
			break;
		}
	}
}
main();
