/* eslint-disable no-template-curly-in-string */
// i18n placeholders use ${1} format intentionally
/**
 * 入口文件
 */
import type { ConvertItem, ImportResult, ProDocumentType } from './converter';
import { exportDocumentToKicad, exportDocumentToXpedition, exportFromProEditor, filterImportResult, importArchive } from './converter';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function activate(status?: 'onStartupFinished', arg?: string): void {}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const TAG = '[FormatConvert]';
const STORE_KEY = 'libReaderData';
const PAGE_SIZE = 50;

// ─── 存储工具 ────────────────────────────────────────────────────────────────

const _sleep = (ms: number) =>
	new Promise<void>((r) => {
		setTimeout(r, ms);
	});

function _withTimeout<T>(p: Promise<T>, ms: number, label?: string): Promise<T | undefined> {
	return Promise.race([
		p.then(
			(v) => v,
			() => undefined,
		),
		new Promise<undefined>((resolve) => {
			setTimeout(() => {
				console.warn(TAG, (label || 'operation') + ' timeout');
				resolve(undefined);
			}, ms);
		}),
	]);
}

// ─── 库读取工具 ──────────────────────────────────────────────────────────────

async function _searchAllDevices(libUuid: string): Promise<Array<{ title: string; uuid: string; libraryUuid: string }>> {
	const all: Array<{ title: string; uuid: string; libraryUuid: string }> = [];
	let page = 1;
	while (true) {
		const results = await eda.lib_Device.search('', libUuid, undefined, undefined, PAGE_SIZE, page);
		if (!results || results.length === 0) break;
		for (const r of results)
			all.push({ title: r.title || r.name || r.deviceName || r.uuid, uuid: r.uuid, libraryUuid: r.libraryUuid || libUuid });
		if (results.length < PAGE_SIZE) break;
		page++;
	}
	return all;
}

async function _searchAllSymbols(libUuid: string): Promise<Array<{ title: string; uuid: string; libraryUuid: string }>> {
	const all: Array<{ title: string; uuid: string; libraryUuid: string }> = [];
	let page = 1;
	while (true) {
		const results = await eda.lib_Symbol.search('', libUuid, undefined, undefined, PAGE_SIZE, page);
		if (!results || results.length === 0) break;
		for (const r of results)
			all.push({ title: r.title || r.name || r.symbolName || r.uuid, uuid: r.uuid, libraryUuid: r.libraryUuid || libUuid });
		if (results.length < PAGE_SIZE) break;
		page++;
	}
	return all;
}

async function _searchAllFootprints(libUuid: string): Promise<Array<{ title: string; uuid: string; libraryUuid: string }>> {
	const all: Array<{ title: string; uuid: string; libraryUuid: string }> = [];
	let page = 1;
	while (true) {
		const results = await eda.lib_Footprint.search('', libUuid, undefined, PAGE_SIZE, page);
		if (!results || results.length === 0) break;
		for (const r of results)
			all.push({ title: r.title || r.name || r.footprintName || r.uuid, uuid: r.uuid, libraryUuid: r.libraryUuid || libUuid });
		if (results.length < PAGE_SIZE) break;
		page++;
	}
	return all;
}

async function _collectPersonalLib(): Promise<Array<{ name: string; uuid: string; libType: string }>> {
	const libs: Array<{ name: string; uuid: string; libType: string }> = [];
	try {
		const uuid = await eda.lib_LibrariesList.getPersonalLibraryUuid();
		if (uuid) libs.push({ name: '个人库', uuid, libType: 'personal' });
	} catch (e) {
		console.warn(TAG, '获取个人库失败:', e);
	}
	return libs;
}

async function _collectTeamLibs(): Promise<Array<{ name: string; uuid: string; libType: string }>> {
	const libs: Array<{ name: string; uuid: string; libType: string }> = [];
	try {
		const allLibs = await eda.lib_LibrariesList.getAllLibrariesList();
		for (const lib of allLibs || []) libs.push({ name: lib.name, uuid: lib.uuid, libType: 'team' });
	} catch (e) {
		console.error(TAG, '获取团队库列表失败:', e);
	}
	return libs;
}

