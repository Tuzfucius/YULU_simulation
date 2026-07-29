"""Render the maintenance JSON report as a readable Markdown document."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def _code_block(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    return f"\n```text\n{cleaned}\n```\n"


def render(payload: Dict[str, Any]) -> str:
    summary = payload.get("summary", {})
    results: List[Dict[str, Any]] = payload.get("results", [])

    lines = [
        "# YULU_simulation 维护测试报告",
        "",
        "## 执行环境",
        "",
        f"- Python：`{payload.get('python', 'unknown')}`",
        f"- 解释器：`{payload.get('executable', 'unknown')}`",
        f"- 仓库：`{payload.get('repository_root', 'unknown')}`",
        "",
        "## 总结",
        "",
        f"- 通过：**{summary.get('passed', 0)}**",
        f"- 失败：**{summary.get('failed', 0)}**",
        f"- 跳过：**{summary.get('skipped', 0)}**",
        f"- 总数：**{summary.get('total', len(results))}**",
        "",
        "## 检查矩阵",
        "",
        "| 分组 | 检查 | 状态 | 耗时/s | 依赖 |",
        "| --- | --- | --- | ---: | --- |",
    ]

    status_text = {"passed": "通过", "failed": "失败", "skipped": "跳过"}
    for result in results:
        dependencies = ", ".join(result.get("dependencies") or []) or "—"
        lines.append(
            "| {group} | {name} | {status} | {duration} | {dependencies} |".format(
                group=result.get("group", ""),
                name=result.get("name", ""),
                status=status_text.get(result.get("status"), result.get("status", "")),
                duration=result.get("duration_seconds", 0),
                dependencies=dependencies,
            )
        )

    failed_or_skipped = [
        result for result in results if result.get("status") in {"failed", "skipped"}
    ]
    lines.extend(["", "## 失败与跳过详情", ""])

    if not failed_or_skipped:
        lines.append("没有失败或跳过的检查。")
    else:
        for result in failed_or_skipped:
            lines.extend(
                [
                    f"### {result.get('group')}/{result.get('name')}",
                    "",
                    f"- 状态：`{result.get('status')}`",
                    f"- 返回码：`{result.get('return_code')}`",
                    f"- 原因：{result.get('reason') or '未提供'}",
                ]
            )
            command = result.get("command") or []
            if command:
                lines.append(f"- 命令：`{' '.join(command)}`")
            lines.append("")
            if result.get("stdout"):
                lines.append("**stdout**")
                lines.append(_code_block(result["stdout"]))
            if result.get("stderr"):
                lines.append("**stderr**")
                lines.append(_code_block(result["stderr"]))

    lines.extend(
        [
            "",
            "## 判读规则",
            "",
            "- `failed`：该检查实际执行并失败。",
            "- `skipped`：该检查依赖的前置检查失败，因此没有继续执行。",
            "- 独立检查之间互不阻塞。",
            "- 默认测试入口用于诊断，即使出现失败也会继续生成完整报告。",
            "- 使用 `-Strict` 时，存在失败会返回非零退出码，适合 CI。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_report", type=Path)
    parser.add_argument("markdown_report", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.json_report.read_text(encoding="utf-8"))
    args.markdown_report.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_report.write_text(render(payload), encoding="utf-8")
    print(f"Markdown report: {args.markdown_report.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
