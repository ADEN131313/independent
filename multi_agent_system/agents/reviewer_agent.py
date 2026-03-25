import logging
from typing import Dict, List, Any

from agents.base_agent import BaseAgent
from config import AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import TaskRequest, TaskResult

logger = logging.getLogger(__name__)


class ReviewerAgent(BaseAgent):
    """Agent specialized in reviewing and quality-checking work from other agents."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        super().__init__(config, message_bus, shared_memory)
        self.review_criteria = {
            "correctness": 0.30,
            "completeness": 0.25,
            "clarity": 0.20,
            "quality": 0.15,
            "efficiency": 0.10,
        }

    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Execute a review task."""
        self.add_to_history("user", task.description)

        # Gather all relevant work products
        context = self._gather_review_context(task)

        review_prompt = f"""
        Review Task: {task.description}
        
        Work to Review:
        {context}
        
        Review Criteria and Weights:
        {self.review_criteria}
        
        Constraints to check: {task.constraints}
        
        Provide a structured review with:
        
        ## Executive Summary
        Brief overview of the work and overall assessment.
        
        ## Detailed Analysis
        
        ### Correctness (30%)
        - Are there factual errors?
        - Is the logic sound?
        - Are edge cases handled?
        
        ### Completeness (25%)
        - Does it meet all requirements?
        - Are there missing pieces?
        - Is the scope appropriate?
        
        ### Clarity (20%)
        - Is it well-organized?
        - Is it easy to understand?
        - Is documentation adequate?
        
        ### Quality (15%)
        - Overall polish and professionalism
        - Consistency
        - Best practices followed?
        
        ### Efficiency (10%)
        - Are there performance concerns?
        - Is there unnecessary complexity?
        - Resource usage reasonable?
        
        ## Issues Found
        List each issue with severity (Critical/High/Medium/Low)
        
        ## Recommendations
        Specific actionable suggestions for improvement
        
        ## Score
        Rate each criterion 1-10 and provide weighted total.
        
        ## Verdict
        APPROVED / NEEDS_REVISION / REJECTED with justification
        """

        review_text = await self._call_llm(review_prompt)

        # Parse verdict
        verdict = self._parse_verdict(review_text)
        score = self._parse_score(review_text)

        result = TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=review_text,
            reasoning=f"Review completed with verdict: {verdict}",
            confidence=0.9,
            metadata={
                "verdict": verdict,
                "score": score,
                "criteria": self.review_criteria,
            },
        )

        # Store review in memory
        self.memory.store(
            f"review:{task.task_id}",
            review_text,
            category="reviews",
            importance=0.9,
            tags=["reviewer", "quality_check", verdict.lower()],
        )

        self.add_to_history("assistant", review_text)
        return result

    def _gather_review_context(self, task: TaskRequest) -> str:
        """Gather all relevant work products for review."""
        parts = []

        # From task context
        for ctx in task.context[-10:]:
            content = ctx.get("content", "")
            if content:
                parts.append(f"[Context]: {content[:500]}")

        # From memory - recent task results
        results = self.memory.get_task_history()
        for r in results[:5]:
            val = r.get("value", {})
            if isinstance(val, dict):
                agent = val.get("agent_name", "Unknown")
                output = val.get("output", "")[:400]
                parts.append(f"[{agent}]: {output}")

        # Code from memory
        code_entries = self.memory.search(category="code", min_importance=0.5)
        for entry in code_entries[:3]:
            val = entry.get("value", "")
            if isinstance(val, str):
                parts.append(f"[Code]: {val[:300]}")

        # Writing from memory
        writing_entries = self.memory.search(category="writing", min_importance=0.5)
        for entry in writing_entries[:3]:
            val = entry.get("value", "")
            if isinstance(val, str):
                parts.append(f"[Writing]: {val[:300]}")

        return "\n\n---\n\n".join(parts) if parts else "No work products found to review."

    def _parse_verdict(self, review_text: str) -> str:
        """Parse the verdict from review text."""
        text_upper = review_text.upper()
        if "REJECTED" in text_upper:
            return "REJECTED"
        elif "NEEDS_REVISION" in text_upper or "NEEDS REVISION" in text_upper:
            return "NEEDS_REVISION"
        elif "APPROVED" in text_upper:
            return "APPROVED"
        return "NEEDS_REVISION"

    def _parse_score(self, review_text: str) -> float:
        """Parse the overall score from review text."""
        import re

        # Look for patterns like "Score: 7.5" or "Total: 8/10"
        patterns = [
            r"(?:overall|total|weighted).*?score.*?(\d+\.?\d*)",
            r"score.*?(\d+\.?\d*)\s*/?\s*10",
            r"(\d+\.?\d*)\s*/\s*10",
        ]

        for pattern in patterns:
            match = re.search(pattern, review_text.lower())
            if match:
                score = float(match.group(1))
                return min(10.0, max(0.0, score))

        return 5.0  # Default neutral score

    async def handle_query(self, query: str) -> str:
        """Handle a quick review query."""
        prompt = f"Provide a brief quality assessment for:\n{query}"
        return await self._call_llm(prompt)

    async def _call_llm(self, prompt: str) -> str:
        """Call local LLM for review."""
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
            logger.error(f"Reviewer LLM call failed: {e}")
            return f"[Reviewer] Unable to complete review: {str(e)}"