async function _fetchLibContent(lib: { name: string; uuid: string; libType: string }) {
	let devices: Array<{ title: string; uuid: string; libraryUuid: string }> = [];
	let symbols: Array<{ title: string; uuid: string; libraryUuid: string }> = [];
	let footprints: Array<{ title: string; uuid: string; libraryUuid: string }> = [];
	try {
		devices = await _searchAllDevices(lib.uuid);
	} catch (e) {
		console.warn(TAG, lib.name + ' 搜索器件失败:', e);
	}
	try {
		symbols = await _searchAllSymbols(lib.uuid);
	} catch (e) {
		console.warn(TAG, lib.name + ' 搜索符号失败:', e);
	}
	try {
		footprints = await _searchAllFootprints(lib.uuid);
	} catch (e) {
		console.warn(TAG, lib.name + ' 搜索封装失败:', e);
	}
	return { libInfo: lib, devices, symbols, footprints };
}

/** 安全关闭文档标签页 */
async function _safeCloseDocument(id: string): Promise<void> {
	try {
		await eda.dmt_EditorControl.closeDocument(id);
	} catch (_) {
		// ignore
	}
}

/** 获取当前工作区下的团队列表 */
async function _getCurrentWorkspaceTeams(): Promise<Array<{ name: string; uuid: string }>> {
	try {
		// EasyEDA 的团队接口在刚切换工作区或客户端尚未同步完成时，返回结果偶尔会变少。
		// 这里多做几次采样并取并集，避免下拉列表时多时少。
		const seen = new Set<string>();
		const result: Array<{ name: string; uuid: string }> = [];
		const addAll = (arr: any[]) => {
			for (const t of arr || []) {
				if (!t || !t.uuid || seen.has(String(t.uuid))) continue;
				seen.add(String(t.uuid));
				result.push({ name: String(t.name || t.title || t.uuid), uuid: String(t.uuid) });
			}
		};

		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const involved = (await eda.dmt_Team.getAllInvolvedTeamInfo()) || [];
				console.log(TAG, 'getAllInvolvedTeamInfo attempt', attempt + 1, 'count:', involved.length);
				addAll(involved);
			} catch (e) {
				console.warn(TAG, 'getAllInvolvedTeamInfo failed:', e);
			}
			try {
				const direct = (await eda.dmt_Team.getAllTeamsInfo()) || [];
				console.log(TAG, 'getAllTeamsInfo attempt', attempt + 1, 'count:', direct.length);
				addAll(direct);
			} catch (e) {
				console.warn(TAG, 'getAllTeamsInfo failed:', e);
			}
			if (result.length > 0 && attempt < 2) await _sleep(300);
		}

		console.log(
			TAG,
			'Current workspace teams:',
			result.length,
			result.map((t) => t.name),
		);
		return result;
	} catch (e) {
		console.warn(TAG, 'getAllTeamsInfo failed:', e);
		return [];
	}
}

/** 获取团队的第一个文件夹 UUID */
async function _getFirstFolder(teamUuid: string): Promise<string | undefined> {
	try {
		const folders = await eda.dmt_Folder.getAllFoldersUuid(teamUuid);
		return folders && folders.length > 0 ? folders[0] : undefined;
	} catch (e) {
		console.warn(TAG, '获取文件夹失败:', e);
		return undefined;
	}
}

// ─── Import state (blob held between convert and execute) ─────────────────────

let _lastImportBlob: Blob | null = null;
let _lastImportFilename = '';
let _lastImportResult: ImportResult | null = null;
let _lastExportBlob: Blob | null = null;
let _lastExportFilename = '';
let _wizardFrameId = 'wizard';

// ─── 命令处理函数 ────────────────────────────────────────────────────────────

