import os
import json
import zipfile
import subprocess
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path
import shutil
import sys
import traceback
import tempfile
from datetime import datetime

# --------------------- 全局配置 ---------------------
APP_NAME = "xpedition库打包工具"
TOOL_MAP = {
    "psk": "PadstackDB2HKP.exe",
    "cel": "CellDB2HKP.exe",
    "pdb": "PartsDB2HKP.exe"
}
SUFFIX_MAP = {
    "psk": ".PSK.HKP",
    "cel": ".CEL.HKP",
    "pdb": ".PDB.HKP"
}

# ── UI 规范色彩 (遵循 easyeda-ui-spec.md) ──
C_PRIMARY       = '#1890FF'
C_PRIMARY_HOVER = '#0D7DE8'
C_BG            = '#FFFFFF'
C_BORDER        = '#D1D1D1'
C_BORDER_INPUT  = '#D0D0D0'
C_HEADER_BG     = '#F0F0F0'
C_HEADER_BORDER = '#E0E0E0'
C_ROW_EVEN      = '#F8F8F8'
C_ROW_HOVER     = '#E6F7FF'
C_DISABLED_BG   = '#E8E8E8'
C_DISABLED_TEXT = '#AAAAAA'
C_TEXT          = '#1A1A1A'
C_TEXT_LABEL    = '#444444'
C_TEXT_SUB      = '#555555'
C_TEXT_HINT     = '#888888'
C_DIVIDER       = '#E8E8E8'
C_SUCCESS       = '#34A853'
C_SUCCESS_BG    = '#E8F5E9'
C_WARN          = '#F59E0B'
C_PROGRESS_TRACK= '#E8E8E8'
C_PROGRESS_FILL = '#2D6EE8'
C_SCROLL_TRACK  = '#F0F0F0'
C_SCROLL_THUMB  = '#C8C8C8'
C_BTN_HOVER     = '#F5F5F5'
C_BTN_BORDER    = '#F1F1F1'
C_TITLE_BAR_BG  = '#F1F1F1'

# ── 字体 (规范: 所有文本统一 12px) ──
FONT       = ("Segoe UI", 12)
FONT_BOLD  = ("Segoe UI", 12, "bold")
FONT_LOG   = ("Consolas", 12)

# ── 尺寸 (规范: 720×600, footer 58px, 按钮 86×32, 行高 32px) ──
WIN_W, WIN_H   = 720, 600
FOOTER_H        = 58
BODY_PAD_X      = 24
BODY_PAD_TOP    = 21
BODY_PAD_BOTTOM = 4
INNER_PAD       = 16
INNER_PAD_H     = 34
BTN_W           = 86
BTN_H           = 32
TABLE_HEADER_H  = 28
TABLE_ROW_H     = 32

# 记忆文件路径 (与脚本同目录)
_CFG_PATH = Path(sys.executable).parent / "lib_pack_cfg.json" if getattr(sys, 'frozen', False) \
            else Path(__file__).parent / "lib_pack_cfg.json"

