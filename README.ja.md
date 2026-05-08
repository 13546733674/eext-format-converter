# フォーマット変換

EasyEDA / JLCEDA Professional Edition 用の拡張プラグイン。Xpedition（Mentor Graphics / Siemens EDA）ライブラリファイルを EasyEDA Pro 形式に変換してインポートします。

## 機能

- **Xpedition ファイルのインポート**：ZIP 形式の Xpedition ライブラリファイ���（PSK/CEL/PDB/シンボルファイル含む）のインポートに対応
- **Xpedition ファイルのエクスポート**：EasyEDA Pro ライブラリを Xpedition 互換形式にエクスポート
- **インポート/エクスポートウィザード**：グラフィカルなウィザードインターフェースで形式変換プロセスをガイド
- **変換完了後のオプション**：
  - Pro にインポート — 変換結果を現在開いている EasyEDA Pro に直接インポート
  - ライブラリファイルをダウンロード — 変換された `.elibz2` ファイルをローカルに保存

## 使用方法

1. EasyEDA Professional Edition でこの拡張機能をインストール
2. メニュー **フォーマット変換 → インポート/エクスポートウィザード** からウィザードを開く
3. 「Xpedition ファイルをインポート」または「Xpedition ファイルをエクスポート」を選択
4. ウィザードの指示に従って操作を完了

## 対応ファイル形式

| 形式        | 説明                                                       |
| ----------- | ---------------------------------------------------------- |
| `.zip`    | Xpedition ライブラリファイルを含むアーカイブ（インポート） |
| `.elibz2` | EasyEDA Pro ライブラリファイル形式（出力）                 |

## 開発

```shell
# 依存関係のインストール
npm install

# コンパイル
npm run compile

# パッケージング
npx ts-node build/packaged.ts
```

## オープンソースライセンス

このプラグインは [Apache License 2.0](https://choosealicense.com/licenses/apache-2.0/) オープンソースライセンスを使用しています。
