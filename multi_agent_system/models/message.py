from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from enum import Enum
from datetime import datetime
import uuid


class MessageType(str, Enum):
    TASK = "task"
    RESULT = "result"
    QUERY = "query"
    FEEDBACK = "feedback"
    ERROR = "error"
    STATUS = "status"
    PLAN = "plan"
    REVIEW = "review"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: MessageType
    sender: str
    receiver: str
    content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    priority: Priority = Priority.MEDIUM
    timestamp: datetime = Field(default_factory=datetime.now)
    parent_id: Optional[str] = None
    correlation_id: Optional[str] = None

    def to_context_dict(self) -> Dict[str, str]:
        return {
            "role": "assistant" if self.type == MessageType.RESULT else "user",
            "content": f"[{self.sender} -> {self.receiver}]: {self.content}",
        }


class TaskRequest(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    assigned_to: str
    context: List[Dict[str, str]] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    expected_output: str = ""
    priority: Priority = Priority.MEDIUM
    parent_task_id: Optional[str] = None
    dependencies: List[str] = Field(default_factory=list)


class TaskResult(BaseModel):
    task_id: str
    agent_name: str
    success: bool
    output: str
    reasoning: str = ""
    confidence: float = 0.8
    metadata: Dict[str, Any] = Field(default_factory=dict)
    sub_results: List["TaskResult"] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.now)


class AgentState(BaseModel):
    name: str
    status: str = "idle"
    current_task_id: Optional[str] = None
    tasks_completed: int = 0
    tasks_failed: int = 0
    last_active: datetime = Field(default_factory=datetime.now)
    capabilities: List[str] = Field(default_factory=list)