def _load_cfg():
    try:
        with open(_CFG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_cfg(data):
    try:
        with open(_CFG_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

# 全局异常捕获 防止闪退
def show_exception_and_exit(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    err = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    messagebox.showerror("程序错误", f"运行失败：\n{err}")

sys.excepthook = show_exception_and_exit


# ─────────────────────────────────────────────────────────
#  主窗口
# ─────────────────────────────────────────────────────────
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME)
        self.geometry(f"{WIN_W}x{WIN_H}")
        self.minsize(600, 480)
        self.resizable(True, True)
        self.configure(bg=C_BG)

        # 锁定字体缩放：强制按 96 DPI 渲染，防止高 DPI 导致字体放大
        self.tk.call('tk', 'scaling', 96.0 / 72.0)

        # 应用图标：蓝色打包盒
        self._app_icon = self._create_app_icon()
        self.iconphoto(True, self._app_icon)

        # 设置标题栏背景色 (Windows 11 22H2+)
        self.after(50, self._set_titlebar_color)

        # 路径变量
        self.path_xpe = tk.StringVar(value=_load_cfg().get('xpe', ''))
        self.path_pad = tk.StringVar()
        self.path_cell = tk.StringVar()
        self.path_part = tk.StringVar()
        self.path_sym = tk.StringVar()

        self.task_list = []
        self.sym_dir_path = ""
        self.selected_tasks = []
        self.selected_sym = None
        self.zip_save_path = ""

        self._current_page_cls = None
        self._setup_styles()

        # 必填项变化时实时更新 footer 按钮状态
        for v in (self.path_xpe, self.path_pad, self.path_cell,
                  self.path_part, self.path_sym):
            v.trace_add('write', lambda *_: self._update_footer())

        # Xpedition 程序目录记忆：变化时自动保存
        self.path_xpe.trace_add('write', lambda *_: _save_cfg({'xpe': self.path_xpe.get()}))

        # ── footer 先 pack 钉在底部 ──
        footer = tk.Frame(self, bg=C_BG, height=FOOTER_H)
        footer.pack(side='bottom', fill='x')
        footer.pack_propagate(False)

        btn_y = (FOOTER_H - BTN_H) // 2
        fb = tk.Frame(footer, bg=C_BG)
        fb.pack(side='right', padx=BODY_PAD_X)

        w, self.btn_done = self._make_btn(fb, "完成")
        w.pack(side='right', padx=4, pady=btn_y)
        w, self.btn_next = self._make_btn(fb, "下一步", primary=True)
        w.pack(side='right', padx=4, pady=btn_y)
        w, self.btn_back = self._make_btn(fb, "返回")
        w.pack(side='right', padx=4, pady=btn_y)
        w, self.btn_exit = self._make_btn(fb, "退出")
        w.pack(side='right', padx=4, pady=btn_y)

        self.btn_exit.configure(command=self._on_exit)
        self.btn_back.configure(command=self._on_back)
        self.btn_next.configure(command=self._on_next)
        self.btn_done.configure(command=self._on_done)

        # ── body-wrap (外层 padding 21px 24px 4px 24px) ──
        body_wrap = tk.Frame(self, bg=C_BG)
        body_wrap.pack(fill='both', expand=True,
                       padx=BODY_PAD_X,
                       pady=(BODY_PAD_TOP, BODY_PAD_BOTTOM))

        # ── body (内框: border #D0D0D0, padding 12px 14px) ──
        self.body = tk.Frame(body_wrap, bg=C_BG,
                            highlightbackground=C_BORDER_INPUT,
                            highlightthickness=1)
        self.body.pack(fill='both', expand=True)

        # ── 页面容器 ──
        self.container = tk.Frame(self.body, bg=C_BG)
        self.container.pack(fill='both', expand=True,
                           padx=INNER_PAD_H, pady=INNER_PAD)
        self.container.grid_rowconfigure(0, weight=1)
        self.container.grid_columnconfigure(0, weight=1)

        self.frames = {}
        for Page in (Page1, Page2, Page3, Page4):
            frame = Page(self.container, self)
            self.frames[Page] = frame
            frame.grid(row=0, column=0, sticky='nsew')

        self.show_frame(Page1)

    # ── 生成应用图标 (32×32 蓝色打包盒) ──

    @staticmethod
    def _in_rrect(x, y, x1, y1, x2, y2, r):
        if x < x1 or x > x2 or y < y1 or y > y2:
            return False
        if x < x1 + r and y < y1 + r:
            return (x - x1 - r) ** 2 + (y - y1 - r) ** 2 <= r * r
        if x > x2 - r and y < y1 + r:
            return (x - x2 + r) ** 2 + (y - y1 - r) ** 2 <= r * r
        if x < x1 + r and y > y2 - r:
            return (x - x1 - r) ** 2 + (y - y2 + r) ** 2 <= r * r
        if x > x2 - r and y > y2 - r:
            return (x - x2 + r) ** 2 + (y - y2 + r) ** 2 <= r * r
        return True

    def _create_app_icon(self):
        s = 32
        img = tk.PhotoImage(width=s, height=s)
        W = '#FFFFFF'
        B = '#1890FF'
        D = '#0D7DE8'

        # 外框 (圆角矩形)
        ox1, oy1, ox2, oy2, oR = 3, 2, 28, 29, 4
        # 内框
        ix1, iy1, ix2, iy2, iR = 5, 4, 26, 27, 3

        for y in range(s):
            row = []
            for x in range(s):
                out = self._in_rrect(x, y, ox1, oy1, ox2, oy2, oR)
                inn = self._in_rrect(x, y, ix1, iy1, ix2, iy2, iR)

                if not out:
                    c = W
                elif not inn:
                    c = D
                else:
                    # 内部：三条白色文件线 (y=9,10 / 15,16 / 21,22)
                    if (9 <= x <= 22) and y in (10, 11, 15, 16, 21, 22):
                        c = W
                    else:
                        c = B
                row.append(c)
            img.put('{' + ' '.join(row) + '}', to=(0, y))
        return img

    # ── 标题栏颜色 (Windows 11+ DWM API) ──

    def _set_titlebar_color(self):
        try:
            import ctypes
            hwnd = int(self.winfo_id())
            # DWMWA_CAPTION_COLOR=35, COLORREF=#F1F1F1=0x00F1F1F1
            color = ctypes.c_uint32(0x00F1F1F1)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 35, ctypes.byref(color), ctypes.sizeof(color))
        except Exception:
            pass

    # ── 按钮工厂 (Frame 包裹实现彩色边框) ──

    def _make_btn(self, parent, text, primary=False):
        border_color = C_PRIMARY if primary else C_BTN_BORDER
        wrap = tk.Frame(parent, bg=border_color, padx=1, pady=1)
        btn = tk.Button(wrap, text=text, font=FONT,
                       width=10, relief='flat', bd=0, cursor='hand2')
        btn.pack()
        btn._wrap = wrap
        self._style_btn(btn, 'primary' if primary else 'normal')
        return wrap, btn

    def _style_btn(self, btn, mode):
        wrap = getattr(btn, '_wrap', None)
        if mode == 'primary':
            btn.configure(state='normal', bg=C_PRIMARY, fg='#FFFFFF',
                         activebackground=C_PRIMARY_HOVER,
                         activeforeground='#FFFFFF',
                         disabledforeground='#FFFFFF')
            if wrap: wrap.configure(bg=C_PRIMARY)
        elif mode == 'disabled':
            btn.configure(state='disabled', bg=C_DISABLED_BG,
                         fg=C_DISABLED_TEXT,
                         disabledforeground=C_DISABLED_TEXT)
            if wrap: wrap.configure(bg=C_DISABLED_BG)
        else:
            btn.configure(state='normal', bg=C_BG, fg=C_TEXT,
                         activebackground=C_BTN_HOVER,
                         activeforeground=C_TEXT,
                         disabledforeground=C_DISABLED_TEXT)
            if wrap: wrap.configure(bg=C_BTN_BORDER)

    def _validate_page1(self):
        xpe = self.path_xpe.get().strip()
        has_lib = any(v.get().strip() for v in
                      (self.path_pad, self.path_cell, self.path_part, self.path_sym))
        return bool(xpe) and has_lib

    def _update_footer(self):
        step = self._step_of(self._current_page_cls)
        if step == 1:
            self._style_btn(self.btn_exit, 'normal')
            self._style_btn(self.btn_back, 'disabled')
            self._style_btn(self.btn_next, 'primary' if self._validate_page1() else 'disabled')
            self._style_btn(self.btn_done, 'disabled')
        elif step == 2:
            self._style_btn(self.btn_exit, 'normal')
            self._style_btn(self.btn_back, 'normal')
            self._style_btn(self.btn_next, 'primary')
            self._style_btn(self.btn_done, 'disabled')
        elif step == 3:
            self._style_btn(self.btn_exit, 'normal')
            self._style_btn(self.btn_back, 'disabled')
            self._style_btn(self.btn_next, 'disabled')
            self._style_btn(self.btn_done, 'disabled')
        elif step == 4:
            self._style_btn(self.btn_exit, 'normal')
            self._style_btn(self.btn_back, 'normal')
            self._style_btn(self.btn_next, 'disabled')
            self._style_btn(self.btn_done, 'primary')

    @staticmethod
    def _step_of(cls):
        return {Page1: 1, Page2: 2, Page3: 3, Page4: 4}.get(cls, 1)

    # ── 页面切换 ──

    def show_frame(self, page):
        self._current_page_cls = page
        self.frames[page].tkraise()
        if hasattr(self.frames[page], 'on_show'):
            self.frames[page].on_show()
        self._update_footer()

    # ── footer 动作 ──

    def _on_exit(self):
        self.quit()

    def _on_back(self):
        step = self._step_of(self._current_page_cls)
        target = {2: Page1, 3: Page1, 4: Page2}.get(step)
        if target:
            self.show_frame(target)

    def _on_next(self):
        step = self._step_of(self._current_page_cls)
        if step == 1:
            self.frames[Page1].next_step()
        elif step == 2:
            self.frames[Page2].start_convert()

    def _on_done(self):
        if self._step_of(self._current_page_cls) == 4:
            if self.frames[Page4].do_save():
                self.quit()

    # ── ttk 样式 ──

    def _setup_styles(self):
        s = ttk.Style(self)
        s.theme_use('clam')

        s.configure('TEntry', fieldbackground=C_BG,
                    bordercolor=C_BORDER,
                    lightcolor=C_BORDER,
                    darkcolor=C_BORDER,
                    insertcolor=C_TEXT,
                    insertwidth=2,
                    padding=(10, 7))
        s.map('TEntry',
              bordercolor=[('focus', C_PRIMARY)],
              lightcolor=[('focus', C_PRIMARY)],
              darkcolor=[('focus', C_PRIMARY)],
              insertcolor=[('focus', C_TEXT)],
              insertwidth=[('focus', 2)])

        s.configure('Custom.Horizontal.TProgressbar',
                    thickness=8,
                    background=C_PROGRESS_FILL,
                    troughcolor=C_PROGRESS_TRACK,
                    borderwidth=0)

        s.configure('TScrollbar', width=8,
                    background=C_SCROLL_THUMB,
                    troughcolor=C_SCROLL_TRACK,
                    bordercolor=C_SCROLL_TRACK,
                    arrowcolor=C_TEXT_SUB)

        s.configure('TCheckbutton', background=C_BG,
                    font=FONT, foreground=C_TEXT)

    # ── 扫描文件 (业务逻辑不变) ──

    def scan_files(self):
        self.task_list.clear()
        self.sym_dir_path = self.path_sym.get().strip()
        seen = set()

        def scan_dir(root_path, suffix, ftype):
            root = Path(root_path)
            if not root.exists():
                return
            for file in root.rglob(f"*.{suffix}"):
                key = str(file).lower()
                if key in seen:
                    continue
                seen.add(key)
                rel = file.relative_to(root)
                name_parts = list(rel.parts)
                pure_name = file.stem
                if len(name_parts) > 1:
                    dir_str = "_".join(name_parts[:-1])
                    out_name = f"{dir_str}_{pure_name}{SUFFIX_MAP[suffix]}"
                else:
                    out_name = f"{pure_name}{SUFFIX_MAP[suffix]}"
                self.task_list.append({"src": str(file), "out_name": out_name, "type": ftype})

        if self.path_pad.get().strip():
            scan_dir(self.path_pad.get(), "psk", "pad")
        if self.path_cell.get().strip():
            scan_dir(self.path_cell.get(), "cel", "cell")
        if self.path_part.get().strip():
            scan_dir(self.path_part.get(), "pdb", "part")


# ─────────────────────────────────────────────────────────
#  页面1 — 选择库路径
# ─────────────────────────────────────────────────────────
class Page1(tk.Frame):
    def __init__(self, parent, ctl):
        super().__init__(parent, bg=C_BG)
        self.ctl = ctl
        self._build()

    def _build(self):
        # 页面标题
        tk.Label(self, text="选择库路径", font=FONT_BOLD,
                fg=C_TEXT, bg=C_BG).pack(anchor='w')
        tk.Label(self, text="请选择Xpedition程序目录和需要转换的库文件目录",
                font=FONT, fg=C_TEXT_HINT, bg=C_BG).pack(anchor='w', pady=(4, 16))

        # 表单区
        form = tk.Frame(self, bg=C_BG)
        form.pack(fill='both', expand=True)

        fields = [
            ("Xpedition程序目录", self.ctl.path_xpe, True,  "请选择 Xpedition 安装目录"),
            ("焊盘堆栈目录",      self.ctl.path_pad, False, "包含 .psk 文件的目录（可选）"),
            ("封装目录",          self.ctl.path_cell, False, "包含 .cel 文件的目录（可选）"),
            ("器件目录",          self.ctl.path_part, False, "包含 .pdb 文件的目录（可选）"),
            ("符号目录",          self.ctl.path_sym, False, "符号文件目录（可选）"),
        ]

        for i, (text, var, required, hint) in enumerate(fields):
            auto = var in (self.ctl.path_pad, self.ctl.path_cell,
                          self.ctl.path_part, self.ctl.path_sym)
            self._make_row(form, text, var, required, i, hint, auto_detect=auto)

        form.grid_columnconfigure(1, weight=1)

        # 红色提示 (默认隐藏)
        self.hint_label = tk.Label(self, text="提示：至少输入一个库路径",
                                  font=FONT, fg='#FF4D4F', bg=C_BG, anchor='w')
        # 库路径变化时自动隐藏提示
        for v in (self.ctl.path_pad, self.ctl.path_cell,
                  self.ctl.path_part, self.ctl.path_sym):
            v.trace_add('write', lambda *_: self.hint_label.pack_forget())

    def _make_row(self, parent, text, var, required, row, placeholder="", auto_detect=False):
        pad_y = 20 if row > 0 else 0

        # 标签
        lbl = tk.Label(parent, text=text + (" *" if required else ""),
                      font=FONT_BOLD if required else FONT,
                      fg=C_TEXT_LABEL, bg=C_BG, anchor='e', width=16)
        lbl.grid(row=row, column=0, sticky='e', padx=(0, 12), pady=(pad_y, 0))

        # 输入 + 浏览按钮
        row_frame = tk.Frame(parent, bg=C_BG)
        row_frame.grid(row=row, column=1, sticky='ew', pady=(pad_y, 0))

        entry = ttk.Entry(row_frame, textvariable=var, font=FONT)
        entry.pack(side='left', fill='x', expand=True, padx=(0, 8))

        # 占位提示
        if placeholder:
            ph = tk.Label(row_frame, text=placeholder, font=FONT,
                         fg=C_TEXT_HINT, bg=C_BG, anchor='w')
            ph.place(x=12, rely=0.5, anchor='w')
            def _sync_ph(*_a, _ph=ph, _var=var, _entry=entry):
                if _var.get().strip():
                    _ph.place_forget()
                else:
                    _ph.place(x=12, rely=0.5, anchor='w')
            var.trace_add('write', _sync_ph)
            ph.bind('<Button-1>', lambda e, _e=entry: _e.focus())
            if var.get().strip():
                ph.place_forget()

        if auto_detect:
            cmd = lambda v=var: self._browse_and_detect(v)
        else:
            cmd = lambda v=var: v.set(filedialog.askdirectory())
        browse_wrap = tk.Frame(row_frame, bg=C_BTN_BORDER, padx=1, pady=1)
        browse_wrap.pack(side='right')
        btn = tk.Button(browse_wrap, text="浏览", font=FONT,
                       relief='flat', bd=0,
                       bg=C_HEADER_BG, fg=C_TEXT_SUB,
                       activebackground='#E5E5E5',
                       activeforeground=C_TEXT,
                       cursor='hand2', width=6,
                       command=cmd)
        btn.pack()
        btn.pack(side='right')

    def _browse_and_detect(self, var):
        path = filedialog.askdirectory()
        if path:
            var.set(path)
            self._auto_detect_paths(path)

    def _auto_detect_paths(self, selected_dir):
        parent = Path(selected_dir).parent
        if not parent.is_dir():
            return
        mapping = {
            'CellDBLibs': self.ctl.path_cell,
            'SymbolLibs': self.ctl.path_sym,
            'PartsDBLibs': self.ctl.path_part,
            'Layout':      self.ctl.path_pad,
        }
        for folder, var in mapping.items():
            target = parent / folder
            if target.is_dir() and not var.get().strip():
                var.set(str(target))

    def next_step(self):
        xpe_path = Path(self.ctl.path_xpe.get().strip())
        if not xpe_path.exists() or not xpe_path.is_dir():
            messagebox.showerror("错误", "请填写正确的 Xpedition 程序目录！")
            return
        has_lib = any(v.get().strip() for v in
                      (self.ctl.path_pad, self.ctl.path_cell,
                       self.ctl.path_part, self.ctl.path_sym))
        if not has_lib:
            self.hint_label.pack(anchor='w', padx=28, pady=(6, 0))
            return
        self.ctl.scan_files()
        self.ctl.show_frame(Page2)


# ─────────────────────────────────────────────────────────
#  页面2 — 文件勾选
# ─────────────────────────────────────────────────────────
class Page2(tk.Frame):
    def __init__(self, parent, ctl):
        super().__init__(parent, bg=C_BG)
        self.ctl = ctl
        self.check_items = []
        self._build()

    def _build(self):
        # 页面标题
        tk.Label(self, text="确认需要转换的文件", font=FONT_BOLD,
                fg=C_TEXT, bg=C_BG).pack(anchor='w')
        tk.Label(self, text="默认已全选，可取消不需要转换的项目",
                font=FONT, fg=C_TEXT_HINT, bg=C_BG).pack(anchor='w', pady=(4, 10))

        # ── 全选按钮 ──
        sel_row = tk.Frame(self, bg=C_BG)
        sel_row.pack(fill='x', pady=(0, 6))

        self.check_all_var = tk.BooleanVar(value=True)
        tk.Checkbutton(sel_row, text="全选", variable=self.check_all_var,
                      font=FONT, fg=C_TEXT_LABEL, bg=C_BG,
                      selectcolor=C_BG, activebackground=C_BG,
                      cursor='hand2',
                      command=self._toggle_all).pack(side='left')

        self.sel_info = tk.Label(sel_row, text="", font=FONT,
                                fg=C_TEXT_HINT, bg=C_BG)
        self.sel_info.pack(side='left', padx=(12, 0))

        # ── 表格容器 (border #D1D1D1, radius 4) ──
        table_box = tk.Frame(self, bg=C_BG,
                            highlightbackground=C_BORDER,
                            highlightthickness=1)
        table_box.pack(fill='both', expand=True)

        # 表头 (height 28px, bg #F0F0F0, border-bottom #E0E0E0)
        hdr = tk.Frame(table_box, bg=C_HEADER_BG, height=TABLE_HEADER_H)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)

        # 表头分割线
        tk.Frame(hdr, bg=C_HEADER_BORDER, height=1).pack(side='bottom', fill='x')

        tk.Label(hdr, text="  文件名称", font=FONT,
                fg=C_TEXT_HINT, bg=C_HEADER_BG).pack(side='left', fill='x', expand=True, padx=(4, 0))
        tk.Label(hdr, text="类型  ", font=FONT,
                fg=C_TEXT_HINT, bg=C_HEADER_BG).pack(side='right')

        # 表体 (可滚动)
        body_frame = tk.Frame(table_box, bg=C_BG)
        body_frame.pack(fill='both', expand=True)

        self.canvas = tk.Canvas(body_frame, bg=C_BG, highlightthickness=0)
        scrollbar = ttk.Scrollbar(body_frame, orient='vertical',
                                 command=self.canvas.yview)
        self.list_frame = tk.Frame(self.canvas, bg=C_BG)
        self.list_frame.bind('<Configure>',
                           lambda e: self.canvas.configure(scrollregion=self.canvas.bbox('all')))
        self._list_win = self.canvas.create_window((0, 0), window=self.list_frame, anchor='nw')
        self.canvas.bind('<Configure>',
                        lambda e: self.canvas.itemconfig(self._list_win, width=e.width))
        self.canvas.configure(yscrollcommand=scrollbar.set)
        self.canvas.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')

        # 鼠标滚轮
        self.canvas.bind('<Enter>', lambda e: self.canvas.bind_all('<MouseWheel>', self._on_wheel))
        self.canvas.bind('<Leave>', lambda e: self.canvas.unbind_all('<MouseWheel>'))

    def _on_wheel(self, event):
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), 'units')

    def _toggle_all(self):
        on = self.check_all_var.get()
        for item in self.check_items:
            item['var'].set(on)

    def on_show(self):
        for w in self.list_frame.winfo_children():
            w.destroy()
        self.check_items.clear()
        self.check_all_var.set(True)

        idx = 0

        # 符号目录
        sym_path = self.ctl.sym_dir_path
        if sym_path and Path(sym_path).exists():
            self._add_row("[符号] " + os.path.basename(sym_path), "符号",
                         {"kind": "sym"}, idx)
            idx += 1

        # 库文件
        for task in self.ctl.task_list:
            prefix = {"pad": "焊盘", "cell": "封装", "part": "器件"}.get(task["type"], "文件")
            self._add_row(task['out_name'], prefix,
                         {"kind": "file", "data": task}, idx)
            idx += 1

        total = len(self.check_items)
        self.sel_info.configure(text=f"已选 {total} / {total} 项")

    def _add_row(self, name, type_text, data, idx):
        bg = C_ROW_EVEN if idx % 2 == 0 else C_BG

        row = tk.Frame(self.list_frame, bg=bg, height=TABLE_ROW_H)
        row.pack(fill='x')
        row.pack_propagate(False)

        v = tk.BooleanVar(value=True)

        cb = tk.Checkbutton(row, variable=v,
                           bg=bg, activebackground=C_ROW_HOVER,
                           selectcolor=C_BG, highlightthickness=0,
                           cursor='hand2',
                           command=lambda: self._sync_sel_info())
        cb.pack(side='left', padx=(10, 4))

        tk.Label(row, text=name, font=FONT, fg=C_TEXT, bg=bg,
                anchor='w').pack(side='left', fill='x', expand=True, padx=(2, 0))
        tk.Label(row, text=type_text, font=FONT, fg=C_TEXT_SUB, bg=bg,
                width=8, anchor='w').pack(side='right', padx=(0, 10))

        # hover
        def enter(e, r=row, b=bg):
            r.configure(bg=C_ROW_HOVER)
            for w in r.winfo_children():
                try:
                    if isinstance(w, tk.Checkbutton):
                        w.configure(bg=C_ROW_HOVER, activebackground=C_ROW_HOVER)
                    else:
                        w.configure(bg=C_ROW_HOVER)
                except tk.TclError:
                    pass
        def leave(e, r=row, b=bg):
            r.configure(bg=b)
            for w in r.winfo_children():
                try:
                    if isinstance(w, tk.Checkbutton):
                        w.configure(bg=b, activebackground=C_ROW_HOVER)
                    else:
                        w.configure(bg=b)
                except tk.TclError:
                    pass
        row.bind('<Enter>', enter)
        row.bind('<Leave>', leave)

        self.check_items.append({**data, "var": v, "row": row, "bg": bg})

    def _sync_sel_info(self):
        total = len(self.check_items)
        checked = sum(1 for it in self.check_items if it['var'].get())
        self.sel_info.configure(text=f"已选 {checked} / {total} 项")
        self.check_all_var.set(checked == total)

    def start_convert(self):
        sel_tasks = []
        sel_sym = None
        for item in self.check_items:
            if not item["var"].get():
                continue
            if item["kind"] == "sym":
                sel_sym = self.ctl.sym_dir_path
            else:
                sel_tasks.append(item["data"])
        if not sel_tasks and not sel_sym:
            messagebox.showwarning("提示", "未勾选任何内容！")
            return
        self.ctl.selected_tasks = sel_tasks
        self.ctl.selected_sym = sel_sym
        self.ctl.show_frame(Page3)


