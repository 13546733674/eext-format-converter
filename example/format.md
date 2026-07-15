# 示例文件格式说明

本目录包含格式转换插件所支持的各类示例文件，可用于测试与参考。

## 导入格式

| 格式          | 示例文件                                                                           | 说明                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Xpedition     | [xpedition_device](xpedition_device)、[xpedition_symbol.txt](xpedition_symbol.txt) | Mentor/Siemens Xpedition 库 ASCII 文本                                                                         |
| TinyCAD       | [tinycad_schematic.dsn](tinycad_schematic.dsn)                                     | TinyCAD XML 原理图 — [详细说明](tinycad-file-format.md)、[TinyCAD 项目](https://github.com/matt123p/TinyCADv4) |
| Cadstar PCB   | -                                                                                  | Cadstar `.cpa` / ZIP 包：https://dev-docs.kicad.org/en/import-formats/cadstar/index.html                       |
| Fabmaster PCB | -                                                                                  | Fabmaster `.txt` / `.fab` / ZIP 包：https://dev-docs.kicad.org/en/import-formats/fabmaster/index.html          |
| gEDA PCB      | -                                                                                  | gEDA `.pcb` / ZIP 包：https://dev-docs.kicad.org/en/import-formats/geda/index.html                             |
| P-CAD PCB     | -                                                                                  | P-CAD `.pcb` / ZIP 包：https://dev-docs.kicad.org/en/import-formats/pcad/index.html                            |
| Allegro       | -                                                                                  | Allegro extracta 输出 / 库数据：https://dev-docs.kicad.org/en/import-formats/allegro/index.html                |

## 导出格式

| 格式            | 示例文件                                               | 说明                                                                                    |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| KiCad Symbol    | [kicad_symbol.kicad_sym](kicad_symbol.kicad_sym)       | KiCad 符号库 — [文件格式](https://dev-docs.kicad.org/en/file-formats/sexpr-symbol-lib/) |
| KiCad Footprint | [kicad_footprint.kicad_mod](kicad_footprint.kicad_mod) | KiCad 封装库 — [文件格式](https://dev-docs.kicad.org/en/file-formats/sexpr-footprint/)  |
| Xpedition       | -                                                      | Xpedition 格式库包（ZIP）— [详细说明](xpedition-file-format.md)                         |

## 嘉立创EDA专业版中间格式

| 格式      | 示例文件                                                 | 说明                   |
| --------- | -------------------------------------------------------- | ---------------------- |
| 器件 JSON | [easyeda-pro_device.json](easyeda-pro_device.json)       | EasyEDA Pro 器件描述   |
| 库归档    | [easyeda-pro_library.elibz2](easyeda-pro_library.elibz2) | EasyEDA Pro 库压缩包   |
| 工程归档  | [easyeda-pro_project.epro2](easyeda-pro_project.epro2)   | EasyEDA Pro 工程压缩包 |
