# 快速开始

## 前置条件

- Conda 25+
- Node.js 22+
- pnpm 10+
- Docker 或等价容器环境

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

## 启动依赖服务

```bash
docker compose up -d postgres redis minio
```

## 安装依赖

```bash
pnpm install
python -m pip install -e "apps/api[dev]"
```

## 验证基线

```bash
pnpm typecheck
python -m pytest apps/api/tests -q
```

## 运行 Web

```bash
pnpm dev:web
```

## 运行 API

```bash
pnpm dev:api
```

## 首轮开发入口

- 先看 `packages/contracts`。
- 再看 `apps/web/app/workspace/demo/page.tsx`。
- 再把 `apps/api` 的 demo 路由替换成真实解析链路。
