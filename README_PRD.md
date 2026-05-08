# 格式转换插件 — 产品需求文档

## 1. 概述

本插件是嘉立创EDA专业版的扩展插件，用于在 Xpedition（Mentor Graphics / Siemens EDA）库文件与嘉立创EDA专业版（EasyEDA Pro）库文件之间进行双向格式转换。

### 1.1 核心能力

- **导入**：将 Xpedition 库文件（ZIP 包）转换为嘉立创EDA专业版 `.elibz2` 格式并导入
- **导出**：将嘉立创EDA专业版库导出为 Xpedition 兼容格式
- **向导界面**：图形化向导引导用户完成格式转换流程

### 1.2 支持的 Xpedition 文件类型

| 文件类型 | 扩展名                | 说明                                          |
| -------- | --------------------- | --------------------------------------------- |
| 焊盘堆库 | `*.PSK.HKP`         | 定义焊盘形状、钻孔和焊盘堆技术                |
| 单元库   | `*.CEL.HKP`         | 定义封装（Footprint），包含引脚、外形、丝印等 |
| 零件库   | `*.PDB.HKP`         | 定义器件（Device），关联符号与封装            |
| 符号文件 | `*.1`、`*.2`、... | V54 文本格式，定义原理图符号                  |

### 1.3 输出格式

`.elibz2` — ZIP 压缩包，包含：

- `lib2.elibu`：Pro V3 文档源（`||` 分隔的 JSON 行格式）
- `device2.json`：器件元数据（关联符号、封装、属性的 JSON）

---

## 2. 转换原理

### 2.1 总体数据流

```
ZIP 输入
  │
  ├─ *.PSK.HKP ──→ 解析焊盘堆 ──┐
  ├─ *.CEL.HKP ──→ 解析封装   ──┤
  ├─ *.PDB.HKP ──→ 解析器件   ──┼─→ 坐标变换 + 图元映射 ──→ Pro V3 文档 ──→ lib2.elibu
  └─ *.1,*.2,... ─→ 解析符号   ──┘                                  │
                                                                    ↓
                                                      device2.json（器件元数据）
                                                                    │
                                                                    ↓
                                                             打包为 .elibz2
```

### 2.2 文件识别规则

ZIP 内文件按扩展名分类：

- 以 `.psk.hkp` 结尾 → 焊盘堆文件
- 以 `.cel.hkp` 结尾 → 单元文件
- 以 `.pdb.hkp` 结尾 → 零件文件
- 以数字结尾（如 `.1`、`.2`）且首行匹配 `V \d+` → 符号文件
- `.json`、`.txt`、`.md`、`.xml`、`.csv`、`.log`、`.elibu`、`.elibz2`、`.zip` → 跳过

### 2.3 坐标系统

| 属性    | Xpedition  | 嘉立创EDA专业版                  |
| ------- | ---------- | -------------------------------- |
| 单位    | 毫米（mm） | 内部单位（0.01 inch = 254000nm） |
| Y轴方向 | 向上为正   | 向下为正                         |
| 原点    | 器件中心   | 边界框左上角                     |

**坐标变换公式：**

- 封装（Footprint）坐标：`eeUnit = mm × 39.3701`，Y 轴不翻转（直接映射）
- 符号（Symbol）坐标：
  - V54+ 版本：`eeUnit = raw × zoomLevel / 254000`
  - V53- 版本：`eeUnit = raw × zoomLevel × 0.1`
  - Y 轴翻转：`eeY = -rawY`

---

## 3. 焊盘堆转换（PSK → Pro V3）

### 3.1 焊盘形状映射表

| Xpedition 焊盘形状 | Pro V3 padType  | 转换规则                                                    |
| ------------------ | --------------- | ----------------------------------------------------------- |
| ROUND              | ELLIPSE         | `width = height = diameter × 39.3701`                    |
| SQUARE             | RECT            | `width = height = side × 39.3701, radius = 0`            |
| RECTANGLE          | RECT            | `width = w × 39.3701, height = h × 39.3701, radius = 0` |
| OBLONG             | OVAL            | `width = w × 39.3701, height = h × 39.3701, radius = 0` |
| OCTAGON            | ELLIPSE（回退） | 近似为圆形，`width = height = diameter × 39.3701`        |
| CUSTOM / POLYGON   | —              | 自定义多边形点集转换为路径                                  |

