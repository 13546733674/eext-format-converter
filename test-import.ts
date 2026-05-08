/**
 * 测试脚本（仅符号）：解析Xpedition符号文件，转换并输出.elibz2
 *
 * 用法: npx ts-node test-import.ts
 */
import * as path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { parseSymbolFile } from './src/converter/symbol-text-parser';
import { generateSymbolDocument } from './src/converter/pro-writer-symbol';

const REF_DIR = path.resolve(__dirname, '..', '..', '参考格式');

function genUUID(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return `${s.substring(0, 8)}${s.substring(8, 12)}4${s.substring(13, 16)}${s.substring(16, 20)}${s.substring(20)}`;
}

async function main() {
  console.log('========================================');
  console.log('  Xpedition 符号 -> EasyEDA 导入测试');
  console.log('========================================');

  // 读取符号文件
  const symPath = path.join(REF_DIR, 'xpedition符号');
  const symContent = fs.readFileSync(symPath, 'utf-8');
  console.log(`\n─── 解析符号文件 ───`);
  console.log(`  文件: ${symPath}`);

  const symbol = parseSymbolFile(symContent, '74_00');
  console.log(`  名称: ${symbol.name}`);
  console.log(`  版本: V${symbol.version}`);
  console.log(`  类型: Y${symbol.symbolType}`);
  console.log(`  缩放: Z${symbol.zoomLevel}`);
  console.log(`  范围: D ${symbol.bbox.x1} ${symbol.bbox.y1} ${symbol.bbox.x2} ${symbol.bbox.y2}`);
  console.log(`  部件数: ${symbol.partsCount}`);
  console.log(`  异构: ${symbol.hetero.join(',')}`);
  console.log(`  属性:`);
  for (const [k, v] of Object.entries(symbol.properties)) {
    console.log(`    ${k} = ${v}`);
  }
  console.log(`  引脚: ${symbol.pins.length}`);
  for (const pin of symbol.pins) {
    console.log(`    P${pin.id}: (${pin.startX},${pin.startY})→(${pin.endX},${pin.endY}) rot=${pin.rotation} inv=${pin.inverted} type=${pin.pinType} nums=[${pin.pinNumbers.join(',')}] label="${pin.label}"`);
  }
  console.log(`  图形: ${symbol.graphics.length}`);
  for (const g of symbol.graphics) {
    if (g.type === 'polyline' || g.type === 'polygon') {
      const pts = g.points.map(p => `(${p.x},${p.y})`).join(' ');
      console.log(`    ${g.type}: ${pts}`);
    } else if (g.type === 'rect') {
      console.log(`    rect: (${g.x1},${g.y1})→(${g.x2},${g.y2})`);
    } else if (g.type === 'circle') {
      console.log(`    circle: (${g.cx},${g.cy}) r=${g.radius}`);
    } else if (g.type === 'arc') {
      console.log(`    arc: (${g.startX},${g.startY}) center(${g.centerX},${g.centerY})→(${g.endX},${g.endY})`);
    }
  }
  console.log(`  文本: ${symbol.texts.length}`);
  for (const t of symbol.texts) {
    console.log(`    T: (${t.x},${t.y}) size=${t.size} rot=${t.rotation} "${t.text}"`);
  }

  // 生成EasyEDA格式
  console.log(`\n─── 生成 EasyEDA 格式 ───`);
  const symUuid = genUUID();
  const source = generateSymbolDocument(symbol, symUuid);
  console.log(`  UUID: ${symUuid}`);
  console.log(`  源码行数: ${source.split('\n').length}`);

  // 打包为.elibz2
  const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };
  deviceData.symbols[symUuid] = {
    uuid: symUuid, ticket: 1, updateTime: Date.now(), createTime: Date.now(),
    title: symbol.name.toLowerCase(), display_title: symbol.name, docType: 2,
  };

  const outZip = new JSZip();
  outZip.file('lib2.elibu', source);
  outZip.file('device2.json', JSON.stringify(deviceData, null, 2));

  const elibzBuffer = await outZip.generateAsync({ type: 'nodebuffer' });
  const outputFile = path.join(REF_DIR, 'test-output-symbol.elibz2');
  fs.writeFileSync(outputFile, new Uint8Array(elibzBuffer));
  console.log(`\n========================================`);
  console.log(`  输出: ${outputFile} (${(elibzBuffer.length / 1024).toFixed(1)} KB)`);
  console.log('========================================');
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
