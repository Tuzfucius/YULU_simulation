from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import os
import json
import traceback

# 导入机器学习核心引擎
from ...models.alert_ml_predictor import TimeSeriesPredictor

router = APIRouter(prefix="/prediction", tags=["prediction"])

# 内存单例保存已训练好的模型 (供当前会话使用)
current_predictor = TimeSeriesPredictor()

class TrainingRequest(BaseModel):
    file_names: List[str]  # e.g., ["sim_20260224_190000.json"]
    model_type: str        # e.g., "xgboost_flat", "lstm_seq"
    hyperparameters: Dict[str, Any]

@router.post("/train")
async def train_model(request: TrainingRequest):
    """
    根据选中的历史仿真结果，抽取 ml_dataset 进行模型训练
    """
    try:
        # 1. 挂载数据集合并
        combined_samples = []
        metadata = {}
        
        # 结果文件通常位于 ../data/results
        DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/results"))
        
        for fname in request.file_names:
            file_path = os.path.join(DATA_DIR, fname)
            if not os.path.exists(file_path):
                # 如果找不到，试一下加前缀或后缀等容错机制
                continue
                
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                ml_dataset = data.get("ml_dataset", {})
                
                if not metadata and ml_dataset.get("metadata"):
                    metadata = ml_dataset["metadata"]
                    
                samples = ml_dataset.get("samples", [])
                combined_samples.extend(samples)
                
        if not combined_samples:
            raise HTTPException(status_code=400, detail="所选文件中未找到有效的 ml_dataset 特征库。")
            
        final_dataset = {
            "metadata": metadata,
            "samples": combined_samples
        }
        
        # 2. 调度引擎开始训练
        global current_predictor
        # 每次训练可以新建实例
        current_predictor = TimeSeriesPredictor()
        
        # 映射前端传来的超参
        params = {
            'n_estimators': request.hyperparameters.get('n_estimators', 100),
            'max_depth': request.hyperparameters.get('max_depth', 10),
        }
        
        result = current_predictor.train(final_dataset, params=params)
        
        if result.get("status") == "error":
             raise HTTPException(status_code=400, detail=result.get("message"))
             
        # 提取关键指标并返回
        return {
            "status": "success",
            "metrics": result["metrics"],
            "feature_importances": result["feature_importance"],
            "trained_samples": result["samples_trained"],
        }
        
    except Exception as e:
         traceback.print_exc()
         raise HTTPException(status_code=500, detail=f"模型训练失败: {str(e)}")


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
        DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/results"))
        file_path = os.path.join(DATA_DIR, request.file_name)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="测试文件不存在")
            
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            ml_dataset = data.get("ml_dataset", {})
            
        X, y, info = current_predictor._prepare_data(ml_dataset)
        
        if len(X) == 0:
            raise HTTPException(status_code=400, detail="测试集中无有效样本")
            
        eval_result = current_predictor.evaluate_raw(X, y, info)
        
        return {
            "status": "success",
            "metrics": eval_result
        }
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"模型评估失败: {str(e)}")
