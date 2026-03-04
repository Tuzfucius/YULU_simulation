"""
安全表达式求值模块

使用 AST 白名单解析方式替代 eval()，仅允许：
- 算术运算 (+, -, *, /, //, %, **)
- 比较运算 (<, >, <=, >=, ==, !=)
- 逻辑运算 (and, or, not)
- 一元运算 (+, -, ~)
- 属性访问（仅限白名单对象的方法）
- 函数调用（仅限白名单函数）
- 下标访问
- 数字和字符串字面量

禁止：
- import 语句
- 任意函数调用
- 双下划线属性访问 (__builtins__, __import__ 等)
"""

import ast
import operator
import logging
from typing import Any, Dict

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# 允许的二元运算符
_BINARY_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.BitAnd: operator.and_,
    ast.BitOr: operator.or_,
    ast.BitXor: operator.xor,
}

# 允许的比较运算符
_COMPARE_OPS = {
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}

# 允许的一元运算符
_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
    ast.Invert: operator.invert,
    ast.Not: operator.not_,
}

# 允许调用的函数白名单
_ALLOWED_FUNCTIONS = {
    'abs', 'max', 'min', 'round', 'int', 'float', 'len', 'sum',
}

# 允许调用的方法白名单（对象类型 -> 方法名集合）
_ALLOWED_METHODS = {
    'Series': {
        'shift', 'diff', 'rolling', 'mean', 'std', 'var', 'sum',
        'min', 'max', 'abs', 'clip', 'fillna', 'ffill', 'bfill',
        'cumsum', 'cumprod', 'pct_change', 'rank', 'apply',
    },
    'DataFrame': {
        'shift', 'diff', 'rolling', 'mean', 'std', 'var', 'sum',
        'min', 'max', 'abs', 'clip', 'fillna',
    },
    'Rolling': {
        'mean', 'std', 'var', 'sum', 'min', 'max', 'median',
    },
    'module': {
        # numpy 允许的函数
        'sqrt', 'log', 'log2', 'log10', 'exp', 'abs',
        'sin', 'cos', 'tan',
        'mean', 'std', 'var', 'sum', 'min', 'max', 'median',
        'clip', 'where', 'sign', 'floor', 'ceil', 'round',
        'diff', 'gradient', 'cumsum',
        'array', 'zeros', 'ones',
    },
}


class SafeExpressionError(Exception):
    """安全表达式求值异常"""
    pass


