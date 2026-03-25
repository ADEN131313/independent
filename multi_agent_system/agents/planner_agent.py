import json
import logging
from typing import Dict, List, Any, Optional

from agents.base_agent import BaseAgent
from config import AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import TaskRequest, TaskResult

logger = logging.getLogger(__name__)


class PlannerAgent(BaseAgent):
    """Agent specialized in creating detailed execution plans."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        super().__init__(config, message_bus, shared_memory)
        self.plans: Dict[str, Dict] = {}

    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Create a detailed plan for a task."""
        self.add_to_history("user", task.description)

        # Gather context
        context_str = self._build_context(task.context)

        planning_prompt = f"""
        Planning Task: {task.description}
        
        Context:
        {context_str}
        
        Constraints: {task.constraints}
        Expected Output: {task.expected_output}
        
        Create a comprehensive execution plan with:
        
        1. OBJECTIVE: Clear statement of the goal
        
        2. ANALYSIS:
           - Current state assessment
           - Key challenges identified
           - Resource requirements
           - Risk factors
        
        3. PHASES: Break into logical phases, each containing:
           - Phase name and description
           - Steps (numbered, with clear actions)
           - Deliverables
           - Estimated effort (Low/Medium/High)
           - Dependencies on other phases
        
        4. TIMELINE:
           - Sequential ordering
           - Parallel opportunities
           - Critical path
        
        5. RISK MITIGATION:
           - Identified risks with probability and impact
           - Mitigation strategies
           - Contingency plans
        
        6. SUCCESS CRITERIA:
           - Measurable outcomes
           - Quality gates
           - Acceptance criteria
        
        Format as a structured document. Be specific and actionable.
        """

        plan_text = await self._call_llm(planning_prompt)

        # Try to extract structured plan
        structured_plan = self._structure_plan(plan_text, task)

        # Store plan
        self.plans[task.task_id] = structured_plan
        self.memory.store(
            f"plan:{task.task_id}",
            structured_plan,
            category="plans",
            importance=0.9,
            tags=["planner", "execution_plan"],
        )

        result = TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=plan_text,
            reasoning="Created comprehensive execution plan with risk analysis",
            confidence=0.85,
            metadata={
                "structured_plan": structured_plan,
                "phases_count": len(structured_plan.get("phases", [])),
            },
        )

        self.add_to_history("assistant", plan_text)
        return result

    def _structure_plan(self, plan_text: str, task: TaskRequest) -> Dict[str, Any]:
        """Create a structured plan dict from the plan text."""
        return {
            "task_id": task.task_id,
            "objective": task.description,
            "plan_text": plan_text,
            "phases": self._extract_phases(plan_text),
            "created_by": self.name,
        }

    def _extract_phases(self, plan_text: str) -> List[Dict[str, str]]:
        """Extract phases from plan text."""
        phases = []
        lines = plan_text.split("\n")
        current_phase = None

        for line in lines:
            line = line.strip()
            if any(
                keyword in line.lower()
                               for keyword in ["phase", "step", "stage"]
            ) and any(c.isdigit() for c in line):
                if current_phase:
                    phases.append(current_phase)
                current_phase = {"name": line, "details": []}
            elif current_phase and line:
                current_phase["details"].append(line)

        if current_phase:
            phases.append(current_phase)

        return phases if phases else [{"name": "Default Phase", "details": [plan_text]}]

    def _build_context(self, task_context: List[Dict[str, str]]) -> str:
        """Build context from task context and memory."""
        parts = []

        for ctx in task_context[-5:]:
            content = ctx.get("content", "")
            if content:
                parts.append(content[:400])

        # Previous plans from memory
        plan_entries = self.memory.search(category="plans", min_importance=0.5)
        for entry in plan_entries[:2]:
            val = entry.get("value", {})
            if isinstance(val, dict):
                obj = val.get("objective", "N/A")
                parts.append(f"[Previous Plan Objective]: {obj}")

        return "\n".join(parts) if parts else "No additional context."

    async def _call_llm(self, prompt: str) -> str:
        """Call local LLM for planning."""
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
            logger.error(f"Planner LLM call failed: {e}")
            return f"[Planner] Unable to create plan: {str(e)}"