# ─────────────────────────────────────────────────────────
#  页面3 — 转换进度
# ─────────────────────────────────────────────────────────
class Page3(tk.Frame):
    def __init__(self, parent, ctl):
        super().__init__(parent, bg=C_BG)
        self.ctl = ctl
        self._build()

    def _build(self):
        # 居中容器
        center = tk.Frame(self, bg=C_BG)
        center.pack(fill='both', expand=True)

        # 旋转图标区域 (用圆形色块模拟)
        icon_area = tk.Frame(center, bg=C_BG)
        icon_area.pack(pady=(40, 0))

        spinner = tk.Frame(icon_area, bg='#EBF2FF', width=72, height=72)
        spinner.pack()
        spinner.pack_propagate(False)
        tk.Label(spinner, text="⏳", font=("Segoe UI", 32),
                fg=C_PROGRESS_FILL, bg='#EBF2FF').place(relx=0.5, rely=0.5, anchor='center')

        # 进度标题
        self.prog_title = tk.Label(center, text="正在转换中...",
                                  font=FONT_BOLD, fg=C_TEXT, bg=C_BG)
        self.prog_title.pack(pady=(16, 4))

        self.prog_desc = tk.Label(center, text="请稍候，正在将库数据转换为Xpedition格式文件",
                                 font=FONT, fg=C_TEXT_SUB, bg=C_BG)
        self.prog_desc.pack(pady=(0, 20))

        # 进度条 (height 8px)
        bar_frame = tk.Frame(center, bg=C_BG)
        bar_frame.pack(fill='x', padx=60)

        self.bar = ttk.Progressbar(bar_frame, mode='determinate',
                                  style='Custom.Horizontal.TProgressbar')
        self.bar.pack(fill='x')

        self.prog_lbl = tk.Label(center, text="准备中...",
                                font=FONT, fg=C_TEXT_HINT, bg=C_BG)
        self.prog_lbl.pack(pady=(8, 0))

        # 分割线
        tk.Frame(center, bg=C_DIVIDER, height=1).pack(fill='x', padx=60, pady=(20, 0))

        # 日志区标题
        tk.Label(center, text="转换日志", font=FONT_BOLD,
                fg=C_TEXT_LABEL, bg=C_BG, anchor='w').pack(fill='x', padx=60, pady=(10, 6))

        # 日志文本框
        log_box = tk.Frame(center, bg=C_BG,
                          highlightbackground=C_BORDER,
                          highlightthickness=1)
        log_box.pack(fill='both', expand=True, padx=60, pady=(0, 0))

        self.log_box = tk.Text(log_box, bg=C_BG, fg=C_TEXT,
                              font=FONT_LOG, relief='flat',
                              padx=10, pady=8, wrap='word',
                              insertbackground=C_TEXT, height=6)
        log_scroll = ttk.Scrollbar(log_box, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=log_scroll.set)
        self.log_box.pack(side='left', fill='both', expand=True)
        log_scroll.pack(side='right', fill='y')

    def on_show(self):
        self.log_box.delete('1.0', tk.END)
        self.bar['value'] = 0
        self.prog_lbl.configure(text="准备中...")
        self.after(100, self.do_work)

    def log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_box.insert(tk.END, f"[{ts}] {msg}\n")
        self.log_box.see(tk.END)
        self.update()

    def update_progress(self, current, total, message):
        if total > 0:
            pct = int((current / total) * 100)
            self.bar['value'] = pct
            self.prog_lbl.configure(text=f"{message}  {current}/{total}")
        self.update()

    def do_work(self):
        temp_dir = Path(tempfile.mkdtemp(prefix="xpe_pack_"))
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        self.log(f"临时目录：{temp_dir}")

        task_list = self.ctl.selected_tasks
        sym_src = self.ctl.selected_sym
        total = len(task_list)
        self.bar['maximum'] = 100
        xpe_bin = Path(self.ctl.path_xpe.get().strip())

        for idx, task in enumerate(task_list):
            src = task["src"]
            out_name = task["out_name"]

            self.update_progress(idx, total, f"正在转换: {out_name}")

            if out_name.lower().endswith(".psk.hkp"):
                tool = xpe_bin / TOOL_MAP["psk"]
            elif out_name.lower().endswith(".cel.hkp"):
                tool = xpe_bin / TOOL_MAP["cel"]
            elif out_name.lower().endswith(".pdb.hkp"):
                tool = xpe_bin / TOOL_MAP["pdb"]
            else:
                self.log(f"跳过未知文件：{out_name}")
                continue

            out_path = temp_dir / out_name
            self.log(f"正在转换：{out_name}")

            cmd = [str(tool), "-i", src, "-o", str(out_path), "-u", "mm", "-a"]
            try:
                result = subprocess.run(
                    cmd, cwd=str(xpe_bin),
                    capture_output=True, text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    check=False
                )
                if result.returncode != 0:
                    self.log(f"【警告】{out_name}：转换返回非零状态码 {result.returncode}")
                    if result.stderr:
                        self.log(f"错误输出：{result.stderr[:200]}")
                else:
                    self.log(f"[成功] {out_name}")
            except FileNotFoundError as e:
                self.log(f"[失败] {out_name}：找不到命令或文件 - {str(e)}")
                self.log(f"命令：{' '.join(cmd)}")
                self.log(f"工作目录：{xpe_bin}")
            except Exception as e:
                self.log(f"[失败] {out_name}：{str(e)}")

        if sym_src and Path(sym_src).is_dir():
            self.log("正在复制符号目录...")
            sym_dst = temp_dir / os.path.basename(sym_src)
            shutil.copytree(sym_src, sym_dst, dirs_exist_ok=True)

        self.log("准备完成...")
        file_count = len(task_list) + (1 if sym_src and Path(sym_src).is_dir() else 0)
        zip_filename = f"xpedition_library_{file_count}files"

        self.ctl.temp_dir = str(temp_dir)
        self.ctl.default_zip_name = zip_filename
        self.ctl.default_save_dir = str(Path.home() / "Desktop")

        self.bar['value'] = 100
        self.prog_lbl.configure(text="转换完成！")
        self.ctl.show_frame(Page4)