### 3.2 钻孔形状映射表

| Xpedition 钻孔形状 | Pro V3 holeType | 转换规则                                        |
| ------------------ | --------------- | ----------------------------------------------- |
| ROUND              | ROUND           | `width = height = diameter × 39.3701`        |
| SLOT               | SLOT            | `width = w × 39.3701, height = h × 39.3701` |
| RECTANGLE          | SLOT（回退）    | `width = w × 39.3701, height = h × 39.3701` |

### 3.3 焊盘堆技术层映射

Xpedition 焊盘堆通过 TECHNOLOGY 节定义不同层的焊盘：

| Xpedition 层           | Pro V3 用途         | 说明                           |
| ---------------------- | ------------------- | ------------------------------ |
| TOP_PAD                | 默认焊盘形状        | 用于 PAD 元素的 defaultPad     |
| BOTTOM_PAD             | 通孔焊盘（TH 器件） | 与 TOP_PAD 相同处理            |
| INTERNAL_PAD           | 内层焊盘            | 目前不单独输出                 |
| TOP_SOLDERMASK_PAD     | 阻焊开窗            | 输出为 FILL 元素，layerId = 50 |
| BOTTOM_SOLDERMASK_PAD  | 底层阻焊开窗        | 仅 TH 器件输出，layerId = 50   |
| TOP_SOLDERPASTE_PAD    | 锡膏层              | 仅 SMD 器件输出，layerId = 51  |
| BOTTOM_SOLDERPASTE_PAD | 底层锡膏层          | 目前不单独输出                 |

### 3.4 焊盘堆类型映射

| Xpedition PADSTACK_TYPE | 含义     | 封装主层             |
| ----------------------- | -------- | -------------------- |
| VIA                     | 过孔     | layerId = 12（多层） |
| PIN_THROUGH             | 通孔引脚 | layerId = 12（多层） |
| PIN_SMD                 | 贴片引脚 | layerId = 1（顶层）  |

---

## 4. 封装转换（CEL → Pro V3 Footprint）

### 4.1 封装输出结构

每个封装生成一段 Pro V3 文档，按以下顺序输出：

```
1. DOCHEAD     — 文档头（docType = FOOTPRINT, uuid）
2. META        — 元信息（标题 = 封装名）
3. DOCHEAD     — 文档设置
4. LAYER × 19  — 预定义层（TOP, BOTTOM, SILK, MASK 等）
5. ACTIVE_LAYER — 当前活动层
6. CANVAS      — 画布设置（originX=0, originY=0）
7. ELE_PLACEHOLDER + FILL × N   — 阻焊/锡膏填充区域
8. ELE_PLACEHOLDER + POLY × N   — 外形轮廓线
9. ELE_PLACEHOLDER + PAD × N    — 焊盘
10. ELE_PLACEHOLDER + ATTR × 2  — Footprint 名称、Designator 属性
```

### 4.2 引脚（PIN）→ 焊盘（PAD）转换

CEL 文件中每个 `.PIN` 条目转换为 Pro V3 的 PAD 元素：

| 属性       | 来源            | 转换                     |
| ---------- | --------------- | ------------------------ |
| num        | PIN.number      | 直接使用                 |
| centerX    | PIN.x           | `mmToEeUnit(x)`        |
| centerY    | PIN.y           | `mmToEeUnit(y)`        |
| padAngle   | PIN.rotation    | 直接使用                 |
| hole       | PADSTACK.hole   | 按 3.2 节映射            |
| defaultPad | PADSTACK.topPad | 按 3.1 节映射            |
| layerId    | —              | TH=12(多层), SMD=1(顶层) |
| plated     | —              | 固定 true                |

