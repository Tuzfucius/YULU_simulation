import numpy as np
import json
import logging
from typing import List, Dict, Any, Tuple
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_recall_fscore_support, accuracy_score, confusion_matrix, roc_auc_score
from sklearn.preprocessing import label_binarize
import warnings

# 忽略潜在的 UndefinedMetricWarning
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=RuntimeWarning)

logger = logging.getLogger(__name__)

class TimeSeriesPredictor:
    """
    时序预测与预警模型核心引擎
    基于 sklearn 随机森林 (RandomForest) 对展平后的时序数据(Window * Features)进行多阶段状态预测。
    """
    def __init__(self):
        self.model = None
        self.feature_names = []
        self.window_size = 0
        self.num_features_per_step = 0
        self.classes_ = []

    def _flatten_sequence(self, x_sequence: List[List[float]]) -> np.ndarray:
        """
        将时序窗口的 2D 数组 (Steps, Features) 展平为 1D 数组 (Steps * Features)
        """
        return np.array(x_sequence).flatten()

    def _prepare_data(self, dataset: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray, List[Any]]:
        """
        将我们构造的 ML Dataset JSON 解析为 X (特征矩阵), y (目标向量), info (附加信息)
        """
        metadata = dataset.get("metadata", {})
        self.window_size = metadata.get("window_size_steps", 5)
        self.feature_names = metadata.get("features", [])
        self.num_features_per_step = len(self.feature_names)

        samples = dataset.get("samples", [])
        
        X_list = []
        y_list = []
        info_list = []

        for sample in samples:
            # 解析特征
            x_seq = sample.get("X_sequence", [])
            if len(x_seq) != self.window_size:
                continue # 数据维度不匹配，跳过
            
            # 解析标签
            y_label = None
            y_seq = sample.get("Y_sequence", [])
            if y_seq:
                y_label = y_seq[-1]
            elif "Y_label" in sample:
                y_label = sample["Y_label"]
            
            if y_label is None:
                continue
                
            flat_x = self._flatten_sequence(x_seq)
            X_list.append(flat_x)
            y_list.append(y_label)
            
            info_list.append({
                "sample_id": sample.get("sample_id", "unknown"),
                "timestamp": sample.get("metadata", {}).get("time_end") or sample.get("timestamp"),
                "target_segment": sample.get("metadata", {}).get("segment") or sample.get("target_segment"),
                "y_seq": y_seq, # 完整真实序列保留作后续延迟分析
            })

        return np.array(X_list), np.array(y_list), info_list

    def train(self, dataset: Dict[str, Any], params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        训练时序预测模型
        
        Args:
            dataset: 原始提取的字典/JSON 数据集
            params: 算法超参如 `max_depth`, `n_estimators`
        """
        if params is None:
            params = {
                'n_estimators': 100,
                'max_depth': 10,
                'min_samples_split': 2,
                'random_state': 42
            }
            
        X, y, info = self._prepare_data(dataset)
        
        if len(X) < 10:
            return {"status": "error", "message": "Not enough samples to train."}

        # 划分训练/测试集进行内部验证
        X_train, X_test, y_train, y_test, info_train, info_test = train_test_split(
            X, y, info, test_size=0.2, random_state=42, stratify=y if len(np.unique(y)) > 1 else None
        )

        # 初始化并训练模型
        self.model = RandomForestClassifier(
            n_estimators=params.get('n_estimators', 100),
            max_depth=params.get('max_depth', 10),
            min_samples_split=params.get('min_samples_split', 2),
            random_state=params.get('random_state', 42),
            class_weight='balanced' # 应对异常样本数较少的问题
        )
        
        self.model.fit(X_train, y_train)
        self.classes_ = [int(x) for x in self.model.classes_]

        # 生成内部测试指标准备返回给前端
        evaluation_results = self.evaluate_raw(X_test, y_test, info_test)
        
        # 提取特征重要性
        imp = self.model.feature_importances_
        # 因为我们是扁平化的时序数据，这里对其做按特征类别汇聚
        feature_importance = {}
        for i, fname in enumerate(self.feature_names):
            # 将同一特征在不同时间步上的重要性累加，代表该特征整体多有用
            idx_list = [i + step * self.num_features_per_step for step in range(self.window_size)]
            total_imp = sum([imp[idx] for idx in idx_list])
            feature_importance[fname] = float(total_imp)

        return {
            "status": "success",
            "message": "Model trained successfully.",
            "metrics": evaluation_results,
            "feature_importance": feature_importance,
            "samples_trained": len(X_train),
            "samples_validated": len(X_test),
            "classes": self.classes_
        }

    def evaluate_raw(self, X_test: np.ndarray, y_test: np.ndarray, info_test: List[Any]) -> Dict[str, Any]:
        """纯数学上的评估，不依赖于物理模型逻辑"""
        y_pred = self.model.predict(X_test)
        
        # 计算各种指标 (使用 macro 平均)
        acc = accuracy_score(y_test, y_pred)
        
        # 针对各类分别获取 PRF1，由于类可能不全，用 warnings 来压制警告
        precision, recall, f1, support = precision_recall_fscore_support(
            y_test, y_pred, zero_division=0, labels=self.classes_
        )
        
        conf_mat = confusion_matrix(y_test, y_pred, labels=self.classes_).tolist()

        return {
            "accuracy": float(acc),
            "precision_macro": float(np.mean(precision)),
            "recall_macro": float(np.mean(recall)),
            "f1_macro": float(np.mean(f1)),
            "confusion_matrix": conf_mat,
            "classes": [int(c) for c in self.classes_],
            # 带上详细的测试样本对战供前端呈现热力图或错报图
            "test_details": [
                {
                    "sample_id": info["sample_id"],
                    "timestamp": info["timestamp"],
                    "target_segment": info["target_segment"],
                    "y_true": int(y_true),
                    "y_pred": int(y_p)
                }
                for info, y_true, y_p in zip(info_test, y_test, y_pred)
            ]
        }

    def predict_realtime_window(self, x_sequence: List[List[float]]) -> Dict[str, Any]:
        """
        实时仿真接入点
        输入当前抓取的一个时序窗口特征，预测当前状态以及置信度。
        """
        if self.model is None:
            raise ValueError("Model has not been trained yet.")
        
        flat_x = self._flatten_sequence(x_sequence).reshape(1, -1)
        pred_class = int(self.model.predict(flat_x)[0])
        probas = self.model.predict_proba(flat_x)[0].tolist()
        
        # 从 probas 中提取属于每类的概率置信度
        confidence_dict = {cls: float(prob) for cls, prob in zip(self.model.classes_, probas)}

        return {
            "predicted_state": pred_class,
            "confidences": confidence_dict,
            "main_confidence": confidence_dict.get(pred_class, 0.0)
        }

    def save_model(self, filepath: str):
        """
        保存模型到磁盘 (使用 joblib 序列化)
        
        Args:
            filepath: 保存路径 (建议 .joblib 后缀)
        """
        import joblib
        if self.model is None:
            raise ValueError("No model to save. Please train first.")
        
        payload = {
            'model': self.model,
            'feature_names': self.feature_names,
            'window_size': self.window_size,
            'num_features_per_step': self.num_features_per_step,
            'classes_': self.classes_,
        }
        joblib.dump(payload, filepath)
        logger.info(f"Model saved to {filepath}")

    def load_model(self, filepath: str):
        """
        从磁盘加载模型
        
        Args:
            filepath: 模型文件路径
        """
        import joblib
        payload = joblib.load(filepath)
        self.model = payload['model']
        self.feature_names = payload['feature_names']
        self.window_size = payload['window_size']
        self.num_features_per_step = payload['num_features_per_step']
        self.classes_ = [int(c) for c in payload['classes_']]
        logger.info(f"Model loaded from {filepath}")

