/**
 * Converter registry and dispatchers.
 *
 * Supported formats are registered here; the extension and wizard only need
 * to pass a format id such as 'xpedition', 'kicad', or 'cadstar'.
 */
// Allegro import
import { allegroImport } from './allegro/allegro-import';
// Cadstar import
import { cadstarImport } from './cadstar/cadstar-import';
// PCB importers (produce a Pro V3 PCB document)
import { cadstarPcbImport } from './cadstar/cadstar-pcb-import';
// Fabmaster import
import { fabmasterImport } from './fabmaster/fabmaster-import';
import { fabmasterPcbImport } from './fabmaster/fabmaster-pcb-import';
import { gedaImport } from './geda/geda-import';
// KiCad export
import { kicadExport } from './kicad/kicad-export';
// P-CAD import
import { pcadImport } from './pcad/pcad-import';
import { pcadPcbImport } from './pcad/pcad-pcb-import';
// TinyCAD schematic import
import { tinycadImport } from './tinycad/tinycad-import';
import type { ConvertItem, ConverterExporter, ConverterImporter, ImportResult } from './types';
// ─── Register built-in formats ───────────────────────────────────────────────

// Xpedition
import { xpeditionExport } from './xpedition/xpedition-export';
import { xpeditionImport } from './xpedition/xpedition-import';

export type { ConvertItem, ImportResult, ImportItemResult, ImportFootprintItem, ImportSymbolItem, ImportDeviceItem } from './types';

export { importXpeditionZip, filterImportResult } from './xpedition/xpedition-import';

export { exportDocumentToKicad } from './kicad/kicad-export';
export { exportDocumentToXpedition } from './xpedition/xpedition-export';
export type { ProDocumentType } from './types';

const exporters = new Map<string, ConverterExporter>();
const importers = new Map<string, ConverterImporter>();

export function registerExporter(exporter: ConverterExporter): void {
	exporters.set(exporter.name, exporter);
}

export function registerImporter(importer: ConverterImporter): void {
	importers.set(importer.name, importer);
}

export function getExporterNames(): string[] {
	return Array.from(exporters.keys());
}

export function getImporterNames(): string[] {
	return Array.from(importers.keys());
}

export async function exportFromProEditor(
	format: string,
	items: ConvertItem[],
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
	const exporter = exporters.get(format);
	if (!exporter) {
		throw new Error(`Unsupported export format: ${format}`);
	}
	return exporter.exportItems(items, fetchFn, onProgress);
}

export async function importArchive(
	format: string,
	blob: Blob,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportResult> {
	const importer = importers.get(format);
	if (!importer) {
		throw new Error(`Unsupported import format: ${format}`);
	}
	return importer.importArchive(blob, onProgress);
}

// ─── Legacy compatibility ────────────────────────────────────────────────────

export async function convertFromProEditor(
	items: ConvertItem[],
	fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
	onProgress?: (done: number, total: number, name: string) => void,
): Promise<Blob> {
	return exportFromProEditor('xpedition', items, fetchFn, onProgress);
}

registerExporter(xpeditionExport);
registerImporter(xpeditionImport);

registerExporter(kicadExport);

registerImporter(cadstarImport);

registerImporter(fabmasterImport);

registerImporter(pcadImport);

registerImporter(allegroImport);

registerImporter(tinycadImport);

registerImporter(cadstarPcbImport);

registerImporter(fabmasterPcbImport);

registerImporter(gedaImport);

registerImporter(pcadPcbImport);
