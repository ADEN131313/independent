import os
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional

load_dotenv()


class AgentConfig(BaseModel):
    name: str
    role: str
    model: str = os.getenv("DEFAULT_MODEL", "microsoft/DialoGPT-medium")
    temperature: float = float(os.getenv("TEMPERATURE", "0.7"))
    max_tokens: int = int(os.getenv("MAX_TOKENS", "512"))
    system_prompt: str = ""
    intelligence_level: int = 100  # Intelligence scaling level (1-1000)


class SystemConfig(BaseModel):
    model_config = {"protected_namespaces": ()}

    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    max_history: int = 50
    max_agents: int = 10
    # Local AI Model Configuration
    model_name: str = os.getenv("MODEL_NAME", "microsoft/DialoGPT-medium")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    max_tokens: int = int(os.getenv("MAX_TOKENS", "512"))
    temperature: float = float(os.getenv("TEMPERATURE", "0.7"))
    device: str = os.getenv("DEVICE", "auto")  # auto, cpu, cuda


# Agent Definitions
AGENT_CONFIGS = {
    "coordinator": AgentConfig(
        name="Coordinator",
        role="orchestrator",
        model="microsoft/DialoGPT-medium",
        temperature=0.3,
        intelligence_level=250,  # High coordination intelligence
        system_prompt=(
            "You are the Coordinator agent. Your job is to break down complex tasks "
            "into subtasks, assign them to the appropriate specialist agents, "
            "synthesize their results, and produce a final coherent output. "
            "You must reason about which agents to invoke and in what order. "
            "Always respond with structured plans."
        ),
    ),
    "researcher": AgentConfig(
        name="Researcher",
        role="research",
        model="microsoft/DialoGPT-medium",
        temperature=0.5,
        intelligence_level=180,  # Strong analytical intelligence
        system_prompt=(
            "You are the Researcher agent. You excel at gathering information, "
            "analyzing data, finding patterns, and producing well-sourced summaries. "
            "Always cite your reasoning and present findings clearly. "
            "When you don't know something, say so explicitly."
        ),
    ),
    "writer": AgentConfig(
        name="Writer",
        role="writing",
        model="microsoft/DialoGPT-medium",
        temperature=0.8,
        intelligence_level=160,  # Creative intelligence
        system_prompt=(
            "You are the Writer agent. You produce polished, engaging, and clear "
            "written content. You can adapt tone, style, and format to the audience. "
            "Focus on clarity, coherence, and compelling narrative structure."
        ),
    ),
    "coder": AgentConfig(
        name="Coder",
        role="coding",
        model="microsoft/DialoGPT-medium",
        temperature=0.2,
        intelligence_level=200,  # Technical precision intelligence
        system_prompt=(
            "You are the Coder agent. You write clean, efficient, well-documented "
            "code. You follow best practices, include error handling, write tests, "
            "and explain your implementation decisions. "
            "Always include docstrings and type hints."
        ),
    ),
    "reviewer": AgentConfig(
        name="Reviewer",
        role="review",
        model="microsoft/DialoGPT-medium",
        temperature=0.3,
        intelligence_level=170,  # Analytical evaluation intelligence
        system_prompt=(
            "You are the Reviewer agent. You critically evaluate work produced by "
            "other agents. You check for correctness, completeness, quality, and "
            "potential issues. Provide constructive feedback with specific suggestions "
            "for improvement. Rate work on a scale of 1-10."
        ),
    ),
    "planner": AgentConfig(
        name="Planner",
        role="planning",
        model="microsoft/DialoGPT-medium",
        temperature=0.4,
        intelligence_level=190,  # Strategic planning intelligence
        system_prompt=(
            "You are the Planner agent. You create detailed, step-by-step plans "
            "for accomplishing complex tasks. You identify dependencies, risks, "
            "and resource requirements. Your plans are actionable and prioritized."
        ),
    ),
}

system_config = SystemConfig()