### 4.3 外形轮廓映射表

CEL 文件中的轮廓（Outline）按类别分配到不同层：

| Xpedition 轮廓类型 | Pro V3 layerId | 说明     |
| ------------------ | -------------- | -------- |
| ASSEMBLY_OUTLINE   | 9              | 装配轮廓 |
| PLACEMENT_OUTLINE  | 48             | 布局轮廓 |
| SILKSCREEN_OUTLINE | 3              | 丝印轮廓 |
| GRAPHIC            | 13             | 通用图形 |

### 4.4 轮廓形状映射表

| Xpedition 形状 | Pro V3 类型 | 转换规则                                             |
| -------------- | ----------- | ---------------------------------------------------- |
| RECT_SHAPE     | POLY        | 4 点矩形路径 `[x1,y1,"L",x2,y1,x2,y2,x1,y2,x1,y1]` |
| POLYLINE_SHAPE | POLY        | 折线路径 `[x0,y0,"L",x1,y1,...,xn,yn]`             |
| POLYLINE_PATH  | POLY        | 带宽度的折线，`width = mmToEeUnit(w)`              |
| CIRCLE_PATH    | POLY        | 圆形路径 `["CIRCLE",cx,cy,radius]`                 |
| RECT_PATH      | POLY        | 带宽度的矩形路径（同 RECT_SHAPE + width）            |

### 4.5 阻焊/锡膏填充（FILL）

根据焊盘堆技术定义自动生成：

- **阻焊层**（layerId=50）：从 `TOP_SOLDERMASK_PAD` 和 `BOTTOM_SOLDERMASK_PAD` 生成
- **锡膏层**（layerId=51）：从 `TOP_SOLDERPASTE_PAD` 生成（仅 SMD 器件）

FILL 路径规则：

- ROUND 焊盘 → `"CIRCLE", cx, cy, radius`
- 其他形状 → 矩形路径 `cx-hw, cy-hh, "L", cx+hw, cy-hh, cx+hw, cy+hh, cx-hw, cy+hh, cx-hw, cy-hh`

### 4.6 空封装处理

引脚数为 0 的封装被跳过，状态标记为 `skip`，消息："无引脚，跳过"。

---

## 5. 符号转换（Symbol → Pro V3 Symbol）

### 5.1 符号文件格式（V54）

符号文件为纯文本格式，每行以单字符命令开头：

| 命令  | 含义         | 参数格式                                             |
| ----- | ------------ | ---------------------------------------------------- |
| `V` | 版本号       | `V VersionNumber`                                  |
| `K` | 时间戳+名称  | `K Timestamp SymbolName`                           |
| `F` | 封装引用     | `F Case`                                           |
| `Y` | 符号类型     | `Y Type`（1=模块, 2=复合, 3=引脚, 4=标注, 5=边框） |
| `D` | 边界框       | `D X1 Y1 X2 Y2`                                    |
| `Z` | 缩放级别     | `Z ZoomLevel`                                      |
| `U` | 属性         | `U X Y Size Rot Origin Vis KEY=VALUE`              |
| `P` | 引脚         | `P ID StartX StartY EndX EndY Unk1 Rot Inverted`   |
| `A` | 引脚属性     | `A X Y Size Rot Origin Vis KEY=VALUE`              |
| `L` | 引脚名称标签 | `L X Y Size Rot Origin Vis Unk1 Unk2 PinName`      |
| `l` | 折线/多边形  | `l PointCount X1 Y1 X2 Y2 ...`                     |
| `b` | 矩形         | `b X1 Y1 X2 Y2`                                    |
| `c` | 圆形         | `c X Y Radius`                                     |
| `a` | 圆弧         | `a StartX StartY CenterX CenterY EndX EndY`        |
| `T` | 文本         | `T X Y Size Rot Origin Text`                       |
| `E` | 结束         | `E`                                                |
| `+` | 闭合标记     | `+ 0`（将上一条 `l` 折线变为多边形）             |
| `\|` | 样式续行     | 忽略                                                 |

