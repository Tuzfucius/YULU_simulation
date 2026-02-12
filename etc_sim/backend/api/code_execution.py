"""
代码执行与虚拟环境管理 API
支持在 conda 环境中执行 Python 代码，以及管理虚拟环境。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import subprocess
import tempfile
import os
import json
import logging
import asyncio
import platform

router = APIRouter()
logger = logging.getLogger(__name__)

# 配置
MAX_EXECUTION_TIME = 30       # 最大执行时间（秒）
MAX_OUTPUT_LENGTH = 50000     # 最大输出长度（字符）


# ==================== 请求/响应模型 ====================

class CodeExecutionRequest(BaseModel):
    code: str
    environment: str = "base"
    timeout: int = MAX_EXECUTION_TIME
    alert_data: Optional[Dict[str, Any]] = None   # 注入的预警数据包


class CodeExecutionResponse(BaseModel):
    success: bool
    output: str = ""
    error: str = ""
    execution_time: float = 0.0


class EnvironmentInfo(BaseModel):
    name: str
    python_version: str = ""
    packages: List[str] = []


class CreateEnvironmentRequest(BaseModel):
    name: str
    python_version: str = "3.10"
    packages: List[str] = []


class InstallPackageRequest(BaseModel):
    environment: str
    packages: List[str]


# ==================== 辅助函数 ====================

def _get_conda_exe() -> str:
    """获取 conda 可执行文件路径"""
    # Windows 上尝试多种路径
    candidates = [
        "conda",
        os.path.expanduser("~/miniconda3/Scripts/conda.exe"),
        os.path.expanduser("~/anaconda3/Scripts/conda.exe"),
        r"C:\ProgramData\miniconda3\Scripts\conda.exe",
        r"C:\ProgramData\anaconda3\Scripts\conda.exe",
    ]
    for c in candidates:
        try:
            result = subprocess.run(
                [c, "--version"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                return c
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return "conda"   # fallback


def _get_conda_activate_cmd(env_name: str) -> str:
    """生成 conda activate 命令前缀"""
    if platform.system() == "Windows":
        return f"conda activate {env_name} && "
    return f"source activate {env_name} && "


async def _run_process(cmd: str, timeout: int = 30, cwd: str = None) -> tuple:
    """异步运行子进程并捕获输出"""
    try:
        if platform.system() == "Windows":
            process = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
            )
        else:
            process = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
            )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
        return (
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace"),
            process.returncode,
        )
    except asyncio.TimeoutError:
        process.kill()
        return "", "执行超时", -1
    except Exception as e:
        return "", str(e), -1


# ==================== 代码执行 ====================

@router.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """在指定 conda 环境中执行 Python 代码"""
    import time
    start_time = time.time()
    
    # 创建临时脚本文件
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        # 注入预警数据包（作为全局变量 alert_data）
        if request.alert_data:
            f.write(f"import json\nalert_data = json.loads('''{json.dumps(request.alert_data, ensure_ascii=False)}''')\n\n")
        
        # 添加安全导入限制提示
        f.write("# === 用户代码 ===\n")
        f.write(request.code)
        f.write("\n")
        
        script_path = f.name

    try:
        # 构建执行命令
        timeout = min(request.timeout, MAX_EXECUTION_TIME)
        activate = _get_conda_activate_cmd(request.environment)
        cmd = f'{activate}python "{script_path}"'

        stdout, stderr, returncode = await _run_process(cmd, timeout=timeout)

        # 截断过长输出
        if len(stdout) > MAX_OUTPUT_LENGTH:
            stdout = stdout[:MAX_OUTPUT_LENGTH] + f"\n... [输出已截断，超出 {MAX_OUTPUT_LENGTH} 字符]"

        elapsed = time.time() - start_time

        return CodeExecutionResponse(
            success=(returncode == 0),
            output=stdout,
            error=stderr if returncode != 0 else "",
            execution_time=round(elapsed, 3),
        )
    finally:
        # 清理临时文件
        try:
            os.unlink(script_path)
        except OSError:
            pass


# ==================== 虚拟环境管理 ====================

@router.get("/environments", response_model=List[EnvironmentInfo])
async def list_environments():
    """列出所有可用的 conda 环境"""
    conda = _get_conda_exe()
    
    try:
        stdout, stderr, rc = await _run_process(
            f"{conda} env list --json", timeout=15
        )
        if rc != 0:
            raise HTTPException(status_code=500, detail=f"获取环境列表失败: {stderr}")
        
        data = json.loads(stdout)
        envs = []
        
        for env_path in data.get("envs", []):
            env_name = os.path.basename(env_path) if env_path else "base"
            if not env_name or env_name == os.path.basename(os.path.dirname(env_path)):
                env_name = "base"
            
            envs.append(EnvironmentInfo(name=env_name))
        
        return envs
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="无法解析 conda 输出")
    except Exception as e:
        logger.error(f"列出环境失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/environments", response_model=Dict[str, Any])
async def create_environment(request: CreateEnvironmentRequest):
    """创建新的 conda 环境"""
    conda = _get_conda_exe()
    
    # 基本命令
    cmd = f'{conda} create -n {request.name} python={request.python_version} -y'
    
    stdout, stderr, rc = await _run_process(cmd, timeout=120)
    
    if rc != 0:
        raise HTTPException(status_code=500, detail=f"创建环境失败: {stderr}")
    
    # 如果有额外包需要安装
    if request.packages:
        pkgs = " ".join(request.packages)
        activate = _get_conda_activate_cmd(request.name)
        install_cmd = f"{activate}pip install {pkgs}"
        
        stdout2, stderr2, rc2 = await _run_process(install_cmd, timeout=180)
        if rc2 != 0:
            logger.warning(f"部分包安装失败: {stderr2}")
    
    return {
        "success": True,
        "message": f"环境 {request.name} 创建成功",
        "name": request.name,
    }


@router.delete("/environments/{name}")
async def delete_environment(name: str):
    """删除 conda 环境"""
    if name.lower() == "base":
        raise HTTPException(status_code=400, detail="不能删除 base 环境")
    
    conda = _get_conda_exe()
    cmd = f"{conda} env remove -n {name} -y"
    
    stdout, stderr, rc = await _run_process(cmd, timeout=60)
    
    if rc != 0:
        raise HTTPException(status_code=500, detail=f"删除环境失败: {stderr}")
    
    return {"success": True, "message": f"环境 {name} 已删除"}


@router.post("/packages/install", response_model=Dict[str, Any])
async def install_packages(request: InstallPackageRequest):
    """在指定环境中安装 pip 包"""
    activate = _get_conda_activate_cmd(request.environment)
    pkgs = " ".join(request.packages)
    cmd = f"{activate}pip install {pkgs}"
    
    stdout, stderr, rc = await _run_process(cmd, timeout=180)
    
    return {
        "success": rc == 0,
        "output": stdout[:5000],
        "error": stderr[:3000] if rc != 0 else "",
    }


@router.get("/environments/{name}/packages")
async def list_packages(name: str):
    """列出指定环境中已安装的 pip 包"""
    activate = _get_conda_activate_cmd(name)
    cmd = f"{activate}pip list --format json"
    
    stdout, stderr, rc = await _run_process(cmd, timeout=15)
    
    if rc != 0:
        raise HTTPException(status_code=500, detail=f"获取包列表失败: {stderr}")
    
    try:
        packages = json.loads(stdout)
        return {"success": True, "packages": packages}
    except json.JSONDecodeError:
        return {"success": False, "packages": [], "error": "无法解析 pip 输出"}
