/**
 * Converter orchestration — convert selected items and package into ZIP.
 */

import JSZip from 'jszip';
import { FootprintConverter } from './footprint-converter';
import { SymbolConverter } from './symbol-converter';
import { parseProSymbol, parseProFootprint } from './pro-editor-parser';

export { importXpeditionZip, filterImportResult } from './importer';
export type { ImportResult, ImportItemResult } from './importer';

export interface ConvertItem {
  uuid: string;
  name: string;
  type: string; // '符号' | '封装' | '器件'
  libraryUuid: string;
}

export interface DeviceFetchResult {
  association?: {
    symbol?: { uuid: string; libraryUuid?: string };
    footprint?: { uuid: string; libraryUuid?: string };
  };
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_') || 'unnamed';
}

export async function convertSelectedItems(
  items: ConvertItem[],
  fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<any>,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const total = items.length;
  let done = 0;

  for (const item of items) {
    if (onProgress) onProgress(done, total, item.name);

    try {
      if (item.type === '器件') {
        const deviceData: DeviceFetchResult = await fetchFn('器件', item.uuid, item.libraryUuid);
        if (!deviceData) { console.warn(`[FormatConvert] Device data null for ${item.name}`); done++; continue; }

        const assoc = deviceData.association;
        const safeName = sanitize(item.name);

        const symUuid = assoc?.symbol?.uuid;
        const symLibUuid = assoc?.symbol?.libraryUuid || '';
        if (symUuid) {
          try {
            const symData = await fetchFn('符号', symUuid, symLibUuid);
            if (symData) {
              const symConverter = new SymbolConverter(symData);
              symConverter.convert();
              const files = symConverter.saveToFiles();
              for (const [partName, content] of Object.entries(files)) {
                zip.file(`${safeName}_${sanitize(partName)}`, content);
              }
            } else {
              console.warn(`[FormatConvert] Symbol data null for device ${item.name}`);
            }
          } catch (e) {
            console.warn(`[FormatConvert] Device symbol conversion failed for ${item.name}:`, e);
          }
        }

        const fpUuid = assoc?.footprint?.uuid;
        const fpLibUuid = assoc?.footprint?.libraryUuid || '';
        if (fpUuid) {
          try {
            const fpData = await fetchFn('封装', fpUuid, fpLibUuid);
            if (fpData) {
              const fpConverter = new FootprintConverter(fpData);
              fpConverter.convert();
              zip.file(`${safeName}_Pads.hkp`, fpConverter.savePadstacksToString());
              zip.file(`${safeName}_Cell.hkp`, fpConverter.saveCellToString());
            } else {
              console.warn(`[FormatConvert] Footprint data null for device ${item.name}`);
            }
          } catch (e) {
            console.warn(`[FormatConvert] Device footprint conversion failed for ${item.name}:`, e);
          }
        }
      } else {
        const rawData = await fetchFn(item.type, item.uuid, item.libraryUuid);
        if (!rawData) { console.warn(`[FormatConvert] Data null for ${item.name} (${item.type})`); done++; continue; }

        if (item.type === '封装') {
          const converter = new FootprintConverter(rawData);
          converter.convert();
          const safeName = sanitize(item.name);
          zip.file(`${safeName}_Pads.hkp`, converter.savePadstacksToString());
          zip.file(`${safeName}_Cell.hkp`, converter.saveCellToString());
        } else if (item.type === '符号') {
          const converter = new SymbolConverter(rawData);
          converter.convert();
          const files = converter.saveToFiles();
          for (const [partName, content] of Object.entries(files)) {
            zip.file(`${sanitize(partName)}`, content);
          }
        }
      }
    } catch (e) {
      console.warn(`[FormatConvert] Failed to convert ${item.name} (${item.type}):`, e);
    }

    done++;
  }

  if (onProgress) onProgress(total, total, '');
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Convert items using Pro editor document source (|| delimited line format).
 * Each fetchFn call returns the raw source string from getDocumentSource().
 */
export async function convertFromProEditor(
  items: ConvertItem[],
  fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
  const zip = new JSZip();
  const total = items.length;
  let done = 0;

  for (const item of items) {
    if (onProgress) onProgress(done, total, item.name);

    try {
      if (item.type === '器件') {
        // Device: fetch device data to get symbol/footprint associations
        const deviceSource = await fetchFn('器件', item.uuid, item.libraryUuid);
        if (!deviceSource) { console.warn(`[FormatConvert] Device data null for ${item.name}`); done++; continue; }

        // Device source might be Pro editor format or JSON object
        let devData: any = null;
        try { devData = JSON.parse(deviceSource); } catch { continue; }

        const assoc = devData.association || devData;
        const safeName = sanitize(item.name);
        // Fallback: use device's own libraryUuid if association doesn't have one
        const devLib = item.libraryUuid || '';

        const symUuid = assoc?.symbol?.uuid;
        const symLibUuid = assoc?.symbol?.libraryUuid || devLib;
        if (symUuid && symLibUuid) {
          try {
            const symSource = await fetchFn('符号', symUuid, symLibUuid);
            if (symSource) {
              const sym = parseProSymbol(symSource);
              const converter = SymbolConverter.fromEeSymbol(sym);
              converter.convert();
              const files = converter.saveToFiles();
              for (const [partName, content] of Object.entries(files)) {
                zip.file(`${safeName}_${sanitize(partName)}`, content);
              }
            }
          } catch (e) { console.warn(`[FormatConvert] Device symbol failed for ${item.name}:`, e); }
        }

        const fpUuid = assoc?.footprint?.uuid;
        const fpLibUuid = assoc?.footprint?.libraryUuid || devLib;
        if (fpUuid && fpLibUuid) {
          try {
            const fpSource = await fetchFn('封装', fpUuid, fpLibUuid);
            if (fpSource) {
              const fp = parseProFootprint(fpSource);
              const converter = FootprintConverter.fromEeFootprint(fp);
              converter.convert();
              zip.file(`${safeName}_Pads.hkp`, converter.savePadstacksToString());
              zip.file(`${safeName}_Cell.hkp`, converter.saveCellToString());
            }
          } catch (e) { console.warn(`[FormatConvert] Device footprint failed for ${item.name}:`, e); }
        }
      } else {
        const source = await fetchFn(item.type, item.uuid, item.libraryUuid);
        if (!source) { console.warn(`[FormatConvert] Source null for ${item.name} (${item.type})`); done++; continue; }

        const safeName = sanitize(item.name);

        if (item.type === '封装') {
          const fp = parseProFootprint(source);
          const converter = FootprintConverter.fromEeFootprint(fp);
          converter.convert();
          zip.file(`${safeName}_Pads.hkp`, converter.savePadstacksToString());
          zip.file(`${safeName}_Cell.hkp`, converter.saveCellToString());
        } else if (item.type === '符号') {
          const sym = parseProSymbol(source);
          const converter = SymbolConverter.fromEeSymbol(sym);
          converter.convert();
          const files = converter.saveToFiles();
          for (const [partName, content] of Object.entries(files)) {
            zip.file(`${sanitize(partName)}`, content);
          }
        }
      }
    } catch (e) {
      console.warn(`[FormatConvert] Failed to convert ${item.name} (${item.type}):`, e);
    }

    done++;
  }

  if (onProgress) onProgress(total, total, '');
  return zip.generateAsync({ type: 'blob' });
}