### 5.2 引脚属性解析

引脚属性通过 `A` 命令的 KEY=VALUE 格式定义：

| KEY         | 含义     | 示例                                             |
| ----------- | -------- | ------------------------------------------------ |
| `PINTYPE` | 引脚类型 | `PINTYPE=Input`、`Output`、`BI`、`Power` |
| `#`       | 引脚编号 | `#=1` 或 `#=1,2,3`（多门器件）               |

### 5.3 符号属性（U 命令）

| KEY                | 含义         | 说明                                    |
| ------------------ | ------------ | --------------------------------------- |
| `DEVICE`         | 器件名称     | 用于符号的 Symbol 属性                  |
| `Ref Designator` | 参考标识前缀 | 如 `U?`、`R?`，用于 Designator 属性 |
| `HETERO`         | 多门异构标识 | 逗号分隔的门编号列表                    |
| `PARTS`          | 门数量       | 多门器件的子部分数量                    |

### 5.4 引脚旋转计算

符号引脚方向由起止点坐标差值计算：

```
dx = bodyX - tipX
dy = bodyY - tipY

if |dx| >= |dy|:
    rotation = dx >= 0 ? 0°  (右) : 180° (左)
else:
    rotation = dy >= 0 ? 90° (上) : 270° (下)
```

### 5.5 引脚形状映射

| Xpedition Inverted | Pro V3 pinShape | 外观       |
| ------------------ | --------------- | ---------- |
| 0                  | NONE            | 普通引脚   |
| 1                  | INVERTED        | 反相圈引脚 |

### 5.6 符号图形映射表

| 符号命令                    | Pro V3 类型 | 转换规则                                                           |
| --------------------------- | ----------- | ------------------------------------------------------------------ |
| `l`（折线）               | POLY        | `closed = false`，点坐标经缩放 + Y 翻转                          |
| `l`（多边形，后接 `+`） | POLY        | `closed = true`，同上                                            |
| `b`（矩形）               | POLY        | 转换为 4 点闭合矩形，`closed = true`                             |
| `c`（圆形）               | POLY        | `points = ["CIRCLE", cx, cy, radius]`                            |
| `a`（圆弧）               | ARC         | `startX, startY, endX, endY, referX(=centerX), referY(=centerY)` |

### 5.7 多门符号处理

当符号包含 `HETERO` 和 `PARTS` 属性时，表示多门器件：

1. 所有子符号文件（`.1`、`.2`、...）的引脚和图形被合并
2. 引脚按坐标去重，不同子文件的引脚编号合并到同一引脚
3. 输出为多个 PART 节，每个门对应一个 PART
4. 引脚编号按 `partIndex` 从 `pinNumbers[]` 数组中分配

**多门结构输出顺序：**

- 第 1 门（first）：引脚（display=true）→ 图形
- 第 2..N-1 门（middle）：引脚（display=false）→ 图形
- 第 N 门（last）：图形 → 引脚（display=true）

### 5.8 符号输出结构

```
DOCHEAD   — docType = SYMBOL
CANVAS    — originX=0, originY=0
PART × N  — 每个门一个 PART
  ├─ ATTR(Symbol)      — 器件名称属性
  ├─ ATTR(Designator)  — 参考标识属性
  ├─ PIN × N           — 引脚
  │   ├─ ATTR(Pin Name)   — 引脚名称
  │   ├─ ATTR(Pin Number) — 引脚编号
  │   └─ ATTR(Pin Type)   — 引脚类型
  └─ POLY/ARC × N     — 图形元素
```

### 5.9 空符号处理

无引脚且无图形的符号被跳过，状态标记为 `skip`，消息："无引脚且无图形，跳过"。

---

## 6. 器件转换（PDB → device2.json）

### 6.1 零件文件格式

零件文件采用点缩进的层次结构：

