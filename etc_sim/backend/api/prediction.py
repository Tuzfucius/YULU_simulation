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
RESULTS_DIR = ETC_SIM_DIR / "data" / "results"
MODELS_DIR = ETC_SIM_DIR / "data" / "models"
DATASETS_DIR = ETC_SIM_DIR / "data" / "datasets"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATASETS_DIR.mkdir(parents=True, exist_ok=True)

# 内存单例保存已训练好的模型 (供当前会话使用)
current_predictor = TimeSeriesPredictor()


# ============================================
# 数据集后处理：从原始仿真 JSON 重建 ml_dataset
# ============================================

def _reconstruct_transactions(data: dict) -> List[ETCTransaction]:
    """从已保存的 JSON 中重建 ETCTransaction 列表"""
    raw_list = data.get("etc_detection", {}).get("transactions", [])
    transactions = []
    for t in raw_list:
        transactions.append(ETCTransaction(
            vehicle_id=t["vehicle_id"],
            gate_id=t["gate_id"],
            gate_position_km=t["gate_position_km"],
            timestamp=t["timestamp"],
            lane=t["lane"],
            speed=t["speed"],
            status=t.get("status", "normal"),
        ))
    return transactions


def _reconstruct_ground_truths(data: dict) -> List[GroundTruthEvent]:
    """从已保存的 JSON 中重建 GroundTruthEvent 列表"""
    anomaly_logs = data.get("anomaly_logs", [])
    ground_truths = []
    for log_entry in anomaly_logs:
        gt = GroundTruthEvent(
            vehicle_id=log_entry.get('id', -1),
            anomaly_type=log_entry.get('type', 0),
            trigger_time=log_entry.get('time', 0.0),
            position_m=log_entry.get('pos_km', 0.0) * 1000.0,
            segment_idx=log_entry.get('segment', 0),
            min_speed_kmh=log_entry.get('min_speed', 0.0),
        )
        ground_truths.append(gt)
    return ground_truths


def _rebuild_ml_dataset(data: dict, 
                        step_seconds: float = 60.0, 
                        window_size_steps: int = 5,
                        extra_features: List[str] = None) -> dict:
    """
    从已保存的仿真结果 JSON 中重建 ml_dataset。
    当文件中缺少 ml_dataset 或其为空时调用。
    """
    transactions = _reconstruct_transactions(data)
    if not transactions:
        logger.warning("无法重建 ml_dataset: 文件中缺少 etc_detection.transactions")
        return {}

    ground_truths = _reconstruct_ground_truths(data)
    
    extractor = TimeSeriesFeatureExtractor(
        step_seconds=step_seconds,
        window_size_steps=window_size_steps,
        extra_features=extra_features
    )
    dataset = extractor.build_dataset(
        transactions=transactions,
        ground_truths=ground_truths,
        run_id="rebuilt"
    )
    return dataset


def _load_ml_dataset_from_file(file_path: Path,
                                step_seconds: float = 60.0,
                                window_size_steps: int = 5,
                                extra_features: List[str] = None,
                                force_rebuild: bool = False) -> dict:
    """
    从仿真结果 JSON 文件中加载或重建 ml_dataset。
    如果用户指定了自定义参数或额外特征，则强制重建。
    """
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    ml_dataset = data.get("ml_dataset", {})
    samples = ml_dataset.get("samples", [])

    # 如果用户指定了自定义参数，强制重建
    has_custom_params = (step_seconds != 60.0 or window_size_steps != 5 or bool(extra_features))
    
    if samples and not has_custom_params and not force_rebuild:
        logger.info(f"直接使用已有 ml_dataset ({len(samples)} samples)")
        return ml_dataset

    # 需要重建
    reason = "自定义参数" if has_custom_params else ("缺少ml_dataset" if not samples else "强制重建")
    logger.info(f"正在重建 ml_dataset (原因: {reason})...")
    ml_dataset = _rebuild_ml_dataset(data, step_seconds, window_size_steps, extra_features)
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
                file_path = RESULTS_DIR / fname
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
                detail="所选文件中未找到有效的 ml_dataset 特征库。"
                       "请确认文件中包含 etc_detection.transactions 数据（需要重新跑一次仿真）。"
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
        
        # 3. 自动保存模型
        model_id = f"model_{len(list(MODELS_DIR.glob('*.joblib'))) + 1}"
        model_path = MODELS_DIR / f"{model_id}.joblib"
        try:
            current_predictor.save_model(str(model_path))
            logger.info(f"模型已保存: {model_path}")
        except Exception as save_err:
            logger.warning(f"模型保存失败: {save_err}")
            model_id = None

        # 提取关键指标并返回
        return {
            "status": "success",
            "metrics": result["metrics"],
            "feature_importances": result["feature_importance"],
            "trained_samples": result["samples_trained"],
            "model_id": model_id,
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
    file_name: str

@router.post("/evaluate")
async def evaluate_on_file(request: EvaluationRequest):
    """
    使用当前已经训练在内存中的模型，对另一份完整的仿真结果进行预测和测算
    """
    global current_predictor
    if current_predictor.model is None:
        raise HTTPException(status_code=400, detail="模型尚未训练，请先进行训练。")
        
    try:
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
        
        return {
            "status": "success",
            "metrics": eval_result
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
    """列出所有已保存的模型"""
    models = []
    for f in sorted(MODELS_DIR.glob("*.joblib")):
        stat = f.stat()
        models.append({
            "model_id": f.stem,
            "filename": f.name,
            "size": stat.st_size,
            "created_at": stat.st_mtime,
        })
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
    """列出 data/results/ 目录下的所有仿真结果文件"""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for f in sorted(RESULTS_DIR.glob("*.json"), reverse=True):
        stat = f.stat()
        # 快速提取元信息
        meta = {}
        try:
            with open(f, "r", encoding="utf-8") as fp:
                head = fp.read(3000)
            # 尝试解析部分 JSON 提取 config/statistics
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
            "name": f.name,
            "path": f.name,
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

@router.post("/extract-dataset")
async def extract_dataset(request: ExtractDatasetRequest):
    """
    从历史仿真结果中提取 ml_dataset 并保存到 data/datasets/ 目录
    """
    try:
        combined_samples = []
        metadata = {}

        for fname in request.file_names:
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
            )

            if not metadata and ml_dataset.get("metadata"):
                metadata = ml_dataset["metadata"]
            combined_samples.extend(ml_dataset.get("samples", []))

        if not combined_samples:
            raise HTTPException(
                status_code=400,
                detail="所选文件中未能提取有效的 ml_dataset 特征库。"
                       "请确认历史文件中包含 etc_detection.transactions 数据。"
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
