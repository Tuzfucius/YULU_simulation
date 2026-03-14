from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from pathlib import Path
import os
import json
import shutil
import traceback
import logging

# 导入机器学习核心引擎
from ...models.alert_ml_predictor import TimeSeriesPredictor
from ...models.ml_feature_extractor import TimeSeriesFeatureExtractor
from ...models.etc_anomaly_detector import ETCTransaction
from ...models.alert_evaluator import GroundTruthEvent
from ..services.run_repository import list_runs as list_history_runs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/prediction", tags=["prediction"])

# 数据目录 (与 StorageService 保持一致)
ETC_SIM_DIR = Path(__file__).resolve().parents[2]  # etc_sim/
RESULTS_DIR = ETC_SIM_DIR / "data" / "simulations"
MODELS_DIR = ETC_SIM_DIR / "data" / "models"
DATASETS_DIR = ETC_SIM_DIR / "data" / "datasets"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATASETS_DIR.mkdir(parents=True, exist_ok=True)

# 内存单例保存已训练好的模型 (供当前会话使用)
current_predictor = TimeSeriesPredictor()


def _collect_source_names(file_names: Optional[List[str]] = None, run_ids: Optional[List[str]] = None) -> List[str]:
    ordered: List[str] = []
    for name in (file_names or []) + (run_ids or []):
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def _resolve_source_path(source_name: str) -> Optional[Path]:
    candidates = [
        DATASETS_DIR / source_name,
        DATASETS_DIR / f"{source_name}.json",
        RESULTS_DIR / source_name / "data.json",
        RESULTS_DIR / source_name,
        RESULTS_DIR / f"{source_name}.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    found = list(DATASETS_DIR.rglob(source_name))
    if found:
        return found[0]

    found = list(RESULTS_DIR.rglob(source_name))
    if found:
        return found[0]

    if not source_name.endswith('.json'):
        found = list(RESULTS_DIR.rglob(f"{source_name}.json"))
        if found:
            return found[0]

    return None


def _load_source_result_payload(source_name: str) -> dict:
    source_path = _resolve_source_path(source_name)
    if not source_path or not source_path.exists():
        return {}

    if source_path.is_dir():
        source_path = source_path / 'data.json'
    if not source_path.exists() or source_path.parent == DATASETS_DIR:
        return {}

    try:
        with open(source_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except Exception:
        return {}


# ============================================
# 数据集后处理：从原始仿真 JSON 重建 ml_dataset
# ============================================

def _rebuild_ml_dataset(data: dict, 
                        step_seconds: float = 60.0, 
                        window_size_steps: int = 5,
                        extra_features: List[str] = None,
                        custom_expressions: List[str] = None) -> dict:
    """
    从已保存的仿真结果 JSON 中重建 ml_dataset。
    利用前端导出的 segment_speed_history。
    """
    segment_speed_history = data.get("segment_speed_history", [])
    if not segment_speed_history:
        logger.warning("无法重建 ml_dataset: 文件中缺少 segment_speed_history")
        return {}

    anomaly_logs = data.get("anomaly_logs", [])
    config = data.get("config", {})
    
    extractor = TimeSeriesFeatureExtractor(
        step_seconds=step_seconds,
        window_size_steps=window_size_steps,
        extra_features=extra_features
    )
    dataset = extractor.build_dataset_from_history(
        segment_speed_history=segment_speed_history,
        anomaly_logs=anomaly_logs,
        config=config,
        run_id="rebuilt",
        custom_expressions=custom_expressions
    )
    return dataset


def _load_ml_dataset_from_file(file_path: Path,
                                step_seconds: float = 60.0,
                                window_size_steps: int = 5,
                                extra_features: List[str] = None,
                                force_rebuild: bool = False,
                                custom_expressions: List[str] = None) -> dict:
    """
    从仿真结果 JSON 文件中加载或重建 ml_dataset。
    如果用户指定了自定义参数或额外特征，则强制重建。
    """
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 如果这个文件本身就是一个直接提取好的 ml_dataset 数据集 (格式为 {"metadata": {...}, "samples": [...]})
    if "samples" in data and "metadata" in data and isinstance(data["samples"], list):
        logger.info(f"识别到这是一个独立的特征数据集文件，直接加载 ({len(data['samples'])} samples)")
        return data

    ml_dataset = data.get("ml_dataset", {})
    samples = ml_dataset.get("samples", [])

    # 如果用户指定了自定义参数，强制重建
    has_custom_params = (step_seconds != 60.0 or window_size_steps != 5 or bool(extra_features) or bool(custom_expressions))
    
    if samples and not has_custom_params and not force_rebuild:
        logger.info(f"直接使用已有 ml_dataset ({len(samples)} samples)")
        return ml_dataset

    # 需要重建
    reason = "自定义参数" if has_custom_params else ("缺少ml_dataset" if not samples else "强制重建")
    logger.info(f"正在重建 ml_dataset (原因: {reason})...")
    ml_dataset = _rebuild_ml_dataset(data, step_seconds, window_size_steps, extra_features, custom_expressions)
    rebuilt_samples = ml_dataset.get("samples", [])

    # 仅在默认参数且成功时回写缓存
    if rebuilt_samples and not has_custom_params:
        data["ml_dataset"] = ml_dataset
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"已将重建的 ml_dataset ({len(rebuilt_samples)} samples) 回写到文件")
        except Exception as e:
            logger.warning(f"回写 ml_dataset 失败: {e}")

    return ml_dataset


# ============================================
# 训练 API
# ============================================

class TrainingRequest(BaseModel):
    file_names: List[str] = []
    run_ids: List[str] = []
    model_type: str
    hyperparameters: Dict[str, Any]
    step_seconds: float = 60.0
    window_size_steps: int = 5
    selected_features: List[str] = []


@router.post("/train")
async def train_model(request: TrainingRequest):
    """???????????????"""
    try:
        combined_samples = []
        metadata = {}
        source_names = _collect_source_names(request.file_names, request.run_ids)

        for source_name in source_names:
            file_path = _resolve_source_path(source_name)
            if file_path is None or not file_path.exists():
                logger.warning(f"??????: {source_name}")
                continue

            ml_dataset = _load_ml_dataset_from_file(
                file_path,
                step_seconds=request.step_seconds,
                window_size_steps=request.window_size_steps,
                extra_features=request.selected_features or None,
            )

            if not metadata and ml_dataset.get("metadata"):
                metadata = ml_dataset["metadata"]

            combined_samples.extend(ml_dataset.get("samples", []))

        if not combined_samples:
            raise HTTPException(status_code=400, detail="???????????????")

        final_dataset = {
            "metadata": {
                **metadata,
                "source_files": source_names,
                "source_run_ids": request.run_ids,
            },
            "samples": combined_samples,
        }

        global current_predictor
        current_predictor = TimeSeriesPredictor()
        params = {
            "n_estimators": request.hyperparameters.get("n_estimators", 100),
            "max_depth": request.hyperparameters.get("max_depth", 10),
        }
        result = current_predictor.train(final_dataset, params=params)
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))

        from datetime import datetime

        primary_name = source_names[0] if source_names else 'unknown'
        ds_stem = primary_name.replace('.json', '')
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        model_id = f"rf_{ds_stem}_{ts}"
        model_path = MODELS_DIR / f"{model_id}.joblib"

        source_files = metadata.get("source_files", []) or source_names
        try:
            current_predictor.save_model(str(model_path))
            meta = {
                "model_id": model_id,
                "created_at": datetime.now().isoformat(),
                "source_datasets": request.file_names,
                "source_simulations": source_files,
                "source_run_ids": request.run_ids,
                "model_type": request.model_type,
                "hyperparameters": request.hyperparameters,
                "metrics": {
                    "accuracy": result["metrics"].get("accuracy"),
                    "f1_macro": result["metrics"].get("f1_macro"),
                    "precision_macro": result["metrics"].get("precision_macro"),
                    "recall_macro": result["metrics"].get("recall_macro"),
                },
                "trained_samples": result["samples_trained"],
                "validated_samples": result["samples_validated"],
            }
            meta_path = MODELS_DIR / f"{model_id}.meta.json"
            with open(meta_path, "w", encoding="utf-8") as meta_file:
                json.dump(meta, meta_file, indent=2, ensure_ascii=False)
        except Exception as save_err:
            logger.warning(f"??????: {save_err}")
            model_id = None

        all_speeds = []
        all_anomalies = []
        for source_name in source_files:
            payload = _load_source_result_payload(source_name)
            if payload:
                all_speeds.extend(payload.get("segment_speed_history", []))
                all_anomalies.extend(payload.get("anomaly_logs", []))

        predict_results = result["metrics"].pop("test_details", [])
        return {
            "status": "success",
            "metrics": result["metrics"],
            "feature_importances": result["feature_importance"],
            "trained_samples": result["samples_trained"],
            "model_id": model_id,
            "test_context": {
                "ground_truth_anomalies": all_anomalies,
                "predict_results": predict_results,
                "segment_speed_history": all_speeds,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"??????: {str(e)}")


# ============================================
# 评估 API
# ============================================

class EvaluationRequest(BaseModel):
    file_name: str   # 可以是 dataset 名或仿真结果目录名

@router.post("/evaluate")
async def evaluate_on_file(request: EvaluationRequest):
    """
    使用当前已加载到内存中的模型，对指定数据集或仿真结果进行预测评估。
    同时返回 test_context 以供前端渲染大屏图表。
    """
    global current_predictor
    if current_predictor.model is None:
        raise HTTPException(status_code=400, detail="模型尚未加载，请先训练或导入模型。")
        
    try:
        # 尝试查找文件：先从 datasets/ 查，再从 simulations/ 查
        file_path = DATASETS_DIR / (request.file_name if request.file_name.endswith('.json') else request.file_name + '.json')
        if not file_path.exists():
            file_path = RESULTS_DIR / request.file_name / "data.json"
        if not file_path.exists():
            file_path = RESULTS_DIR / request.file_name
        if not file_path.exists():
            found = list(RESULTS_DIR.rglob(request.file_name))
            file_path = found[0] if found else None
        
        if file_path is None or not file_path.exists():
            raise HTTPException(status_code=404, detail="测试文件不存在")
            
        ml_dataset = _load_ml_dataset_from_file(file_path)
            
        X, y, info = current_predictor._prepare_data(ml_dataset)
        
        if len(X) == 0:
            raise HTTPException(status_code=400, detail="测试集中无有效样本")
            
        eval_result = current_predictor.evaluate_raw(X, y, info)
        
        # 提取 test_context 用于前端大屏图表
        predict_results = eval_result.pop("test_details", [])
        
        # 尝试获取源仿真的速度历史和异常日志
        all_speeds = []
        all_anomalies = []
        metadata = ml_dataset.get("metadata", {})
        source_files = metadata.get("source_files", [])
        if not source_files:
            source_files = [request.file_name]
        
        for sf in source_files:
            sf_path = RESULTS_DIR / sf / "data.json"
            if not sf_path.exists():
                sf_path = RESULTS_DIR / sf
            if not sf_path.exists():
                found = list(RESULTS_DIR.rglob(sf))
                sf_path = found[0] if found else None
            if sf_path and sf_path.exists():
                try:
                    with open(sf_path, "r", encoding="utf-8") as f:
                        sg_data = json.load(f)
                        all_speeds.extend(sg_data.get("segment_speed_history", []))
                        all_anomalies.extend(sg_data.get("anomaly_logs", []))
                except Exception:
                    pass
        
        return {
            "status": "success",
            "metrics": eval_result,
            "feature_importances": dict(zip(
                metadata.get("features", metadata.get("feature_names", [])),
                current_predictor.model.feature_importances_.tolist()
            )) if hasattr(current_predictor.model, 'feature_importances_') else {},
            "test_context": {
                "ground_truth_anomalies": all_anomalies,
                "predict_results": predict_results,
                "segment_speed_history": all_speeds
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"模型评估失败: {str(e)}")


# ============================================
# 模型管理 API
# ============================================

@router.get("/models")
async def list_models():
    """列出所有已保存的模型，并读取伴生的 .meta.json 提供溯源信息"""
    models = []
    for f in sorted(MODELS_DIR.glob("*.joblib"), reverse=True):
        stat = f.stat()
        entry = {
            "model_id": f.stem,
            "filename": f.name,
            "size": stat.st_size,
            "created_at": stat.st_mtime,
            "meta": None,
        }
        # 尝试读取元数据
        meta_path = MODELS_DIR / f"{f.stem}.meta.json"
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as mf:
                    entry["meta"] = json.load(mf)
            except Exception:
                pass
        models.append(entry)
    return {"models": models}


class LoadModelRequest(BaseModel):
    model_id: str

@router.post("/load")
async def load_model(request: LoadModelRequest):
    """加载指定的已保存模型到内存"""
    global current_predictor
    model_path = MODELS_DIR / f"{request.model_id}.joblib"
    
    if not model_path.exists():
        raise HTTPException(status_code=404, detail=f"模型文件不存在: {request.model_id}")
    
    try:
        current_predictor = TimeSeriesPredictor()
        current_predictor.load_model(str(model_path))
        return {
            "status": "success",
            "message": f"模型 {request.model_id} 已加载到内存",
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"模型加载失败: {str(e)}")


# ============================================
# 仿真结果列表 API (供前端数据采集池使用)
# ============================================

@router.get("/results")
async def list_simulation_results():
    """?????????????"""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for run in list_history_runs(RESULTS_DIR):
        run_dir = RESULTS_DIR / run["run_id"]
        data_file = run_dir / "data.json"
        size = data_file.stat().st_size if data_file.exists() else 0
        summary = run.get("summary", {})
        files.append({
            "name": run["name"],
            "path": run["path"],
            "run_id": run["run_id"],
            "size": size,
            "modified": run.get("modified"),
            "meta": {
                "vehicles": summary.get("total_vehicles"),
                "anomalies": summary.get("total_anomalies"),
                "sim_time": summary.get("simulation_time"),
                "ml_samples": summary.get("ml_samples", 0),
            },
        })
    return {"files": files}


# ============================================
# 数据集提取 API
# ============================================

class ExtractDatasetRequest(BaseModel):
    file_names: List[str] = []
    run_ids: List[str] = []
    dataset_name: str = ""
    step_seconds: float = 60.0
    window_size_steps: int = 5
    selected_features: List[str] = []
    custom_expressions: List[str] = []


@router.post("/extract-dataset")
async def extract_dataset(request: ExtractDatasetRequest):
    """?????????????????"""
    try:
        combined_samples = []
        metadata = {}
        source_names = _collect_source_names(request.file_names, request.run_ids)

        for source_name in source_names:
            file_path = _resolve_source_path(source_name)
            if file_path is None or not file_path.exists():
                logger.warning(f"??????: {source_name}")
                continue

            ml_dataset = _load_ml_dataset_from_file(
                file_path,
                step_seconds=request.step_seconds,
                window_size_steps=request.window_size_steps,
                extra_features=request.selected_features or None,
                force_rebuild=True,
                custom_expressions=request.custom_expressions or None,
            )

            if not metadata and ml_dataset.get("metadata"):
                metadata = ml_dataset["metadata"]
            combined_samples.extend(ml_dataset.get("samples", []))

        if not combined_samples:
            raise HTTPException(status_code=400, detail="???????????????")

        from datetime import datetime

        ds_name = request.dataset_name.replace(" ", "_") if request.dataset_name else f"ds_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        final_dataset = {
            "metadata": {
                **metadata,
                "source_files": source_names,
                "source_run_ids": request.run_ids,
                "extraction_params": {
                    "step_seconds": request.step_seconds,
                    "window_size_steps": request.window_size_steps,
                    "extra_features": request.selected_features,
                },
                "created_at": datetime.utcnow().isoformat(),
            },
            "samples": combined_samples,
        }

        ds_path = DATASETS_DIR / f"{ds_name}.json"
        with open(ds_path, "w", encoding="utf-8") as dataset_file:
            json.dump(final_dataset, dataset_file, indent=2, ensure_ascii=False)

        n_features = len(metadata.get("feature_names", [])) or (6 + len(request.selected_features))
        return {
            "status": "success",
            "dataset_name": ds_name,
            "total_samples": len(combined_samples),
            "feature_dim": n_features,
            "window_size": request.window_size_steps,
            "input_vector_dim": n_features * request.window_size_steps,
            "path": str(ds_path),
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"???????: {str(e)}")


@router.get("/datasets")
async def list_datasets():
    """列出 data/datasets/ 下的所有已提取训练数据集"""
    datasets = []
    for f in sorted(DATASETS_DIR.glob("*.json"), reverse=True):
        stat = f.stat()
        meta = {}
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            m = data.get("metadata", {})
            ep = m.get("extraction_params", {})
            meta = {
                "total_samples": len(data.get("samples", [])),
                "feature_names": m.get("feature_names", []),
                "step_seconds": ep.get("step_seconds"),
                "window_size_steps": ep.get("window_size_steps"),
                "extra_features": ep.get("extra_features", []),
                "source_files": m.get("source_files", []),
                "created_at": m.get("created_at"),
            }
        except Exception:
            pass

        datasets.append({
            "name": f.stem,
            "filename": f.name,
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "meta": meta,
        })

    return {"datasets": datasets}


# ============================================
# 文件管理 API（重命名 / 删除 / 打开文件夹）
# ============================================

import subprocess
import platform


def _open_folder_in_explorer(path: Path):
    """在系统文件资源管理器中打开指定路径"""
    folder = path if path.is_dir() else path.parent
    os_name = platform.system()
    if os_name == 'Windows':
        subprocess.Popen(['explorer', str(folder)])
    elif os_name == 'Darwin':
        subprocess.Popen(['open', str(folder)])
    else:
        subprocess.Popen(['xdg-open', str(folder)])


# --- 模型管理 ---

@router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    """删除指定模型文件及其元数据"""
    model_path = MODELS_DIR / f"{model_id}.joblib"
    meta_path = MODELS_DIR / f"{model_id}.meta.json"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail=f"模型不存在: {model_id}")
    try:
        model_path.unlink()
        if meta_path.exists():
            meta_path.unlink()
        return {"success": True, "message": f"模型 {model_id} 已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")


