"""Error handling service for unified error management.

This service provides a centralized way to handle errors across the system,
converting exceptions to appropriate responses and ensuring consistent error handling.
"""

from typing import Any, Dict, Optional

from app.exceptions import (
    AgentError,
    ConfigurationError,
    LLMError,
    OpenManusError,
    StateTransitionError,
    TokenLimitExceeded,
    ToolError,
    ToolExecutionError,
)
from app.logger import logger
from app.schema import Message
from app.tool.base import ToolResult


class ErrorHandler:
    """Centralized error handler for converting exceptions to appropriate responses."""

    @staticmethod
    def handle_tool_error(
        error: Exception, tool_name: str, context: Optional[Dict[str, Any]] = None
    ) -> ToolResult:
        """Handle tool execution errors and convert to ToolResult.

        Args:
            error: The exception that occurred
            tool_name: Name of the tool that failed
            context: Optional context information

        Returns:
            ToolResult with error information
        """
        context = context or {}

        if isinstance(error, ToolError):
            error_msg = error.message
        elif isinstance(error, ToolExecutionError):
            error_msg = str(error)
        else:
            error_msg = f"Unexpected error in tool '{tool_name}': {str(error)}"

        logger.error(
            f"Tool execution error: {tool_name}",
            error=str(error),
            error_type=type(error).__name__,
            **context,
            exc_info=True,
        )

        return ToolResult(error=error_msg)

    @staticmethod
    def handle_llm_error(
        error: Exception,
        operation: str = "LLM operation",
        context: Optional[Dict[str, Any]] = None,
    ) -> Optional[Message]:
        """Handle LLM errors and convert to appropriate response.

        Args:
            error: The exception that occurred
            operation: Description of the operation that failed
            context: Optional context information

        Returns:
            Optional Message with error information, or None if error should be re-raised
        """
        context = context or {}

        if isinstance(error, TokenLimitExceeded):
            # Token limit errors should be re-raised, not converted
            logger.error(
                f"Token limit exceeded in {operation}",
                **context,
            )
            raise error

        error_msg = f"Error in {operation}: {str(error)}"

        logger.error(
            f"LLM error: {operation}",
            error=str(error),
            error_type=type(error).__name__,
            **context,
            exc_info=True,
        )

        return Message.assistant_message(error_msg)

    @staticmethod
    def handle_agent_error(
        error: Exception, agent_name: str, context: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Handle agent errors and convert to Message.

        Args:
            error: The exception that occurred
            agent_name: Name of the agent
            context: Optional context information

        Returns:
            Message with error information
        """
        context = context or {}

        if isinstance(error, AgentError):
            error_msg = str(error)
        else:
            error_msg = f"Unexpected error in agent '{agent_name}': {str(error)}"

        logger.error(
            f"Agent error: {agent_name}",
            error=str(error),
            error_type=type(error).__name__,
            **context,
            exc_info=True,
        )

        return Message.assistant_message(error_msg)

    @staticmethod
    def should_retry(error: Exception, max_retries: int = 3) -> bool:
        """Determine if an error should be retried.

        Args:
            error: The exception that occurred
            max_retries: Maximum number of retries allowed

        Returns:
            True if the error should be retried, False otherwise
        """
        # Don't retry these errors
        non_retryable_errors = (
            TokenLimitExceeded,
            ConfigurationError,
            ValueError,  # Validation errors shouldn't be retried
        )

        if isinstance(error, non_retryable_errors):
            return False

        # Retry other errors (rate limits, network errors, etc.)
        return True

    @staticmethod
    def get_error_context(error: Exception) -> Dict[str, Any]:
        """Extract context information from an error.

        Args:
            error: The exception

        Returns:
            Dictionary with error context
        """
        context = {
            "error_type": type(error).__name__,
            "error_message": str(error),
        }

        # Add specific context based on error type
        if isinstance(error, ToolExecutionError):
            context["tool_name"] = error.tool_name
            if hasattr(error, "details") and error.details:
                context.update(error.details)
        elif isinstance(error, AgentError):
            context["agent_name"] = error.agent_name
        elif isinstance(error, LLMError):
            if hasattr(error, "model") and error.model:
                context["model"] = error.model
        elif isinstance(error, TokenLimitExceeded):
            if hasattr(error, "current_tokens"):
                context["current_tokens"] = error.current_tokens
            if hasattr(error, "max_tokens"):
                context["max_tokens"] = error.max_tokens

        return context
