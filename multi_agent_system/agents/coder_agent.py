import re
import logging
from typing import Dict, List, Any, Optional

from agents.base_agent import BaseAgent
from config import AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import TaskRequest, TaskResult

logger = logging.getLogger(__name__)


class CoderAgent(BaseAgent):
    """Agent specialized in writing, reviewing, and debugging code."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        super().__init__(config, message_bus, shared_memory)
        self.code_snippets: Dict[str, str] = {}
        self.supported_languages = [
            "python", "javascript", "typescript", "java",
            "go", "rust", "c++", "sql", "bash",
        ]

    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Execute a coding task."""
        self.add_to_history("user", task.description)

        # Detect task type
        task_type = self._detect_task_type(task.description)

        # Gather relevant context
        context_str = self._build_context(task.context)

        if task_type == "write":
            result = await self._write_code(task, context_str)
        elif task_type == "debug":
            result = await self._debug_code(task, context_str)
        elif task_type == "review":
            result = await self._review_code(task, context_str)
        elif task_type == "test":
            result = await self._write_tests(task, context_str)
        elif task_type == "refactor":
            result = await self._refactor_code(task, context_str)
        else:
            result = await self._write_code(task, context_str)

        self.add_to_history("assistant", result.output)
        return result

    def _detect_task_type(self, description: str) -> str:
        """Detect the type of coding task."""
        desc_lower = description.lower()
        if any(w in desc_lower for w in ["debug", "fix", "error", "bug", "broken"]):
            return "debug"
        elif any(w in desc_lower for w in ["review", "check", "evaluate", "assess"]):
            return "review"
        elif any(w in desc_lower for w in ["test", "unittest", "pytest", "spec"]):
            return "test"
        elif any(w in desc_lower for w in ["refactor", "clean", "improve", "optimize"]):
            return "refactor"
        return "write"

    async def _write_code(self, task: TaskRequest, context: str) -> TaskResult:
        """Write new code."""
        prompt = f"""
        Coding Task: {task.description}
        
        Context:
        {context}
        
        Requirements: {task.constraints}
        Expected Output: {task.expected_output}
        
        Write clean, production-quality code with:
        1. Clear implementation
        2. Type hints (where applicable)
        3. Docstrings and comments
        4. Error handling
        5. Brief explanation of design decisions
        
        Wrap code blocks in appropriate markdown code fences with language tags.
        """

        code_output = await self._call_llm(prompt)

        # Extract and cache code blocks
        code_blocks = self._extract_code_blocks(code_output)
        for i, block in enumerate(code_blocks):
            key = f"code:{task.task_id}:{i}"
            self.code_snippets[key] = block
            self.memory.store(
                key,
                block,
                category="code",
                importance=0.8,
                tags=["coder", "implementation"],
            )

        return TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=code_output,
            reasoning="Generated implementation with best practices",
            confidence=0.85,
            metadata={"task_type": "write", "code_blocks": len(code_blocks)},
        )

    async def _debug_code(self, task: TaskRequest, context: str) -> TaskResult:
        """Debug existing code."""
        prompt = f"""
        Debug Task: {task.description}
        
        Code/Context to Debug:
        {context}
        
        Provide:
        1. Root cause analysis
        2. The fix with explanation
        3. How to prevent similar issues
        4. Test cases to verify the fix
        """

        debug_output = await self._call_llm(prompt)

        return TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=debug_output,
            reasoning="Performed root cause analysis and provided fix",
            confidence=0.8,
            metadata={"task_type": "debug"},
        )

    async def _review_code(self, task: TaskRequest, context: str) -> TaskResult:
        """Review code for quality and issues."""
        prompt = f"""
        Code Review Task: {task.description}
        
        Code to Review:
        {context}
        
        Provide a thorough code review covering:
        1. Correctness (bugs, logic errors)
        2. Security vulnerabilities
        3. Performance concerns
        4. Code style and readability
        5. Design patterns and architecture
        6. Specific improvement suggestions with code examples
        
        Rate the overall quality (1-10).
        """

        review_output = await self._call_llm(prompt)

        return TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=review_output,
            reasoning="Completed comprehensive code review",
            confidence=0.85,
            metadata={"task_type": "review"},
        )

    async def _write_tests(self, task: TaskRequest, context: str) -> TaskResult:
        """Write test cases."""
        prompt = f"""
        Testing Task: {task.description}
        
        Code to Test:
        {context}
        
        Write comprehensive tests including:
        1. Unit tests for individual functions
        2. Integration tests where applicable
        3. Edge cases and boundary conditions
        4. Error/failure cases
        5. Clear test descriptions
        
        Use appropriate testing framework for the language.
        """

        test_output = await self._call_llm(prompt)

        return TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=test_output,
            reasoning="Generated comprehensive test suite",
            confidence=0.8,
            metadata={"task_type": "test"},
        )

    async def _refactor_code(self, task: TaskRequest, context: str) -> TaskResult:
        """Refactor existing code."""
        prompt = f"""
        Refactoring Task: {task.description}
        
        Current Code:
        {context}
        
        Refactor the code to improve:
        1. Readability and maintainability
        2. Performance (if applicable)
        3. Design patterns
        4. Code duplication removal
        5. Function/class decomposition
        
        Show before/after with explanations for each change.
        """

        refactor_output = await self._call_llm(prompt)

        return TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=refactor_output,
            reasoning="Refactored code with improvements",
            confidence=0.8,
            metadata={"task_type": "refactor"},
        )

    def _extract_code_blocks(self, text: str) -> List[str]:
        """Extract code blocks from markdown text."""
        pattern = r"```(?:\w+)?\n(.*?)```"
        return re.findall(pattern, text, re.DOTALL)

    def _build_context(self, task_context: List[Dict[str, str]]) -> str:
        """Build context string from task context and memory."""
        parts = []

        # Task context
        for ctx in task_context[-5:]:
            content = ctx.get("content", "")
            if content:
                parts.append(content[:500])

        # Relevant code from memory
        code_entries = self.memory.search(category="code", min_importance=0.5)
        for entry in code_entries[:3]:
            val = entry.get("value", "")
            if isinstance(val, str):
                parts.append(f"[Previous code]:\n{val[:300]}")

        return "\n---\n".join(parts) if parts else "No additional context."

    async def _call_llm(self, prompt: str) -> str:
        """Call local LLM for coding tasks."""
        try:
            from core.local_ai import local_ai

            return await local_ai.generate_text(
                prompt=prompt,
                system_prompt=self.config.system_prompt,
                conversation_history=self.conversation_history[-10:],
                max_length=self.config.max_tokens,
                temperature=self.config.temperature,
            )

        except Exception as e:
            logger.error(f"Coder LLM call failed: {e}")
            return f"[Coder] Unable to complete task: {str(e)}"