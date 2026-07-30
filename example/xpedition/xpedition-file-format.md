# Xpedition 库文件格式说明

Xpedition（Mentor / Siemens EDA）库由四类文件组成，本插件通过读取其 ASCII 导出形式完成转换：

| 类型     | 原始扩展名 | ASCII 导出后缀         | 说明               |
| -------- | ---------- | ---------------------- | ------------------ |
| 焊盘堆栈 | `.psk`     | `.PSK.HKP`             | 焊盘、孔及层叠定义 |
| 封装     | `.cel`     | `.CEL.HKP`             | PCB 封装 / Cell    |
| 器件     | `.pdb`     | `.PDB.HKP`             | Part / Device 定义 |
| 符号     | 目录       | 文本文件（如 `sym.1`） | 原理图符号图形     |

> 原始二进制库需先用 Xpedition 自带的转换工具（PadstackDB2HKP、CellDB2HKP、PartsDB2HKP）转成 ASCII，再打包成 ZIP 供插件导入。详见 [tools/xpedition-library-packager/README.md](../tools/xpedition-library-packager/README.md)。

---

## 1. HKP 通用格式（PSK / CEL）

`.PSK.HKP` 与 `.CEL.HKP` 采用相同的点缩进层级文本格式，以 `.` 数量表示层级：

```text
! Comment line
.KEYWORD value
..CHILD_KEY value
...GRAND_CHILD value
```

### 1.1 焊盘堆栈文件（\*.PSK.HKP）

顶层通常为 `PADS`、`HOLES`、`PADSTACKS` 等章节。

#### 焊盘（PAD）

```text
.PAD "PadName"
..PAD_SHAPE "ROUND"
..DIAMETER 1.0
..WIDTH 1.0
..HEIGHT 1.0
..OFFSETX 0.0
..OFFSETY 0.0
```

- `PAD_SHAPE`：`ROUND`、`RECTANGLE`、`OBLONG`、`SQUARE`、`OCTAGON`、`CUSTOM`。
- `CUSTOM` 形状可跟随 `XY` 节点，以 `(x y)` 点序列描述多边形轮廓。

#### 孔（HOLE）

```text
.HOLE "HoleName"
..DRILL_SIZE 0.5
..PLATED YES
..POS_TOL 0.05
..NEG_TOL 0.05
```

#### 焊盘堆栈（PADSTACK）

```text
.PADSTACK "PadstackName"
..PADSTACK_TYPE "PIN_THROUGH"
..TOP_PAD "PadName"
..BOTTOM_PAD "PadName"
..INTERNAL_PAD "PadName"
..TOP_SOLDERMASK_PAD "PadName"
..BOTTOM_SOLDERMASK_PAD "PadName"
..TOP_SOLDERPASTE_PAD "PadName"
..BOTTOM_SOLDERPASTE_PAD "PadName"
..DRILL "HoleName"
..DRILL_OFFSETX 0.0
..DRILL_OFFSETY 0.0
```

`PADSTACK_TYPE` 取值：`VIA`、`PIN_SMD`、`PIN_THROUGH`。

---

### 1.2 封装文件（\*.CEL.HKP）

#### 单元头

```text
.CELL "CellName"
..PACKAGE_GROUP "Discrete"
..MOUNT_TYPE "SURFACE"
..NUMBER_LAYERS 2
..DESCRIPTION "0402 Resistor"
```

- `MOUNT_TYPE`：`SURFACE`、`THROUGH`、`MIXED`。

#### 引脚

```text
..PIN "1"
...PADSTACK "PadstackName"
...XY (0 0)
...ROTATION 0
```

#### 外框与图形

外框按类型分组，常见 `kind`：

- `ASSEMBLY_OUTLINE`：装配层外框
- `PLACEMENT_OUTLINE`：放置边界
- `SILKSCREEN_OUTLINE`：丝印层图形
- `GRAPHIC`：普通图形

支持图形类型：

```text
..OUTLINE "ASSEMBLY_OUTLINE"
...RECT_SHAPE 0 0 1 1
...POLYLINE_SHAPE (0 0) (1 0) (1 1) (0 1)
...POLYLINE_PATH (0 0) (1 1)
...CIRCLE_PATH 0 0 0.5
...RECT_PATH 0 0 1 1
```

#### 文本

```text
..TEXT "RefDes"
...XY (0 0)
...HEIGHT 1.0
...TEXT_LAYER "SILKSCREEN_TOP"
```

---

## 2. 器件文件（\*.PDB.HKP）

