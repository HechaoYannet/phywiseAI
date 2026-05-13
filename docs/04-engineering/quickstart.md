# 快速开始

## 前置条件

- Conda 25+
- Node.js 22+
- pnpm 10+
- 可选：Redis 7+，仅在 `PHYWISE_PARSE_EXECUTION_MODE=rq` 时需要

## 创建 Python 环境

```bash
conda env create -f environment.yml
conda activate phywise-dev
```

如果环境已存在，改用：

```bash
conda env update -f environment.yml --prune
conda activate phywise-dev
```

## 安装依赖

```bash
pnpm install
python -m pip install -e "apps/api[dev]"
```

## 准备环境变量

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

默认开发基线使用：

- `SQLite` 持久化，默认 `storage/phywise.db`
- 本地文件存储，默认 `storage/`
- 同步解析，默认 `PHYWISE_PARSE_EXECUTION_MODE=inline`

## 验证当前实现

```bash
pnpm typecheck
python -m pytest apps/api/tests -q
pnpm build:web
```

## 运行 Web

```bash
pnpm dev:web
```

## 运行 API

```bash
pnpm dev:api
```

## 手动冒烟链路

1. 打开 Web 首页，确认直接进入空白工作台。
2. 在板内点击“导入题目”或“插入受力分析模板”。
3. 导入图片、PDF 或文本后，确认板上出现 source 节点与 AI 建议浮层。
4. 接受或拒绝建议，确认 `WorkspaceDocument` 会生成新 revision。
5. 手动画物体、斜面、力箭头、文本和公式，确认自动保存与刷新恢复正常。

## 调试链路

旧的上传确认页仍可用于内部调试：

1. 走 `/api/problems/parse-jobs` 生成 `ProblemParseResult`
2. 打开 `/problems/{problemId}/confirm`
3. 从确认页创建工作台

这条链路不再是主产品入口。
