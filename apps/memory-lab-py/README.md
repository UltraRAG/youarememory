# Python 测试版（memory-lab-py）

这个目录是 YouAreMemory 的 **Python 本地测试环境**，用于你不看 TS 代码也能快速验证需求。

能力包括：

- 直接读写与 TS 插件一致的 SQLite 表结构
- 直接复用 `packages/openclaw-memory-plugin/skills` 规则
- 提供 Streamlit 简易测试界面
- 提供 Python↔TS 对齐校验脚本（parity）

---

## 一、Conda 环境安装（从零开始）

### 1) 创建环境

```bash
conda create -n youarememory-lab python=3.11 -y
```

### 2) 激活环境

```bash
conda activate youarememory-lab
```

### 3) 进入目录并安装依赖

```bash
cd apps/memory-lab-py
pip install -r requirements.txt
```

### 4) 验证 Python 模块语法（可选）

```bash
python3 -m py_compile streamlit_app.py scripts/parity_check.py memory_lab_py/*.py
```

---

## 二、启动 Python 测试 UI

```bash
cd apps/memory-lab-py
conda activate youarememory-lab
streamlit run streamlit_app.py
```

UI 可以直接做：

- 写入 L0
- 运行 heartbeat
- 输入 query 执行 retrieve
- 查看 overview/snapshot/l2/l1/l0/facts

---

## 三、Python↔TS 对齐校验

先在仓库根目录构建一次插件：

```bash
npm run build --workspace @youarememory/openclaw-memory-plugin
```

再执行校验：

```bash
python3 apps/memory-lab-py/scripts/parity_check.py \
  --query "项目进展" \
  --db ~/.openclaw/youarememory/memory.sqlite \
  --skills-dir ./packages/openclaw-memory-plugin/skills
```

严格模式（完整 ID 列表比对）：

```bash
python3 apps/memory-lab-py/scripts/parity_check.py \
  --query "项目进展" \
  --db ~/.openclaw/youarememory/memory.sqlite \
  --skills-dir ./packages/openclaw-memory-plugin/skills \
  --strict
```

---

## 四、日常开发命令清单（你可以直接照抄）

### 场景 A：我只改 Python，先本地验证

```bash
conda activate youarememory-lab
streamlit run apps/memory-lab-py/streamlit_app.py
```

### 场景 B：我改完后，一键做 TS 对齐检查

```bash
npm run parity:check
```

如需严格比对：

```bash
npm run parity:check:strict
```
