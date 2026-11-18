# syntax=docker/dockerfile:1
# LubanAgent 会话级容器沙箱镜像（R10，可选部署形态）。
# 基线：python:3.12-slim + 最小化加固；运行期隔离由 docker run 参数强制
# （--network none / --read-only / --tmpfs / --cap-drop ALL / no-new-privileges，
#  见 lubanagent/skill/container.py），镜像只负责"干净、无特权、无网络工具"。
FROM python:3.12-slim

# 清理包管理缓存；不安装任何额外工具（curl/wget/apt 在运行期也用不到）
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 运行用户与 ContainerOptions 默认 user 一致（nobody:nogroup = 65534:65534）
USER 65534:65534
WORKDIR /skill
