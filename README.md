# YouAreMemory

YouAreMemory 是一个给 OpenClaw 用的本地优先记忆插件。它会自动记录对话、构建多层记忆索引、在回答前做记忆召回，并提供一个本地看板让你查看当前记忆状态。

如果你只是想装起来用，先看下面的“5 分钟安装”。如果你想在这个基础上继续开发，也直接看这份 README，不需要再翻多份重复文档。

## 它能做什么

- 自动把每轮对话存成 `L0`
- 在话题闭合时构建 `L1`
- 维护两类 `L2`
  - 按天的时间记忆
  - 可持续归并的项目记忆
- 维护一份单例 `GlobalProfileRecord`，表示用户稳定画像
- 在 OpenClaw 的 `before_prompt_build` 阶段自动注入记忆上下文
- 提供本地记忆看板，查看项目、时间线、画像和索引状态

## 5 分钟安装

前提：

- 已安装 `Node.js >= 24`
- 已安装并能正常使用 `openclaw`
- 当前目录就是这个仓库根目录

第一次安装，或者你怀疑插件链接脏了，执行：

```bash
npm install
npm run relink:memory-plugin
```

这个命令会自动完成：

- 构建插件
- 修复本地插件链接
- 绑定 OpenClaw 的 `memory` slot
- 启用 `youarememory-openclaw`
- 重启 gateway
- 等待健康检查通过
- 打开本地看板

## 第一次看到什么算成功

安装完成后，至少要满足这几件事：

```bash
openclaw plugins info youarememory-openclaw
openclaw gateway status --json
```

你应该看到：

- `Status: loaded`
- `runtime.status = running`
- `rpc.ok = true`

然后浏览器可以打开：

- `http://127.0.0.1:39393/youarememory/`

## OpenClaw 原生 memory 和本插件是什么关系

很多人第一次接上 YouAreMemory 时，会误以为 OpenClaw 还在用它自己的原生 memory。这里要先分清两层边界：

- `memory slot`
  - 这是回答前的动态记忆 provider
  - 现在应该由 `youarememory-openclaw` 接管
- `Project Context`
  - 这是 OpenClaw 宿主自己的 workspace bootstrap 注入链路
  - 它会继续把 `AGENTS.md / USER.md / MEMORY.md / BOOTSTRAP.md` 之类文件放进系统提示
  - 这不是 memory slot，也不是我们插件应该去重写的东西

YouAreMemory 的目标是：**完全替代动态对话记忆**，但**不修改用户 workspace 文件**。也就是说：

- 回答前的动态历史记忆，由 YouAreMemory 负责
- OpenClaw 的 workspace bootstrap 仍然是宿主静态上下文
- 插件会在自己的 system-context 合同里明确“本轮该信谁”
- 插件不会自动改写 `~/.openclaw/workspace/*`

为了避免 OpenClaw 原生动态 memory 和我们并行工作，这个仓库默认会收口这些配置：

- `plugins.slots.memory = "youarememory-openclaw"`
- `plugins.entries.memory-core.enabled = false`
- `hooks.internal.entries.session-memory.enabled = false`
- `agents.defaults.memorySearch.enabled = false`
- `agents.defaults.compaction.memoryFlush.enabled = false`
- 插件不再暴露 `memory_search`

## 日常怎么用

正常对话就行，不需要手动调用工具。

插件会自动做这些事：

1. 每轮对话先落 `L0`
2. 用户停下来一小段时间后，后台判断话题是否转变
3. 话题闭合时生成 `L1`
4. 基于新的 `L1` 更新 `L2` 项目、`L2` 时间和全局画像
5. 下次提问时，在回答前自动做记忆召回

如果你打开看板，常用操作只有三个：

- `刷新`：重新拉取当前数据
- `立即构建`：立刻把当前开放话题强制落成索引
- `清空并重建`：清掉派生索引后，从已有 `L0` 全量重放

## 改完代码后怎么更新

大多数情况下，你只需要：

```bash
npm run reload:memory-plugin
```

它会自动：

- 构建当前插件
- 确认 `memory` slot 指向 `youarememory-openclaw`
- 关闭 OpenClaw 原生动态 memory 的并行配置
- 启用插件
- 重启 gateway
- 校验插件和网关状态
- 打开最新 UI

什么时候用 `reload`，什么时候用 `relink`：

- `reload:memory-plugin`
  - 日常开发和日常更新都用这个
  - 适合“我刚改了代码，想重新加载看看”
