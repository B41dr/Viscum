import sys
from datetime import datetime

from loguru import logger as _logger

from app.config import PROJECT_ROOT

_print_level = "INFO"
_logger_initialized = False
_current_log_file = None


def define_log_level(print_level="INFO", logfile_level="DEBUG", name: str = None):
    """Adjust the log level to above level"""
    global _print_level, _logger_initialized, _current_log_file

    # 如果已经初始化过，只更新日志级别，不创建新文件
    if _logger_initialized:
        _print_level = print_level
        # 只更新 stderr 的日志级别，不重新创建文件
        _logger.remove()
        _logger.add(sys.stderr, level=print_level)
        if _current_log_file and _current_log_file.exists():
            _logger.add(_current_log_file, level=logfile_level)
        return _logger

    _print_level = print_level

    current_date = datetime.now()
    formatted_date = current_date.strftime("%Y%m%d%H%M%S")
    log_name = (
        f"{name}_{formatted_date}" if name else formatted_date
    )  # name a log with prefix name

    _current_log_file = PROJECT_ROOT / f"logs/{log_name}.log"

    # 确保 logs 目录存在
    _current_log_file.parent.mkdir(parents=True, exist_ok=True)

    _logger.remove()
    _logger.add(sys.stderr, level=print_level)
    _logger.add(_current_log_file, level=logfile_level)

    _logger_initialized = True
    return _logger


def cleanup_empty_logs():
    """清理空的日志文件"""
    logs_dir = PROJECT_ROOT / "logs"
    if not logs_dir.exists():
        return

    empty_logs = []
    for log_file in logs_dir.glob("*.log"):
        try:
            # 检查文件是否为空或只有很少的内容（比如只有换行符）
            if log_file.stat().st_size == 0:
                empty_logs.append(log_file)
            elif log_file.stat().st_size < 10:  # 小于10字节可能是空的或只有换行符
                content = log_file.read_text(encoding="utf-8", errors="ignore").strip()
                if not content:
                    empty_logs.append(log_file)
        except Exception:
            # 如果读取文件出错，跳过
            continue

    # 删除空日志文件，但保留当前正在使用的日志文件
    for log_file in empty_logs:
        if log_file != _current_log_file:
            try:
                log_file.unlink()
            except Exception:
                pass


# 初始化 logger（只执行一次）
logger = define_log_level()

# 在模块加载时清理旧的空日志文件
cleanup_empty_logs()


if __name__ == "__main__":
    logger.info("Starting application")
    logger.debug("Debug message")
    logger.warning("Warning message")
    logger.error("Error message")
    logger.critical("Critical message")

    try:
        raise ValueError("Test error")
    except Exception as e:
        logger.exception(f"An error occurred: {e}")
