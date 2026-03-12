# YouAreMemory

基于多级索引（L0 / L1 / L2）的 OpenClaw 记忆插件项目，支持 **Python-first 测试** + **TS 插件生产接入**。

## 你应该先看哪里

- **先用 Python 测功能（推荐）**：[`apps/memory-lab-py/README.md`](apps/memory-lab-py/README.md)
- **只想装 OpenClaw 插件**：[`packages/openclaw-memory-plugin/README.md`](packages/openclaw-memory-plugin/README.md)
- **一步一步教程**：[`docs/openclaw-beginner-guide.md`](docs/openclaw-beginner-guide.md)
- **代码审查（不熟 TS 也能看）**：[`docs/code-review-guide.md`](docs/code-review-guide.md)

## 这个项目解决什么问题

OpenClaw 默认记忆通常偏“单层检索”。YouAreMemory 增加了三层记忆结构：

- `L0`：原始对话日志（完整保存）
- `L1`：会话窗口抽取（摘要、事实、情景、项目标签）
- `L2`：维度索引（时间索引、项目索引）

并且在检索时走推理降级链路：

- `search_l2` -> 不够再 `search_l1` -> 还不够再 `search_l0`

## 当前能力（混合架构）

- Python 测试版（SQLite-only）可直接验证注入、索引、检索
- `kind: "memory"` TS 插件接入 OpenClaw memory 插槽
- Agent Skills（`SKILL.md`）任务编排：工具优先、脚本补充
- 本地 SQLite 持久化（`l0_sessions` / `l1_windows` / `l2_*` / `global_facts`）
- heartbeat 索引流水线：`L0 -> L1 -> L2 + 动态画像`
- Python↔TS parity 对比脚本（同 DB、同 query 对齐关键字段）

## 快速开始（先 Python 后插件）

### 1) Python 测试 UI（无需先装 OpenClaw）

```bash
cd apps/memory-lab-py
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run streamlit_app.py
```

### 2) 构建并安装 OpenClaw 插件

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

### 3) 做 Python↔TS 一致性校验（推荐）

```bash
python3 apps/memory-lab-py/scripts/parity_check.py \
  --query "我这个项目最近进展到哪里了？" \
  --db ~/.openclaw/youarememory/memory.sqlite
```

## 项目结构

```text
youarememory/
├── apps/
│   ├── memory-lab-py/               # Python 测试版（核心 + Streamlit UI + parity）
│   └── memory-ui/                   # TS 插件内嵌的静态面板资源
├── packages/
│   └── openclaw-memory-plugin/      # OpenClaw memory slot 插件（core + agent-skills + rules）
├── docs/
│   ├── openclaw-beginner-guide.md   # Python-first + OpenClaw 接入
│   └── code-review-guide.md         # 代码审查入口
```

## 开发命令（常用）

```bash
npm run build
npm run typecheck
npm run dev:plugin

# TS 调试检索入口（需先 build）
npm run debug:retrieve --workspace @youarememory/openclaw-memory-plugin -- --query "项目进展"
```