```
.Number "part_number"
  ..Name "name"
  ..Label "label"
  ..Desc "description"
  ..RefPrefix "U"
  ..TopCell "cell_name"
  ..BottomCell "cell_name"
  ..Prop "key", "value", "type"
  ..Symbol "library:symbol_name"
    ...PinName "pin_name"
  ..Slots
    ...SlotID "1"
      ....PinNumber "1"
```

### 6.2 器件属性映射

| Xpedition 属性 | device2.json 属性                                      | 说明                     |
| -------------- | ------------------------------------------------------ | ------------------------ |
| Number/Name    | `Manufacturer Part`                                  | 器件型号                 |
| RefPrefix      | `Designator`                                         | 加 `?` 后缀，如 `U?` |
| TopCell        | `Footprint`（有 UUID 时）或 `原封装`（无 UUID 时） | 封装引用                 |
| Symbol         | `Symbol`                                             | 符号 UUID 引用           |
| Desc           | `description`                                        | 器件描述                 |
| Prop × N      | 直接写入 attributes                                    | 所有自定义属性           |

固定属性：

- `Add into BOM`: `"yes"`
- `Convert to PCB`: `"yes"`
- `Name`: `"={Manufacturer Part}"`（动态引用）

### 6.3 多封装器件处理

当器件同时定义 `TopCell` 和 `BottomCell`（且不同）时：

- 主封装使用 `TopCell` 关联的 UUID
- 额外记录 `原封装1 = TopCell`、`原封装2 = BottomCell` 属性

### 6.4 符号引用解析

`Symbol` 字段格式为 `"library:symbol_name"`，转换时：

1. 以 `:` 分割取后半部分作为符号名称
2. 在已解析的符号列表中查找对应 UUID
3. 找不到时 `Symbol` 属性为空字符串

### 6.5 器件状态

| 状态 | 条件                   | 消息                       |
| ---- | ---------------------- | -------------------------- |
| ok   | 符号和封装都找到       | —                         |
| warn | 封装未找到             | `封装 "xxx" 未找到`      |
| skip | 无符号引用且无封装引用 | `无符号和封装引用，跳过` |
| fail | 转换过程异常           | 异常信息                   |

---

## 7. 去重与冲突处理

### 7.1 名称冲突

当多个封装/符号/器件具有相同名称时，使用 `UniqueNameTracker` 追加序号后缀：

- 第 1 个：`original_name`
- 第 2 个：`original_name_2`
- 第 3 个：`original_name_3`
- ...

### 7.2 器件去重

通过零件编号（Number）去重，重复编号追加 `_dup` 后缀。

### 7.3 多文件符号合并

同名符号文件（如 `sym.1` 和 `sym.2`）合并为单个符号：

- 引脚按起止坐标去重，编号合并
- 图形按坐标去重
- 使用第一个文件的元数据（版本、缩放级别等）作为基准

---

## 8. Pro V3 文档格式

### 8.1 行格式

每行由 `||` 分隔的三部分组成：

```
{header_json}||{data_json}|
```

**header_json 结构：**

```json
{
  "type": "ELEMENT_TYPE",
  "ticket": <递增序号>,
  "id": "<元素ID>",
  "client": "<随机UUID>"
}
```

### 8.2 元素类型一览

| type            | 用途                       | 包含位置         |
| --------------- | -------------------------- | ---------------- |
| DOCHEAD         | 文档头                     | 封装、符号       |
| META            | 标题描述                   | 封装             |
| LAYER           | 层定义                     | 封装（×19）     |
| ACTIVE_LAYER    | 活动层                     | 封装             |
| CANVAS          | 画布设置                   | 封装、符号       |
| PART            | 门定义                     | 符号（多门器件） |
| PIN             | 引脚                       | 符号             |
| PAD             | 焊盘                       | 封装             |
| POLY            | 折线/多边形/圆形轮廓       | 封装、符号       |
| ARC             | 圆弧                       | 符号             |
| FILL            | 填充区域（阻焊/锡膏）      | 封装             |
| ATTR            | 属性（名称、编号、类型等） | 封装、符号       |
| ELE_PLACEHOLDER | 元素组占位符               | 封装             |

