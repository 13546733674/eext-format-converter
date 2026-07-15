import * as fs from 'fs';
import * as JSZip from 'jszip';
import * as path from 'path';

async function main() {
	const data = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', '参考格式', 'test-output-symbol.elibz2')));
	const zip = await JSZip.loadAsync(data);
	const content = await zip.file('lib2.elibu')!.async('string');
	const lines = content.split('\n');
	console.log('Total lines:', lines.length);
	// Count graphics and show pin numbers per part
	for (const partId of ['74_00.1', '74_00.2', '74_00.3']) {
		const partLines = lines.filter((l) => l.includes(`"partId":"${partId}"`));
		const polys = partLines.filter((l) => l.includes('"POLY"'));
		const arcs = partLines.filter((l) => l.includes('"ARC"'));
		const pinNums = partLines.filter((l) => l.includes('"Pin Number"'));
		console.log(`\n${partId}: ${polys.length} POLY, ${arcs.length} ARC`);
		pinNums.forEach((l) => {
			const m = l.match(/"value":"([^"]*)".*?"x":([^,]*),"y":([^,]*)/);
			if (m) console.log(`  PinNumber: value=${m[1]}, x=${m[2]}, y=${m[3]}`);
		});
		polys.forEach((l, i) => {
			const pts = l.match(/"points":\[([^\]]*)\]/);
			console.log(`  POLY ${i + 1}: ${pts ? pts[1].substring(0, 80) : '?'}`);
		});
		arcs.forEach((l) => {
			const m = l.match(/"startX":([^,]*).*"endX":([^,]*).*"referX":([^,]*)/);
			if (m) console.log(`  ARC: start=${m[1]}, end=${m[2]}, refer=${m[3]}`);
		});
	}
}

main().catch((e) => console.error(e));
