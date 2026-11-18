"""会话级容器沙箱（R10）：Skill 脚本的 Docker 执行后端。

定位：进程级沙箱（sandbox.py）已有的超时/环境白名单/输出截断语义在这里保持不变，
只把执行底座从"宿主子进程"换成"一次性容器"——用于不可信外部用户场景的可选部署形态。
设计文档（docs/design-docs/LuBanAgent-platform-research-and-transformation.md §4.1 第 6 条）：
"同一套代码，只换执行底座；容器形态下不开进程级 rlimit（容器自身限额已覆盖）"。

隔离声明（不假装隔离）：
- 网络默认关闭（--network none）；网络白名单在容器形态下不生效（连网能力整体移除）。
- 文件系统：skill 包目录只读挂载；workspace 目录按会话读写挂载；根文件系统 read-only。
- 资源：memory / cpus / pids-limit 由容器引擎强制；宿主 UID 进程数语义不适用。
- 前置条件：宿主装有 docker CLI 且当前用户有 daemon 访问权；镜像需已存在（默认
  python:3.12-slim，可用 compose profile `sandbox` 预构建 hardened 镜像）。
"""

import asyncio
import logging
import shlex
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

#: 容器内 skill 包挂载点（包目录整体只读挂载，脚本路径映射进这里）。
_SKILL_MOUNT = "/skill"
#: 容器内会话工作区挂载点（rw；未提供 workspace 时不存在该挂载）。
_WORKSPACE_MOUNT = "/workspace"


@dataclass(frozen=True)
class ContainerOptions:
    """容器执行参数；镜像与限额由部署配置决定，不在代码里偷偷放宽。"""

    image: str = "python:3.12-slim"
    docker_cmd: str = "docker"
    memory: str = "512m"
    cpus: float = 1.0
    pids_limit: int = 128
    user: str = "65534:65534"  # nobody:nogroup；镜像内含该 UID 即可
    workspace_dir: Path | None = None  # 宿主目录，rw 挂载到 /workspace（per-session）
    extra_args: tuple[str, ...] = field(default=())


def build_docker_command(
    script: Path,
    package_dir: Path,
    *,
    options: ContainerOptions,
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
) -> tuple[list[str], list[str]]:
    """构造 docker run 参数与容器内命令。

    返回 (docker_argv, container_cmd)。interpreter 在容器内统一用 python3/sh
    （不依赖宿主 sys.executable 的路径）。
    """
    suffix = script.suffix.lower()
    container_script = f"{_SKILL_MOUNT}/scripts/{script.name}"
    if suffix == ".py":
        interpreter = ["python3"]
    elif suffix == ".sh":
        interpreter = ["/bin/sh"]
    else:
        interpreter = []

    run_args: list[str] = [
        options.docker_cmd,
        "run",
        "--rm",
        "--network", "none",
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--memory", options.memory,
        f"--cpus={options.cpus:g}",
        f"--pids-limit={options.pids_limit}",
        "--user", options.user,
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "-v", f"{package_dir}:{_SKILL_MOUNT}:ro",
        "-w", _SKILL_MOUNT,
    ]
    if options.workspace_dir is not None:
        run_args += ["-v", f"{options.workspace_dir}:{_WORKSPACE_MOUNT}"]
    run_args += list(options.extra_args)
    for key, value in (env or {}).items():
        run_args += ["-e", f"{key}={shlex.quote(value)}"]

    container_cmd = [*interpreter, container_script, *(args or [])]
    return run_args, container_cmd


def _kill_group(proc: asyncio.subprocess.Process) -> None:
    import os
    import signal

    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


async def run_script_in_container(
    script: Path,
    package_dir: Path,
    *,
    options: ContainerOptions,
    args: list[str] | None = None,
    timeout_seconds: float = 30.0,
    max_output_chars: int = 10_000,
    env: dict[str, str] | None = None,
) -> "ScriptResult":
    """在一次性容器中执行脚本；超时杀 docker CLI（--rm 由容器内进程终结兜底清理）。

    返回类型与 process 后端一致的 ScriptResult（延迟导入避免循环依赖）。
    """
    from lubanagent.skill.sandbox import ScriptResult

    argv, container_cmd = build_docker_command(
        script, package_dir, options=options, args=args, env=env
    )
    start = time.perf_counter()
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            *container_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"容器沙箱不可用: 找不到 {options.docker_cmd} 命令；"
            "请确认宿主已安装 Docker CLI 且当前用户有 daemon 访问权"
        ) from exc

    timed_out = False
    try:
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout_seconds)
    except TimeoutError:
        timed_out = True
        _kill_group(proc)
        stdout_b, stderr_b = await proc.communicate()
    duration_ms = (time.perf_counter() - start) * 1000.0

    def _text(data: bytes) -> str:
        text = data.decode("utf-8", errors="replace")
        return text if len(text) <= max_output_chars else text[:max_output_chars]

    if timed_out:
        logger.warning(
            "container sandbox: 超时强杀 (image=%s script=%s)", options.image, script.name
        )
    return ScriptResult(
        exit_code=proc.returncode if proc.returncode is not None else -1,
        stdout=_text(stdout_b or b""),
        stderr=_text(stderr_b or b""),
        duration_ms=duration_ms,
        timed_out=timed_out,
    )
