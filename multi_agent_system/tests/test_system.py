#!/usr/bin/env python3
"""Tests for the multi-agent system."""

import asyncio
import pytest
import logging

from config import AGENT_CONFIGS
from core.message_bus import MessageBus
from core.memory import SharedMemory
from core.orchestrator import Orchestrator
from models.message import (
    Message,
    MessageType,
    TaskRequest,
    TaskResult,
    Priority,
)
from agents.coordinator_agent import CoordinatorAgent
from agents.researcher_agent import ResearcherAgent
from agents.writer_agent import WriterAgent
from agents.coder_agent import CoderAgent
from agents.reviewer_agent import ReviewerAgent
from agents.planner_agent import PlannerAgent
)

logging.basicConfig(level=logging.WARNING)


# ── Message Tests ──────────────────────────────────────────


class TestMessage:
    def test_message_creation(self):
        msg = Message(
            type=MessageType.TASK,
            sender="Agent1",
            receiver="Agent2",
            content="Test content",
        )
        assert msg.sender == "Agent1"
        assert msg.receiver == "Agent2"
        assert msg.type == MessageType.TASK
        assert msg.priority == Priority.MEDIUM
        assert msg.id is not None

    def test_message_to_context_dict(self):
        msg = Message(
            type=MessageType.RESULT,
            sender="Writer",
            receiver="Coordinator",
            content="Here is the output",
        )
        ctx = msg.to_context_dict()
        assert "role" in ctx
        assert "content" in ctx
        assert "Writer" in ctx["content"]

    def test_task_request_creation(self):
        task = TaskRequest(
            description="Do something",
            assigned_to="Coder",
            constraints=["Be fast"],
        )
        assert task.description == "Do something"
        assert task.assigned_to == "Coder"
        assert "Be fast" in task.constraints

    def test_task_result_creation(self):
        result = TaskResult(
            task_id="test_123",
            agent_name="Researcher",
            success=True,
            output="Research complete",
            confidence=0.9,
        )
        assert result.success is True
        assert result.confidence == 0.9


# ── Message Bus Tests ──────────────────────────────────────


class TestMessageBus:
    @pytest.fixture
    def bus(self):
        return MessageBus()

    @pytest.mark.asyncio
    async def test_subscribe_and_publish(self, bus):
        received = []

        async def handler(msg):
            received.append(msg)

        bus.subscribe("TestAgent", handler)

        msg = Message(
            type=MessageType.TASK,
            sender="Sender",
            receiver="TestAgent",
            content="Hello",
        )
        await bus.publish(msg)

        assert len(received) == 1
        assert received[0].content == "Hello"

    @pytest.mark.asyncio
    async def test_broadcast(self, bus):
        received = []

        async def handler(msg):
            received.append(msg)

        bus.subscribe("*", handler)

        msg = Message(
            type=MessageType.STATUS,
            sender="System",
            receiver="Anyone",
            content="Broadcast",
        )
        await bus.publish(msg)

        assert len(received) == 1

    @pytest.mark.asyncio
    async def test_history(self, bus):
        for i in range(5):
            msg = Message(
                type=MessageType.TASK,
                sender="A",
                receiver="B",
                content=f"Msg {i}",
            )
            await bus.publish(msg)

        history = bus.get_history(limit=3)
        assert len(history) == 3

    def test_stats(self, bus):
        stats = bus.get_stats()
        assert "total_messages" in stats
        assert "subscribers" in stats


# ── Shared Memory Tests ────────────────────────────────────


class TestSharedMemory:
    @pytest.fixture
    def memory(self):
        return SharedMemory(max_entries=100)

    def test_store_and_retrieve(self, memory):
        memory.store("key1", "value1", category="test")
        result = memory.retrieve("key1")
        assert result == "value1"

    def test_retrieve_nonexistent(self, memory):
        result = memory.retrieve("nonexistent")
        assert result is None

    def test_search_by_category(self, memory):
        memory.store("k1", "v1", category="research")
        memory.store("k2", "v2", category="code")
        memory.store("k3", "v3", category="research")

        results = memory.search(category="research")
        assert len(results) == 2

    def test_search_by_importance(self, memory):
        memory.store("k1", "v1", importance=0.3)
        memory.store("k2", "v2", importance=0.8)
        memory.store("k3", "v3", importance=0.9)

        results = memory.search(min_importance=0.7)
        assert len(results) == 2

    def test_delete(self, memory):
        memory.store("key", "value")
        assert memory.delete("key") is True
        assert memory.retrieve("key") is None
        assert memory.delete("nonexistent") is False

    def test_clear(self, memory):
        memory.store("k1", "v1")
        memory.store("k2", "v2")
        memory.clear()
        assert memory.retrieve("k1") is None
        stats = memory.get_stats()
        assert stats["total_entries"] == 0

    def test_eviction(self, memory):
        small_memory = SharedMemory(max_entries=3)
        for i in range(5):
            small_memory.store(f"key_{i}", f"value_{i}", importance=0.5)

        assert small_memory.get_stats()["total_entries"] <= 3

    def test_store_task_result(self, memory):
        result = TaskResult(
            task_id="int_test",
            agent_name="Coder",
            success=True,
            output="Done",
        )
        memory.store_task_result(result)
        history = memory.get_task_history("Coder")
        assert len(history) >= 1

    def test_export(self, memory):
        memory.store("k1", "v1")
        exported = memory.export()
        assert "k1" in exported
        assert "v1" in exported


