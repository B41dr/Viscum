from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator

from app.llm import LLM
from app.logger import logger
from app.sandbox.client import SANDBOX_CLIENT
from app.schema import ROLE_TYPE, AgentState, Memory, Message


class BaseAgent(BaseModel, ABC):
    """Abstract base class for managing agent state and execution.

    Provides foundational functionality for state transitions, memory management,
    and a step-based execution loop. Subclasses must implement the `step` method.
    """

    # Core attributes
    name: str = Field(..., description="Unique name of the agent")
    description: Optional[str] = Field(None, description="Optional agent description")

    # Prompts
    system_prompt: Optional[str] = Field(
        None, description="System-level instruction prompt"
    )
    next_step_prompt: Optional[str] = Field(
        None, description="Prompt for determining next action"
    )

    # Dependencies
    llm: LLM = Field(default_factory=LLM, description="Language model instance")
    memory: Memory = Field(default_factory=Memory, description="Agent's memory store")
    state: AgentState = Field(
        default=AgentState.IDLE, description="Current agent state"
    )

    # Execution control
    max_steps: int = Field(default=10, description="Maximum steps before termination")
    current_step: int = Field(default=0, description="Current step in execution")

    duplicate_threshold: int = 2

    class Config:
        arbitrary_types_allowed = True
        extra = "allow"  # Allow extra fields for flexibility in subclasses

    @model_validator(mode="after")
    def initialize_agent(self) -> "BaseAgent":
        """Initialize agent with default settings if not provided."""
        if self.llm is None or not isinstance(self.llm, LLM):
            self.llm = LLM(config_name=self.name.lower())
        if not isinstance(self.memory, Memory):
            self.memory = Memory()
        return self

    @asynccontextmanager
    async def state_context(self, new_state: AgentState):
        """Context manager for safe agent state transitions.

        Args:
            new_state: The state to transition to during the context.

        Yields:
            None: Allows execution within the new state.

        Raises:
            ValueError: If the new_state is invalid.
        """
        if not isinstance(new_state, AgentState):
            raise ValueError(f"Invalid state: {new_state}")

        previous_state = self.state
        self.state = new_state
        try:
            yield
        except Exception as e:
            self.state = AgentState.ERROR  # Transition to ERROR on failure
            raise e
        finally:
            self.state = previous_state  # Revert to previous state

    def update_memory(
        self,
        role: ROLE_TYPE,  # type: ignore
        content: str,
        base64_image: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Add a message to the agent's memory.

        Args:
            role: The role of the message sender (user, system, assistant, tool).
            content: The message content.
            base64_image: Optional base64 encoded image.
            **kwargs: Additional arguments (e.g., tool_call_id for tool messages).

        Raises:
            ValueError: If the role is unsupported.
        """
        message_map = {
            "user": Message.user_message,
            "system": Message.system_message,
            "assistant": Message.assistant_message,
            "tool": lambda content, **kw: Message.tool_message(content, **kw),
        }

        if role not in message_map:
            raise ValueError(f"Unsupported message role: {role}")

        # Create message with appropriate parameters based on role
        kwargs = {"base64_image": base64_image, **(kwargs if role == "tool" else {})}
        self.memory.add_message(message_map[role](content, **kwargs))

    async def run(self, request: Optional[str] = None) -> str:
        """Execute the agent's main loop asynchronously.

        Args:
            request: Optional initial user request to process.

        Returns:
            A string summarizing the execution results.

        Raises:
            RuntimeError: If the agent is not in IDLE state at start.
        """
        if self.state != AgentState.IDLE:
            raise RuntimeError(f"Cannot run agent from state: {self.state}")

        if request:
            self.update_memory("user", request)

        results: List[str] = []
        async with self.state_context(AgentState.RUNNING):
            while (
                self.current_step < self.max_steps and self.state != AgentState.FINISHED
            ):
                self.current_step += 1
                logger.info(f"Executing step {self.current_step}/{self.max_steps}")
                step_result = await self.step()

                # Check for stuck state
                if self.is_stuck():
                    self.handle_stuck_state()

                results.append(f"Step {self.current_step}: {step_result}")

            if self.current_step >= self.max_steps:
                self.current_step = 0
                self.state = AgentState.IDLE
                results.append(f"Terminated: Reached max steps ({self.max_steps})")
        await SANDBOX_CLIENT.cleanup()
        return "\n".join(results) if results else "No steps executed"

    @abstractmethod
    async def step(self) -> str:
        """Execute a single step in the agent's workflow.

        Must be implemented by subclasses to define specific behavior.
        """

    def handle_stuck_state(self):
        """Handle stuck state by adding a prompt to change strategy"""
        stuck_prompt = "\
        Observed duplicate responses. Consider new strategies and avoid repeating ineffective paths already attempted."
        self.next_step_prompt = f"{stuck_prompt}\n{self.next_step_prompt}"
        logger.warning(f"Agent detected stuck state. Added prompt: {stuck_prompt}")

    def is_stuck(self) -> bool:
        """Check if the agent is stuck in a loop by detecting duplicate content"""
        if len(self.memory.messages) < 2:
            return False

        last_message = self.memory.messages[-1]
        if not last_message.content:
            return False

        # Count identical content occurrences
        duplicate_count = sum(
            1
            for msg in reversed(self.memory.messages[:-1])
            if msg.role == "assistant" and msg.content == last_message.content
        )

        return duplicate_count >= self.duplicate_threshold

    async def compress_context_if_needed(
        self, estimated_tokens: Optional[int] = None, max_tokens: Optional[int] = None
    ) -> bool:
        """Compress context if token usage is approaching limits.
        
        Uses a sliding window approach:
        - Keeps all system messages
        - Keeps the most recent N messages (configurable)
        - Summarizes messages in between
        
        Args:
            estimated_tokens: Estimated tokens for the next request
            max_tokens: Maximum allowed tokens
            
        Returns:
            True if compression was performed, False otherwise
        """
        if not self.memory.enable_compression:
            return False

        # Get compressible messages (excluding system and recent)
        compressible = self.memory.get_compressible_messages()
        if len(compressible) < 5:  # Don't compress if too few messages
            return False

        # Check if compression is needed based on token usage
        should_compress = False
        if estimated_tokens and max_tokens:
            usage_ratio = (self.llm.total_input_tokens + estimated_tokens) / max_tokens
            if usage_ratio >= self.memory.compression_threshold:
                should_compress = True
        elif len(compressible) > 20:  # Compress if too many messages
            should_compress = True

        if not should_compress:
            return False

        try:
            logger.info(
                f"🔄 Compressing context: {len(compressible)} messages to summarize "
                f"(keeping {self.memory.keep_recent_messages} recent messages)"
            )
            
            # Prepare messages for summarization
            messages_to_summarize = compressible
            
            # Create summary prompt
            summary_prompt = """请总结以下对话历史，保留关键信息和决策点。总结应该简洁但包含重要的上下文信息，包括：
1. 用户的主要需求和目标
2. 已执行的关键操作和工具调用
3. 重要的中间结果和发现
4. 当前的任务状态

对话历史：
"""
            for i, msg in enumerate(messages_to_summarize, 1):
                role_name = {"user": "用户", "assistant": "助手", "tool": "工具"}.get(msg.role, msg.role)
                content = msg.content or ""
                if msg.tool_calls:
                    tool_names = [tc.function.name for tc in msg.tool_calls]
                    content += f" [调用了工具: {', '.join(tool_names)}]"
                # Limit each message to 500 chars to avoid token explosion
                if len(content) > 500:
                    content = content[:500] + "..."
                summary_prompt += f"\n{i}. {role_name}: {content}"
            
            summary_prompt += "\n\n请提供一个简洁但完整的总结，保留所有关键信息："

            # Generate summary using LLM (use a separate LLM instance to avoid recursion)
            # Use default config to avoid token limit issues
            summary_llm = LLM(config_name="default")
            summary_response = await summary_llm.ask(
                messages=[Message.user_message(summary_prompt)],
                system_msgs=[
                    Message.system_message(
                        "你是一个专业的对话总结助手。你的任务是提取和保留对话中的关键信息，"
                        "包括用户意图、执行的操作、重要结果和当前状态。总结要简洁但完整。"
                    )
                ],
                stream=False,
            )

            # Create summary message
            summary_content = f"[已压缩的对话历史摘要 ({len(messages_to_summarize)} 条消息)]\n{summary_response}"
            summary_msg = Message.assistant_message(summary_content)
            self.memory.summary_message = summary_msg

            # Replace compressible messages with summary
            system_messages = self.memory.get_system_messages()
            recent_messages = self.memory.get_recent_messages(self.memory.keep_recent_messages)
            
            # Rebuild messages: system + summary + recent
            self.memory.messages = system_messages + [summary_msg] + recent_messages
            
            logger.info(
                f"✅ Context compressed: {len(messages_to_summarize)} messages -> 1 summary, "
                f"total messages: {len(self.memory.messages)} "
                f"(system: {len(system_messages)}, recent: {len(recent_messages)})"
            )
            return True

        except Exception as e:
            logger.error(f"❌ Failed to compress context: {e}", exc_info=True)
            # If compression fails, fall back to simple truncation
            logger.warning("Falling back to simple message truncation")
            system_messages = self.memory.get_system_messages()
            recent_messages = self.memory.get_recent_messages(self.memory.keep_recent_messages)
            self.memory.messages = system_messages + recent_messages
            return False

    @property
    def messages(self) -> List[Message]:
        """Retrieve a list of messages from the agent's memory."""
        return self.memory.messages

    @messages.setter
    def messages(self, value: List[Message]):
        """Set the list of messages in the agent's memory."""
        self.memory.messages = value