/** 处理 load 命令：加载库内容 */
async function _handleLoadCmd(data: any, teams: Array<{ name: string; uuid: string }>) {
	const seq: number = data.seq;
	const aff: string = data.aff;
	const teamUuid: string | undefined = data.teamUuid || undefined;

	try {
		await eda.dmt_Workspace.toggleToWorkspace(teamUuid);
	} catch (e) {
		console.warn(TAG, '工作区切换失败:', e);
	}

	const rawLibs = aff === 'personal' ? await _collectPersonalLib() : await _collectTeamLibs();
	const allItems: Array<{ uuid: string; name: string; type: string; libraryUuid: string }> = [];
	for (const lib of rawLibs) {
		const content = await _fetchLibContent(lib);
		for (const d of content.devices) allItems.push({ uuid: d.uuid, name: d.title, type: '器件', libraryUuid: d.libraryUuid });
		for (const s of content.symbols) allItems.push({ uuid: s.uuid, name: s.title, type: '符号', libraryUuid: s.libraryUuid });
		for (const f of content.footprints) allItems.push({ uuid: f.uuid, name: f.title, type: '封装', libraryUuid: f.libraryUuid });
	}

	await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'done', seq, items: allItems }));
}

/** 处理 convert 命令：导出转换 */
async function _handleConvertCmd(data: any, teams: Array<{ name: string; uuid: string }>) {
	const convertItems: ConvertItem[] = data.items || [];
	const format: string = data.format || 'xpedition';
	const filename: string = data.filename || (format === 'kicad' ? 'easyeda2kicad.zip' : 'easyeda2xpedition.zip');

	// Toggle workspace before conversion (same as load command)
	const convTeamUuid: string | undefined = data.teamUuid || undefined;
	console.log(TAG, '切换工作区 teamUuid=' + convTeamUuid);
	try {
		await eda.dmt_Workspace.toggleToWorkspace(convTeamUuid);
		await _sleep(500);
	} catch (e) {
		console.warn(TAG, '工作区切换失败:', e);
	}

	// Hide wizard so it doesn't interfere with editor
	try {
		await eda.sys_IFrame.hideIFrame(_wizardFrameId);
	} catch (e) {
		console.warn(TAG, 'hideIFrame:', e);
	}
	await _sleep(300);

	try {
		const blob = await exportFromProEditor(
			format,
			convertItems,
			async (type, uuid, libraryUuid) => {
				console.log(TAG, 'fetchFn:', type, 'uuid=' + uuid, 'libUuid=' + libraryUuid);
				if (type === '器件') {
					try {
						const dev = await _withTimeout(eda.lib_Device.get(uuid), 15000, 'lib_Device.get');
						return dev ? JSON.stringify(dev) : null;
					} catch (de) {
						console.warn(TAG, 'Device get failed:', de);
						return null;
					}
				}
				if (!libraryUuid) {
					console.warn(TAG, '跳过：libraryUuid 为空', type, uuid);
					return null;
				}

				// Try to fetch the document source directly without opening the editor.
				// The documented API does not guarantee this field, so fall back to
				// openInEditor + getDocumentSource if it is missing.
				try {
					const item = await _withTimeout(
						type === '符号' ? eda.lib_Symbol.get(uuid, libraryUuid) : eda.lib_Footprint.get(uuid, libraryUuid),
						15000,
						'lib.get',
					);
					const directSource = (item as any)?.documentSource;
					if (typeof directSource === 'string' && directSource.length > 0) {
						console.log(TAG, 'direct documentSource:', type, uuid, directSource.length + ' chars');
						return directSource;
					}
				} catch (e) {
					console.warn(TAG, '直接获取文档源码失败，回退到编辑器:', type, uuid, e);
				}

				let tabId: string | undefined;
				try {
					const openPromise =
						type === '符号' ? eda.lib_Symbol.openInEditor(uuid, libraryUuid) : eda.lib_Footprint.openInEditor(uuid, libraryUuid);

					tabId = await Promise.race([
						openPromise.then((t) => t || undefined),
						new Promise<undefined>((resolve) => {
							setTimeout(() => resolve(undefined), 15000);
						}),
					]);

					if (!tabId) {
						console.warn(TAG, 'openInEditor 超时或返回空:', type, uuid);
						openPromise.then((t) => {
							if (t) _safeCloseDocument(t);
						});
						return null;
					}

					await _sleep(2000);
					const source = await _withTimeout(eda.sys_FileManager.getDocumentSource(), 10000, 'getDocumentSource');
					console.log(TAG, 'getDocumentSource:', source ? source.length + ' chars' : 'null');
					await _sleep(300);
					_safeCloseDocument(tabId);
					return source || null;
				} catch (e) {
					console.warn(TAG, '获取文档源码失败:', type, uuid, e);
					if (tabId) _safeCloseDocument(tabId);
					return null;
				}
			},
			(done, total, name) => {
				eda.sys_Storage.setExtensionUserConfig(
					STORE_KEY,
					JSON.stringify({ teams, cmd: 'converting', seq: data.seq, progress: { done, total, name } }),
				);
			},
		);
		_lastExportBlob = blob;
		_lastExportFilename = filename;
		console.log(TAG, '转换完成，blob size=' + blob.size + ' filename=' + filename);
		await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'convert-done', seq: data.seq }));
	} catch (err) {
		console.error(TAG, '转换失败:', err);
		await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'convert-error', seq: data.seq, error: String(err) }));
	}

	// Show wizard again with result
	console.log(TAG, 'showIFrame:', _wizardFrameId);
	try {
		await eda.sys_IFrame.showIFrame(_wizardFrameId);
	} catch (e) {
		console.warn(TAG, 'showIFrame:', e);
	}
}