class RenameRequest(BaseModel):
    new_name: str


def _next_copy_name(directory: Path, stem: str, suffix: str) -> str:
    for index in range(1, 1000):
        candidate = f"{stem}_copy{index}"
        if not (directory / f"{candidate}{suffix}").exists():
            return candidate
    raise HTTPException(status_code=500, detail="无法生成可用的复制名称")


@router.put("/models/{model_id}/rename")
async def rename_model(model_id: str, request: RenameRequest):
    """重命名模型文件（同步更新 meta.json 中的 model_id）"""
    src = MODELS_DIR / f"{model_id}.joblib"
    src_meta = MODELS_DIR / f"{model_id}.meta.json"
    new_name = request.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="新名称不能为空")
    if '/' in new_name or '\\' in new_name:
        raise HTTPException(status_code=400, detail="名称中不能包含路径分隔符")
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"模型不存在: {model_id}")
    dst = MODELS_DIR / f"{new_name}.joblib"
    if dst.exists():
        raise HTTPException(status_code=409, detail=f"名称已存在: {new_name}")
    try:
        src.rename(dst)
        dst_meta = MODELS_DIR / f"{new_name}.meta.json"
        if src_meta.exists():
            # 更新 meta 中的 model_id 字段
            with open(src_meta, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            meta['model_id'] = new_name
            with open(dst_meta, 'w', encoding='utf-8') as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)
            src_meta.unlink()
        return {"success": True, "new_model_id": new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重命名失败: {e}")


@router.post("/models/{model_id}/open-folder")
async def open_model_folder(model_id: str):
    """在文件资源管理器中显示该模型所在目录"""
    model_path = MODELS_DIR / f"{model_id}.joblib"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail=f"模型不存在: {model_id}")
    try:
        _open_folder_in_explorer(model_path)
        return {"success": True, "folder": str(MODELS_DIR)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开文件夹失败: {e}")


@router.post("/models/{model_id}/copy")
async def copy_model(model_id: str):
    """复制模型文件及其元数据。"""
    src = MODELS_DIR / f"{model_id}.joblib"
    src_meta = MODELS_DIR / f"{model_id}.meta.json"
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"模型不存在: {model_id}")

    new_name = _next_copy_name(MODELS_DIR, model_id, ".joblib")
    dst = MODELS_DIR / f"{new_name}.joblib"
    dst_meta = MODELS_DIR / f"{new_name}.meta.json"
    try:
        shutil.copy2(src, dst)
        if src_meta.exists():
            with open(src_meta, "r", encoding="utf-8") as f:
                meta = json.load(f)
            meta["model_id"] = new_name
            with open(dst_meta, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)
        return {"success": True, "new_model_id": new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"复制失败: {e}")


