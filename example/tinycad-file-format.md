# TinyCAD 文件格式说明

TinyCAD 使用 XML 格式保存原理图，扩展名通常为 `.dsn`。一个 `.dsn` 文件可包含多张图纸，但转换时插件以 `<TinyCADSheets>/<TinyCAD>` 下第一张图纸为准。

## 1. 文件根结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<TinyCADSheets>
  <TinyCAD>
    <NAME>Sheet 1</NAME>
    <DETAILS>
      <Size width="1485" height="1050" />
    </DETAILS>

    <!-- 符号定义 -->
    <SYMBOLDEF id="...">...</SYMBOLDEF>

    <!-- 符号实例 -->
    <SYMBOL id="..." pos="x,y" ...>...</SYMBOL>

    <!-- 连线与网络 -->
    <WIRE a="x1,y1" b="x2,y2" />
    <BUS a="x1,y1" b="x2,y2" />
    <JUNCTION pos="x,y" />
    <LABEL pos="x,y" direction="0">NET_NAME</LABEL>
  </TinyCAD>
</TinyCADSheets>
```

所有坐标均为 TinyCAD 内部单位，转换时会按固定比例映射到嘉立创EDA专业版原理图单位。

---

## 2. 图纸属性

### DETAILS / Size

```xml
<DETAILS>
  <Size width="1485" height="1050" />
</DETAILS>
```

- `width` / `height`：图纸尺寸，默认 `1485 × 1050`。

---

## 3. 符号定义（SYMBOLDEF）

```xml
<SYMBOLDEF id="0B4C...">
  <NAME>Resistor</NAME>
  <REF>R</REF>
  <DESCRIPTION>Resistor</DESCRIPTION>
  <PPP>1</PPP>

  <TinyCAD>
    <!-- 图形 -->
    <RECTANGLE a="-10,-5" b="10,5" style="0" fill="0" />
    <POLYGON pos="0,0" style="0" fill="0">
      <POINT pos="-10,0" />
      <POINT pos="10,0" />
    </POLYGON>
    <LABEL pos="0,-10" direction="0" font="0" color="000000" style="0">REFDES</LABEL>

    <!-- 引脚 -->
    <PIN pos="-10,0" number="1" direction="3" length="10" which="0" show="0">PIN_NAME</PIN>
    <PIN pos="10,0" number="2" direction="2" length="10" which="0" show="0">PIN_NAME</PIN>
  </TinyCAD>
</SYMBOLDEF>
```

### SYMBOLDEF 字段

| 字段          | 说明                                                |
| ------------- | --------------------------------------------------- |
| `id`          | 符号定义唯一标识，供 `SYMBOL` 引用                  |
| `NAME`        | 符号名称                                            |
| `REF`         | 位号前缀，如 `R`、`C`、`U`                          |
| `DESCRIPTION` | 描述                                                |
| `PPP`         | Parts Per Package，单个封装内逻辑单元数量，默认 `1` |

### 图形元素

#### RECTANGLE（矩形）

```xml
<RECTANGLE a="x1,y1" b="x2,y2" style="0" fill="0" />
```

- `a`：左上角坐标
- `b`：右下角坐标
- `style`：线型索引
- `fill`：填充索引

#### POLYGON（多边形）

```xml
<POLYGON pos="x,y" style="0" fill="0">
  <POINT pos="x1,y1" />
  <POINT pos="x2,y2" />
  ...
</POLYGON>
```

- `pos`：基准偏移
- `POINT`：相对 `pos` 的点序列

#### LABEL（文本标签）

```xml
<LABEL pos="x,y" direction="0" font="0" color="000000" style="0">文本内容</LABEL>
```

- `direction`：文字方向
- `font` / `color` / `style`：样式索引

### 引脚（PIN）

```xml
<PIN pos="x,y" number="1" direction="3" length="10" which="0" show="0">PIN_NAME</PIN>
```

| 属性        | 说明                                     |
| ----------- | ---------------------------------------- |
| `pos`       | 引脚在符号内的位置                       |
| `number`    | 引脚编号                                 |
| `direction` | 引脚朝向：`0`=下，`1`=上，`2`=右，`3`=左 |
| `length`    | 引脚长度                                 |
| `which`     | 多 Part 时所属 Part 索引                 |
| `show`      | 是否显示                                 |
| 文本内容    | 引脚名称                                 |

---

## 4. 符号实例（SYMBOL）

```xml
<SYMBOL id="0B4C..." pos="100,200" rotate="0" scale_x="1" scale_y="1">
  <FIELD>
    <DESCRIPTION>Value</DESCRIPTION>
    <VALUE>1k</VALUE>
    <show>1</show>
  </FIELD>
</SYMBOL>
```

| 属性                  | 说明                  |
| --------------------- | --------------------- |
| `id`                  | 引用的 `SYMBOLDEF id` |
| `pos`                 | 在图纸上的放置位置    |
| `rotate`              | 旋转角度              |
| `scale_x` / `scale_y` | X/Y 缩放              |

### FIELD

符号实例上的属性字段：

| 子元素        | 说明                              |
| ------------- | --------------------------------- |
| `DESCRIPTION` | 字段描述，如 `Value`、`Footprint` |
| `VALUE`       | 字段值                            |
| `show`        | 是否显示                          |

---

## 5. 连接关系

### WIRE（导线）

```xml
<WIRE a="x1,y1" b="x2,y2" />
```

### BUS（总线）

```xml
<BUS a="x1,y1" b="x2,y2" />
```

### JUNCTION（节点）

```xml
<JUNCTION pos="x,y" />
```

### LABEL（网络标签）

```xml
<LABEL pos="x,y" direction="0">NET_NAME</LABEL>
```

---

## 6. 导入行为

插件导入 TinyCAD 时：

1. 解析 `<TinyCADSheets>/<TinyCAD>` 下的第一张图纸。
2. 将每个 `SYMBOLDEF` 转换为嘉立创EDA专业版符号。
3. 将 `SYMBOL` 实例、导线、总线、节点、网络标签转换为原理图页。
4. 输出为 EasyEDA Pro 工程归档（`.epro2`）。

> 注：目前仅支持单张图纸导入；多张图纸时只处理第一张。
