import logging
from typing import Dict, List, Any

from agents.base_agent import BaseAgent
from config import AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import TaskRequest, TaskResult

logger = logging.getLogger(__name__)


class ResearcherAgent(BaseAgent):
    """Agent specialized in research, analysis, and information gathering."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        super().__init__(config, message_bus, shared_memory)
        self.research_cache: Dict[str, str] = {}

    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Execute a research task."""
        self.add_to_history("user", task.description)

        # Check cache first
        cache_key = task.description.lower().strip()
        if cache_key in self.research_cache:
            logger.info(f"Research cache hit for: {task.description[:50]}")
            return TaskResult(
                task_id=task.task_id,
                agent_name=self.name,
                success=True,
                output=self.research_cache[cache_key],
                reasoning="Retrieved from research cache",
                confidence=0.9,
            )

        # Build research prompt with context
        context_str = "\n".join(
            c.get("content", "") for c in task.context[-5:] if c.get("content")
        )

        research_prompt = f"""
        Research Task: {task.description}
        
        Context from previous work:
        {context_str}
        
        Constraints: {task.constraints}
        Expected Output: {task.expected_output}
        
        Provide a thorough research analysis that includes:
        1. Key findings and facts
        2. Analysis and interpretation
        3. Relevant patterns or trends
        4. Potential gaps or limitations in the information
        5. Confidence assessment of findings
        
        Be specific, factual, and well-organized.
        """

        result_text = await self._call_llm(research_prompt)

        # Cache the result
        self.research_cache[cache_key] = result_text

        # Store in shared memory
        self.memory.store(
            f"research:{task.task_id}",
            result_text,
            category="research",
            importance=0.7,
            tags=["researcher", "analysis"],
        )

        result = TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=result_text,
            reasoning="Completed research analysis using available knowledge",
            confidence=0.8,
            metadata={"cached": False},
        )

        self.add_to_history("assistant", result_text)
        return result

    async def handle_query(self, query: str) -> str:
        """Handle a quick research query."""
        prompt = f"Answer this research question concisely and accurately:\n{query}"
        return await self._call_llm(prompt)

    async def _call_llm(self, prompt: str) -> str:
        """Call local LLM for research."""
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
            logger.error(f"Researcher LLM call failed: {e}")
            return f"[Researcher] Unable to complete research: {str(e)}"