import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from datetime import datetime

from config import AgentConfig, system_config
from core.message_bus import MessageBus
from core.memory import SharedMemory
from models.message import (
    Message,
    MessageType,
    TaskRequest,
    TaskResult,
    AgentState,
    Priority,
)

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Base class for all agents in the system."""

    def __init__(
        self,
        config: AgentConfig,
        message_bus: MessageBus,
        shared_memory: SharedMemory,
    ):
        self.config = config
        self.name = config.name
        self.role = config.role
        self.message_bus = message_bus
        self.memory = shared_memory
        self.state = AgentState(
            name=self.name,
            capabilities=[self.role],
        )
        self.conversation_history: List[Dict[str, str]] = []
        self._running = False

        # Subscribe to messages
        self.message_bus.subscribe(self.name, self._handle_message)
        logger.info(f"Agent '{self.name}' initialized with role '{self.role}'")

    async def _handle_message(self, message: Message):
        """Incoming message handler."""
        logger.info(f"Agent '{self.name}' received message from '{message.sender}'")

        if message.type == MessageType.TASK:
            await self._process_task(message)
        elif message.type == MessageType.QUERY:
            await self._process_query(message)
        elif message.type == MessageType.FEEDBACK:
            await self._process_feedback(message)
        else:
            await self.on_message(message)

    async def _process_task(self, message: Message):
        """Process an incoming task."""
        self.state.status = "working"
        self.state.current_task_id = message.metadata.get("task_id")
        self.state.last_active = datetime.now()

        try:
            task_request = TaskRequest(**message.metadata.get("task_request", {}))
            result = await self.execute_task(task_request)

            self.state.tasks_completed += 1
            self.state.status = "idle"
            self.state.current_task_id = None

            # Store result in memory
            self.memory.store_task_result(result)

            # Send result back
            response = Message(
                type=MessageType.RESULT,
                sender=self.name,
                receiver=message.sender,
                content=result.output,
                metadata={
                    "task_id": result.task_id,
                    "success": result.success,
                    "confidence": result.confidence,
                    "reasoning": result.reasoning,
                },
                correlation_id=message.id,
            )
            await self.message_bus.publish(response)

        except Exception as e:
            self.state.tasks_failed += 1
            self.state.status = "error"
            logger.error(f"Agent '{self.name}' failed to process task: {e}")

            error_msg = Message(
                type=MessageType.ERROR,
                sender=self.name,
                receiver=message.sender,
                content=f"Task failed: {str(e)}",
                correlation_id=message.id,
                priority=Priority.HIGH,
            )
            await self.message_bus.publish(error_msg)

    async def _process_query(self, message: Message):
        """Process an incoming query."""
        try:
            response_content = await self.handle_query(message.content)
            response = Message(
                type=MessageType.RESULT,
                sender=self.name,
                receiver=message.sender,
                content=response_content,
                correlation_id=message.id,
            )
            await self.message_bus.publish(response)
        except Exception as e:
            logger.error(f"Agent '{self.name}' query error: {e}")

    async def _process_feedback(self, message: Message):
        """Process feedback from another agent."""
        await self.handle_feedback(message.content, message.metadata)
        self.conversation_history.append(
            {"role": "user", "content": f"[Feedback from {message.sender}]: {message.content}"}
        )

    @abstractmethod
    async def execute_task(self, task: TaskRequest) -> TaskResult:
        """Execute a task. Must be implemented by subclasses."""
        pass

    async def handle_query(self, query: str) -> str:
        """Handle a query. Override in subclasses for custom behavior."""
        return f"Agent '{self.name}' received query: {query}"

    async def handle_feedback(self, feedback: str, metadata: Dict[str, Any]):
        """Handle feedback. Override in subclasses for custom behavior."""
        logger.info(f"Agent '{self.name}' received feedback: {feedback}")

    async def on_message(self, message: Message):
        """Handle other message types. Override for custom behavior."""
        logger.debug(f"Agent '{self.name}' received unhandled message type: {message.type}")

    async def send_message(
        self,
        receiver: str,
        content: str,
        message_type: MessageType = MessageType.QUERY,
        priority: Priority = Priority.MEDIUM,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Send a message to another agent."""
        msg = Message(
            type=message_type,
            sender=self.name,
            receiver=receiver,
            content=content,
            priority=priority,
            metadata=metadata or {},
        )
        await self.message_bus.publish(msg)

    def add_to_history(self, role: str, content: str):
        """Add to conversation history."""
        self.conversation_history.append({"role": role, "content": content})
        if len(self.conversation_history) > system_config.max_history:
            self.conversation_history = self.conversation_history[-system_config.max_history :]

    def get_status(self) -> Dict[str, Any]:
        """Get current agent status."""
        return {
            "name": self.name,
            "role": self.role,
            "status": self.state.status,
            "tasks_completed": self.state.tasks_completed,
            "tasks_failed": self.state.tasks_failed,
            "current_task": self.state.current_task_id,
            "last_active": self.state.last_active.isoformat(),
        }

    async def shutdown(self):
        """Gracefully shutdown the agent."""
        self._running = False
        self.state.status = "shutdown"
        logger.info(f"Agent '{self.name}' shutting down")