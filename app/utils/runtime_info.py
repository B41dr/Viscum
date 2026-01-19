"""运行时信息工具函数，用于获取日期、时间、地点等运行时信息"""

import locale
import platform
from datetime import datetime
from typing import Dict, Optional

try:
    import geocoder  # type: ignore
except ImportError:
    geocoder = None  # Optional dependency for location detection


def get_runtime_info() -> Dict[str, str]:
    """获取运行时信息，包括日期、时间、地点等
    
    Returns:
        Dict[str, str]: 包含运行时信息的字典
    """
    now = datetime.now()
    
    # 获取系统信息
    system_info = {
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "year": str(now.year),
        "month": str(now.month),
        "day": str(now.day),
        "weekday": now.strftime("%A"),
        "weekday_cn": _get_weekday_cn(now.weekday()),
        "timezone": str(now.astimezone().tzinfo),
        "timestamp": str(int(now.timestamp())),
    }
    
    # 获取时区信息
    local_tz = now.astimezone().tzinfo
    if hasattr(local_tz, 'key'):
        system_info["timezone_name"] = local_tz.key
    else:
        system_info["timezone_name"] = str(local_tz)
    
    # 获取系统平台信息
    system_info["platform"] = platform.system()
    system_info["platform_release"] = platform.release()
    system_info["platform_version"] = platform.version()
    system_info["machine"] = platform.machine()
    system_info["processor"] = platform.processor()
    
    # 尝试获取地理位置信息
    location_info = _get_location_info()
    if location_info:
        system_info.update(location_info)
    else:
        # 如果无法获取位置，使用默认值
        system_info["location"] = "未知"
        system_info["country"] = "未知"
        system_info["city"] = "未知"
    
    # 获取语言环境
    try:
        system_info["locale"] = locale.getdefaultlocale()[0] or "未知"
    except Exception:
        system_info["locale"] = "未知"
    
    return system_info


def _get_weekday_cn(weekday: int) -> str:
    """将星期几转换为中文"""
    weekdays_cn = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    return weekdays_cn[weekday]


def _get_location_info() -> Optional[Dict[str, str]]:
    """尝试获取地理位置信息
    
    Returns:
        Optional[Dict[str, str]]: 位置信息字典，如果获取失败则返回 None
    """
    if geocoder is None:
        return None
    
    try:
        # 尝试使用 IP 地址获取位置
        g = geocoder.ip('me')
        if g.ok:
            location_info = {}
            
            # 国家
            if g.country:
                location_info["country"] = g.country
            else:
                location_info["country"] = "未知"
            
            # 城市
            if g.city:
                location_info["city"] = g.city
            else:
                location_info["city"] = "未知"
            
            # 完整位置
            location_parts = []
            if g.city:
                location_parts.append(g.city)
            if g.region:
                location_parts.append(g.region)
            if g.country:
                location_parts.append(g.country)
            
            location_info["location"] = ", ".join(location_parts) if location_parts else "未知"
            
            # 坐标（可选）
            if g.latlng:
                location_info["latitude"] = str(g.latlng[0])
                location_info["longitude"] = str(g.latlng[1])
            
            return location_info
    except Exception:
        pass
    
    return None


def format_system_prompt(prompt: str, runtime_info: Optional[Dict[str, str]] = None) -> str:
    """格式化系统提示词，注入运行时信息
    
    Args:
        prompt: 原始系统提示词，可以包含占位符如 {date}, {time}, {location} 等
        runtime_info: 运行时信息字典，如果为 None 则自动获取
    
    Returns:
        str: 格式化后的系统提示词
    
    Examples:
        >>> prompt = "当前日期是 {date}，时间是 {time}，位置是 {location}"
        >>> formatted = format_system_prompt(prompt)
        >>> # 输出: "当前日期是 2024-01-19，时间是 14:30:00，位置是 北京, 中国"
    """
    if runtime_info is None:
        runtime_info = get_runtime_info()
    
    try:
        return prompt.format(**runtime_info)
    except KeyError as e:
        # 如果提示词中有未定义的占位符，保留原样
        import logging
        logging.warning(f"系统提示词中包含未定义的占位符: {e}")
        return prompt
