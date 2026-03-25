import asyncio
import logging
from typing import Dict, List, Optional, Any
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
from sentence_transformers import SentenceTransformer
import numpy as np

from config import system_config

logger = logging.getLogger(__name__)


class LocalAIService:
    """Local AI service using transformers for text generation and embeddings."""

    def __init__(self):
        self.device = self._get_device()
        self.model = None
        self.tokenizer = None
        self.embedder = None
        self._initialized = False

    def _get_device(self) -> str:
        """Determine the best available device."""
        if system_config.device != "auto":
            return system_config.device

        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    async def initialize(self):
        """Initialize the local AI models."""
        if self._initialized:
            return

        try:
            logger.info(f"Initializing local AI models on {self.device}")

            # Load conversational model
            self.tokenizer = AutoTokenizer.from_pretrained(system_config.model_name)
            self.model = AutoModelForCausalLM.from_pretrained(system_config.model_name)
            self.model.to(self.device)

            # Set padding token if not exists
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token

            # Load embedding model
            self.embedder = SentenceTransformer(system_config.embedding_model)
            self.embedder.to(self.device)

            self._initialized = True
            logger.info("Local AI models initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize local AI models: {e}")
            raise

    async def generate_text(
        self,
        prompt: str,
        max_length: int = None,
        temperature: float = None,
        system_prompt: str = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Generate text using the local conversational model."""
        if not self._initialized:
            await self.initialize()

        max_length = max_length or system_config.max_tokens
        temperature = temperature or system_config.temperature

        # Build full prompt
        full_prompt = ""
        if system_prompt:
            full_prompt += f"System: {system_prompt}\n\n"

        # Add conversation history
        if conversation_history:
            for msg in conversation_history[-5:]:  # Limit context
                role = msg.get("role", "user")
                content = msg.get("content", "")
                full_prompt += f"{role.title()}: {content}\n"

        full_prompt += f"User: {prompt}\nAssistant:"

        try:
            # Tokenize input
            inputs = self.tokenizer(
                full_prompt,
                return_tensors="pt",
                truncation=True,
                max_length=max_length,
                padding=True
            ).to(self.device)

            # Generate response
            with torch.no_grad():
                outputs = self.model.generate(
                    inputs["input_ids"],
                    attention_mask=inputs["attention_mask"],
                    max_length=max_length,
                    temperature=temperature,
                    do_sample=temperature > 0,
                    top_p=0.9,
                    num_return_sequences=1,
                    pad_token_id=self.tokenizer.pad_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                )

            # Decode response
            generated_text = self.tokenizer.decode(
                outputs[0][inputs["input_ids"].shape[1]:],
                skip_special_tokens=True
            ).strip()

            # Clean up response
            if generated_text.startswith("Assistant:"):
                generated_text = generated_text[10:].strip()
            if generated_text.startswith(prompt):
                generated_text = generated_text[len(prompt):].strip()

            return generated_text

        except Exception as e:
            logger.error(f"Text generation failed: {e}")
            return f"[Local AI Error] Unable to generate response: {str(e)}"

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for texts."""
        if not self._initialized:
            await self.initialize()

        try:
            embeddings = self.embedder.encode(texts, convert_to_numpy=True)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            # Return zero embeddings as fallback
            return [[0.0] * 384 for _ in texts]  # Assuming 384-dim embeddings

    async def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate semantic similarity between two texts."""
        embeddings = await self.generate_embeddings([text1, text2])
        if len(embeddings) < 2:
            return 0.0

        # Cosine similarity
        vec1 = np.array(embeddings[0])
        vec2 = np.array(embeddings[1])

        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))

    async def analyze_task_complexity(self, task_description: str) -> Dict[str, Any]:
        """Analyze task complexity using local reasoning."""
        if not self._initialized:
            await self.initialize()

        # Simple rule-based complexity analysis
        words = len(task_description.split())
        sentences = len([s for s in task_description.split('.') if s.strip()])
        keywords = ['complex', 'advanced', 'multiple', 'coordinate', 'integrate', 'optimize']

        complexity_score = 0
        complexity_score += min(words / 50, 5)  # Word count factor
        complexity_score += min(sentences / 3, 3)  # Sentence count factor
        complexity_score += sum(1 for kw in keywords if kw in task_description.lower())  # Keywords factor

        # Cap at 10
        complexity_score = min(complexity_score, 10)

        reasoning = await self.generate_text(
            f"Analyze the complexity of this task: {task_description[:200]}...",
            max_length=100,
            system_prompt="You are a task complexity analyzer. Provide a brief assessment."
        )

        return {
            "complexity_score": complexity_score,
            "estimated_effort": "low" if complexity_score < 3 else "medium" if complexity_score < 7 else "high",
            "requires_coordination": complexity_score > 5,
            "suggested_agents": self._suggest_agents_for_task(task_description, complexity_score),
            "reasoning": reasoning
        }

    def _suggest_agents_for_task(self, task_description: str, complexity: float) -> List[str]:
        """Suggest appropriate agents for a task."""
        suggestions = []

        desc_lower = task_description.lower()

        # Always include coordinator for complex tasks
        if complexity > 5:
            suggestions.append("coordinator")

        # Research-related
        if any(word in desc_lower for word in ['research', 'analyze', 'find', 'gather', 'investigate']):
            suggestions.append("researcher")

        # Writing-related
        if any(word in desc_lower for word in ['write', 'document', 'content', 'article', 'report']):
            suggestions.append("writer")

        # Coding-related
        if any(word in desc_lower for word in ['code', 'program', 'implement', 'develop', 'build']):
            suggestions.append("coder")

        # Review-related
        if any(word in desc_lower for word in ['review', 'evaluate', 'check', 'validate', 'test']):
            suggestions.append("reviewer")

        # Planning-related
        if any(word in desc_lower for word in ['plan', 'organize', 'schedule', 'strategy']):
            suggestions.append("planner")

        # Default to coordinator if no specific agents suggested
        if not suggestions:
            suggestions.append("coordinator")

        return list(set(suggestions))  # Remove duplicates


# Global instance
local_ai = LocalAIService()