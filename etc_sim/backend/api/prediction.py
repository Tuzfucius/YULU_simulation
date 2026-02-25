from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from pathlib import Path
import os
import json
import traceback
import logging

# 导入机器学习核心引擎
from ...models.alert_ml_predictor import TimeSeriesPredictor
from ...models.ml_feature_extractor import TimeSeriesFeatureExtractor
from ...models.etc_anomaly_detector import ETCTransaction
from ...models.alert_evaluator import GroundTruthEvent

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
    file_names: List[str]  # e.g., ["sim_20260224_190000.json"]
    model_type: str        # e.g., "xgboost_flat", "lstm_seq"
    hyperparameters: Dict[str, Any]
    # 数据集提取参数
    step_seconds: float = 60.0              # 时间步长 (秒)
    window_size_steps: int = 5              # 滑动窗口步数
    selected_features: List[str] = []       # 额外启用的特征 (speed_variance, occupancy, headway_mean)

@router.post("/train")
async def train_model(request: TrainingRequest):
    """
    根据选中的历史仿真结果，抽取 ml_dataset 进行模型训练
    """
    try:
        # 1. 挂载数据集合并
        combined_samples = []
        metadata = {}
        
        for fname in request.file_names:
            # 优先从 datasets/ 目录加载已提取的数据集
            file_path = DATASETS_DIR / fname
            if not file_path.exists():
                file_path = RESULTS_DIR / fname / "data.json"
            if not file_path.exists():
                file_path = RESULTS_DIR / fname # fallback for direct files
            if not file_path.exists():
                found = list(RESULTS_DIR.rglob(fname))
                file_path = found[0] if found else None
            if file_path is None or not file_path.exists():
                continue

            ml_dataset = _load_ml_dataset_from_file(
                file_path,
                step_seconds=request.step_seconds,
                window_size_steps=request.window_size_steps,
                extra_features=request.selected_features or None,
            )
            
            if not metadata and ml_dataset.get("metadata"):
                metadata = ml_dataset["metadata"]
                    
            samples = ml_dataset.get("samples", [])
            combined_samples.extend(samples)
                
        if not combined_samples:
            raise HTTPException(
                status_code=400, 
                detail="所选文件中未提取出有效的机器学习特征样本。请确认仿真数据包含有效的路段统计数据，或尝试重新生成数据集。"
            )
            
        final_dataset = {
            "metadata": metadata,
            "samples": combined_samples
        }
        
        # 2. 调度引擎开始训练
        global current_predictor
        current_predictor = TimeSeriesPredictor()
        
        params = {
            'n_estimators': request.hyperparameters.get('n_estimators', 100),
            'max_depth': request.hyperparameters.get('max_depth', 10),
        }
        
        result = current_predictor.train(final_dataset, params=params)
        
        if result.get("status") == "error":
             raise HTTPException(status_code=400, detail=result.get("message"))
        
        # 3. 自动保存模型（规范化命名 + meta.json 伴生）
        from datetime import datetime
        ds_stem = request.file_names[0].replace('.json', '') if request.file_names else 'unknown'
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        model_id = f"rf_{ds_stem}_{ts}"
        model_path = MODELS_DIR / f"{model_id}.joblib"
        try:
            current_predictor.save_model(str(model_path))
            # 生成元数据伴生文件
            meta = {
                "model_id": model_id,
                "created_at": datetime.now().isoformat(),
                "source_datasets": request.file_names,
                "source_simulations": source_files,
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
            with open(meta_path, "w", encoding="utf-8") as mf:
                json.dump(meta, mf, indent=2, ensure_ascii=False)
            logger.info(f"模型已保存: {model_path} (元数据: {meta_path})")
        except Exception as save_err:
            logger.warning(f"模型保存失败: {save_err}")
            model_id = None

        # 4. 提取关联的仿真测试上下文以便前端绘图
        all_speeds = []
        all_anomalies = []
        source_files = metadata.get("source_files", [])
        # 如果是直接从源仿真文件训练而不是 dataset
        if not source_files and any(RESULTS_DIR.rglob(fname) for fname in request.file_names):
            source_files = request.file_names
            
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
                except Exception as e:
                    logger.warning(f"无法读取源测试上下文 {sf_path}: {e}")

        # 将评价详情转换为前端要求的 predict_results 格式
        predict_results = result["metrics"].pop("test_details", [])

        # 提取关键指标并返回
        return {
            "status": "success",
            "metrics": result["metrics"],
            "feature_importances": result["feature_importance"],
            "trained_samples": result["samples_trained"],
            "model_id": model_id,
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
         raise HTTPException(status_code=500, detail=f"模型训练失败: {str(e)}")


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
    """列出 data/simulations/ 目录下的所有仿真结果文件夹"""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    
    # 查找所有 run_xxx/data.json
    for json_file in sorted(RESULTS_DIR.glob("*/data.json"), reverse=True):
        sim_dir = json_file.parent
        stat = json_file.stat()
        # 快速提取元信息
        meta = {}
        try:
            with open(json_file, "r", encoding="utf-8") as fp:
                head = fp.read(3000)
            data = json.loads(head) if head.rstrip().endswith('}') else None
            if data:
                cfg = data.get("config", {})
                stats = data.get("statistics", {})
                ml = data.get("ml_dataset", {})
                meta = {
                    "vehicles": cfg.get("total_vehicles") or stats.get("total_vehicles"),
                    "anomalies": stats.get("total_anomalies"),
                    "sim_time": stats.get("simulation_time"),
                    "ml_samples": len(ml.get("samples", [])) if ml else 0,
                }
        except Exception:
            pass

        files.append({
            "name": sim_dir.name,  # 返回目录名 run_xxx
            "path": sim_dir.name,
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "meta": meta,
        })
    
    return {"files": files}


# ============================================
# 数据集提取 API
# ============================================

class ExtractDatasetRequest(BaseModel):
    file_names: List[str]           # 来源仿真结果文件
    dataset_name: str = ""          # 数据集名称, 为空则自动生成
    step_seconds: float = 60.0
    window_size_steps: int = 5
    selected_features: List[str] = []
    custom_expressions: List[str] = []  # 用户自定义的派生特征表达式

@router.post("/extract-dataset")
async def extract_dataset(request: ExtractDatasetRequest):
    """
    从历史仿真结果中提取 ml_dataset 并保存到 data/datasets/ 目录
    """
    try:
        combined_samples = []
        metadata = {}

        for fname in request.file_names:
            file_path = RESULTS_DIR / fname / "data.json"
            if not file_path.exists():
                file_path = RESULTS_DIR / fname
            if not file_path.exists():
                found = list(RESULTS_DIR.rglob(fname))
                file_path = found[0] if found else None
            if file_path is None or not file_path.exists():
                logger.warning(f"文件不存在: {fname}")
                continue

            ml_dataset = _load_ml_dataset_from_file(
                file_path,
                step_seconds=request.step_seconds,
                window_size_steps=request.window_size_steps,
                extra_features=request.selected_features or None,
                force_rebuild=True,  # 提取时总是重建
                custom_expressions=request.custom_expressions or None,
            )

            if not metadata and ml_dataset.get("metadata"):
                metadata = ml_dataset["metadata"]
            combined_samples.extend(ml_dataset.get("samples", []))

        if not combined_samples:
            raise HTTPException(
                status_code=400,
                detail="所选文件中未能提取有效的机器学习特征样本。请确认历史文件中包含足够的流量历史数据。"
            )

        # 生成数据集名称
        from datetime import datetime
        if not request.dataset_name:
            ds_name = f"ds_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        else:
            ds_name = request.dataset_name.replace(" ", "_")

        final_dataset = {
            "metadata": {
                **metadata,
                "source_files": request.file_names,
                "extraction_params": {
                    "step_seconds": request.step_seconds,
                    "window_size_steps": request.window_size_steps,
                    "extra_features": request.selected_features,
                },
                "created_at": datetime.utcnow().isoformat(),
            },
            "samples": combined_samples,
        }

        # 保存到 datasets 目录
        ds_path = DATASETS_DIR / f"{ds_name}.json"
        with open(ds_path, "w", encoding="utf-8") as f:
            json.dump(final_dataset, f, indent=2, ensure_ascii=False)

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
        raise HTTPException(status_code=500, detail=f"数据集提取失败: {str(e)}")


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
