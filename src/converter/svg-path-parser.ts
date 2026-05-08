/**
 * Lightweight SVG path parser for extracting path commands.
 * Ported from easyeda/svg_path_parser.py
 */

export interface SvgPathCommand {
  type: string;
}

export class SvgPathMoveTo implements SvgPathCommand {
  type = 'M' as const;
  startX: number;
  startY: number;
  constructor(args: number[]) {
    this.startX = args[0];
    this.startY = args[1];
  }
}

export class SvgPathLineTo implements SvgPathCommand {
  type = 'L' as const;
  posX: number;
  posY: number;
  constructor(args: number[]) {
    this.posX = args[0];
    this.posY = args[1];
  }
}

export class SvgPathEllipticalArc implements SvgPathCommand {
  type = 'A' as const;
  radiusX: number;
  radiusY: number;
  xAxisRotation: number;
  flagLargeArc: boolean;
  flagSweep: boolean;
  endX: number;
  endY: number;
  constructor(args: number[]) {
    this.radiusX = args[0];
    this.radiusY = args[1];
    this.xAxisRotation = args[2];
    this.flagLargeArc = !!args[3];
    this.flagSweep = !!args[4];
    this.endX = args[5];
    this.endY = args[6];
  }
}

export class SvgPathClosePath implements SvgPathCommand {
  type = 'Z' as const;
}

const SVG_PATH_HANDLERS: Record<string, { new(args: number[]): SvgPathCommand; argc: number }> = {
  M: { new: (a) => new SvgPathMoveTo(a), argc: 2 },
  L: { new: (a) => new SvgPathLineTo(a), argc: 2 },
  A: { new: (a) => new SvgPathEllipticalArc(a), argc: 7 },
  Z: { new: () => new SvgPathClosePath(), argc: 0 },
};

export function parseSvgPath(svgPath: string): SvgPathCommand[] {
  const result: SvgPathCommand[] = [];
  if (!svgPath) return result;

  const prepared = svgPath.trim() + ' ';
  const normalized = prepared.replace(/,/g, ' ');

  const re = /([a-zA-Z])([ ,\-+.0-9]+)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(normalized)) !== null) {
    const cmd = match[1];
    const handler = SVG_PATH_HANDLERS[cmd];
    if (!handler) continue;

    const argStr = match[2].trim();
    if (handler.argc === 0) {
      result.push(new handler([]));
      continue;
    }

    const nums = argStr.split(/\s+/).map(Number);
    for (let i = 0; i < nums.length; i += handler.argc) {
      const chunk = nums.slice(i, i + handler.argc);
      if (chunk.length === handler.argc) {
        result.push(new handler(chunk));
      }
    }
  }

  return result;
}