### 8.3 device2.json 结构

```json
{
  "devices": {
    "<uuid>": {
      "uuid": "...",
      "attributes": {
        "Manufacturer Part": "...",
        "Designator": "U?",
        "Footprint": "<fp_uuid>",
        "Symbol": "<sym_uuid>",
        ...
      },
      "title": "...",
      "display_title": "...",
      "description": "...",
      "symbol_type": 2
    }
  },
  "symbols": {
    "<uuid>": {
      "uuid": "...",
      "title": "...",
      "display_title": "...",
      "docType": 2
    }
  },
  "footprints": {
    "<uuid>": {
      "uuid": "...",
      "title": "...",
      "display_title": "...",
      "docType": 4
    }
  }
}
```

### 8.4 docType 值

| docType | 文档类型          |
| ------- | ----------------- |
| 2       | 符号（Symbol）    |
| 4       | 封装（Footprint） |

---

## 9. 导出转换（EasyEDA Pro → Xpedition）

### 9.1 层映射（EasyEDA → Xpedition）

| EasyEDA 层名          | Xpedition 层       |
| --------------------- | ------------------ |
| TopLayer              | TOP                |
| BottomLayer           | BOTTOM             |
| TopSilkLayer          | SILKSCREEN_OUTLINE |
| BottomSilkLayer       | SILKSCREEN_OUTLINE |
| TopPasteMaskLayer     | SOLDER_PASTE       |
| BottomPasteMaskLayer  | SOLDER_PASTE       |
| TopSolderMaskLayer    | SOLDER_MASK        |
| BottomSolderMaskLayer | SOLDER_MASK        |
| Multi-Layer           | MULTI_LAYER        |
| TopAssembly           | ASSEMBLY_OUTLINE   |
| BottomAssembly        | ASSEMBLY_OUTLINE   |
| ComponentShapeLayer   | ASSEMBLY_OUTLINE   |

### 9.2 引脚类型映射（EasyEDA → Xpedition）

| EasyEDA 引脚类型 | 索引值 | Xpedition 引脚类型 |
| ---------------- | ------ | ------------------ |
| Undefined        | 0      | — （不输出）      |
| Input            | 1      | Input              |
| Output           | 2      | Output             |
| I/O              | 3      | BI                 |
| Power            | 4      | — （不输出）      |

### 9.3 焊盘形状映射（EasyEDA → Xpedition）

| EasyEDA 形状 | Xpedition 形状 | 说明         |
| ------------ | -------------- | ------------ |
| RECT         | RECTANGLE      | 矩形焊盘     |
| ROUND        | ROUND          | 圆形焊盘     |
| OVAL         | OBLONG         | 椭圆形焊盘   |
| ELLIPSE      | ROUND          | 近似为圆形   |
| POLYGON      | CUSTOM         | 自定义多边形 |

### 9.4 封装类型检测

| 条件             | 封装类型        |
| ---------------- | --------------- |
| 所有引脚均为贴片 | SURFACE（贴片） |
| 存在通孔引脚     | THROUGH（通孔） |
| 既有贴片又有通孔 | MIXED（混合）   |

---

## 10. 单位换算参考

| 换算                             | 公式                             |
| -------------------------------- | -------------------------------- |
| mm → EasyEDA 内部单位           | `value × 39.3701`             |
| mm → EasyEDA 内部单位（整数）   | `Math.round(value × 39.3701)` |
| EasyEDA 内部单位 → mm           | `value × 0.0254 / 10`         |
| EasyEDA 内部单位 → thou（密耳） | `value × 10`                  |
| 原始值 → EasyEDA 单位（V54+）   | `raw × zoomLevel / 254000`    |
| 原始值 → EasyEDA 单位（V53-）   | `raw × zoomLevel × 0.1`      |

---

## 11. 已知限制

