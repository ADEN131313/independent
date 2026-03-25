# Multi-Agent AI System

A modular, extensible multi-agent system where specialized AI agents collaborate
through a shared message bus and memory system to solve complex tasks using
**local AI models only** - no external API dependencies.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Orchestrator                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │               Message Bus                       │ │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │ │
│  │  │Coord │ │Resrch│ │Writer│ │ Coder│ │Review│ │ │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │ │
│  │  ┌──────┐                                       │ │
│  │  │Plannr│          ┌──────────────┐             │ │
│  │  └──────┘          │Shared Memory │             │ │
│  │                    └──────────────┘             │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Local AI Models

This system uses **local AI models only** - no external API calls:

- **Conversational Model**: Microsoft DialoGPT-medium (355M parameters)
- **Embedding Model**: Sentence Transformers all-MiniLM-L6-v2 (23M parameters)
- **Intelligence Scaling**: 1-1000 scale with agent-specific levels

## Agents

| Agent | Role | Intelligence | Description |
|-------|------|--------------|-------------|
| **Coordinator** | Orchestrator | 250 | Decomposes tasks, delegates, synthesizes results |
| **Researcher** | Research | 180 | Gathers information, analyzes data |
| **Writer** | Writing | 160 | Produces polished written content |
| **Coder** | Coding | 200 | Writes, debugs, tests, and reviews code |
| **Reviewer** | Review | 170 | Quality checks and constructive feedback |
| **Planner** | Planning | 190 | Creates detailed execution plans |

## Quick Start

```bash
# Install dependencies (may take several minutes to download models)
pip install -r requirements.txt

# Set up environment (optional - uses defaults if not set)
cp .env.example .env
# Edit .env to customize model settings if desired

# Run interactive mode
python main.py

# Run a single task
python main.py --task "Build a REST API for a todo app"

# Run demo
python main.py --demo

# Run tests
pytest tests/ -v
```

## Interactive Commands

| Command | Description |
|---------|-------------|
| `/status` | Show system status |
| `/agents` | List available agents |
| `/pipeline agent1,agent2 task` | Run task through pipeline |
| `/direct agent_name task` | Send task directly to agent |
| `/memory` | Show memory statistics |
| `/quit` | Exit |

## Project Structure

```
multi_agent_system/
├── main.py                  # Entry point
├── config.py                # Configuration & agent definitions
├── requirements.txt         # Dependencies
├── .env.example             # Environment template
├── README.md                # This file
├── agents/
│   ├── __init__.py
│   ├── base_agent.py        # Abstract base agent
│   ├── coordinator_agent.py # Task orchestrator
│   ├── researcher_agent.py  # Research specialist
│   ├── writer_agent.py      # Writing specialist
│   ├── coder_agent.py       # Coding specialist
│   ├── reviewer_agent.py    # Quality reviewer
│   └── planner_agent.py     # Planning specialist
├── core/
│   ├── __init__.py
│   ├── message_bus.py       # Inter-agent communication
│   ├── memory.py            # Shared knowledge storage
│   └── orchestrator.py      # Top-level system manager
├── models/
│   ├── __init__.py
│   └── message.py           # Data models
├── utils/
│   ├── __init__.py
│   ├── logger.py            # Logging setup
│   └── helpers.py           # Utility functions
└── tests/
    ├── __init__.py
    └── test_system.py       # Test suite
```

## Extending the System

### Adding a New Agent

1. Create a new file in `agents/`:
```python
from agents.base_agent import BaseAgent

class MyAgent(BaseAgent):
    async def execute_task(self, task):
        # Your implementation
        return TaskResult(...)
```

2. Add config in `config.py`:
```python
AGENT_CONFIGS["my_agent"] = AgentConfig(
    name="MyAgent",
    role="custom",
    system_prompt="You are...",
)
```

3. Register in `core/orchestrator.py`:
```python
AGENT_CLASSES["my_agent"] = MyAgent
```

### Custom Message Middleware

```python
async def my_middleware(message):
    # Transform or filter messages
    return message

orchestrator.message_bus.add_middleware(my_middleware)
```