# ── Agent Tests ────────────────────────────────────────────


class TestAgents:
    @pytest.fixture
    def setup(self):
        bus = MessageBus()
        memory = SharedMemory()
        return bus, memory

    def test_researcher_init(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["researcher"]
        agent = ResearcherAgent(config, bus, memory)
        assert agent.name == "Researcher"
        assert agent.role == "research"
        assert agent.state.status == "idle"

    def test_writer_init(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["writer"]
        agent = WriterAgent(config, bus, memory)
        assert agent.name == "Writer"
        assert "technical" in agent.style_guides

    def test_coder_init(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["coder"]
        agent = CoderAgent(config, bus, memory)
        assert agent.name == "Coder"
        assert "python" in agent.supported_languages

    def test_coder_detect_task_type(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["coder"]
        agent = CoderAgent(config, bus, memory)

        assert agent._detect_task_type("fix this bug") == "debug"
        assert agent._detect_task_type("review this code") == "review"
        assert agent._detect_task_type("write tests for") == "test"
        assert agent._detect_task_type("refactor this module") == "refactor"
        assert agent._detect_task_type("create a new function") == "write"

    def test_coder_extract_code_blocks(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["coder"]
        agent = CoderAgent(config, bus, memory)

        text = 'Here is code:\n```python\nprint("hello")\n```\nAnd more:\n```js\nconsole.log("hi")\n```'
        blocks = agent._extract_code_blocks(text)
        assert len(blocks) == 2
        assert 'print("hello")' in blocks[0]

    def test_writer_detect_style(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["writer"]
        agent = WriterAgent(config, bus, memory)

        assert agent._detect_style("write API documentation") == "technical"
        assert agent._detect_style("write a casual blog post") == "casual"
        assert agent._detect_style("write a creative story") == "creative"
        assert agent._detect_style("write a formal report") == "formal"

    def test_reviewer_parse_verdict(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["reviewer"]
        agent = ReviewerAgent(config, bus, memory)

        assert agent._parse_verdict("Overall: APPROVED") == "APPROVED"
        assert agent._parse_verdict("Verdict: REJECTED") == "REJECTED"
        assert agent._parse_verdict("Status: NEEDS_REVISION") == "NEEDS_REVISION"

    def test_agent_status(self, setup):
        bus, memory = setup
        config = AGENT_CONFIGS["researcher"]
        agent = ResearcherAgent(config, bus, memory)

        status = agent.get_status()
        assert status["name"] == "Researcher"
        assert status["tasks_completed"] == 0


# ── Orchestrator Tests ─────────────────────────────────────


class TestOrchestrator:
    @pytest.fixture
    def orchestrator(self):
        return Orchestrator()

    @pytest.mark.asyncio
    async def test_initialize(self, orchestrator):
        await orchestrator.initialize(["researcher", "writer"])
        assert "researcher" in orchestrator.agents
        assert "writer" in orchestrator.agents
        assert "coordinator" not in orchestrator.agents

    @pytest.mark.asyncio
    async def test_initialize_all(self, orchestrator):
        await orchestrator.initialize()
        assert len(orchestrator.agents) == len(AGENT_CONFIGS)

    @pytest.mark.asyncio
    async def test_system_status(self, orchestrator):
        await orchestrator.initialize(["researcher"])
        status = orchestrator.get_system_status()
        assert "agents" in status
        assert "memory" in status
        assert "message_bus" in status


# ── Integration Tests ──────────────────────────────────────


class TestIntegration:
    @pytest.mark.asyncio
    async def test_message_flow(self):
        """Test that messages flow correctly between components."""
        bus = MessageBus()
        memory = SharedMemory()
        received = []

        async def handler(msg):
            received.append(msg)
            # Store in memory
            memory.store(f"msg:{msg.id}", msg.content, category="messages")

        bus.subscribe("Receiver", handler)

        msg = Message(
            type=MessageType.TASK,
            sender="Sender",
            receiver="Receiver",
            content="Integration test",
        )
        await bus.publish(msg)

        assert len(received) == 1
        assert memory.retrieve(f"msg:{msg.id}") == "Integration test"

    @pytest.mark.asyncio
    async def test_memory_persistence(self):
        """Test that task results persist in memory."""
        memory = SharedMemory()

        result = TaskResult(
            task_id="int_test",
            agent_name="Coder",
            success=True,
            output="Integration output",
        )
        memory.store_task_result(result)

        history = memory.get_task_history("Coder")
        assert len(history) >= 1

        stored = history[0]["value"]
        assert stored["output"] == "Integration output"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])