class SafeEvaluator:
    """
    安全表达式求值器
    
    使用 AST 遍历方式解析并求值表达式，拒绝不安全的操作。
    
    用法:
        evaluator = SafeEvaluator(variables={'avg_speed': series, 'np': np})
        result = evaluator.evaluate("avg_speed.diff().abs()")
    """
    
    def __init__(self, variables: Dict[str, Any] = None):
        self.variables = variables or {}
    
    def evaluate(self, expression: str) -> Any:
        """
        安全地求值一个表达式
        
        Args:
            expression: 要求值的表达式字符串
            
        Returns:
            求值结果
            
        Raises:
            SafeExpressionError: 表达式不安全或求值失败
        """
        try:
            tree = ast.parse(expression.strip(), mode='eval')
        except SyntaxError as e:
            raise SafeExpressionError(f"表达式语法错误: {e}")
        
        return self._eval_node(tree.body)
    
    def _eval_node(self, node: ast.AST) -> Any:
        """递归求值 AST 节点"""
        
        # 数字字面量
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float, str, bool, type(None))):
                return node.value
            raise SafeExpressionError(f"不允许的常量类型: {type(node.value)}")
        
        # 变量名
        if isinstance(node, ast.Name):
            if node.id in self.variables:
                return self.variables[node.id]
            raise SafeExpressionError(f"未定义的变量: {node.id}")
        
        # 二元运算
        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in _BINARY_OPS:
                raise SafeExpressionError(f"不允许的运算符: {op_type.__name__}")
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)
            return _BINARY_OPS[op_type](left, right)
        
        # 一元运算
        if isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in _UNARY_OPS:
                raise SafeExpressionError(f"不允许的一元运算符: {op_type.__name__}")
            operand = self._eval_node(node.operand)
            return _UNARY_OPS[op_type](operand)
        
        # 比较运算
        if isinstance(node, ast.Compare):
            left = self._eval_node(node.left)
            for op, comparator in zip(node.ops, node.comparators):
                op_type = type(op)
                if op_type not in _COMPARE_OPS:
                    raise SafeExpressionError(f"不允许的比较运算符: {op_type.__name__}")
                right = self._eval_node(comparator)
                left = _COMPARE_OPS[op_type](left, right)
            return left
        
        # 布尔运算
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                result = True
                for val_node in node.values:
                    result = result and self._eval_node(val_node)
                return result
            elif isinstance(node.op, ast.Or):
                result = False
                for val_node in node.values:
                    result = result or self._eval_node(val_node)
                return result
            raise SafeExpressionError(f"不允许的布尔运算: {type(node.op).__name__}")
        
        # 条件表达式 (a if cond else b)
        if isinstance(node, ast.IfExp):
            test = self._eval_node(node.test)
            if test:
                return self._eval_node(node.body)
            return self._eval_node(node.orelse)
        
        # 属性访问
        if isinstance(node, ast.Attribute):
            obj = self._eval_node(node.value)
            attr_name = node.attr
            
            # 禁止双下划线属性
            if attr_name.startswith('__'):
                raise SafeExpressionError(f"禁止访问私有属性: {attr_name}")
            
            # 验证属性访问的合法性
            if not self._is_allowed_attribute(obj, attr_name):
                raise SafeExpressionError(
                    f"不允许访问 {type(obj).__name__} 的属性: {attr_name}"
                )
            
            return getattr(obj, attr_name)
        
        # 函数/方法调用
        if isinstance(node, ast.Call):
            func = self._eval_node(node.func)
            
            # 验证调用的合法性
            func_name = self._get_func_name(node.func)
            if not self._is_allowed_call(node.func, func):
                raise SafeExpressionError(f"不允许调用: {func_name}")
            
            args = [self._eval_node(arg) for arg in node.args]
            kwargs = {kw.arg: self._eval_node(kw.value) for kw in node.keywords}
            
            return func(*args, **kwargs)
        
        # 下标访问
        if isinstance(node, ast.Subscript):
            obj = self._eval_node(node.value)
            
            if isinstance(node.slice, ast.Constant):
                return obj[node.slice.value]
            elif isinstance(node.slice, ast.Slice):
                lower = self._eval_node(node.slice.lower) if node.slice.lower else None
                upper = self._eval_node(node.slice.upper) if node.slice.upper else None
                step = self._eval_node(node.slice.step) if node.slice.step else None
                return obj[lower:upper:step]
            else:
                idx = self._eval_node(node.slice)
                return obj[idx]
        
        # 列表/元组字面量
        if isinstance(node, ast.List):
            return [self._eval_node(e) for e in node.elts]
        if isinstance(node, ast.Tuple):
            return tuple(self._eval_node(e) for e in node.elts)
        
        raise SafeExpressionError(f"不允许的表达式类型: {type(node).__name__}")
    
    def _is_allowed_attribute(self, obj: Any, attr_name: str) -> bool:
        """检查属性访问是否在白名单中"""
        # numpy/pandas 模块的属性
        if obj is np or obj is pd:
            return attr_name in _ALLOWED_METHODS.get('module', set())
        
        # pandas Series
        if isinstance(obj, pd.Series):
            return attr_name in _ALLOWED_METHODS.get('Series', set())
        
        # pandas DataFrame
        if isinstance(obj, pd.DataFrame):
            return attr_name in _ALLOWED_METHODS.get('DataFrame', set())
        
        # pandas Rolling
        if isinstance(obj, pd.core.window.rolling.Rolling):
            return attr_name in _ALLOWED_METHODS.get('Rolling', set())
        
        return False
    
    def _is_allowed_call(self, func_node: ast.AST, func: Any) -> bool:
        """检查函数调用是否在白名单中"""
        # 内置函数
        func_name = self._get_func_name(func_node)
        if func_name in _ALLOWED_FUNCTIONS:
            return True
        
        # 方法调用 (obj.method)
        if isinstance(func_node, ast.Attribute):
            return True  # 属性访问已经在 _is_allowed_attribute 中验证
        
        # numpy/pandas 的函数
        if hasattr(func, '__module__'):
            module = getattr(func, '__module__', '') or ''
            if module.startswith(('numpy', 'pandas')):
                return True
        
        return False
    
    def _get_func_name(self, node: ast.AST) -> str:
        """获取函数名称"""
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return node.attr
        return '<unknown>'


def safe_eval(expression: str, variables: Dict[str, Any]) -> Any:
    """
    安全求值表达式的便捷函数
    
    Args:
        expression: 表达式字符串
        variables: 可用的变量字典
        
    Returns:
        求值结果
        
    Raises:
        SafeExpressionError: 不安全或求值失败
    """
    evaluator = SafeEvaluator(variables=variables)
    return evaluator.evaluate(expression)
