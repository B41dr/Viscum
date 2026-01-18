class OpenManusError(Exception):
    """Base exception for all OpenManus errors"""

    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class AgentError(OpenManusError):
    """Base exception for agent-related errors"""

    def __init__(self, message: str, agent_name: str = None, details: dict = None):
        super().__init__(message, details)
        self.agent_name = agent_name


class ToolError(OpenManusError):
    """Raised when a tool encounters an error."""

    def __init__(self, message: str, tool_name: str = None, details: dict = None):
        super().__init__(message, details)
        self.tool_name = tool_name
        # Keep backward compatibility
        self.message = message


class ToolExecutionError(ToolError):
    """Raised when tool execution fails."""

    def __init__(
        self,
        message: str,
        tool_name: str = None,
        original_error: Exception = None,
        details: dict = None,
    ):
        super().__init__(message, tool_name, details)
        self.original_error = original_error


class LLMError(OpenManusError):
    """Base exception for LLM-related errors"""

    def __init__(self, message: str, model: str = None, details: dict = None):
        super().__init__(message, details)
        self.model = model


class TokenLimitExceeded(LLMError):
    """Exception raised when the token limit is exceeded"""

    def __init__(
        self,
        message: str = "Token limit exceeded",
        model: str = None,
        current_tokens: int = None,
        max_tokens: int = None,
        details: dict = None,
    ):
        super().__init__(message, model, details)
        self.current_tokens = current_tokens
        self.max_tokens = max_tokens


class ConfigurationError(OpenManusError):
    """Raised when there's a configuration error"""

    pass


class StateTransitionError(AgentError):
    """Raised when an invalid state transition is attempted"""

    def __init__(
        self,
        message: str,
        current_state: str = None,
        target_state: str = None,
        agent_name: str = None,
    ):
        super().__init__(message, agent_name)
        self.current_state = current_state
        self.target_state = target_state