器件文件同样使用点缩进层级，以 `Number` 作为单元入口：

```text
.Number "R0402"
..Name "R0402"
..Label "Resistor"
..Desc "0402 Chip Resistor"
..RefPrefix "R"
..TopCell "R0402"
..BottomCell ""
..Symbol "lib:symbol_name"
...PinName "1"
...PinName "2"
..Slots
...SlotID "A"
...PinNumber "1"
...PinNumber "2"
..Prop "VALUE", "1k", "STRING"
```

### 关键字段

| 字段                     | 说明                                      |
| ------------------------ | ----------------------------------------- |
| `Number`                 | 器件型号（Part Number）                   |
| `Name`                   | 器件名称                                  |
| `Label`                  | 显示标签                                  |
| `Desc`                   | 描述                                      |
| `RefPrefix`              | 位号前缀，如 `R`、`C`、`U`                |
| `TopCell` / `BottomCell` | 顶层 / 底层封装名                         |
| `Symbol`                 | 符号引用，格式为 `library:symbol_name`    |
| `PinName`                | 符号引脚名称列表                          |
| `Slots`                  | 多 Slot 器件的引脚分组                    |
| `Prop`                   | 自定义属性，格式 `"key", "value", "type"` |

---

## 3. 符号文件（_.1 / _.2 / ...）

符号文件为纯文本，采用单字母命令行格式，常见 V54 版本：

```text
V 54
K 1234567890 SymbolName
F 0
Y 1
D -100 -100 100 100
Z 5
U 0 0 10 0 0 0 REFDES=U?
P 1 0 0 10 0 0 0 0
A 0 0 10 0 0 0 PINNUMBER=1
L 0 0 10 0 0 0 0 0 PINNAME
l 4 0 0 10 0 10 10 10 10 0
b 0 0 10 10
c 0 0 5
a 0 10 0 0 10 0
T 0 0 10 0 0 Label
E
```

### 命令说明

| 命令 | 含义           | 参数                                                                        |
| ---- | -------------- | --------------------------------------------------------------------------- |
| `V`  | 版本号         | `VersionNumber`                                                             |
| `K`  | 时间戳与符号名 | `UnixTimestamp SymbolName`                                                  |
| `F`  | Case           | `Case`                                                                      |
| `Y`  | 符号类型       | `1=Module, 2=Composite, 3=Pin, 4=Annotate, 5=Border`                        |
| `D`  | 绘图边界       | `DrawX1 DrawY1 DrawX2 DrawY2`                                               |
| `Z`  | 缩放级别       | 坐标单位 = `ZoomLevel × 0.0254mm`                                           |
| `U`  | 单位属性       | `OriginX OriginY Size Rotation Origin Visibility KEY=VALUE`                 |
| `P`  | 引脚           | `ID StartX StartY EndX EndY Unknown1 Rotation Inverted`                     |
| `A`  | 引脚属性       | `OriginX OriginY Size Rotation Origin Visibility KEY=VALUE`                 |
| `L`  | 引脚标签       | `OriginX OriginY Size Rotation Origin Visibility Unknown1 Unknown2 PinName` |
| `l`  | 折线/多边形    | `PointNumber StartX StartY path1X path1Y ...`；以 `+` 闭合为多边形          |
| `b`  | 矩形           | `StartX StartY EndX EndY`                                                   |
| `c`  | 圆             | `PositionX PositionY Radius`                                                |
| `a`  | 圆弧           | `StartX StartY CenterX CenterY EndX EndY`                                   |
| `T`  | 文本           | `OriginX OriginY Size Rotation Origin Text`                                 |
| `E`  | 文件结束       | -                                                                           |

### 引脚编号扩展

符号文件中的 `PINVALUE` 或 `PINNUMBER` 属性支持范围写法，如：

```text
[1:50]      ; 1 到 50
[1:50:2]    ; 1 到 50，步长 2
```

---

## 4. 打包要求

导入插件会扫描 ZIP 包内的文件并按后缀分类：

- `*.psk.hkp` → 焊盘堆栈
- `*.cel.hkp` → 封装
- `*.pdb.hkp` → 器件
- 以数字结尾的符号文本文件（如 `sym.1`、`sym.2`）→ 原理图符号

建议打包结构：

```text
xpedition_lib.zip
├── pads.PSK.HKP
├── cells.CEL.HKP
├── parts.PDB.HKP
└── symbols/
    ├── resistor.1
    ├── resistor.2
    └── capacitor.1
```
