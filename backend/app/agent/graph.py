"""LangGraph definition: a model node and a tools node with a conditional loop."""

from collections.abc import Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition


def build_graph(llm: BaseChatModel, tools: Sequence[BaseTool]) -> CompiledStateGraph:
    """Compile: START -> model -> (tools -> model)* -> END.

    The LLM is injected so tests can use a fake model with no network.
    """
    tool_list = list(tools)
    model = llm.bind_tools(tool_list)

    async def call_model(state: MessagesState) -> dict:
        response = await model.ainvoke(state["messages"])
        return {"messages": [response]}

    builder = StateGraph(MessagesState)
    builder.add_node("model", call_model)
    builder.add_node("tools", ToolNode(tool_list))
    builder.add_edge(START, "model")
    builder.add_conditional_edges("model", tools_condition)
    builder.add_edge("tools", "model")
    return builder.compile()
