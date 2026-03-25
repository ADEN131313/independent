import asyncio
from typing import Dict, List, Callable, Optional, Any
from collections import defaultdict
from datetime import datetime
import logging

from models.message import Message, MessageType, Priority

logger = logging.getLogger(__name__)


class MessageBus:
    """Central message bus for inter-agent communication."""

    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = defaultdict(list)
        self._message_history: List[Message] = []
        self._queues: Dict[str, asyncio.Queue] = {}
        self._middleware: List[Callable] = []
        self._running = False

    def subscribe(self, agent_name: str, callback: Callable):
        """Subscribe an agent to receive messages."""
        self._subscribers[agent_name].append(callback)
        if agent_name not in self._queues:
            self._queues[agent_name] = asyncio.Queue()
        logger.info(f"Agent '{agent_name}' subscribed to message bus")

    def unsubscribe(self, agent_name: str, callback: Callable):
        """Unsubscribe an agent from the message bus."""
        if agent_name in self._subscribers:
            self._subscribers[agent_name].remove(callback)

    def add_middleware(self, middleware: Callable):
        """Add middleware that processes every message."""
        self._middleware.append(middleware)

    async def publish(self, message: Message) -> bool:
        """Publish a message to the bus."""
        # Run middleware
        for mw in self._middleware:
            message = await mw(message) if asyncio.iscoroutinefunction(mw) else mw(message)
            if message is None:
                logger.debug("Message dropped by middleware")
                return False

        self._message_history.append(message)
        logger.info(
            f"Message [{message.type.value}] from '{message.sender}' "
            f"to '{message.receiver}' (priority: {message.priority.value})"
        )

        # Deliver to specific receiver
        if message.receiver in self._subscribers:
            for callback in self._subscribers[message.receiver]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(message)
                    else:
                        callback(message)
                except Exception as e:
                    logger.error(f"Error delivering message to {message.receiver}: {e}")

        # Deliver to broadcast subscribers
        if "*" in self._subscribers:
            for callback in self._subscribers["*"]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(message)
                    else:
                        callback(message)
                except Exception as e:
                    logger.error(f"Error in broadcast delivery: {e}")

        return True

    async def request_response(
        self, message: Message, timeout: float = 30.0
    ) -> Optional[Message]:
        """Send a message and wait for a response."""
        response_queue = asyncio.Queue()
        correlation_id = message.id

        async def response_handler(msg: Message):
            if msg.correlation_id == correlation_id:
                await response_queue.put(msg)

        self.subscribe(message.sender + "_response", response_handler)
        await self.publish(message)

        try:
            response = await asyncio.wait_for(response_queue.get(), timeout=timeout)
            return response
        except asyncio.TimeoutError:
            logger.warning(f"Request-response timeout for message {message.id}")
            return None
        finally:
            self.unsubscribe(message.sender + "_response", response_handler)

    def get_history(
        self,
        agent_name: Optional[str] = None,
        message_type: Optional[MessageType] = None,
        limit: int = 50,
    ) -> List[Message]:
        """Get message history with optional filters."""
        history = self._message_history

        if agent_name:
            history = [
                m
                for m in history
                if m.sender == agent_name or m.receiver == agent_name
            ]

        if message_type:
            history = [m for m in history if m.type == message_type]

        return history[-limit:]

    def clear_history(self):
        """Clear message history."""
        self._message_history.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get bus statistics."""
        return {
            "total_messages": len(self._message_history),
            "subscribers": list(self._subscribers.keys()),
            "message_types": {
                mt.value: sum(1 for m in self._message_history if m.type == mt)
                for mt in MessageType
            },
        }