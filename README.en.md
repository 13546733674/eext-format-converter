# Format Convert

An extension for EasyEDA / JLCEDA Professional Edition that converts Xpedition (Mentor Graphics / Siemens EDA) library files to EasyEDA Pro format and imports them.

## Features

- **Import Xpedition Files**: Import Xpedition library files in ZIP format (containing PSK/CEL/PDB/symbol files)
- **Export Xpedition Files**: Export EasyEDA Pro libraries to Xpedition-compatible format
- **Import/Export Wizard**: A graphical wizard that guides users through the format conversion process
- **Post-conversion options**:
  - Import to Pro — directly import the converted result into the currently open EasyEDA Pro
  - Download library file — save the converted `.elibz2` file locally

## Usage

1. Install this extension in EasyEDA Professional Edition
2. Open the wizard via menu **Format Convert → Import/Export Wizard**
3. Select "Import Xpedition files" or "Export Xpedition files"
4. Follow the wizard instructions to complete the operation

## Supported File Formats

| Format      | Description                                         |
| ----------- | --------------------------------------------------- |
| `.zip`    | Archive containing Xpedition library files (import) |
| `.elibz2` | EasyEDA Pro library file format (output)            |

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
