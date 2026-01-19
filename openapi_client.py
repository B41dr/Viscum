#!/usr/bin/env python3
"""
OpenAPI 客户端脚本
用于调用快手 OpenAPI 接口
"""

import logging
import os
from typing import Any, Dict, List, Optional

import requests

# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class OpenApiService:
    """OpenAPI 服务类，用于调用快手 OpenAPI 接口"""

    def __init__(
        self,
        open_api_url: str = "https://is-gateway.corp.kuaishou.com",
        app_key: str = "bfe47d59-1b97-4214-b44b-21d6a3d76804",
        secret_key: str = "7656f1041d6a4760a7fc41023671f820",
    ):
        """
        初始化 OpenAPI 服务

        Args:
            open_api_url: OpenAPI 基础 URL
            app_key: 应用 Key
            secret_key: 密钥
        """
        self.open_api_url = open_api_url
        self.app_key = app_key
        self.secret_key = secret_key
        self._access_token: Optional[str] = None

    def access_open_api(self) -> str:
        """
        获取 OpenAPI 访问令牌

        Returns:
            access_token: 访问令牌
        """
        url = f"{self.open_api_url}/token/get"
        params = {
            "appKey": self.app_key,
            "secretKey": self.secret_key,
        }

        try:
            logger.info(f"正在获取 access token，URL: {url}")
            logger.debug(f"请求参数: appKey={self.app_key}, secretKey=***")
            response = requests.get(url, params=params, timeout=30)
            logger.info(f"Token 请求响应状态码: {response.status_code}")

            response.raise_for_status()
            data = response.json()
            logger.debug(f"Token 响应数据: {data}")

            access_token = data.get("result", {}).get("accessToken", "")
            if not access_token:
                logger.warning(f"未能获取到 accessToken，完整响应: {data}")
                raise ValueError(f"未能获取到 accessToken，响应: {data}")
            else:
                self._access_token = access_token
                logger.info("成功获取 access token")

            return access_token
        except requests.exceptions.RequestException as e:
            logger.error(f"获取 access token 失败: {e}")
            if hasattr(e, "response") and e.response is not None:
                logger.error(f"响应状态码: {e.response.status_code}")
                logger.error(f"响应内容: {e.response.text}")
            raise

    def post_fn(self, url: str, data: Any) -> Optional[Any]:
        """
        发送 POST 请求

        Args:
            url: API 路径（不包含基础 URL）
            data: 请求数据

        Returns:
            响应数据中的 data 字段，如果失败返回 None
        """
        try:
            access_token = self.access_open_api()
            if not access_token:
                logger.error("无法获取 access token，无法继续请求")
                return None

            full_url = f"{self.open_api_url}{url}"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }

            logger.info(f"发送 POST 请求到: {full_url}")
            logger.debug(f"请求数据: {data}")
            logger.debug(f"请求头: Authorization=Bearer {access_token[:20]}...")

            response = requests.post(full_url, json=data, headers=headers, timeout=30)

            logger.info(f"POST 请求响应状态码: {response.status_code}")
            logger.debug(f"响应头: {dict(response.headers)}")

            # 即使状态码不是 200，也尝试解析响应
            try:
                result = response.json()
                logger.debug(f"响应数据: {result}")
            except ValueError:
                logger.error(f"响应不是有效的 JSON，响应内容: {response.text}")
                result = None

            response.raise_for_status()

            # 检查业务错误（即使 HTTP 200，也可能有业务错误）
            if result:
                # 检查是否有错误码
                if isinstance(result, dict):
                    # 检查常见的错误字段
                    error_code = (
                        result.get("code")
                        or result.get("status")
                        or result.get("errorCode")
                    )
                    error_message = (
                        result.get("message")
                        or result.get("errorMessage")
                        or result.get("msg")
                    )

                    if error_code and error_code != 0 and error_code != 200:
                        logger.warning(
                            f"业务错误: code={error_code}, message={error_message}"
                        )
                        # 仍然返回结果，让调用者决定如何处理

                # 根据响应结构返回数据
                # 尝试多种可能的响应结构
                if "data" in result:
                    data = result.get("data")
                    # 如果 data 中还有错误，也检查一下
                    if isinstance(data, dict) and (
                        data.get("code") or data.get("status")
                    ):
                        error_code = data.get("code") or data.get("status")
                        if error_code and error_code != 0 and error_code != 200:
                            logger.warning(
                                f"业务错误（在 data 中）: code={error_code}, message={data.get('message')}"
                            )
                    return data
                elif "result" in result:
                    return result.get("result")
                else:
                    return result

            return None

        except requests.exceptions.HTTPError as e:
            logger.error(f"POST 请求 HTTP 错误: {e}")
            if hasattr(e, "response") and e.response is not None:
                logger.error(f"HTTP 状态码: {e.response.status_code}")
                try:
                    error_data = e.response.json()
                    logger.error(f"错误响应 JSON: {error_data}")
                except ValueError:
                    logger.error(f"错误响应文本: {e.response.text}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"POST 请求失败: {e}")
            if hasattr(e, "response") and e.response is not None:
                logger.error(f"响应内容: {e.response.text}")
            return None
        except Exception as e:
            logger.error(f"POST 请求发生未知错误: {e}", exc_info=True)
            return None

    def get_fn(
        self, url: str, params: Optional[Dict[str, Any]] = None
    ) -> Optional[Any]:
        """
        发送 GET 请求

        Args:
            url: API 路径（不包含基础 URL）
            params: 查询参数

        Returns:
            响应数据中的 data 字段，如果失败返回 None
        """
        access_token = self.access_open_api()
        full_url = f"{self.open_api_url}{url}"

        headers = {
            "Authorization": f"Bearer {access_token}",
        }

        try:
            response = requests.get(
                full_url, headers=headers, params=params, timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return result.get("data")
        except requests.exceptions.RequestException as e:
            logger.error(f"GET 请求失败: {e}")
            if hasattr(e.response, "text"):
                logger.error(f"响应内容: {e.response.text}")
            return None

    def get_open_api_access_token(
        self, app_key: str, secret_key: str
    ) -> tuple[str, str]:
        """
        获取 OpenAPI 访问令牌和刷新令牌

        Args:
            app_key: 应用 Key
            secret_key: 密钥

        Returns:
            (refresh_token, access_token): 刷新令牌和访问令牌的元组
        """
        url = f"{self.open_api_url}/token/get"
        params = {
            "appKey": app_key,
            "secretKey": secret_key,
        }

        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            result = data.get("result", {})
            access_token = result.get("accessToken", "")
            refresh_token = result.get("refreshToken", "")

            return refresh_token, access_token
        except requests.exceptions.RequestException as e:
            logger.error(f"获取 token 失败: {e}")
            raise


def main():
    """主函数，示例调用"""
    # 获取用户输入
    print("=" * 60)
    print("OpenAPI 接口调用工具")
    print("=" * 60)

    # 输入标题
    title = input("请输入文档标题 (docTitle): ").strip()
    if not title:
        print("❌ 错误：标题不能为空")
        return

    # 输入 markdown 文件路径
    content_path = input("请输入 Markdown 文件的绝对路径 (content): ").strip()
    if not content_path:
        print("❌ 错误：文件路径不能为空")
        return

    # 验证文件是否存在
    if not os.path.exists(content_path):
        print(f"❌ 错误：文件不存在: {content_path}")
        return

    # 验证是否为文件（不是目录）
    if not os.path.isfile(content_path):
        print(f"❌ 错误：路径不是文件: {content_path}")
        return

    # 读取文件内容
    try:
        with open(content_path, "r", encoding="utf-8") as f:
            content = f.read()
        logger.info(f"成功读取文件: {content_path}，文件大小: {len(content)} 字符")
    except Exception as e:
        logger.error(f"读取文件失败: {e}")
        print(f"❌ 错误：无法读取文件 {content_path}: {e}")
        return

    # 创建服务实例
    open_api_service = OpenApiService()

    # 构建请求数据
    request_data = {
        # "parentId": "",  # 新文档所在文件夹ID
        # "parentViewStrId": "VQ_Faopq4oF4",
        "knowLink": 3,
        "viewModel": "A3",
        "content": content,
        "docTitle": title,
        "classifyLevel": 3,
        "contentType": 1,
    }

    print("=" * 60)
    print("开始调用 OpenAPI 接口")
    print(f"文档标题: {title}")
    print(f"内容文件: {content_path}")
    print(f"内容长度: {len(content)} 字符")
    print("=" * 60)

    try:
        result = open_api_service.post_fn(
            "/word/e/api/create-with-content",
            request_data,
        )

        print("=" * 60)
        if result is not None:
            # 检查是否是业务错误
            is_business_error = False
            if isinstance(result, dict):
                error_code = result.get("code") or result.get("status")
                error_message = result.get("message") or result.get("msg")
                if error_code and error_code != 0 and error_code != 200:
                    is_business_error = True
                    logger.warning(
                        f"业务错误: code={error_code}, message={error_message}"
                    )
                    print(f"⚠️  HTTP 请求成功，但业务逻辑返回错误")
                    print(f"错误码: {error_code}")
                    print(f"错误信息: {error_message}")
                    if "i18n" in result:
                        i18n = result.get("i18n", {})
                        if "zhCN" in i18n:
                            print(f"中文错误: {i18n['zhCN']}")
                        if "enUS" in i18n:
                            print(f"英文错误: {i18n['enUS']}")
                    print(f"\n完整响应: {result}")
                else:
                    logger.info(f"请求成功，返回结果: {result}")
                    print(f"✅ 请求成功！")
                    print(f"返回结果: {result}")
            else:
                logger.info(f"请求成功，返回结果: {result}")
                print(f"✅ 请求成功！")
                print(f"返回结果: {result}")
        else:
            logger.error("请求失败，返回 None")
            print("❌ 请求失败，返回 None")
            print("请查看上方的详细错误日志")
        print("=" * 60)

    except Exception as e:
        logger.error(f"执行失败: {e}", exc_info=True)
        print("=" * 60)
        print(f"❌ 执行失败: {e}")
        print("=" * 60)


if __name__ == "__main__":
    main()