# ─────────────────────────────────────────────────────────
#  页面4 — 完成
# ─────────────────────────────────────────────────────────
class Page4(tk.Frame):
    def __init__(self, parent, ctl):
        super().__init__(parent, bg=C_BG)
        self.ctl = ctl
        self.var_fname = tk.StringVar()
        self.var_save_dir = tk.StringVar()
        self._build()

    def _build(self):
        # 上部居中: 成功图标 + 标题 (pady=40 与转换页图标对齐)
        top = tk.Frame(self, bg=C_BG)
        top.pack(fill='x', pady=(40, 0))

        circle = tk.Frame(top, bg=C_SUCCESS_BG, width=72, height=72)
        circle.pack()
        circle.pack_propagate(False)
        tk.Label(circle, text="✓", font=("Segoe UI", 28, "bold"),
                fg=C_SUCCESS, bg=C_SUCCESS_BG).place(relx=0.5, rely=0.5, anchor='center')

        tk.Label(top, text="转换完成！",
                font=FONT_BOLD, fg=C_TEXT, bg=C_BG).pack(pady=(12, 0))

        # 分割线
        tk.Frame(self, bg=C_DIVIDER, height=1).pack(fill='x', padx=60, pady=(16, 0))

        # 保存设置区 — 标题 (pack)
        save_sec = tk.Frame(self, bg=C_BG)
        save_sec.pack(fill='x', padx=60, pady=(14, 0))

        tk.Label(save_sec, text="保存到本地", font=FONT_BOLD,
                fg=C_TEXT_LABEL, bg=C_BG, anchor='w').pack(fill='x')
        tk.Label(save_sec, text="选择文件名和保存路径，点击完成进行打包下载",
                font=FONT, fg=C_TEXT_HINT, bg=C_BG, anchor='w').pack(fill='x', pady=(2, 10))

        # 表单区 (grid) — 独立容器，不能与 pack 混用
        form = tk.Frame(self, bg=C_BG)
        form.pack(fill='x', padx=60)
        form.columnconfigure(1, weight=1)

        tk.Label(form, text="文件名  ", font=FONT,
                fg=C_TEXT_LABEL, bg=C_BG, anchor='w'
                ).grid(row=0, column=0, sticky='w', pady=(0, 20))
        ttk.Entry(form, textvariable=self.var_fname, font=FONT
                 ).grid(row=0, column=1, sticky='ew', pady=(0, 20))
        zip_wrap = tk.Frame(form, bg=C_BTN_BORDER, padx=1, pady=1)
        zip_wrap.grid(row=0, column=2, padx=(8, 0), pady=(0, 20))
        tk.Label(zip_wrap, text=".zip", font=FONT,
                bg=C_HEADER_BG, fg=C_TEXT_SUB, anchor='center',
                width=6).pack(ipady=3)

        tk.Label(form, text="保存到  ", font=FONT,
                fg=C_TEXT_LABEL, bg=C_BG, anchor='w'
                ).grid(row=1, column=0, sticky='w')
        ttk.Entry(form, textvariable=self.var_save_dir, font=FONT
                 ).grid(row=1, column=1, sticky='ew')
        browse_wrap = tk.Frame(form, bg=C_BTN_BORDER, padx=1, pady=1)
        browse_wrap.grid(row=1, column=2, padx=(8, 0))
        tk.Button(browse_wrap, text="浏览", font=FONT,
                 relief='flat', bd=0, width=6,
                 bg=C_HEADER_BG, fg=C_TEXT_SUB,
                 activebackground='#E5E5E5',
                 activeforeground=C_TEXT,
                 cursor='hand2',
                 command=self._browse_dir).pack(ipady=3)

        # 操作按钮
        self.action_area = tk.Frame(self, bg=C_BG)
        self.action_area.pack(pady=(20, 0))

    def on_show(self):
        for w in self.action_area.winfo_children():
            w.destroy()

        default_name = getattr(self.ctl, 'default_zip_name', 'xpedition_library.zip')
        default_dir = getattr(self.ctl, 'default_save_dir', '')
        # 去掉默认名中的 .zip 后缀供用户编辑
        if default_name.lower().endswith('.zip'):
            default_name = default_name[:-4]
        self.var_fname.set(default_name)
        self.var_save_dir.set(default_dir)

    def _browse_dir(self):
        path = filedialog.askdirectory()
        if path:
            self.var_save_dir.set(path)

    def _action_btn(self, parent, text, cmd, primary=False):
        border_color = C_PRIMARY if primary else C_BTN_BORDER
        wrap = tk.Frame(parent, bg=border_color, padx=1, pady=1)
        wrap.pack(side='left', padx=4)
        if primary:
            btn = tk.Button(wrap, text=text, font=FONT,
                           relief='flat', bd=0, width=14,
                           bg=C_PRIMARY, fg='#FFFFFF',
                           activebackground=C_PRIMARY_HOVER,
                           activeforeground='#FFFFFF',
                           cursor='hand2', command=cmd)
        else:
            btn = tk.Button(wrap, text=text, font=FONT,
                           relief='flat', bd=0, width=14,
                           bg=C_BG, fg=C_TEXT,
                           activebackground=C_BTN_HOVER,
                           activeforeground=C_TEXT,
                           cursor='hand2', command=cmd)
        btn.pack()

    def do_save(self):
        fname = self.var_fname.get().strip()
        if not fname:
            messagebox.showwarning("提示", "请输入文件名！")
            return False
        save_dir = self.var_save_dir.get().strip()
        if not save_dir or not Path(save_dir).is_dir():
            messagebox.showwarning("提示", "请选择有效的保存路径！")
            return False

        zip_path = Path(save_dir) / (fname + ".zip")
        temp_dir = getattr(self.ctl, 'temp_dir', '')

        if temp_dir and Path(temp_dir).exists():
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for file in Path(temp_dir).rglob("*"):
                    if file.is_file():
                        zf.write(file, file.relative_to(temp_dir))
            shutil.rmtree(temp_dir, ignore_errors=True)

        self.ctl.zip_save_path = str(zip_path)
        return True

    def open_folder(self):
        save_dir = self.var_save_dir.get().strip()
        if save_dir and Path(save_dir).is_dir():
            os.startfile(save_dir)
        else:
            messagebox.showinfo("提示", "未找到输出目录")


if __name__ == "__main__":
    app = App()
    app.mainloop()
