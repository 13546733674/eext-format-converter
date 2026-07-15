/**
 * Lightweight SVG path parser for extracting path commands.
 * Ported from easyeda/svg_path_parser.py
 */

export interface SvgPathCommand {
	type: string;
}

export class SvgPathMoveTo implements SvgPathCommand {
	public type = 'M' as const;
	public startX: number;
	public startY: number;
	public constructor(args: number[]) {
		this.startX = args[0];
		this.startY = args[1];
	}
}

export class SvgPathLineTo implements SvgPathCommand {
	public type = 'L' as const;
	public posX: number;
	public posY: number;
	public constructor(args: number[]) {
		this.posX = args[0];
		this.posY = args[1];
	}
}

export class SvgPathEllipticalArc implements SvgPathCommand {
	public type = 'A' as const;
	public radiusX: number;
	public radiusY: number;
	public xAxisRotation: number;
	public flagLargeArc: boolean;
	public flagSweep: boolean;
	public endX: number;
	public endY: number;
	public constructor(args: number[]) {
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
	public type = 'Z' as const;
}

interface SvgPathHandler {
	argc: number;
	create: (args: number[]) => SvgPathCommand;
}

const SVG_PATH_HANDLERS: Record<string, SvgPathHandler> = {
	M: { argc: 2, create: (a) => new SvgPathMoveTo(a) },
	L: { argc: 2, create: (a) => new SvgPathLineTo(a) },
	A: { argc: 7, create: (a) => new SvgPathEllipticalArc(a) },
	Z: { argc: 0, create: () => new SvgPathClosePath() },
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
			result.push(handler.create([]));
			continue;
		}

		const nums = argStr.split(/\s+/).map(Number);
		for (let i = 0; i < nums.length; i += handler.argc) {
			const chunk = nums.slice(i, i + handler.argc);
			if (chunk.length === handler.argc) {
				result.push(handler.create(chunk));
			}
		}
	}

	return result;
}
