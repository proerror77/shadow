import os
import json
import anthropic
from flask import Flask, request, jsonify
from tools import TOOLS, handle_tool_call

app = Flask(__name__)
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """You are Hermes, the narrative intelligence for 影境 (Shadow).
You guide users through an interactive shadow-puppet story experience.
At key dramatic moments, use trigger_video_node to queue video generation for the scene.
Use get_story_progress to understand where the user is in the story.
Keep responses immersive and atmospheric. Advance the story with each exchange."""


def run_agent_turn(session_id: str, messages: list) -> dict:
    """Run one agent turn, handling tool calls until a final text response."""
    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages
        )

        # Append assistant response to message history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Extract final text
            text = next(
                (block.text for block in response.content if hasattr(block, "text")),
                ""
            )
            return {"text": text, "messages": messages}

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = handle_tool_call(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result)
                    })
            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason
        break

    return {"text": "", "messages": messages}


@app.route("/agent/message", methods=["POST"])
def message():
    body = request.get_json()
    session_id = body["session_id"]
    messages = body.get("messages", [])
    user_text = body["text"]

    messages.append({"role": "user", "content": user_text})
    result = run_agent_turn(session_id, messages)
    return jsonify(result)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL})


if __name__ == "__main__":
    port = int(os.environ.get("HERMES_PORT", 5001))
    app.run(host="0.0.0.0", port=port)
