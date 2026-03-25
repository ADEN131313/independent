import json
import logging
from typing import Dict, List, Optional, Any

from agents.base_agent import BaseAgent
from config import AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import (
    TaskRequest,
    TaskResult,
    MessageType,
    Priority,
    Message,
)

logger = logging.getLogger(__name__)

AGENT_LIST = ["Researcher", "Writer", "Coder", "Reviewer", "Planner"]


class CoordinatorAgent(BaseAgent):
    """Orchestrator agent that decomposes tasks and coordinates other agents."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        super().__init__(config, message_bus, shared_memory)
        self.active_plans: Dict[str, Dict] = {}
        self.subtask_results: Dict[str, List[TaskResult]] = {}

    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Decompose and coordinate a complex task."""
        self.add_to_history("user", task.description)

        # Step 1: Plan the task
        plan = await self._create_plan(task)
        self.active_plans[task.task_id] = plan
        self.memory.store(
            f"plan:{task.task_id}",
            plan,
            category="plans",
            importance=0.9,
            tags=["coordinator", "plan"],
        )

        # Step 2: Execute subtasks
        results = await self._execute_plan(task.task_id, plan, task.context)

        # Step 3: Synthesize results
        synthesis = await self._synthesize_results(task, plan, results)

        result = TaskResult(
            task_id=task.task_id,
            agent_name=self.name,
            success=True,
            output=synthesis,
            reasoning=f"Coordinated {len(results)} subtasks across agents",
            confidence=0.85,
            sub_results=results,
            metadata={"plan": plan},
        )

        self.add_to_history("assistant", synthesis)
        return result

    async def _create_plan(self, task: TaskRequest) -> Dict[str, Any]:
        """Create an execution plan for the task."""
        plan_prompt = f"""
        Task: {task.description}
        Constraints: {task.constraints}
        Expected Output: {task.expected_output}
        Available Agents: {AGENT_LIST}

        Create a step-by-step execution plan. For each step specify:
        1. step_id (sequential number)
        2. description (what to do)
        3. assigned_agent (which agent handles this)
        4. depends_on (list of step_ids this depends on, empty if independent)
        5. expected_output (what this step should produce)

        Return valid JSON:
        {{
            "steps": [
                {{
                    "step_id": 1,
                    "description": "...",
                    "assigned_agent": "...",
                    "depends_on": [],
                    "expected_output": "..."
                }}
            ],
            "strategy": "sequential|parallel|hybrid"
        }}
        """

        # Use LLM to generate plan
        plan_text = await self._call_llm(plan_prompt)

        try:
            plan = json.loads(plan_text)
        except json.JSONDecodeError:
            # Fallback: create a simple sequential plan
            plan = {
                "steps": [
                    {
                        "step_id": 1,
                        "description": "Research and gather information",
                        "assigned_agent": "Researcher",
                        "depends_on": [],
                        "expected_output": "Research summary",
                    },
                    {
                        "step_id": 2,
                        "description": "Create a detailed plan",
                        "assigned_agent": "Planner",
                        "depends_on": [1],
                        "expected_output": "Execution plan",
                    },
                    {
                        "step_id": 3,
                        "description": "Execute the main work",
                        "assigned_agent": "Coder",
                        "depends_on": [2],
                        "expected_output": "Working implementation",
                    },
                    {
                        "step_id": 4,
                        "description": "Write documentation",
                        "assigned_agent": "Writer",
                        "depends_on": [3],
                        "expected_output": "Documentation",
                    },
                    {
                        "step_id": 5,
                        "description": "Review everything",
                        "assigned_agent": "Reviewer",
                        "depends_on": [3, 4],
                        "expected_output": "Review report",
                    },
                ],
                "strategy": "hybrid",
            }

        logger.info(f"Created plan with {len(plan['steps'])} steps")
        return plan

    async def _execute_plan(
        self,
        task_id: str,
        plan: Dict[str, Any],
        context: List[Dict[str, str]],
    ) -> List[TaskResult]:
        """Execute a plan step by step."""
        results: List[TaskResult] = []
        completed_steps: set = set()
        steps = plan.get("steps", [])

        max_iterations = len(steps) * 2
        iteration = 0

        while len(completed_steps) < len(steps) and iteration < max_iterations:
            iteration += 1

            for step in steps:
                step_id = step["step_id"]
                if step_id in completed_steps:
                    continue

                # Check dependencies
                deps = step.get("depends_on", [])
                if not all(d in completed_steps for d in deps):
                    continue

                # Execute step
                agent_name = step["assigned_agent"]
                subtask = TaskRequest(
                    description=step["description"],
                    assigned_to=agent_name,
                    context=context + [
                        {"role": "system", "content": f"Previous results: {[r.output[:200] for r in results[-3:]]}"}
                    ],
                    expected_output=step.get("expected_output", ""),
                    parent_task_id=task_id,
                )

                result = await self._delegate_task(agent_name, subtask)
                results.append(result)
                completed_steps.add(step_id)

                logger.info(
                    f"Step {step_id} completed by {agent_name}: "
                    f"success={result.success}"
                )

        return results

    async def _delegate_task(self, agent_name: str, task: TaskRequest) -> TaskResult:
        """Delegate a task to a specific agent and wait for result."""
        import asyncio

        result_queue = asyncio.Queue()

        async def capture_result(message: Message):
            if (
                message.type == MessageType.RESULT
                and message.correlation_id
            ):
                await result_queue.put(message)

        self.message_bus.subscribe(self.name + "_delegate", capture_result)

        try:
            msg = Message(
                type=MessageType.TASK,
                sender=self.name,
                receiver=agent_name,
                content=task.description,
                metadata={
                    "task_id": task.task_id,
                    "task_request": task.model_dump(mode="json"),
                },
                priority=task.priority,
            )
            await self.message_bus.publish(msg)

            response = await asyncio.wait_for(result_queue.get(), timeout=60.0)

            return TaskResult(
                task_id=task.task_id,
                agent_name=agent_name,
                success=response.metadata.get("success", True),
                output=response.content,
                reasoning=response.metadata.get("reasoning", ""),
                confidence=response.metadata.get("confidence", 0.8),
            )

        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for {agent_name} on task {task.task_id}")
            return TaskResult(
                task_id=task.task_id,
                agent_name=agent_name,
                success=False,
                output=f"Agent {agent_name} timed out",
                confidence=0.0,
            )
        finally:
            self.message_bus.unsubscribe(self.name + "_delegate", capture_result)

    async def _synthesize_results(
        self,
        task: TaskRequest,
        plan: Dict[str, Any],
        results: List[TaskResult],
    ) -> str:
        """Synthesize all subtask results into a final output."""
        results_summary = "\n\n".join(
            f"=== {r.agent_name} (Step) ===\n{r.output}\nConfidence: {r.confidence}"
            for r in results
        )

        synthesis_prompt = f"""
        Original Task: {task.description}
        
        Plan Executed: {json.dumps(plan, indent=2)}
        
        Results from all agents:
        {results_summary}
        
        Synthesize these results into a comprehensive, coherent final output.
        Address any conflicts between results and provide a unified response.
        """

        synthesis = await self._call_llm(synthesis_prompt)
        return synthesis

    async def _call_llm(self, prompt: str) -> str:
        """Call the local LLM for planning and synthesis."""
        try:
            from core.local_ai import local_ai

            content = await local_ai.generate_text(
                prompt=prompt,
                system_prompt=self.config.system_prompt,
                conversation_history=self.conversation_history[-10:],
                max_length=self.config.max_tokens,
                temperature=self.config.temperature,
            )

            self.add_to_history("user", prompt)
            self.add_to_history("assistant", content)
            return content

        except Exception as e:
            logger.error(f"Local LLM call failed: {e}")
            # Fallback: return structured response
            return json.dumps({"error": str(e), "fallback": True})