/** 处理 download 命令：下载上一次导出的 ZIP */
async function _handleDownloadCmd(data: any, teams: Array<{ name: string; uuid: string }>) {
	const downloadSeq: number = data.seq;
	console.log(TAG, 'download cmd received, blob=' + (_lastExportBlob ? _lastExportBlob.size + 'B' : 'null') + ' filename=' + _lastExportFilename);
	try {
		if (!_lastExportBlob) throw new Error('No export blob available');
		await eda.sys_FileSystem.saveFile(_lastExportBlob, _lastExportFilename || 'export.zip');
		console.log(TAG, 'saveFile done');
		await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'download-done', seq: downloadSeq }));
	} catch (err) {
		console.error(TAG, '下载失败:', err);
		await eda.sys_Storage.setExtensionUserConfig(
			STORE_KEY,
			JSON.stringify({ teams, cmd: 'download-error', seq: downloadSeq, error: String(err) }),
		);
	}
}

/** 处理 import 命令：导入 ZIP 解析 */
async function _handleImportCmd(data: any, teams: Array<{ name: string; uuid: string }>) {
	// Clear command immediately to prevent re-execution
	await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'importing', seq: data.seq }));
	const importSeq: number = data.seq;
	const fileData: string = data.file; // base64 encoded ZIP

	try {
		const binaryStr = atob(fileData);
		const bytes = new Uint8Array(binaryStr.length);
		for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
		const importBlob = new Blob([bytes], { type: 'application/zip' });

		const format: string = data.format || 'xpedition';
		const importResult = await importArchive(format, importBlob, (done, total, name) => {
			eda.sys_Storage.setExtensionUserConfig(
				STORE_KEY,
				JSON.stringify({
					teams,
					cmd: 'importing',
					seq: importSeq,
					progress: { done, total, name },
				}),
			);
		});

		// Store blob for later use (import-execute)
		let filename = data.filename || 'imported.elibz2';
		if (importResult.isProjectArchive) {
			const base = data.filename ? data.filename.replace(/\.[^.]+$/, '') : 'imported';
			filename = base + '.epro2';
		}
		_lastImportBlob = importResult.blob;
		_lastImportFilename = filename;
		_lastImportResult = importResult;

		await eda.sys_Storage.setExtensionUserConfig(
			STORE_KEY,
			JSON.stringify({
				teams,
				cmd: 'import-convert-done',
				seq: importSeq,
				isProjectArchive: !!importResult.isProjectArchive,
				result: {
					devices: importResult.devices,
					footprints: importResult.footprints,
					symbols: importResult.symbols,
					deviceItems: (importResult.deviceItems || []).map((d) => ({
						uuid: d.uuid,
						name: d.name,
						status: d.status,
						message: d.message,
					})),
					footprintItems: (importResult.footprintItems || []).map((f) => ({
						uuid: f.uuid,
						name: f.name,
						status: f.status,
						message: f.message,
					})),
					symbolItems: (importResult.symbolItems || []).map((s) => ({
						uuid: s.uuid,
						name: s.name,
						status: s.status,
						message: s.message,
					})),
				},
			}),
		);
	} catch (err) {
		console.error(TAG, 'Import failed:', err);
		await eda.sys_Storage.setExtensionUserConfig(
			STORE_KEY,
			JSON.stringify({
				teams,
				cmd: 'import-error',
				seq: importSeq,
				error: String(err),
			}),
		);
	}
}

