"""Context compression service for managing conversation history.

This service handles the compression of conversation history when token limits
are approached, using a sliding window approach to maintain context while
reducing token usage.
"""

from typing import List, Optional

from app.llm import LLM
from app.logger import logger
from app.schema import Memory, Message


class ContextCompressionService:
    """Service for compressing conversation context when token limits are approached.

    Uses a sliding window approach:
    - Keeps all system messages
    - Keeps the most recent N messages (configurable)
    - Summarizes messages in between
    """

    # Compression thresholds
    MIN_MESSAGES_TO_COMPRESS = 5
    MAX_MESSAGES_BEFORE_COMPRESS = 20
    MAX_MESSAGE_LENGTH_FOR_SUMMARY = 500

    def __init__(self, summarizer_llm: Optional[LLM] = None):
        """Initialize the context compression service.

        Args:
            summarizer_llm: Optional LLM instance for summarization.
                          If not provided, uses default config.
        """
        self.summarizer_llm = summarizer_llm or LLM(config_name="default")

    def should_compress(
        self,
        memory: Memory,
        estimated_tokens: Optional[int] = None,
        max_tokens: Optional[int] = None,
    ) -> bool:
        """Determine if context compression is needed.

        Args:
            memory: Memory instance containing messages
            estimated_tokens: Estimated tokens for the next request
            max_tokens: Maximum allowed tokens

        Returns:
            True if compression should be performed, False otherwise
        """
        if not memory.enable_compression:
            return False

        compressible = memory.get_compressible_messages()
        if len(compressible) < self.MIN_MESSAGES_TO_COMPRESS:
            return False

        # Check based on token usage ratio
        if estimated_tokens and max_tokens:
            # This would need access to current token count, which is in LLM
            # For now, we'll use message count as a proxy
            if len(compressible) > self.MAX_MESSAGES_BEFORE_COMPRESS:
                return True
        elif len(compressible) > self.MAX_MESSAGES_BEFORE_COMPRESS:
            return True

        return False

    def should_compress_by_tokens(
        self,
        memory: Memory,
        current_tokens: int,
        estimated_tokens: int,
        max_tokens: int,
    ) -> bool:
        """Determine if compression is needed based on token usage.

        Args:
            memory: Memory instance containing messages
            current_tokens: Current token count
            estimated_tokens: Estimated tokens for the next request
            max_tokens: Maximum allowed tokens

        Returns:
            True if compression should be performed, False otherwise
        """
        if not memory.enable_compression:
            return False

        compressible = memory.get_compressible_messages()
        if len(compressible) < self.MIN_MESSAGES_TO_COMPRESS:
            return False

        usage_ratio = (current_tokens + estimated_tokens) / max_tokens
        return usage_ratio >= memory.compression_threshold

    async def compress(self, memory: Memory) -> bool:
        """Compress the conversation context.

        Args:
            memory: Memory instance to compress

        Returns:
            True if compression was successful, False otherwise
        """
        compressible = memory.get_compressible_messages()

        if len(compressible) < self.MIN_MESSAGES_TO_COMPRESS:
            return False

        try:
            logger.info(
                f"🔄 Compressing context: {len(compressible)} messages to summarize "
                f"(keeping {memory.keep_recent_messages} recent messages)"
            )

            # Create summary
            summary_msg = await self._create_summary(compressible)
            memory.summary_message = summary_msg

            # Rebuild messages: system + summary + recent
            system_messages = memory.get_system_messages()
            recent_messages = memory.get_recent_messages(memory.keep_recent_messages)
            memory.messages = system_messages + [summary_msg] + recent_messages

            logger.info(
                f"✅ Context compressed: {len(compressible)} messages -> 1 summary, "
                f"total messages: {len(memory.messages)} "
                f"(system: {len(system_messages)}, recent: {len(recent_messages)})"
            )
            return True

        except Exception as e:
            logger.error(f"❌ Failed to compress context: {e}", exc_info=True)
            # Fall back to simple truncation
            return self._fallback_truncation(memory)

    async def _create_summary(self, messages: List[Message]) -> Message:
        """Create a summary of the given messages.

        Args:
            messages: List of messages to summarize

        Returns:
            Message containing the summary
        """
        summary_prompt = self._build_summary_prompt(messages)

        summary_response = await self.summarizer_llm.ask(
            messages=[Message.user_message(summary_prompt)],
            system_msgs=[
                Message.system_message(
                    "你是一个专业的对话总结助手。你的任务是提取和保留对话中的关键信息，"
                    "包括用户意图、执行的操作、重要结果和当前状态。总结要简洁但完整。"
                )
            ],
            stream=False,
        )

        summary_content = (
            f"[已压缩的对话历史摘要 ({len(messages)} 条消息)]\n{summary_response}"
        )
        return Message.assistant_message(summary_content)

    def _build_summary_prompt(self, messages: List[Message]) -> str:
        """Build the prompt for summarization.

        Args:
            messages: List of messages to summarize

        Returns:
            Formatted summary prompt
        """
        prompt = """请总结以下对话历史，保留关键信息和决策点。总结应该简洁但包含重要的上下文信息，包括：
1. 用户的主要需求和目标
2. 已执行的关键操作和工具调用
3. 重要的中间结果和发现
4. 当前的任务状态

对话历史：
"""
        role_names = {"user": "用户", "assistant": "助手", "tool": "工具"}

        for i, msg in enumerate(messages, 1):
            role_name = role_names.get(msg.role, msg.role)
            content = msg.content or ""

            # Add tool call information
            if msg.tool_calls:
                tool_names = [tc.function.name for tc in msg.tool_calls]
                content += f" [调用了工具: {', '.join(tool_names)}]"

            # Limit message length to avoid token explosion
            if len(content) > self.MAX_MESSAGE_LENGTH_FOR_SUMMARY:
                content = content[: self.MAX_MESSAGE_LENGTH_FOR_SUMMARY] + "..."

            prompt += f"\n{i}. {role_name}: {content}"

        prompt += "\n\n请提供一个简洁但完整的总结，保留所有关键信息："
        return prompt

    def _fallback_truncation(self, memory: Memory) -> bool:
        """Fallback to simple message truncation if compression fails.

        Args:
            memory: Memory instance to truncate

        Returns:
            True if truncation was performed
        """
        logger.warning("Falling back to simple message truncation")
        system_messages = memory.get_system_messages()
        recent_messages = memory.get_recent_messages(memory.keep_recent_messages)
        memory.messages = system_messages + recent_messages
        return False
