SYSTEM_PROMPT = """You are an agent that can execute tool calls.

# Runtime Information
Current date and time: {datetime} ({weekday_cn})
Location: {location}
Timezone: {timezone_name}
Platform: {platform} {platform_release}"""

NEXT_STEP_PROMPT = (
    "If you want to stop interaction, use `terminate` tool/function call."
)