- `relink:memory-plugin`
  - 首次安装
  - 插件链接损坏
  - `plugin id mismatch`
  - OpenClaw 找不到当前仓库插件

## 常见问题

### 1. 命令执行后终端一直卡住

现在推荐只用：

```bash
npm run reload:memory-plugin
```

不要再手动粘贴长串 `openclaw gateway restart` 组合命令。仓库里的 reload 脚本已经对常见卡住场景做了健康检查和超时兜底。

### 2. 页面看起来还是旧版

先执行：

```bash
npm run reload:memory-plugin
```

如果还不对，再强刷浏览器：`Cmd + Shift + R`

### 3. 升级后索引很奇怪

直接在看板里做一次：

1. 打开 `设置`
2. 点击 `清空并重建`
3. 等待从现有 `L0` 重新回放

### 4. 我只想 30 秒确认插件真的活着

```bash
openclaw plugins info youarememory-openclaw
openclaw gateway status --json
python - <<'PY'
import urllib.request
html = urllib.request.urlopen("http://127.0.0.1:39393/youarememory/?v=check", timeout=5).read().decode("utf-8", "ignore")
print(all(marker in html for marker in ["YouAreMemory", "记忆看板", "检索调试"]))
PY
```

## 看板里能看到什么

当前看板是极简数据面板风格，主要看这几块：

- 顶部状态和操作
- 近期 `L2` 项目
- 近期 `L2` 时间记忆
- 最近 `L1`
- 最近 `L0`
- 单例全局画像
- 当前 `memory slot` 是否真的是我们
- 当前动态记忆运行时是否健康
- 宿主 workspace bootstrap 是否存在
- 最近一次 recall 是否真的注入了我们的记忆

它主要用来回答三个问题：

- 现在到底记住了什么
- 当前索引有没有构建异常
- 检索为什么命中了某条记忆

## 二次开发入口

如果你想在这个插件基础上继续开发，先记住下面几个目录：

```text
packages/openclaw-memory-plugin/src
packages/openclaw-memory-plugin/ui-source
docs/memory-design.md
```

最常改的地方：

- `packages/openclaw-memory-plugin/src/index.ts`
  - 插件入口，负责组装 runtime、注册 hook 和 tools
- `packages/openclaw-memory-plugin/src/runtime.ts`
  - 插件运行态壳层，负责队列、timer、UI server、`before_reset` flush
- `packages/openclaw-memory-plugin/src/hooks.ts`
  - OpenClaw lifecycle hook 接线
- `packages/openclaw-memory-plugin/src/core/**`
  - 真正的记忆核心：落库、索引构建、检索、LLM 抽取
- `packages/openclaw-memory-plugin/ui-source/**`
  - 看板前端

推荐开发循环：

1. 改 `src` 或 `ui-source`
2. 执行 `npm run reload:memory-plugin`
3. 打开看板或直接去 OpenClaw 对话验证
4. 如果改动影响旧索引结构，用“清空并重建”

如果你在改推理链路，最重要的入口是：

- `packages/openclaw-memory-plugin/src/runtime.ts`
  - OpenClaw `before_prompt_build` 的实际注入点
- `packages/openclaw-memory-plugin/src/core/retrieval/reasoning-loop.ts`
  - 三跳动态检索、逐层下钻、本地 fallback
- `packages/openclaw-memory-plugin/src/tools.ts`
  - 暴露给 OpenClaw 的工具面

如果你只是在调 TS 编译：

```bash
npm run dev:plugin
```

如果你要单独调检索：

```bash
npm run debug:retrieve --workspace @youarememory/youarememory-openclaw -- --query "项目进展"
```

## 项目结构

```text
youarememory/
├── packages/
│   └── openclaw-memory-plugin/          # OpenClaw memory 插件和本地看板
├── docs/
│   ├── memory-design.md                 # 设计说明
│   ├── code-review-guide.md             # 代码审查入口
└── scripts/                             # reload / relink 等辅助脚本
```

## 还想看更深入的设计

- 设计说明：[docs/memory-design.md](/Users/meisen/Desktop/youarememory/docs/memory-design.md)
- 代码审查入口：[docs/code-review-guide.md](/Users/meisen/Desktop/youarememory/docs/code-review-guide.md)
- 插件包说明：[packages/openclaw-memory-plugin/README.md](/Users/meisen/Desktop/youarememory/packages/openclaw-memory-plugin/README.md)