# --- 数据集管理 ---

@router.delete("/datasets/{dataset_name}")
async def delete_dataset(dataset_name: str):
    """删除指定数据集文件"""
    path = DATASETS_DIR / f"{dataset_name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset_name}")
    try:
        path.unlink()
        return {"success": True, "message": f"数据集 {dataset_name} 已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")


@router.put("/datasets/{dataset_name}/rename")
async def rename_dataset(dataset_name: str, request: RenameRequest):
    """重命名数据集 JSON 文件"""
    src = DATASETS_DIR / f"{dataset_name}.json"
    new_name = request.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="新名称不能为空")
    if '/' in new_name or '\\' in new_name:
        raise HTTPException(status_code=400, detail="名称中不能包含路径分隔符")
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset_name}")
    dst = DATASETS_DIR / f"{new_name}.json"
    if dst.exists():
        raise HTTPException(status_code=409, detail=f"名称已存在: {new_name}")
    try:
        src.rename(dst)
        return {"success": True, "new_name": new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重命名失败: {e}")


@router.post("/datasets/{dataset_name}/open-folder")
async def open_dataset_folder(dataset_name: str):
    """在文件资源管理器中显示该数据集所在目录"""
    path = DATASETS_DIR / f"{dataset_name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset_name}")
    try:
        _open_folder_in_explorer(path)
        return {"success": True, "folder": str(DATASETS_DIR)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开文件夹失败: {e}")


@router.post("/datasets/{dataset_name}/copy")
async def copy_dataset(dataset_name: str):
    """复制数据集文件。"""
    src = DATASETS_DIR / f"{dataset_name}.json"
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"数据集不存在: {dataset_name}")

    new_name = _next_copy_name(DATASETS_DIR, dataset_name, ".json")
    dst = DATASETS_DIR / f"{new_name}.json"
    try:
        shutil.copy2(src, dst)
        return {"success": True, "new_name": new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"复制失败: {e}")
