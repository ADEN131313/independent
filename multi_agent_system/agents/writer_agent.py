import logging
from typing import Dict, List, Any

from agents.base_agent import BaseAgent
from config import AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import TaskRequest, TaskResult

logger = logging.getLogger(__name__)


class WriterAgent(BaseAgent):
    """Agent specialized in producing high-quality written content."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        super().__init__(config, message_bus, shared_memory)
        self.style_guides: Dict[str, str] = {
            "technical": "Use precise language, include code examples, define terms",
            "casual": "Conversational tone, relatable examples, accessible language",
            "formal": "Professional tone, structured format, evidence-based",
            "creative": "Engaging narrative, vivid descriptions, compelling hooks",
        }

    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Execute a writing task."""
        self.add_to_history("user", task.description)

        # Gather context from shared memory
        research_data = self.memory.search(category="research", min_importance=0.5)
        context_str = self._format_context(task.context, research_data)

        # Determine writing style
        style = self._detect_style(task.description)
        style_guide = self.style_guides.get(style, self.style_guides["formal"])

        writing_prompt = f"""
        Writing Task: {task.description}
        
        Style Guide: {style_guide}
        
        Available Research and Context:
        {context_str}
        
        Constraints: {task.constraints}
        Expected Output Format: {task.expected_output}
        
        Produce polished, well-structured written content. Include:
        - Clear introduction
        - Well-organized body sections
        - Strong conclusion
        - Appropriate formatting (headers, lists, etc. where relevant)
        """

        content = await self._call_llm(writing_prompt)

        result = TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=content,
            reasoning=f"Produced {style}-style written content based on available research",
            confidence=0.85,
            metadata={"style": style, "word_count": len(content.split())},
        )

        # Store in memory
        self.memory.store(
            f"writing:{task.task_id}",
            content,
            category="writing",
            importance=0.7,
            tags=["writer", style],
        )

        self.add_to_history("assistant", content)
        return result

    def _detect_style(self, description: str) -> str:
        """Detect the appropriate writing style from task description."""
        desc_lower = description.lower()
        if any(w in desc_lower for w in ["code", "technical", "api", "documentation"]):
            return "technical"
        elif any(w in desc_lower for w in ["blog", "casual", "friendly", "social"]):
            return "casual"
        elif any(w in desc_lower for w in ["story", "creative", "narrative", "fiction"]):
            return "creative"
        return "formal"

    def _format_context(
        self,
        task_context: List[Dict[str, str]],
        memory_data: List[Dict],
    ) -> str:
        """Format context for the writing prompt."""
        parts = []

        if task_context:
            parts.append("Task Context:")
            for ctx in task_context[-5:]:
                parts.append(f"  - {ctx.get('content', '')[:300]}")

        if memory_data:
            parts.append("\nResearch Data:")
            for item in memory_data[:3]:
                val = item.get("value", "")
                if isinstance(val, str):
                    parts.append(f"  - {val[:300]}")

        return "\n".join(parts) if parts else "No additional context available."

    async def handle_feedback(self, feedback: str, metadata: Dict[str, Any]):
        """Process writing feedback to improve future outputs."""
        await super().handle_feedback(feedback, metadata)

        # Check if feedback suggests a style change
        feedback_lower = feedback.lower()
        if "too formal" in feedback_lower:
            self.memory.store(
                "style_preference",
                "more casual",
                category="preferences",
                importance=0.8,
            )
        elif "too casual" in feedback_lower:
            self.memory.store(
                "style_preference",
                "more formal",
                category="preferences",
                importance=0.8,
            )

    async def _call_llm(self, prompt: str) -> str:
        """Call local LLM for writing."""
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
            logger.error(f"Writer LLM call failed: {e}")
            return f"[Writer] Unable to produce content: {str(e)}"