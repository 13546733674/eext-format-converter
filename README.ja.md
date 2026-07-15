# フォーマット変換 v1.0.2

EasyEDA / JLCEDA Professional Edition 用の拡張プラグイン。Xpedition、Cadstar、Fabmaster、P-CAD、Allegro、gEDA、TinyCAD などの形式と EasyEDA Pro 間で相互変換し、KiCad へのエクスポートにも対応します。

## 機能

- **複数形式のインポート**：Xpedition（ZIP ライブラリパッケージ）、Cadstar、Fabmaster、P-CAD、Allegro、gEDA、TinyCAD などを EasyEDA Pro ライブラリまたはプロジェクトにインポート
- **KiCad エクスポート**：シンボル/フットプリントライブラリエディタのトップメニューから現在のドキュメントを `.kicad_sym` / `.kicad_mod` に直接エクスポート
- **Xpedition ファイルのエクスポート**：EasyEDA Pro ライブラリを Xpedition 互換形式にエクスポート
- **インポート/エクスポートウィザード**：グラフィカルなウィザードインターフェースで形式変換プロセスをガイド
- **変換完了後のオプション**：
    - Pro にインポート — 変換結果を現在開いている EasyEDA Pro に直接インポート
    - ライブラリファイルをダウンロード — 変換された `.elibz2` ファイルをローカルに保存

## 使用方法

1. EasyEDA Professional Edition でこの拡張機能をインストール
2. メニュー **フォーマット変換 → インポート/エクスポートウィザード...** からウィザードを開く
3. インポートまたはエクスポートしたい形式を選択
4. ウィザードの指示に従って操作を完了

## 対応ファイル形式

| 方向         | 形式             | 説明                                                      |
| ------------ | ---------------- | --------------------------------------------------------- |
| インポート   | `.zip`           | Xpedition ライブラリファイルを含むアーカイブ              |
| インポート   | `.zip/.cpa`      | Cadstar PCB ファイル                                      |
| インポート   | `.zip/.txt/.fab` | Fabmaster PCB ファイル                                    |
| インポート   | `.zip/.pcb`      | P-CAD / gEDA PCB ファイル                                 |
| インポート   | `.zip/.dsn`      | TinyCAD 回路図ファイル                                    |
| エクスポート | `.zip`           | Xpedition 互換ライブラリパッケージ                        |
| エクスポート | `.zip`           | KiCad ライブラリパッケージ（`.kicad_sym` + `.kicad_mod`） |

Xpedition ライブラリファイルは、パッケージツールを使用して ASCII 形式に変換し、ZIP に圧縮する必要があります。詳細は[パッケージツールの README](https://github.com/easyeda/eext-format-convert/blob/main/tools/xpedition-library-packager/README.md) を参照してください。

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
