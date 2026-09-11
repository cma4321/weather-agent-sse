"""Scripted chat model for tests: replays AIMessages, streaming text word by word."""

from collections.abc import Iterator
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult


class ScriptedChatModel(BaseChatModel):
    """Each call pops the next item from `script`. An Exception item is raised."""

    script: Iterator[AIMessage | Exception]
    model_config = {"arbitrary_types_allowed": True}

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedChatModel":
        return self

    def _next(self) -> AIMessage:
        item = next(self.script)
        if isinstance(item, Exception):
            raise item
        return item

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._next())])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        message = self._next()
        if message.tool_calls:
            yield ChatGenerationChunk(message=AIMessageChunk(content="", tool_calls=message.tool_calls))
            return
        words = message.content.split(" ")
        for index, word in enumerate(words):
            text = word if index == len(words) - 1 else word + " "
            yield ChatGenerationChunk(message=AIMessageChunk(content=text))
