/**
 * Build a minimal EasyEDA Pro V3 project archive (`.epro2`).
 *
 * An epro2 is a ZIP containing:
 *   - `project2.json`  project metadata
 *   - `<name>.epru`    project log: concatenated DOCHEAD + source lines
 *   - optional `IMAGE/` assets
 *
 * This builder supports two import scenarios:
 *   - PCB-only: CONFIG + BOARD + PCB documents
 *   - Schematic-only: CONFIG + SCH + SCH_PAGE documents (+ optional SYMBOL docs)
 */
import JSZip from 'jszip';

import { genUUID } from './easyeda-pro-import-builder';

export interface Epro2DocumentSource {
	docType: 'PCB' | 'SCH' | 'SCH_PAGE' | 'SYMBOL' | 'FOOTPRINT' | 'DEVICE' | 'BOARD';
	uuid: string;
	client: string;
	source: string;
	updateTime?: number;
	version?: number;
}

export interface Epro2Options {
	projectName: string;
	introduction?: string;
	description?: string;
	/** Generated Pro V3 PCB document source (starts with PCB DOCHEAD). */
	pcbSource?: string;
	/** Generated Pro V3 schematic page source(s) (each starts with SCH_PAGE DOCHEAD). */
	schematicPageSources?: string[];
	/** Generated Pro V3 symbol sources to include as library documents. */
	symbolSources?: string[];
	/** Generated Pro V3 footprint sources to include as library documents. */
	footprintSources?: string[];
}

function generateClient(): string {
	const hex = '0123456789abcdef';
	let s = '';
	for (let i = 0; i < 16; i++) s += hex[Math.floor(Math.random() * 16)];
	return s;
}

function buildDocHead(docType: string, uuid: string, client: string, updateTime: number, version: number): string {
	return `{"type":"DOCHEAD","ticket":1}||{"docType":"${docType}","client":"${client}","uuid":"${uuid}","updateTime":${updateTime},"version":"${version}","user":{"uuid":"${uuid}"}}|`;
}

function buildConfigDocHead(client: string, updateTime: number, version: number): string {
	return `{"type":"DOCHEAD","ticket":1}||{"docType":"CONFIG","client":"${client}","uuid":"CONFIG","updateTime":${updateTime},"version":"${version}","user":{"uuid":"CONFIG"}}|`;
}

/**
 * Build a minimal CONFIG document source.
 */
function buildConfigSource(client: string, defaultSheetUuid?: string): string {
	const lines: string[] = [];
	lines.push(
		`{"type":"UNIVERSAL","ticket":1,"id":"UNIVERSAL"}||{"allowLibRename":true,"defaultNetName":true,"wireMultipleNet":true,"netFlagCrossLayerConnection":true,"netLabelCrossPageConnection":true,"busGenerateNetClass":true,"relevanceDisplayRow":"SINGLE","relevanceBelongSchPage":"NAME","relevanceLocation":"ZONE"}|`,
	);
	if (defaultSheetUuid) {
		lines.push(`{"type":"META","ticket":2,"id":"META"}||{"defaultSheet":"${defaultSheetUuid}"}|`);
	} else {
		lines.push(`{"type":"META","ticket":2,"id":"META"}||{}|`);
	}
	return lines.join('\n');
}

/**
 * Build a minimal BOARD document source.
 */
function buildBoardSource(boardUuid: string, client: string, pcbUuid?: string, schUuid?: string): string {
	const lines: string[] = [];
	lines.push(buildDocHead('BOARD', boardUuid, client, Date.now(), Date.now()));
	const meta: Record<string, any> = { title: 'Board1', zIndex: null };
	if (pcbUuid) meta.pcb = pcbUuid;
	if (schUuid) meta.sch = schUuid;
	lines.push(`{"type":"META","ticket":1,"id":"META"}||${JSON.stringify(meta)}|`);
	lines.push(`{"type":"META_MODIFY","ticket":2,"id":"META_MODIFY"}||{"updateTime":${Date.now()}}|`);
	return lines.join('\n');
}

/**
 * Build a minimal SCH document source.
 */