async function _importProjectArchive(data: any, teams: Array<{ name: string; uuid: string }>, importBlob: Blob, importSeq: number): Promise<void> {
	const aff: string = data.aff || 'personal';
	const teamUuid: string = data.teamUuid || '';
	const isPersonal = aff === 'personal';
	const targetTeamUuid = isPersonal ? undefined : teamUuid || undefined;
	const projectName = data.projectName || _lastImportFilename.replace(/\.(elibz2|zip|epro2)$/i, '') + '_' + Date.now();
	const folderUuid = data.folderUuid || (targetTeamUuid ? await _getFirstFolder(targetTeamUuid) : undefined);
	const ext = _lastImportFilename.toLowerCase().endsWith('.epro2') ? '.epro2' : '.zip';
	const importFilename = _lastImportFilename.replace(/\.(elibz2|zip|epro2)$/i, ext) || `import${ext}`;
	const importFile = new File([importBlob], importFilename, { type: 'application/zip' });

	const saveTo: any = {
		operation: 'New Project',
		newProjectOwnerTeamUuid: targetTeamUuid,
		newProjectOwnerFolderUuid: folderUuid,
		newProjectFriendlyName: projectName,
		newProjectDescription: '',
		newProjectCollaborationMode: 1,
	};

	console.log(TAG, 'importProjectByProjectFile (project):', importFilename, 'team:', targetTeamUuid, 'folder:', folderUuid);

	await eda.sys_FileManager.importProjectByProjectFile(importFile, 'JLCEDA Pro', { importOption: 'ImportDocument' } as any, saveTo);
	if (data.download) {
		await eda.sys_FileSystem.saveFile(importBlob, importFilename);
	}
	await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'import-done', seq: importSeq }));
}

async function _importLibraryArchive(data: any, teams: Array<{ name: string; uuid: string }>, importBlob: Blob, importSeq: number): Promise<void> {
	const aff: string = data.aff || 'personal';
	const teamUuid: string = data.teamUuid || '';
	const createDevice: boolean = data.createDevice !== false;
	const isPersonal = aff === 'personal';
	const targetTeamUuid = isPersonal ? undefined : teamUuid || undefined;
	console.log(TAG, 'import target - aff:', aff, 'teamUuid:', teamUuid, 'isPersonal:', isPersonal);

	const zipName = _lastImportFilename.replace(/.elibz2$/i, '.zip');
	const importFile = new File([importBlob], zipName, { type: 'application/zip' });
	const projectName = _lastImportFilename.replace(/.elibz2$/i, '') + '_' + Date.now();

	const folderUuid = targetTeamUuid ? await _getFirstFolder(targetTeamUuid) : undefined;

	const saveTo: any = {
		operation: 'New Project',
		newProjectOwnerTeamUuid: targetTeamUuid,
		newProjectOwnerFolderUuid: folderUuid,
		newProjectFriendlyName: projectName,
		newProjectDescription: '',
		newProjectCollaborationMode: 1,
	};

	const librariesImportSetting: any = {
		ownerTeamUuid: targetTeamUuid,
		createDeviceForSingleSymbol: createDevice,
	};

	console.log(TAG, 'importProjectByProjectFile:', zipName, 'team:', targetTeamUuid, 'folder:', folderUuid);

	await eda.sys_FileManager.importProjectByProjectFile(
		importFile,
		'JLCEDA Pro',
		{ importOption: 'ExtractLibraries' } as any,
		saveTo,
		librariesImportSetting,
	);
	await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'import-done', seq: importSeq }));
}

