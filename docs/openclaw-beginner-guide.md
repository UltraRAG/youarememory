# OpenClaw 插件开发教程（安装 + 开发 + 记忆看板）

这份文档覆盖完整流程：

1. 首次安装或修复链接
2. 日常代码开发
3. 每次改完后的快速重载
4. 新版索引结构的使用注意
5. 常见问题与验证

默认项目目录：

`/Users/meisen/Desktop/youarememory`

---

## 1) 首次安装或修复链接

在仓库根目录执行：

```bash
npm install
npm run relink:memory-plugin
```

`relink:memory-plugin` 会自动完成：

- 构建插件
- 卸载旧链接
- 清理本地旧扩展目录
- 重新 `install --link`
- 绑定 memory slot
- 启用插件
- 重启 gateway
- 等待健康检查通过
- 打开最新 UI

安装后你应该看到：

- `openclaw plugins info youarememory-openclaw` 里 `Status: loaded`
- 页面可打开：`http://127.0.0.1:39393/youarememory/`
- 看板为“左侧层级导航 + 中间主工作区 + 右侧按需抽屉”

---

## 2) 日常开发（推荐工作流）

### 2.1 代码位置速览

- 插件逻辑：`packages/openclaw-memory-plugin/src`
- UI 页面：`packages/openclaw-memory-plugin/ui-source`
- 构建产物：`packages/openclaw-memory-plugin/dist`
- 中文设计文档：`docs/memory-design.md`

### 2.2 每次改代码后的推荐流程

1. 改代码（`src` 或 `ui-source`）
2. 执行 `npm run reload:memory-plugin`
3. 浏览器会自动打开带时间戳的最新页面
4. 如果改动涉及旧索引数据，使用看板里的“清空并重建”

---

## 3) 每次改完后的快速重载

```bash
npm run reload:memory-plugin
```

这个命令会自动：

- `npm run build --workspace @youarememory/youarememory-openclaw`
- `openclaw config set plugins.slots.memory "youarememory-openclaw"`
- `openclaw plugins enable youarememory-openclaw`
- `openclaw gateway restart`
- 轮询 `openclaw gateway status --json`
- 校验 `openclaw plugins info youarememory-openclaw`
- 打开 UI 并退出

说明：

- 现在不需要手动 `export YAM_HOME` 或手动 `cd`
- 在当前 macOS 环境里，gateway 由 LaunchAgent 托管，重载命令应当执行完即退出
- 即使 `openclaw gateway restart` 子进程偶发卡住，包装脚本也会在健康检查通过后主动结束并返回

---

## 4) 新版数据结构的使用注意

当前版本已经切换到：

- `captureStrategy = full_session` 默认
- `GlobalProfileRecord` 单例模型
- `L1` 按话题闭合构建
- 索引触发支持：定时、切到新 session、看板“立即构建”

这意味着：

- `L0` 默认保存完整 session，而不是只保存最后一轮
- 全局画像会被持续重写到单例 `global_profile_record`
- `L1` 不再按时间或条数切窗，而是由模型判断话题是否闭合
- `L2` 时间固定按天维护，不再提供粒度配置
- 看板设置里只保留自动构建间隔；手动触发用“立即构建”或“清空并重建”

### 推荐重建流程

如果你本地已经跑过旧版插件，升级后建议：

1. 打开看板
2. 点右上角 `设置`
3. 在设置抽屉里点击 `清空并重建`
4. 继续正常对话，让新的 `L0 / L1 / L2 / GlobalProfile` 重新建立

---

## 5) 开发时的两个模式

### 模式 A：稳妥模式（推荐）

- 改完后直接执行 `npm run reload:memory-plugin`
- 最稳定，不容易漏步骤

### 模式 B：TS 监听模式

```bash
npm run dev:plugin
```

注意：

- 这个监听只负责 TS 编译
- 如果你改的是 `ui-source/*`，仍然需要执行一次 `npm run reload:memory-plugin`

---

## 6) 30 秒验证（确认真的生效）

```bash
openclaw plugins info youarememory-openclaw
openclaw gateway status --json
python - <<'PY'
import urllib.request
html = urllib.request.urlopen("http://127.0.0.1:39393/youarememory/?v=check", timeout=5).read().decode("utf-8", "ignore")
markers = [
    "YouAreMemory",
    "记忆看板",
    "检索调试",
]
print("ui-markers:", all(marker in html for marker in markers))
PY
```

检查点：

- `Status: loaded`
- `runtime.status = running`
- `rpc.ok = true`
- `ui-markers: True`

---

## 7) 常见问题

### 7.1 插件链接脏了，或者有安装异常

```bash
npm run relink:memory-plugin
```

### 7.2 页面还是旧版

```bash
npm run reload:memory-plugin
```

如果还不对，再手动强刷浏览器：`Cmd + Shift + R`

### 7.3 升级后事实为空

这通常表示本地还是旧版 `global_facts` / `global_fact_record` 数据。

处理方式：

1. 打开看板
2. 点 `设置`
3. 点 `清空并重建`
4. 继续正常对话，等待新画像重新进入 `global_profile_record`

---

## 8) 底层命令（只在排障时手动使用）

```bash
# 构建插件 workspace
npm run build --workspace @youarememory/youarememory-openclaw

# 查看插件状态
openclaw plugins info youarememory-openclaw

# 查看 gateway 状态
openclaw gateway status --json
```
