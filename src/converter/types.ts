/**
 * Shared converter types and abstractions.
 */

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

export interface ImportItemResult {
	name: string;
	status: 'ok' | 'warn' | 'fail' | 'skip';
	message?: string;
}

export interface ImportFootprintItem extends ImportItemResult {
	uuid: string;
	documentSource: string;
}

export interface ImportSymbolItem extends ImportItemResult {
	uuid: string;
	documentSource: string;
}

export interface ImportDeviceItem extends ImportItemResult {
	uuid: string;
	symbolUuid: string;
	footprintUuid: string;
}

export interface ImportResult {
	devices: ImportItemResult[];
	footprints: ImportItemResult[];
	symbols: ImportItemResult[];
	blob: Blob;
	footprintItems?: ImportFootprintItem[];
	symbolItems?: ImportSymbolItem[];
	deviceItems?: ImportDeviceItem[];
	/**
	 * Optional Pro V3 PCB document source. Kept for compatibility; new importers
	 * should package sources into an epro2 archive and set isProjectArchive.
	 */
	pcbSource?: string;
	/**
	 * When true, `blob` is an EasyEDA Pro project archive (`.epro2`) and should
	 * be imported via `importProjectByProjectFile` as a new project rather than
	 * as a library archive.
	 */
	isProjectArchive?: boolean;
}

export interface ConverterExporter {
	name: string;
	displayName: string;
	defaultFilename: string;
	exportItems: (
		items: ConvertItem[],
		fetchFn: (type: string, uuid: string, libraryUuid: string) => Promise<string | null>,
		onProgress?: (done: number, total: number, name: string) => void,
	) => Promise<Blob>;
}

export interface ConverterImporter {
	name: string;
	displayName: string;
	supportedExtensions: string[];
	importArchive: (blob: Blob, onProgress?: (done: number, total: number, name: string) => void) => Promise<ImportResult>;
}
