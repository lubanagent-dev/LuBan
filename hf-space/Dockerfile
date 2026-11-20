# syntax=docker/dockerfile:1
# Hugging Face Spaces 部署：单容器 = mock-biz + LubanAgent（API + 工作台 UI 同端口）。
# Space 仓库只放本文件与 README.md；构建时从 GitHub 拉源码，Factory rebuild 即跟进 main。
# 免费档无持久卷：SQLite 与上传文件随容器重建重置，演示够用；要持久化需开 Persistent Storage 并挂 /data。
ARG SOURCE_REPO=https://github.com/lubanagent-dev/LuBan.git

# 工作台前端构建（生产构建默认同源相对路径，dist 由 FastAPI 同端口托管）
FROM node:22-slim AS ui-builder
ARG SOURCE_REPO
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git clone --depth 1 "${SOURCE_REPO}" /src
WORKDIR /src/lubanagent/ui
RUN npm ci && npm run build

# Python 依赖（uv.lock 冻结安装）
FROM python:3.12-slim AS builder
ARG SOURCE_REPO
COPY --from=ghcr.io/astral-sh/uv:0.6.7 /uv /usr/local/bin/uv
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git clone --depth 1 "${SOURCE_REPO}" /src
WORKDIR /src
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN uv sync --frozen --no-dev --extra mysql --extra langfuse --extra docs

# 运行时：venv + 源码 + UI 产物；HF Spaces 以 UID 1000 运行容器
FROM python:3.12-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /src/lubanagent ./lubanagent
COPY --from=ui-builder /src/lubanagent/ui/dist ./lubanagent/ui/dist
COPY --from=builder /src/app ./app
COPY --from=builder /src/migrations ./migrations
COPY --from=builder /src/alembic.ini ./
COPY --from=builder /src/demos ./demos
RUN useradd --create-home --uid 1000 luban && chown -R luban:luban /app
USER luban
# 演示配置：mock 业务服务同容器（无独立 MySQL，SQLite 兜底）；AUTH_ENABLED=false 免登录直接体验，公开演示勿放真实数据。
# 端口跟随 PORT 环境变量（缺省 7860），兼容 HF Spaces / Render / Koyeb 等按 PORT 注入流量的平台。
ENV BIZ_BASE_URL=http://127.0.0.1:9100 \
    AUTH_ENABLED=false
EXPOSE 7860
# migrate / init 幂等；mock 服务后台起，容器退出随之结束
CMD ["sh", "-c", "python -m demos.customer_service.mock_services & luban migrate && luban init --fill-missing && exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port \"${PORT:-7860}\""]