async function _importPcbDocumentSource(teams: Array<{ name: string; uuid: string }>, importSeq: number): Promise<void> {
	const pcbUuid = await eda.dmt_Pcb.createPcb();
	if (!pcbUuid) throw new Error('Failed to create PCB document');
	const tabId = await eda.dmt_EditorControl.openDocument(pcbUuid);
	if (!tabId) throw new Error('Failed to open PCB document');
	await eda.sys_FileManager.setDocumentSource(_lastImportResult!.pcbSource);
	await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'import-done', seq: importSeq }));
}

/** 处理 import-execute 命令：执行实际导入 */
async function _handleImportExecuteCmd(data: any, teams: Array<{ name: string; uuid: string }>) {
	// Clear command immediately to prevent re-execution on next poll
	await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'import-executing', seq: data.seq }));
	const importSeq: number = data.seq;
	const importPro: boolean = data.importPro !== false;
	const download = !!data.download;
	const selectedUuids: string[] | undefined = data.selectedUuids;

	try {
		let importBlob = _lastImportBlob;
		if (selectedUuids && selectedUuids.length > 0 && _lastImportResult && !_lastImportResult.isProjectArchive) {
			console.log(TAG, 'Filtering import to', selectedUuids.length, 'items');
			importBlob = await filterImportResult(_lastImportResult, new Set(selectedUuids));
		}

		// Project archive imports (epro2): create a new EasyEDA Pro project.
		if (_lastImportResult?.isProjectArchive && importPro && importBlob) {
			await _importProjectArchive(data, teams, importBlob, importSeq);
			return;
		}

		// Legacy PCB document source imports: create a blank PCB and inject it.
		if (_lastImportResult?.pcbSource) {
			await _importPcbDocumentSource(teams, importSeq);
			return;
		}

		if (importPro && importBlob) {
			await _importLibraryArchive(data, teams, importBlob, importSeq);
		}
		if (download && importBlob) {
			await eda.sys_FileSystem.saveFile(importBlob, _lastImportFilename);
		}
		await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'import-done', seq: importSeq }));
	} catch (err) {
		console.error(TAG, 'Import execute failed:', err);
		await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'import-error', seq: importSeq, error: String(err) }));
	}
}

/** 从当前打开的符号库/封装库文档导出 KiCad 文件 */
export async function exportCurrentDocToKicad(): Promise<void> {
	try {
		const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
		if (!doc) {
			await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Please open a symbol or footprint library document first.'));
			return;
		}

		const docTypeNumber = typeof doc.documentType === 'number' ? doc.documentType : Number(doc.documentType);
		let docType: ProDocumentType | undefined;
		if (docTypeNumber === 2) {
			docType = 'symbol';
		} else if (docTypeNumber === 4) {
			docType = 'footprint';
		}
		if (!docType) {
			await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Please open a symbol or footprint library document first.'));
			return;
		}

		const source = await eda.sys_FileManager.getDocumentSource();
		if (!source) {
			await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Failed to read document source.'));
			return;
		}

		const result = exportDocumentToKicad(source, docType);
		const blob = new Blob([result.content], { type: 'text/plain' });
		await eda.sys_FileSystem.saveFile(blob, result.filename);
	} catch (err) {
		console.error(TAG, '导出 KiCad 失败:', err);
		await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Export KiCad failed: ${1}', undefined, undefined, err));
	}
}

