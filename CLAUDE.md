# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

- `npm install` — install dependencies.
- `npm run compile` — bundle [src/index.ts](src/index.ts) with esbuild into `dist/`.
- `npm run build` — compile plus package the extension into `build/dist/<name>_v<version>.eext`.
- `npm run fix` — run Prettier and ESLint with auto-fix across the repo.
- `npx ts-node example/test/test-<name>.ts` — run a manual test/debug script (there is no formal test runner).

The build outputs a browser IIFE bundle (`globalName: 'edaEsbuildExportName'`) configured in [config/esbuild.common.ts](config/esbuild.common.ts). Do not change `bundle`, `minify`, `platform`, `format`, or `globalName` in that file without understanding the EasyEDA Pro extension loader requirements.

## Extension architecture

This is an EasyEDA Pro (嘉立创EDA专业版) extension named **eext-format-convert**. It converts between Xpedition (Mentor/Siemens EDA) library files and EasyEDA Pro library format.

### Entry and menu registration

- [extension.json](extension.json) declares the extension metadata, entry point (`./dist/index`), and a single header menu item under **格式转换 → 导入向导** in home/schematic/PCB contexts.
- [src/index.ts](src/index.ts) exports `readAllLibraries`, which opens the wizard iframe and handles the command loop.

### Wizard UI ↔ extension communication

- The wizard is a plain HTML/JS page at [iframe/wizard.html](iframe/wizard.html), opened via `eda.sys_IFrame.openIFrame`.
- The wizard and the extension coordinate by reading/writing `eda.sys_Storage` under the key `libReaderData`.
- Commands driven from the wizard: `load`, `convert`, `import`, `import-execute`, `exit`, `done-wizard`.

### Conversion flows

**Import (Xpedition → EasyEDA Pro)**

1. User uploads a ZIP containing Xpedition library files.
2. [src/converter/importer.ts](src/converter/importer.ts) unzips and classifies files:
    - `*.psk.hkp` → padstack definitions
    - `*.cel.hkp` → cell (footprint) definitions
    - `*.pdb.hkp` → part/device definitions
    - numeric-suffixed symbol files (e.g. `sym.1`) → schematic symbols
3. Parsers: [hkp-parser.ts](src/converter/hkp-parser.ts), [parts-parser.ts](src/converter/parts-parser.ts), [symbol-text-parser.ts](src/converter/symbol-text-parser.ts).
4. Generators: [pro-writer-footprint.ts](src/converter/pro-writer-footprint.ts) and [pro-writer-symbol.ts](src/converter/pro-writer-symbol.ts) emit EasyEDA Pro document-source lines.
5. Results are packaged into an `.elibz2` blob (`lib2.elibu` + `device2.json`), then either downloaded or imported into EasyEDA Pro via `eda.sys_FileManager.importProjectByProjectFile`.

**Export (EasyEDA Pro → Xpedition)**

1. The wizard lists devices/symbols/footprints from personal or team libraries.
2. Selected items are passed back with command `convert`.
3. [src/converter/index.ts](src/converter/index.ts) fetches each item’s source, parses it with [pro-editor-parser.ts](src/converter/pro-editor-parser.ts), and converts via [footprint-converter.ts](src/converter/footprint-converter.ts) and [symbol-converter.ts](src/converter/symbol-converter.ts).
4. Output is a ZIP of Xpedition HKP/text files saved locally.

### Data models

- [models-easyeda.ts](src/converter/models-easyeda.ts) — internal EasyEDA Pro symbol/footprint shapes.
- [models-xpedition.ts](src/converter/models-xpedition.ts) — Xpedition Cell/Padstack/Symbol text model classes.
- [easyeda-importer.ts](src/converter/easyeda-importer.ts) — parses raw EasyEDA CAD JSON strings into the internal models.
- [constants.ts](src/converter/constants.ts) — unit conversion, layer mapping, pin-type mapping.

## Packaging and release

- [build/packaged.ts](build/packaged.ts) creates the `.eext` file by zipping repo files while honoring [.edaignore](.edaignore).
- `.edaignore` excludes source/config/build tooling; only runtime assets (dist, iframe, locales, images, README, extension.json, etc.) ship.
- [`.github/workflows/build.yml`](.github/workflows/build.yml) builds on push to `main`/`master`, bumps the git tag from `extension.json` version, and releases separate `zh-cn` and `global` language packages.

## Code style and i18n

- Prettier config: tabs, single quotes, print width 150, sorted imports via `@trivago/prettier-plugin-sort-imports` ([.prettierrc.js](.prettierrc.js)).
- ESLint: `alloy` + `alloy/typescript` with `tsdoc/syntax` warning ([.eslintrc.js](.eslintrc.js)).
- Translations live in [locales/](locales/); wizard strings use `${1}` placeholders and are resolved via `eda.sys_I18n.text`.
