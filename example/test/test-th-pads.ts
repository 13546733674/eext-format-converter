import * as fs from 'fs';
import * as path from 'path';

import { parsePadsFile } from '../../src/converter/hkp-parser';

const DATA = 'D:/Downloads/easyeda2xpedition-main/备份/easyeda2xpedition-main/导入插件/测试用例/xpedition_library_18files';
const psk = fs.readFileSync(path.join(DATA, 'PadstackDB.PSK.HKP'), 'utf-8');
const { pads, holes, padstacks } = parsePadsFile(psk);
const padMap = new Map(pads.map((p) => [p.name, p]));
const holeMap = new Map(holes.map((h) => [h.name, h]));
console.log('=== Through-hole padstacks ===');
for (const ps of padstacks) {
	if (ps.type === 'PIN_THROUGH') {
		const tp = ps.topPad ? padMap.get(ps.topPad) : null;
		const bp = ps.bottomPad ? padMap.get(ps.bottomPad) : null;
		const hole = ps.holeName ? holeMap.get(ps.holeName) : null;
		console.log(`PS: ${ps.name}`);
		if (tp) console.log(`  top: ${tp.name} ${tp.shape} d=${tp.diameter} w=${tp.width} h=${tp.height}`);
		if (bp) console.log(`  bot: ${bp.name} ${bp.shape} d=${bp.diameter} w=${bp.width} h=${bp.height}`);
		if (hole) console.log(`  hole: ${hole.name} ${hole.shape} d=${hole.diameter} w=${hole.width} h=${hole.height}`);
	}
}
