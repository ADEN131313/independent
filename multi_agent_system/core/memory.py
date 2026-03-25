from typing import Dict, List, Optional, Any
from datetime import datetime
from collections import deque
import json
import logging

from models.message import TaskResult

logger = logging.getLogger(__name__)


class MemoryEntry:
    """A single memory entry."""

    def __init__(
        self,
        key: str,
        value: Any,
        category: str = "general",
        importance: float = 0.5,
        tags: Optional[List[str]] = None,
    ):
        self.key = key
        self.value = value
        self.category = category
        self.importance = importance
        self.tags = tags or []
        self.created_at = datetime.now()
        self.accessed_at = datetime.now()
        self.access_count = 0

    def access(self):
        self.accessed_at = datetime.now()
        self.access_count += 1

    def to_dict(self) -> Dict:
        return {
            "key": self.key,
            "value": self.value,
            "category": self.category,
            "importance": self.importance,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "accessed_at": self.accessed_at.isoformat(),
            "access_count": self.access_count,
        }


class SharedMemory:
    """Shared memory store accessible by all agents."""

    def __init__(self, max_entries: int = 1000):
        self._store: Dict[str, MemoryEntry] = {}
        self._max_entries = max_entries
        self._access_log: deque = deque(maxlen=500)

    def store(
        self,
        key: str,
        value: Any,
        category: str = "general",
        importance: float = 0.5,
        tags: Optional[List[str]] = None,
    ) -> str:
        """Store a value in shared memory."""
        if len(self._store) >= self._max_entries:
            self._evict()

        entry = MemoryEntry(key, value, category, importance, tags)
        self._store[key] = entry
        self._access_log.append(
            {"action": "store", "key": key, "timestamp": datetime.now().isoformat()}
        )
        logger.debug(f"Stored memory entry: {key} (category: {category})")
        return key

    def retrieve(self, key: str) -> Optional[Any]:
        """Retrieve a value from shared memory."""
        if key in self._store:
            entry = self._store[key]
            entry.access()
            self._access_log.append(
                {
                    "action": "retrieve",
                    "key": key,
                    "timestamp": datetime.now().isoformat(),
                }
            )
            return entry.value
        return None

    def search(
        self,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        min_importance: float = 0.0,
    ) -> List[Dict]:
        """Search memory entries by category, tags, or importance."""
        results = []
        for entry in self._store.values():
            if category and entry.category != category:
                continue
            if tags and not any(t in entry.tags for t in tags):
                continue
            if entry.importance < min_importance:
                continue
            entry.access()
            results.append(entry.to_dict())

        results.sort(key=lambda x: x["importance"], reverse=True)
        return results

    def store_task_result(self, result: TaskResult):
        """Store a task result in memory."""
        key = f"task_result:{result.task_id}:{result.agent_name}"
        self.store(
            key,
            result.model_dump(),
            category="task_results",
            importance=0.8 if result.success else 0.6,
            tags=[result.agent_name, "task_result"],
        )

    def get_task_history(self, agent_name: Optional[str] = None) -> List[Dict]:
        """Get task result history."""
        results = self.search(category="task_results")
        if agent_name:
            results = [r for r in results if agent_name in r.get("tags", [])]
        return results

    def _evict(self):
        """Evict least important/least accessed entries."""
        entries = sorted(
            self._store.values(),
            key=lambda e: (e.importance, e.access_count, e.created_at),
        )
        for entry in entries[: max(1, len(entries) // 10)]:
            del self._store[entry.key]
            logger.debug(f"Evicted memory entry: {entry.key}")

    def delete(self, key: str) -> bool:
        """Delete a memory entry."""
        if key in self._store:
            del self._store[key]
            return True
        return False

    def clear(self):
        """Clear all memory."""
        self._store.clear()
        self._access_log.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        categories = {}
        for entry in self._store.values():
            cat = entry.category
            categories[cat] = categories.get(cat, 0) + 1

        return {
            "total_entries": len(self._store),
            "categories": categories,
            "max_entries": self._max_entries,
        }

    def export(self) -> str:
        """Export memory as JSON."""
        return json.dumps(
            {k: v.to_dict() for k, v in self._store.items()},
            indent=2,
            default=str,
        )