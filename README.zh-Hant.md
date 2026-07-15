# 格式轉換 v1.0.2

嘉立創EDA專業版（EasyEDA Pro）擴展插件，支援 Xpedition、Cadstar、Fabmaster、P-CAD、Allegro、gEDA、TinyCAD 等格式與嘉立創EDA專業版互轉，並支援匯出 KiCad。

## 功能

- **導入多種格式**：支援 Xpedition（ZIP 庫包）、Cadstar、Fabmaster、P-CAD、Allegro、gEDA、TinyCAD 等格式導入為嘉立創EDA專業版庫或工程
- **匯出 KiCad**：在符號庫/封裝庫編輯器中透過頂部選單直接匯出目前文件為 `.kicad_sym` / `.kicad_mod`
- **匯出 Xpedition**：將嘉立創EDA專業版庫資料匯出為 Xpedition 格式
- **導入匯出精靈**：提供圖形化精靈介面，引導使用者完成格式轉換流程
- **轉換完成後可選操作**：
    - 導入專業版 — 將轉換結果直接導入到目前開啟的嘉立創EDA專業版
    - 下載庫檔案 — 儲存轉換後的 `.elibz2` 檔案到本機

## 使用方法

1. 在嘉立創EDA專業版（3.0+）中安裝本擴展
2. 透過選單 **格式轉換 → 導入匯出精靈...** 開啟精靈
3. 選擇需要導入或匯出的格式，按精靈提示操作
4. 預覽轉換結果，選擇需要導入的器件/符號/封裝
5. 選擇歸屬（個人/團隊），點擊導入

## 支援的檔案格式

| 方向 | 格式             | 說明                                          |
| ---- | ---------------- | --------------------------------------------- |
| 導入 | `.zip`           | Xpedition 庫包（含 PSK/CEL/PDB/符號檔案）     |
| 導入 | `.zip/.cpa`      | Cadstar PCB 檔案                              |
| 導入 | `.zip/.txt/.fab` | Fabmaster PCB 檔案                            |
| 導入 | `.zip/.pcb`      | P-CAD / gEDA PCB 檔案                         |
| 導入 | `.zip/.dsn`      | TinyCAD 原理圖檔案                            |
| 匯出 | `.zip`           | Xpedition 格式庫包                            |
| 匯出 | `.zip`           | KiCad 格式庫包（`.kicad_sym` + `.kicad_mod`） |

Xpedition 庫檔案需要先用打包工具轉換成 ASCII 檔案並打包成 zip，詳見[打包工具說明](https://github.com/easyeda/eext-format-convert/blob/main/tools/xpedition-library-packager/README.md)。

## 系統要求

- 嘉立創EDA專業版 >= 3.0

## 開源許可

本插件使用 [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/) 開源許可協定。
