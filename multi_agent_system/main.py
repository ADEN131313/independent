#!/usr/bin/env python3
"""
Multi-Agent System - Main Entry Point
======================================
A flexible multi-agent system where specialized AI agents collaborate
through a shared message bus and memory system to solve complex tasks.

Usage:
    python main.py                    # Interactive mode
    python main.py --task "..."       # Single task mode
    python main.py --demo             # Run demo
"""

import asyncio
import argparse
import logging
import sys
from typing import Optional

from config import AGENT_CONFIGS
from core.orchestrator import Orchestrator
from models.message import Priority
from utils.logger import setup_logging
from utils.helpers import truncate_text

logger = logging.getLogger(__name__)


async def interactive_mode(orchestrator: Orchestrator):
    """Run in interactive mode."""
    print("\n" + "=" * 60)
    print("  Multi-Agent System - Interactive Mode")
    print("=" * 60)
    print(f"  Available agents: {', '.join(orchestrator.agents.keys())}")
    print("  Commands:")
    print("    /status    - Show system status")
    print("    /agents    - List agents")
    print("    /pipeline  - Run pipeline: /pipeline agent1,agent2 task")
    print("    /direct    - Direct agent: /direct agent_name task")
    print("    /memory    - Show memory stats")
    print("    /quit      - Exit")
    print("  Or just type a task for the Coordinator to handle.")
    print("=" * 60 + "\n")

    while True:
        try:
            user_input = input("\n📝 Enter task: ").strip()

            if not user_input:
                continue

            if user_input.lower() in ("/quit", "/exit", "/q"):
                print("Goodbye!")
                break

            elif user_input.lower() == "/status":
                status = orchestrator.get_system_status()
                print("\n📊 System Status:")
                for name, info in status["agents"].items():
                    print(
                        f"  {name}: {info['status']} "
                        f"(completed: {info['tasks_completed']}, "
                        f"failed: {info['tasks_failed']})"
                    )
                print(f"  Memory: {status['memory']}")
                print(f"  Messages: {status['message_bus']['total_messages']}")
                continue

            elif user_input.lower() == "/agents":
                print("\n🤖 Available Agents:")
                for name, config in AGENT_CONFIGS.items():
                    print(f"  - {config.name} ({config.role}): {config.system_prompt[:80]}...")
                continue

            elif user_input.lower() == "/memory":
                stats = orchestrator.shared_memory.get_stats()
                print(f"\n🧠 Memory Stats: {stats}")
                continue

            elif user_input.lower().startswith("/pipeline "):
                parts = user_input[10:].split(" ", 1)
                if len(parts) < 2:
                    print("Usage: /pipeline agent1,agent2 task description")
                    continue
                agents = parts[0].split(",")
                task_desc = parts[1]
                print(f"\n🔄 Running pipeline: {' → '.join(agents)}")
                results = await orchestrator.submit_to_pipeline(task_desc, agents)
                for i, r in enumerate(results):
                    print(f"\n  Step {i+1} ({r.agent_name}): {truncate_text(r.output, 300)}")
                continue

            elif user_input.lower().startswith("/direct "):
                parts = user_input[8:].split(" ", 1)
                if len(parts) < 2:
                    print("Usage: /direct agent_name task description")
                    continue
                agent_name = parts[0].capitalize()
                task_desc = parts[1]
                print(f"\n🎯 Sending directly to {agent_name}...")
                result = await orchestrator.submit_task(
                    task_desc, target_agent=agent_name, timeout=60.0
                )
                print(f"\n  Result: {result.output}")
                continue

            # Default: send to coordinator
            print("\n🧠 Coordinator is processing your task...")
            result = await orchestrator.submit_task(
                user_input,
                target_agent="coordinator",
                priority=Priority.MEDIUM,
                timeout=120.0,
            )

            if result.success:
                print(f"\n✅ Result (confidence: {result.confidence:.0%}):")
                print(f"{result.output}")
                if result.reasoning:
                    print(f"\n💭 Reasoning: {result.reasoning}")
            else:
                print(f"\n❌ Task failed: {result.output}")

        except KeyboardInterrupt:
            print("\n\nInterrupted. Goodbye!")
            break
        except Exception as e:
            logger.error(f"Error in interactive mode: {e}")
            print(f"\n❌ Error: {e}")


async def single_task_mode(orchestrator: Orchestrator, task: str, agent: str = "coordinator"):
    """Execute a single task and exit."""
    print(f"Executing task: {task}")
    print(f"Target agent: {agent}\n")

    result = await orchestrator.submit_task(
        task,
        target_agent=agent,
        priority=Priority.HIGH,
        timeout=120.0,
    )

    if result.success:
        print(f"✅ Result:\n{result.output}")
    else:
        print(f"❌ Failed: {result.output}")
        sys.exit(1)


async def demo_mode(orchestrator: Orchestrator):
    """Run a demonstration of the system."""
    print("\n" + "=" * 60)
    print("  Multi-Agent System Demo")
    print("=" * 60)

    demos = [
        {
            "name": "Simple Task (Coordinator)",
            "task": "Explain the benefits of using a multi-agent system for software development.",
            "agent": "coordinator",
        },
        {
            "name": "Direct Research Task",
            "task": "What are the top 3 design patterns used in Python and why?",
            "agent": "researcher",
        },
        {
            "name": "Direct Coding Task",
            "task": "Write a Python function that implements a thread-safe LRU cache with TTL support.",
            "agent": "coder",
        },
        {
            "name": "Pipeline: Research → Write",
            "pipeline": ["researcher", "writer"],
            "task": "Explain how neural networks learn through backpropagation.",
        },
    ]

    for i, demo in enumerate(demos, 1):
        print(f"\n{'─' * 50}")
        print(f"Demo {i}: {demo['name']}")
        print(f"{'─' * 50}")

        if "pipeline" in demo:
            results = await orchestrator.submit_to_pipeline(
                demo["task"], demo["pipeline"]
            )
            for j, r in enumerate(results):
                print(f"\n  [{r.agent_name}]: {truncate_text(r.output, 400)}")
        else:
            result = await orchestrator.submit_task(
                demo["task"],
                target_agent=demo["agent"],
                timeout=90.0,
            )
            print(f"\n  {truncate_text(result.output, 500)}")

        print()

    # Print final status
    print("\n" + "=" * 60)
    print("  Demo Complete - System Status")
    print("=" * 60)
    status = orchestrator.get_system_status()
    for name, info in status["agents"].items():
        print(f"  {name}: completed={info['tasks_completed']}, failed={info['tasks_failed']}")


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Multi-Agent System")
    parser.add_argument("--task", type=str, help="Single task to execute")
    parser.add_argument(
        "--agent",
        type=str,
        default="coordinator",
        help="Target agent for single task",
    )
    parser.add_argument("--demo", action="store_true", help="Run demo mode")
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    parser.add_argument("--log-file", type=str, help="Log file path")
    parser.add_argument(
        "--agents",
        type=str,
        nargs="+",
        help="Specific agents to initialize",
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging(level=args.log_level, log_file=args.log_file)

    # Initialize orchestrator
    orchestrator = Orchestrator()
    await orchestrator.initialize(agent_names=args.agents)

    try:
        if args.demo:
            await demo_mode(orchestrator)
        elif args.task:
            await single_task_mode(orchestrator, args.task, args.agent)
        else:
            await interactive_mode(orchestrator)
    finally:
        await orchestrator.shutdown()


if __name__ == "__main__":
    asyncio.run(main())