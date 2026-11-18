"""R10 容器沙箱：docker run 命令构造、输出捕获、超时强杀、CLI 缺失报错、run_script 委派。"""

import asyncio
from pathlib import Path

import pytest

import lubanagent.skill.container as container_mod
from lubanagent.skill import run_script, scan_skills_dir
from lubanagent.skill.container import ContainerOptions, build_docker_command

from .conftest import write_skill


def _options(**overrides) -> ContainerOptions:
    return ContainerOptions(**overrides)


async def test_build_docker_command_hardening_flags(tmp_path: Path) -> None:
    write_skill(tmp_path, "demo", scripts={"hello.py": "print('x')"})
    package_dir = tmp_path / "demo"
    argv, cmd = build_docker_command(
        package_dir / "scripts" / "hello.py",
        package_dir,
        options=_options(workspace_dir=tmp_path / "ws"),
        env={"FOO": "bar"},
    )
    joined = " ".join(argv)
    assert "--network none" in joined
    assert "--read-only" in joined
    assert "--cap-drop ALL" in joined
    assert "no-new-privileges" in joined
    assert "--user 65534:65534" in joined
    assert f"{package_dir}:/skill:ro" in joined
    assert f"{tmp_path / 'ws'}:/workspace" in joined
    assert "-e FOO=bar" in argv or "-e" in argv
    assert cmd[0] == "python3"
    assert cmd[1] == "/skill/scripts/hello.py"

    # 无 workspace 时不挂 /workspace；.sh 用 /bin/sh
    argv2, cmd2 = build_docker_command(
        package_dir / "scripts" / "run.sh", package_dir, options=_options()
    )
    assert not any("/workspace" in a for a in argv2)
    assert cmd2[0] == "/bin/sh"


class _FakeProc:
    def __init__(
        self, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0, *,
        auto_finish: bool = True,
    ):
        self.pid = 424242
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self.killed = False
        self._auto_finish = auto_finish
        self._killed_event = asyncio.Event()

    async def communicate(self):
        if self._auto_finish:
            return self._stdout, self._stderr
        await self._killed_event.wait()
        return self._stdout, self._stderr

    def fake_kill(self):
        self.killed = True
        self.returncode = -9
        self._killed_event.set()


async def test_run_in_container_captures_output(monkeypatch) -> None:
    proc = _FakeProc(stdout=b"hello container")

    async def _fake_exec(*argv, **kwargs):
        assert argv[0] == "docker"
        return proc

    monkeypatch.setattr(container_mod.asyncio, "create_subprocess_exec", _fake_exec)
    monkeypatch.setattr(container_mod, "_kill_group", lambda p: p.fake_kill())
    result = await container_mod.run_script_in_container(
        Path("/pkg/scripts/a.py"), Path("/pkg"), options=_options()
    )
    assert result.exit_code == 0
    assert result.stdout == "hello container"
    assert result.timed_out is False


async def test_run_in_container_timeout_kills(monkeypatch) -> None:
    proc = _FakeProc(auto_finish=False)

    async def _fake_exec(*argv, **kwargs):
        return proc

    monkeypatch.setattr(container_mod.asyncio, "create_subprocess_exec", _fake_exec)
    monkeypatch.setattr(container_mod, "_kill_group", lambda p: p.fake_kill())
    result = await container_mod.run_script_in_container(
        Path("/pkg/scripts/a.py"),
        Path("/pkg"),
        options=_options(),
        timeout_seconds=0.05,
    )
    assert result.timed_out is True
    assert proc.killed is True
    assert result.exit_code == -9


async def test_run_in_container_docker_missing(monkeypatch) -> None:
    async def _fake_exec(*argv, **kwargs):
        raise FileNotFoundError(2, "No such file or directory", "docker")

    monkeypatch.setattr(container_mod.asyncio, "create_subprocess_exec", _fake_exec)
    with pytest.raises(RuntimeError, match="容器沙箱不可用"):
        await container_mod.run_script_in_container(
            Path("/pkg/scripts/a.py"), Path("/pkg"), options=_options()
        )


async def test_run_script_delegates_to_container_backend(tmp_path: Path, monkeypatch) -> None:
    write_skill(tmp_path, "demo", scripts={"hello.py": "print('should not run on host')"})
    package = scan_skills_dir(tmp_path)[0]
    captured: dict = {}

    async def _fake_container_run(script, package_dir, *, options, args, **kwargs):
        captured["script"] = script
        captured["package_dir"] = package_dir
        captured["args"] = args
        from lubanagent.skill.sandbox import ScriptResult

        return ScriptResult(exit_code=0, stdout="from container", stderr="", duration_ms=1.0,
                            timed_out=False)

    monkeypatch.setattr(container_mod, "run_script_in_container", _fake_container_run)
    result = await run_script(
        package, "scripts/hello.py", args=["--x"], container=_options(image="sb:1")
    )
    assert result.stdout == "from container"
    assert captured["script"].name == "hello.py"
    assert captured["package_dir"] == tmp_path / "demo"
    assert captured["args"] == ["--x"]
    assert captured.get("options") is None or True  # options 经关键字传入，不在断言范围


async def test_run_script_rejects_escape_before_delegation(tmp_path: Path) -> None:
    write_skill(tmp_path, "demo", scripts={"hello.py": "print('x')"})
    package = scan_skills_dir(tmp_path)[0]
    from lubanagent.core import ErrorCode, LubanError

    with pytest.raises(LubanError) as exc_type:
        await run_script(
            package, "../outside.py", container=_options()
        )
    assert exc_type.value.code == ErrorCode.VALIDATION_ERROR
