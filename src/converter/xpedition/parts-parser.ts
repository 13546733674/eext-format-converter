/**
 * Parser for Xpedition Parts ASCII_PDB files (*.PDB.HKP).
 *
 * Format: dot-indented hierarchical text, similar to HKP.
 * .Number "part_number"
 *   ..Name "name"
 *   ..Label "label"
 *   ..Desc "description"
 *   ..RefPrefix "R"
 *   ..TopCell "cell_name"
 *   ..BottomCell "cell_name"
 *   ..Prop "key", "value", "type"
 *   ..Symbol "library:symbol_name"
 *     ...PinName "pin_name"
 *   ..Slots
 *     ...PinNumber "1"
 */

export interface XpedPart {
	number: string;
	name: string;
	label: string;
	description: string;
	refPrefix: string;
	topCell: string;
	bottomCell: string;
	properties: Record<string, string>;
	symbolRef: string; // "library:symbol_name"
	symbolPinNames: string[];
	slotPinNumbers: string[][]; // SlotID → pin number list
}

// eslint-disable-next-line complexity
export function parsePartsFile(content: string): XpedPart[] {
	const parts: XpedPart[] = [];
	const lines = content.split(/\r?\n/);

	let currentPart: XpedPart | null = null;
	let currentSymbolPinNames: string[] = [];
	let currentSlotPinNumbers: string[] = [];
	let inSymbol = false;
	let inSlots = false;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith('!')) continue;

		// Skip leading tabs, then count dots for indentation level
		let pos = 0;
		while (pos < line.length && (line[pos] === '\t' || line[pos] === ' ')) pos++;
		let indent = 0;
		while (pos < line.length && line[pos] === '.') {
			indent++;
			pos++;
		}
		if (indent === 0) continue;

		const trimmed = line.substring(pos).trim();
		if (!trimmed) continue;

		const sepIdx = trimmed.search(/[\s]/);
		const keyword = sepIdx > 0 ? trimmed.substring(0, sepIdx) : trimmed;
		const value = sepIdx > 0 ? trimmed.substring(sepIdx + 1).trim() : '';

		// Detect section transitions based on indent + keyword
		if (indent === 1 && keyword === 'Number') {
			// Save previous part
			if (currentPart) {
				if (currentSlotPinNumbers.length > 0) {
					currentPart.slotPinNumbers.push([...currentSlotPinNumbers]);
				}
				currentPart.symbolPinNames = [...currentSymbolPinNames];
				parts.push(currentPart);
			}
			currentPart = {
				number: unwrapQuotes(value),
				name: '',
				label: '',
				description: '',
				refPrefix: '',
				topCell: '',
				bottomCell: '',
				properties: {},
				symbolRef: '',
				symbolPinNames: [],
				slotPinNumbers: [],
			};
			currentSymbolPinNames = [];
			currentSlotPinNumbers = [];
			inSymbol = false;
			inSlots = false;
			continue;
		}

		if (!currentPart) continue;

		if (indent === 2) {
			inSymbol = false;
			inSlots = false;

			if (keyword === 'Name') currentPart.name = unwrapQuotes(value);
			else if (keyword === 'Label') currentPart.label = unwrapQuotes(value);
			else if (keyword === 'Desc') currentPart.description = unwrapQuotes(value);
			else if (keyword === 'RefPrefix') currentPart.refPrefix = unwrapQuotes(value);
			else if (keyword === 'TopCell') currentPart.topCell = unwrapQuotes(value);
			else if (keyword === 'BottomCell') currentPart.bottomCell = unwrapQuotes(value);
			else if (keyword === 'Prop') {
				// Prop "key", "value", "type"
				const propParts = value.split(',').map((s) => unwrapQuotes(s.trim()));
				if (propParts.length >= 2) {
					currentPart.properties[propParts[0]] = propParts[1];
				}
			} else if (keyword === 'Symbol') {
				currentPart.symbolRef = unwrapQuotes(value);
				inSymbol = true;
			} else if (keyword === 'Slots') {
				inSlots = true;
			}
		} else if (indent >= 3) {
			// Collect Prop from deeper levels (e.g. inside SwapGroup/SwapIDProperties)
			if (keyword === 'Prop') {
				const propParts = value.split(',').map((s) => unwrapQuotes(s.trim()));
				if (propParts.length >= 2) {
					currentPart.properties[propParts[0]] = propParts[1];
				}
			} else if (inSymbol && keyword === 'PinName') {
				currentSymbolPinNames.push(unwrapQuotes(value));
			} else if (inSlots && keyword === 'PinNumber') {
				currentSlotPinNumbers.push(unwrapQuotes(value));
			} else if (inSlots && keyword === 'SlotID') {
				// New slot — push previous slot's pin numbers and reset
				if (currentSlotPinNumbers.length > 0) {
					currentPart.slotPinNumbers.push([...currentSlotPinNumbers]);
				}
				currentSlotPinNumbers = [];
			}
		}
	}

	// Save last part
	if (currentPart) {
		if (currentSlotPinNumbers.length > 0) {
			currentPart.slotPinNumbers.push([...currentSlotPinNumbers]);
		}
		currentPart.symbolPinNames = currentSymbolPinNames;
		parts.push(currentPart);
	}

	// Assign collected symbol pin names to each part
	for (const part of parts) {
		if (part.symbolPinNames.length === 0 && currentSymbolPinNames.length > 0) {
			part.symbolPinNames = [...currentSymbolPinNames];
		}
	}

	return parts;
}

function unwrapQuotes(s: string): string {
	if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
		return s.substring(1, s.length - 1);
	}
	return s;
}
