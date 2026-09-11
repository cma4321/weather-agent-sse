import json

from langchain_core.messages import AIMessageChunk

from app.sse.encoder import encode_frame, to_sse


def test_frame_has_event_and_full_data():
    event = {"event": "on_tool_start", "name": "get_weather", "run_id": "r1", "data": {"input": {"city": "SP"}}}
    frame = encode_frame(event)
    assert frame.startswith("event: on_tool_start\ndata: ")
    assert frame.endswith("\n\n")
    payload = json.loads(frame[len("event: on_tool_start\ndata: ") : -2])
    assert payload == event


def test_pydantic_messages_are_dumped():
    chunk = AIMessageChunk(content="Olá")
    frame = encode_frame({"event": "on_chat_model_stream", "name": "m", "run_id": "r", "data": {"chunk": chunk}})
    payload = json.loads(frame.split("data: ", 1)[1])
    assert payload["data"]["chunk"]["content"] == "Olá"
    assert payload["data"]["chunk"]["type"] == "AIMessageChunk"


def test_unknown_objects_fall_back_to_str():
    class Weird:
        def __str__(self):
            return "weird"

    frame = encode_frame({"event": "x", "data": {"obj": Weird()}})
    assert json.loads(frame.split("data: ", 1)[1])["data"]["obj"] == "weird"


def test_newlines_in_strings_stay_on_one_data_line():
    frame = encode_frame({"event": "x", "data": {"text": "a\nb"}})
    assert frame.count("\n") == 3  # event line, data line, blank line


async def test_to_sse_encodes_each_event():
    async def events():
        yield {"event": "a", "data": {}}
        yield {"event": "b", "data": {}}

    frames = [f async for f in to_sse(events())]
    assert frames == ['event: a\ndata: {"event": "a", "data": {}}\n\n', 'event: b\ndata: {"event": "b", "data": {}}\n\n']


async def test_to_sse_turns_encoding_failure_into_error_frame():
    async def events():
        yield {"event": "a", "data": {}}
        yield {"data": {}}  # no "event" key -> KeyError inside encode_frame

    frames = [f async for f in to_sse(events())]
    assert frames[0].startswith("event: a\n")
    assert frames[1].startswith("event: error\ndata: ")
    assert '"message": "\'event\'"' in frames[1]