| 限制项        | 说明                                   |
| ------------- | -------------------------------------- |
| 八角形焊盘    | 近似为圆形（ELLIPSE），非精确八角形    |
| 椭圆图形      | 转换为圆形，仅使用 radiusX             |
| 圆弧精度      | 使用三次贝塞尔中点近似，非精确圆弧     |
| 文本元素      | 仅保留基本位置信息，字体和详细格式丢失 |
| 铜皮区域      | 散热焊盘（Thermal Spokes）不转换       |
| 3D 模型       | 仅保留 Model3DName，几何数据不转换     |
| 槽孔          | 简化为边界框矩形                       |
| 复杂 SVG 路径 | 仅支持 M/L/C/A/Z 命令，其他命令忽略    |
| 尺寸标注      | 不转换                                 |
| 禁布区        | 不转换                                 |
| 设计规则/约束 | 不转换                                 |
| 层颜色/可见性 | 不转换                                 |

---

## 12. 技术架构

### 12.1 插件结构

```
pro-api-sdk/
├── src/
│   ├── index.ts                    # 主入口，注册菜单和命令处理器
│   └── converter/
│       ├── importer.ts             # 导入管线编排（ZIP → .elibz2）
│       ├── hkp-parser.ts           # HKP 文件解析器（PSK/CEL）
│       ├── parts-parser.ts         # PDB 零件文件解析器
│       ├── symbol-text-parser.ts   # V54 符号文本文件解析器
│       ├── pro-writer-footprint.ts # 封装 → Pro V3 文档生成
│       ├── pro-writer-symbol.ts    # 符号 → Pro V3 文档生成
│       ├── pro-layers.ts           # Pro V3 样板代码生成（层、画布）
│       ├── easyeda-importer.ts     # EasyEDA JSON 解析器（导出用）
│       ├── pro-editor-parser.ts    # Pro V3 `||` 格式解析器（导出用）
│       ├── footprint-converter.ts  # 封装转换器（导出方向）
│       ├── symbol-converter.ts     # 符号转换器（导出方向）
│       ├── svg-path-parser.ts      # SVG 路径命令解析器
│       ├── models-xpedition.ts     # Xpedition 输出数据模型
│       ├── models-easyeda.ts       # EasyEDA 输入数据模型
│       └── constants.ts            # 常量、映射表、单位换算
├── iframe/
│   └── wizard.html                 # 图形化向导 UI
├── locales/                        # 国际化翻译
├── extension.json                  # 插件配置
└── build/
    └── packaged.ts                 # 打包脚本
```

### 12.2 通信机制

插件 UI（wizard.html iframe）与扩展主进程（index.ts）通过共享存储通信：

1. UI 写入配置：`eda.sys_Storage.setExtensionUserConfig(key, value)`
2. 扩展读取配置：`eda.sys_Storage.getExtensionUserConfig(key)`
3. 扩展处理后写入结果
4. UI 轮询读取结果

**通信键值流（导入流程）：**

```
UI                    Extension
 │                       │
 ├─ cmd="import" ──────→│ 解析 ZIP + 转换
 │   data={file}        │
 │                       ├─ cmd="import-convert-done" ─→ UI 显示操作选择页
 │                       │
 ├─ cmd="import-execute"│
 │   data={importPro,    │
 │         download}  ──→│
 │                       ├─ openFile (导入专业版)
 │                       ├─ saveFile (下载库文件)
 │                       ├─ cmd="import-done" ────────→ UI 显示结果页
```

### 12.3 两阶段导入架构

- **Phase 1**（`import` 命令）：ZIP → 解析 → 格式转换 → 存储 Blob → 发送 `import-convert-done`
- **Phase 2**（`import-execute` 命令）：根据用户勾选执行 `openFile`（导入专业版）和/或 `saveFile`（下载库文件）→ 发送 `import-done`

### 12.4 编译与打包

```shell
npm run compile                    # esbuild 编译 → dist/index.js
npx ts-node build/packaged.ts      # 打包为 .eext 扩展包
```
