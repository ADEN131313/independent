import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from config import AGENT_CONFIGS, AgentConfig
from core.message_bus import MessageBus
from core.memory import SharedMemory
from agents.coordinator_agent import CoordinatorAgent
from agents.researcher_agent import ResearcherAgent
from agents.writer_agent import WriterAgent
from agents.coder_agent import CoderAgent
from agents.reviewer_agent import ReviewerAgent
from agents.planner_agent import PlannerAgent
from agents.base_agent import BaseAgent
from models.message import (
    Message,
    MessageType,
    TaskRequest,
    TaskResult,
    Priority,
)

logger = logging.getLogger(__name__)

AGENT_CLASSES = {
    "coordinator": CoordinatorAgent,
    "researcher": ResearcherAgent,
    "writer": WriterAgent,
    "coder": CoderAgent,
    "reviewer": ReviewerAgent,
    "planner": PlannerAgent,
}


class Orchestrator:
    """Top-level orchestrator that manages the entire multi-agent system."""

    def __init__(self):
        self.message_bus = MessageBus()
        self.shared_memory = SharedMemory()
        self.agents: Dict[str, BaseAgent] = {}
        self.task_queue: asyncio.Queue = asyncio.Queue()
        self.results: Dict[str, TaskResult] = {}
        self._running = False
        self._task_counter = 0

        logger.info("Orchestrator initialized")

    async def initialize(self, agent_names: Optional[List[str]] = None):
        """Initialize agents."""
        if agent_names is None:
            agent_names = list(AGENT_CONFIGS.keys())

        for name in agent_names:
            if name in AGENT_CONFIGS and name in AGENT_CLASSES:
                config = AGENT_CONFIGS[name]
                agent_class = AGENT_CLASSES[name]
                agent = agent_class(config, self.message_bus, self.shared_memory)
                self.agents[name] = agent
                logger.info(f"Initialized agent: {name}")

        logger.info(f"Orchestrator ready with {len(self.agents)} agents")

    async def submit_task(
        self,
        description: str,
        target_agent: str = "coordinator",
        priority: Priority = Priority.MEDIUM,
        constraints: Optional[List[str]] = None,
        expected_output: str = "",
        timeout: float = 120.0,
    ) -> TaskResult:
        """Submit a task to the system."""
        self._task_counter += 1
        task_id = f"task_{self._task_counter}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        task = TaskRequest(
            task_id=task_id,
            description=description,
            assigned_to=target_agent,
            constraints=constraints or [],
            expected_output=expected_output,
            priority=priority,
        )

        logger.info(f"Submitting task {task_id} to {target_agent}: {description[:100]}")

        # Store task in memory
        self.shared_memory.store(
            f"task:{task_id}",
            task.model_dump(),
            category="tasks",
            importance=0.8,
            tags=["orchestrator", "task"],
        )

        # Send task to target agent
        message = Message(
            type=MessageType.TASK,
            sender="Orchestrator",
            receiver=target_agent,
            content=description,
            priority=priority,
            metadata={
                "task_id": task_id,
                "task_request": task.model_dump(mode="json"),
            },
        )

        # Set up result capture
        result_future = asyncio.Future()

        async def capture_result(message: Message):
            if (
                message.type == MessageType.RESULT
                and message.metadata.get("task_id") == task_id
            ):
                result = TaskResult(
                    task_id=task_id,
                    agent_name=message.sender,
                    success=message.metadata.get("success", True),
                    output=message.content,
                    reasoning=message.metadata.get("reasoning", ""),
                    confidence=message.metadata.get("confidence", 0.8),
                )
                self.results[task_id] = result
                self.shared_memory.store_task_result(result)
                if not result_future.done():
                    result_future.set_result(result)

        self.message_bus.subscribe("Orchestrator_listener", capture_result)

        try:
            await self.message_bus.publish(message)
            result = await asyncio.wait_for(result_future, timeout=timeout)
            logger.info(f"Task {task_id} completed: success={result.success}")
            return result

        except asyncio.TimeoutError:
            logger.warning(f"Task {task_id} timed out after {timeout}s")
            return TaskResult(
                task_id=task_id,
                agent_name=target_agent,
                success=False,
                output=f"Task timed out after {timeout} seconds",
                confidence=0.0,
            )
        finally:
            self.message_bus.unsubscribe("Orchestrator_listener", capture_result)

    async def submit_to_pipeline(
        self,
        description: str,
        pipeline: List[str],
        constraints: Optional[List[str]] = None,
        timeout_per_step: float = 60.0,
    ) -> List[TaskResult]:
        """Submit a task through a pipeline of agents sequentially."""
        results = []
        context = []
        constraints = constraints or []

        for i, agent_name in enumerate(pipeline):
            logger.info(f"Pipeline step {i + 1}/{len(pipeline)}: {agent_name}")

            step_task = TaskRequest(
                description=f"Pipeline step {i + 1}: {description}",
                assigned_to=agent_name,
                context=context,
                constraints=constraints,
                expected_output=f"Output from {agent_name} for step {i + 1}",
            )

            step_result = await self.submit_task(
                description=step_task.description,
                target_agent=agent_name,
                constraints=constraints,
                timeout=timeout_per_step,
            )

            results.append(step_result)
            context.append(
                {
                    "role": "assistant",
                    "content": f"[{agent_name}]: {step_result.output[:500]}",
                }
            )

            # If a step fails critically, stop the pipeline
            if not step_result.success and step_result.confidence < 0.3:
                logger.warning(f"Pipeline stopped at step {i + 1} due to failure")
                break

        return results

    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status."""
        return {
            "agents": {
                name: agent.get_status() for name, agent in self.agents.items()
            },
            "memory": self.shared_memory.get_stats(),
            "message_bus": self.message_bus.get_stats(),
            "tasks_completed": len(self.results),
            "running": self._running,
        }

    async def shutdown(self):
        """Gracefully shutdown the system."""
        self._running = False
        for name, agent in self.agents.items():
            await agent.shutdown()
        logger.info("Orchestrator shut down complete")