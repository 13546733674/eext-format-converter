# Format Convert v1.0.2

An extension for EasyEDA / JLCEDA Professional Edition that converts between multiple EDA formats and EasyEDA Pro, including Xpedition, Cadstar, Fabmaster, P-CAD, Allegro, gEDA, TinyCAD, and export to KiCad.

## Features

- **Import multiple formats**: Import Xpedition (ZIP library package), Cadstar, Fabmaster, P-CAD, Allegro, gEDA, and TinyCAD files into EasyEDA Pro libraries or projects
- **Export KiCad**: Export the current symbol/footprint library document to `.kicad_sym` / `.kicad_mod` via the top menu
- **Export Xpedition**: Export EasyEDA Pro libraries to Xpedition-compatible format
- **Import/Export Wizard**: A graphical wizard that guides users through the format conversion process
- **Post-conversion options**:
    - Import to Pro — directly import the converted result into the currently open EasyEDA Pro
    - Download library file — save the converted `.elibz2` file locally

## Usage

1. Install this extension in EasyEDA Professional Edition
2. Open the wizard via menu **Format Convert → Import/Export Wizard...**
3. Select the format you want to import or export
4. Follow the wizard instructions to complete the operation

## Supported File Formats

| Direction | Format           | Description                                          |
| --------- | ---------------- | ---------------------------------------------------- |
| Import    | `.zip`           | Xpedition library package (PSK/CEL/PDB/symbol files) |
| Import    | `.zip/.cpa`      | Cadstar PCB file                                     |
| Import    | `.zip/.txt/.fab` | Fabmaster PCB file                                   |
| Import    | `.zip/.pcb`      | P-CAD / gEDA PCB file                                |
| Import    | `.zip/.dsn`      | TinyCAD schematic file                               |
| Export    | `.zip`           | Xpedition-compatible library package                 |
| Export    | `.zip`           | KiCad library package (`.kicad_sym` + `.kicad_mod`)  |

For Xpedition, the library files must first be converted to ASCII and packaged into a ZIP using the packager tool. See the [packager README](https://github.com/easyeda/eext-format-convert/blob/main/tools/xpedition-library-packager/README.md).

## Development

```shell
# Install dependencies
npm install

# Compile
npm run compile

# Package
npx ts-node build/packaged.ts
```

## Open-source License

This plugin uses the [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/) open source license.
