# 格式轉換

嘉立創EDA專業版擴展插件，用於將 Xpedition（Mentor Graphics / Siemens EDA）庫檔案轉換為嘉立創EDA專業版格式並導入。

## 功能

- **導入 Xpedition 檔案**：支援導入 ZIP 格式的 Xpedition 庫檔案（包含 PSK/CEL/PDB/符號檔案）
- **匯出 Xpedition 檔案**：將嘉立創EDA專業版庫匯出為 Xpedition 相容格式
- **導入匯出精靈**：提供圖形化精靈介面，引導使用者完成格式轉換流程
- **轉換完成後可選操作**：
  - 導入專業版 — 將轉換結果直接導入到當前開啟的嘉立創EDA專業版
  - 下載庫檔案 — 儲存轉換後的 `.elibz2` 檔案到本機

## 使用方法

1. 在嘉立創EDA專業版中安裝本擴展
2. 透過選單 **格式轉換 → 導入匯出精靈** 開啟精靈
3. 選擇「導入Xpedition檔案」或「匯出Xpedition檔案」
4. 按照精靈提示完成操作

## 支援的檔案格式

| 格式        | 說明                                  |
| ----------- | ------------------------------------- |
| `.zip`    | 包含 Xpedition 庫檔案的壓縮檔（導入） |
| `.elibz2` | 嘉立創EDA專業版庫檔案格式（輸出）     |

## 開發

```shell
# 安裝依賴
npm install

# 編譯
npm run compile

# 打包
npx ts-node build/packaged.ts
```

## 開源許可

本插件使用 [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/) 開源許可協定。