function buildSchSource(schUuid: string, client: string, boardUuid: string, defaultPageUuid: string): string {
	const lines: string[] = [];
	lines.push(buildDocHead('SCH', schUuid, client, Date.now(), Date.now()));
	lines.push(`{"type":"META","ticket":1,"id":"META"}||{"title":"Schematic1","source":"","board":"${boardUuid}","zIndex":null}|`);
	lines.push(`{"type":"ACTIVE_SHEET","ticket":2,"id":"ACTIVE_SHEET"}||{"uuid":"${defaultPageUuid}"}|`);
	return lines.join('\n');
}

/**
 * Strip an existing DOCHEAD line from a generated document source so we can
 * re-emit it with a project-level consistent DOCHEAD, or keep it if absent.
 */
function stripDocHead(source: string): string {
	const lines = source.split('\n');
	if (lines[0]?.includes('"type":"DOCHEAD"')) {
		return lines.slice(1).join('\n');
	}
	return source;
}

function normalizeSource(source: string): string {
	return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+/g, '\n').trim();
}

function buildEpruContent(
	options: Epro2Options,
	client: string,
	boardUuid: string,
	pcbUuid?: string,
	schUuid?: string,
	defaultPageUuid?: string,
): string {
	const now = Date.now();
	const epruParts: string[] = [];

	// CONFIG
	epruParts.push(buildConfigDocHead(client, now, now));
	epruParts.push(buildConfigSource(client, defaultPageUuid));

	// BOARD (link PCB and SCH)
	if (pcbUuid || schUuid) {
		epruParts.push(buildBoardSource(boardUuid, client, pcbUuid, schUuid));
	}

	// SCH + SCH_PAGE
	if (schUuid && defaultPageUuid && options.schematicPageSources) {
		epruParts.push(buildSchSource(schUuid, client, boardUuid, defaultPageUuid));
		for (let i = 0; i < options.schematicPageSources.length; i++) {
			const pageSource = normalizeSource(options.schematicPageSources[i]);
			const pageUuid = i === 0 ? defaultPageUuid : genUUID();
			const stripped = stripDocHead(pageSource);
			epruParts.push(buildDocHead('SCH_PAGE', pageUuid, client, now, now));
			epruParts.push(stripped);
		}
	}

	// PCB
	if (pcbUuid && options.pcbSource) {
		const pcbSource = normalizeSource(options.pcbSource);
		const stripped = stripDocHead(pcbSource);
		epruParts.push(buildDocHead('PCB', pcbUuid, client, now, now));
		epruParts.push(stripped);
	}

	// Library documents (SYMBOL / FOOTPRINT) appended at the end
	for (const symSource of options.symbolSources ?? []) {
		epruParts.push(normalizeSource(symSource));
	}
	for (const fpSource of options.footprintSources ?? []) {
		epruParts.push(normalizeSource(fpSource));
	}

	return epruParts.filter((p) => p.length > 0).join('\n') + '\n';
}

export async function buildEpro2Archive(options: Epro2Options): Promise<Blob> {
	const projectName = options.projectName || 'Imported Project';
	const introduction = options.introduction ?? '';
	const description = options.description ?? '';
	const client = generateClient();

	const boardUuid = genUUID();
	const hasPcb = !!options.pcbSource;
	const hasSch = !!options.schematicPageSources && options.schematicPageSources.length > 0;
	const pcbUuid = hasPcb ? genUUID() : undefined;
	const schUuid = hasSch ? genUUID() : undefined;
	const defaultPageUuid = hasSch ? genUUID() : undefined;

	const epruContent = buildEpruContent(options, client, boardUuid, pcbUuid, schUuid, defaultPageUuid);
	const epruName = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}.epru`;

	const project2Json = JSON.stringify({
		title: projectName,
		cbb_project: false,
		editorVersion: '',
		introduction,
		description,
		tags: '[]',
	});

	const zip = new JSZip();
	zip.file('project2.json', project2Json);
	zip.file(epruName, epruContent);
	// No IMAGE folder needed for imported geometry.

	const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
	return new Blob([arrayBuffer], { type: 'application/zip' });
}
