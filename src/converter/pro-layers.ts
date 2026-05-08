/**
 * Pro V3 document boilerplate generators — layers, canvas.
 * FOOTPRINT format matching 嘉立创符号+封装.txt reference.
 */

// MM → EasyEDA internal unit (mil): mm × 39.3701
export function mmToEeUnit(mm: number): number {
  return Math.round(mm * 39.3701 * 100) / 100;
}

export function mmToEeUnitInt(mm: number): number {
  return Math.round(mm * 39.3701);
}

// ─── Footprint boilerplate (FOOTPRINT library format) ────────────────────────

export function generateFootprintBoilerplate(uuid: string, title: string, contentClient: string): string {
  const lines: string[] = [];
  const now = Date.now();
  const docHeadLine = `{"type":"DOCHEAD"}||{"docType":"FOOTPRINT","client":"40a70b99d69ad9e2","uuid":"${uuid}","updateTime":${now},"version":"${now}","editVersion":"3.2.127","user":{}}|`;

  // DOCHEAD + META + DOCHEAD
  lines.push(docHeadLine);
  lines.push(`{"type":"META","ticket":1,"id":"META"}||{"title":"${title}","description":"","tags":[],"source":""}|`);
  lines.push(docHeadLine);

  // 19 LAYER entries (order and IDs match SOD-123 reference)
  const layerEntries: [number, string, string, string, string, number][] = [
    [1, 'TOP', 'Top Layer', '#FF0000', '#7F0000', 1],
    [2, 'BOTTOM', 'Bottom Layer', '#0000FF', '#00007F', 1],
    [3, 'TOP_SILK', 'Top Silkscreen Layer', '#FFCC00', '#7F6600', 1],
    [4, 'BOT_SILK', 'Bottom Silkscreen Layer', '#66CC33', '#336619', 1],
    [7, 'TOP_PASTE_MASK', 'Top Paste Mask Layer', '#808080', '#404040', 1],
    [8, 'BOT_PASTE_MASK', 'Bottom Paste Mask Layer', '#800000', '#400000', 1],
    [5, 'TOP_SOLDER_MASK', 'Top Solder Mask Layer', '#800080', '#400040', 1],
    [6, 'BOT_SOLDER_MASK', 'Bottom Solder Mask Layer', '#AA00FF', '#55007F', 1],
    [13, 'DOCUMENT', 'Document Layer', '#FFFFFF', '#7F7F7F', 1],
    [11, 'OUTLINE', 'Board Outline Layer', '#FF00FF', '#7F007F', 1],
    [12, 'MULTI', 'Multi-Layer', '#C0C0C0', '#606060', 1],
    [9, 'TOP_ASSEMBLY', 'Top Assembly Layer', '#33CC99', '#19664C', 1],
    [10, 'BOT_ASSEMBLY', 'Bottom Assembly Layer', '#5555FF', '#2A2A7F', 1],
    [14, 'MECHANICAL', 'Mechanical Layer', '#F022F0', '#781178', 1],
    [52, 'COMPONENT_MODEL', 'Component Model Layer', '#FFFFFF', '#7F7F7F', 1],
    [48, 'COMPONENT_SHAPE', 'Component Shape Layer', '#00CCCC', '#006666', 1],
    [51, 'PIN_FLOATING', 'Pin Floating Layer', '#FF99FF', '#7F4C7F', 1],
    [49, 'COMPONENT_MARKING', 'Component Marking Layer', '#66FFCC', '#337F66', 1],
    [50, 'PIN_SOLDERING', 'Pin Soldering Layer', '#CC9999', '#664C4C', 1],
  ];

  let t = 0;
  for (const [layerId, layerType, layerName, activeColor, inactiveColor, inactiveTrans] of layerEntries) {
    t++;
    lines.push(`{"type":"LAYER","ticket":${t},"id":"[\\\"LAYER\\\",${layerId}]","client":"${contentClient}"}||{"layerType":"${layerType}","layerName":"${layerName}","use":true,"show":true,"locked":false,"activeColor":"${activeColor}","activateTransparency":1,"inactiveColor":"${inactiveColor}","inactiveTransparency":${inactiveTrans}}|`);
  }

  // ACTIVE_LAYER
  const firstT = t + 1;
  const activeT = t + 2;
  lines.push(`{"type":"ACTIVE_LAYER","ticket":${activeT},"id":"ACTIVE_LAYER","firstTicket":${firstT},"client":"${contentClient}"}||{"layerId":1}|`);

  // CANVAS
  const canvasT = activeT + 1;
  lines.push(`{"type":"CANVAS","ticket":${canvasT},"id":"CANVAS","client":"${contentClient}"}||{"originX":0,"originY":0,"unit":"mm","gridXSize":10,"gridYSize":10,"snapXSize":0.393701,"snapYSize":0.393701,"gridType":"NONE","multiGridType":"NONE","highlightValue":0.5}|`);

  return lines.join('\n');
}

// ─── Symbol boilerplate ─────────────────────────────────────────────────────

export function generateSymbolBoilerplate(uuid: string, partTitle: string, title?: string): string {
  const now = Date.now();
  const lines: string[] = [];
  const docHeadLine = `{"type":"DOCHEAD"}||{"docType":"SYMBOL","client":"dc1b67a7c337aae3","uuid":"${uuid}","updateTime":${now},"version":"${now}"}|`;
  lines.push(docHeadLine);
  lines.push(`{"type":"META","ticket":1,"id":"META"}||{"title":"${title || partTitle}","description":"","tags":[],"docType":2,"source":""}|`);
  lines.push(docHeadLine);
  lines.push(`{"type":"CANVAS","ticket":1,"id":"CANVAS"}||{"originX":0,"originY":0}|`);
  lines.push(`{"type":"PART","ticket":2,"id":"${partTitle}"}||{"title":"${partTitle}"}|`);
  return lines.join('\n');
}

// Deprecated exports kept for compatibility
export function resetBoilerplateTicket(): void {}
