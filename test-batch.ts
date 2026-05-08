/**
 * 批量测试：将 testsym.zip 中的所有符号转为 elibz2
 * 用法: npx ts-node test-batch.ts
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
  return s;
}

async function main() {
  console.log('========================================');
  console.log('  testsym.zip 批量符号转换测试');
  console.log('========================================');

  const zipPath = path.join(REF_DIR, 'testsym.zip');
  const data = new Uint8Array(fs.readFileSync(zipPath));
  const zip = await JSZip.loadAsync(data);

  // Collect all symbol files
  const symbolFiles: { name: string; content: string }[] = [];
  for (const [filePath, file] of Object.entries(zip.files)) {
    if (!file.dir && filePath.startsWith('sym/')) {
      const content = await file.async('string');
      const baseName = path.basename(filePath);
      symbolFiles.push({ name: baseName, content });
    }
  }

  console.log(`\n找到 ${symbolFiles.length} 个符号文件\n`);

  // Convert each symbol
  const allSourceLines: string[] = [];
  const deviceData: any = { devices: {}, symbols: {}, footprints: {}, panelLibs: {} };

  for (const sf of symbolFiles) {
    try {
      const symbol = parseSymbolFile(sf.content, sf.name);
      const uuid = genUUID();
      const source = generateSymbolDocument(symbol, uuid);

      // Each symbol gets its own DOCHEAD block
      allSourceLines.push(source);

      deviceData.symbols[uuid] = {
        uuid,
        ticket: 1,
        updateTime: Date.now(),
        createTime: Date.now(),
        title: symbol.name.toLowerCase(),
        display_title: symbol.name,
        docType: 2,
      };

      console.log(`  ${sf.name}: type=Y${symbol.symbolType}, ${symbol.pins.length} pins, ${symbol.graphics.length} graphics, ${symbol.partsCount} parts -> OK`);
    } catch (e: any) {
      console.log(`  ${sf.name}: ERROR - ${e.message}`);
    }
  }

  // Package as elibz2
  const outZip = new JSZip();
  outZip.file('lib2.elibu', allSourceLines.join('\n\n'));
  outZip.file('device2.json', JSON.stringify(deviceData, null, 2));

  const elibzBuffer = await outZip.generateAsync({ type: 'nodebuffer' });
  const outputFile = path.join(REF_DIR, 'test-batch-output.elibz2');
  fs.writeFileSync(outputFile, new Uint8Array(elibzBuffer));

  console.log(`\n========================================`);
  console.log(`  输出: ${outputFile} (${(elibzBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`  符号数: ${Object.keys(deviceData.symbols).length}`);
  console.log('========================================');
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
