# Python 实现版（root: python-implementation）

这个目录是你当前日常开发与测试入口，目标是让你不依赖 TS/OpenClaw 插件安装，也能完整验证 YouAreMemory 的记忆机制。

## 你可以直接做什么

- 启动 Streamlit UI，测试五大面板：
  - 各级索引查看
  - 索引构建过程（heartbeat trace）
  - 推理过程（intent/fallback trace）
  - 工具调用台（memory_recall / memory_store / search_l2/l1/l0 / memory_search）
  - Chat 对话页（before_prompt_build -> OpenAI 兼容模型 -> agent_end）
- 通过 OpenAI 兼容接口接本地模型，调试请求/响应 payload。
- 支持点击保存后写入浏览器缓存（当前页面 URL），下次打开同一地址可直接读取。
- 默认 `extra_body` 已内置 Qwen3.5 关闭 thinking 参数。
- 支持一键清空当前 SQLite 中全部 memory 索引数据（危险操作）。
- 用 parity 脚本快速对齐 Python 与 TS 的检索结果。

## Conda 从零安装

```bash
conda create -n youarememory-py311 python=3.11 -y
conda activate youarememory-py311
pip install -r python-implementation/requirements.txt
```

## 启动 UI

```bash
streamlit run python-implementation/streamlit_app.py
```

## 对齐校验（Python vs TS）

```bash
npm run parity:check
npm run parity:check:strict
```

## 说明

- `python-implementation/` 现在包含完整 Python 核心与 UI（无需额外目录跳转）。
- 你可以只在这个目录完成日常开发与验证；根文档与脚本路径已全部对齐。