/** 从当前打开的符号库/封装库文档导出 Xpedition 文件 */
export async function exportCurrentDocToXpedition(): Promise<void> {
	try {
		const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
		if (!doc) {
			await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Please open a symbol or footprint library document first.'));
			return;
		}

		const docTypeNumber = typeof doc.documentType === 'number' ? doc.documentType : Number(doc.documentType);
		let docType: ProDocumentType | undefined;
		if (docTypeNumber === 2) {
			docType = 'symbol';
		} else if (docTypeNumber === 4) {
			docType = 'footprint';
		}
		if (!docType) {
			await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Please open a symbol or footprint library document first.'));
			return;
		}

		const source = await eda.sys_FileManager.getDocumentSource();
		if (!source) {
			await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Failed to read document source.'));
			return;
		}

		const result = await exportDocumentToXpedition(source, docType);
		await eda.sys_FileSystem.saveFile(result.blob, result.filename);
	} catch (err) {
		console.error(TAG, '导出 Xpedition 失败:', err);
		await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Export Xpedition failed: ${1}', undefined, undefined, err));
	}
}

// ─── 主向导流程 ──────────────────────────────────────────────────────────────

export async function openImportWizard(): Promise<void> {
	return _runWizard('import', 'Import Wizard');
}

export async function openExportWizard(): Promise<void> {
	return _runWizard('export', 'Export Wizard');
}

/** @deprecated Use openImportWizard() or openExportWizard() instead. */
export async function readAllLibraries(): Promise<void> {
	return openImportWizard();
}

async function _runWizard(mode: 'import' | 'export', titleKey: string): Promise<void> {
	try {
		_wizardFrameId = mode === 'import' ? 'import-wizard' : 'export-wizard';
		let teams: Array<{ name: string; uuid: string }> = [];
		await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: '', seq: 0, items: null, mode }));

		eda.sys_IFrame.openIFrame('/iframe/wizard.html', 720, 600, _wizardFrameId, {
			title: eda.sys_I18n.text(titleKey),
			maximizeButton: false,
			minimizeButton: false,
		});

		for (;;) {
			await _sleep(300);
			let raw: string | null;
			try {
				raw = await eda.sys_Storage.getExtensionUserConfig(STORE_KEY);
			} catch (e) {
				continue;
			}
			if (!raw) continue;
			let data: any;
			try {
				data = JSON.parse(raw);
			} catch (e) {
				continue;
			}

			if (data.cmd === 'teams') {
				teams = await _getCurrentWorkspaceTeams();
				await eda.sys_Storage.setExtensionUserConfig(STORE_KEY, JSON.stringify({ teams, cmd: 'teams-done' }));
			} else if (data.cmd === 'load') {
				await _handleLoadCmd(data, teams);
			} else if (data.cmd === 'convert') {
				await _handleConvertCmd(data, teams);
			} else if (data.cmd === 'download') {
				await _handleDownloadCmd(data, teams);
			} else if (data.cmd === 'import') {
				await _handleImportCmd(data, teams);
			} else if (data.cmd === 'import-execute') {
				await _handleImportExecuteCmd(data, teams);
			} else if (data.cmd === 'exit' || data.cmd === 'done-wizard') {
				try {
					await eda.sys_IFrame.closeIFrame(_wizardFrameId);
				} catch (e) {
					console.warn(TAG, 'closeIFrame failed:', e);
				}
				break;
			}
		}
	} catch (err) {
		console.error(TAG, '向导初始化失败:', err);
		await eda.sys_Dialog.showInformationMessage(eda.sys_I18n.text('Initialization failed: ${1}', undefined, undefined, err));
	}
}
