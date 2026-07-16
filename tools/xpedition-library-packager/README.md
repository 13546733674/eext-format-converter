# Xpedition库打包工具

#### 介绍

支持将Xpedition的库文件（焊盘堆栈、封装、器件、符号）转换为ASCII格式的HKP文件，并打包成zip，供库迁移使用。

#### 支持的库文件类型

| 类型     | 文件扩展名 | 转换工具           | 输出后缀     |
| -------- | ---------- | ------------------ | ------------ |
| 焊盘堆栈 | `.psk`     | PadstackDB2HKP.exe | `.PSK.HKP`   |
| 封装     | `.cel`     | CellDB2HKP.exe     | `.CEL.HKP`   |
| 器件     | `.pdb`     | PartsDB2HKP.exe    | `.PDB.HKP`   |
| 符号     | 目录       | 直接复制           | 目录原样打包 |

#### 安装教程

直接运行（需要Python环境）

```bash
git clone https://github.com/easyeda/eext-format-convert
cd ./eext-format-convert/tools/xpedition-library-packager/
pip install tkinter
python 库打包工具.py
```

#### 使用说明

工具采用四步向导流程：

1. **选择库路径** — 指定Xpedition程序目录（必填）和需要转换的库文件目录（至少填一个）。选择某个库目录后，工具会自动检测同级目录下的其他库文件夹。
2. **确认转换文件** — 显示扫描到的所有文件列表，默认全选，可取消不需要的项目。
3. **转换进度** — 自动调用Xpedition转换工具，实时显示转换日志和进度。
4. **保存打包** — 设置文件名和保存路径，点击"完成"将所有转换结果打包为zip文件。

#### 配置文件

程序会在同目录下自动生成 `lib_pack_cfg.json`，用于记忆Xpedition程序目录路径，下次启动时自动填入。

#### 运行环境

- Windows 10/11
- Python 3.x（开发运行）
- Xpedition（需包含 PadstackDB2HKP、CellDB2HKP、PartsDB2HKP 转换工具）
