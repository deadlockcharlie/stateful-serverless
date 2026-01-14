import asyncio
import json
import os
import re
import time
import httpx
from flask import request
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import TextMessage
from autogen_core import CancellationToken
from autogen_ext.models.openai import OpenAIChatCompletionClient

def parse_word_counts(response_text):
    """Parse the LLM response into a word_counts dictionary"""
    word_counts = {}
    
    # Try to parse various formats like "word": count or word: count
    # Pattern matches: "word": 1, 'word': 1, word: 1
    pattern = r'["\']?(\w+)["\']?\s*:\s*(\d+)'
    matches = re.findall(pattern, response_text)
    
    for word, count in matches:
        word_counts[word.lower()] = int(count)
    
    return word_counts

def main():
    """Fission handler - must be synchronous"""
    body = request.get_json() or {}
    agent_id = body.get("agent_id", "agent-0")
    chunk = body.get("chunk", "")
    state_manager_url = body.get("state_manager_url")
    session_id = body.get("session_id", "default")
    
    # Run the async code
    result = asyncio.run(process_chunk(agent_id, chunk, state_manager_url, session_id))
    # Return the body portion directly - Fission expects the response body
    return json.dumps(result.get("body", result))

async def process_chunk(agent_id, chunk, state_manager_url, session_id):
    """Async processing logic"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    MODEL_CLIENT = OpenAIChatCompletionClient(model="gpt-4o-2024-08-06", api_key=api_key)
    
    agent = AssistantAgent(
        name="assistant_agent",
        system_message="You are a helpful assistant",
        model_client=MODEL_CLIENT, 
    )
    
    response = await agent.on_messages(
        [TextMessage(content=f'Create a list of word : count, for all of the words that exist in this text, reply ONLY with the list of word:count and nothing else, for example if the text was "hello world" you reply with "hello": 2, "world": 1  {chunk}',
                     source="user")], CancellationToken()
    )
    
    response_text = response.chat_message.content
    word_counts = parse_word_counts(response_text)
    
    if state_manager_url:
        state_response = await send_result(word_counts, state_manager_url, session_id, agent_id)
        state_updated = True
    else:
        state_updated = False
        state_response = None
        
    await MODEL_CLIENT.close()
    
    return {
        "status": 200,
        "body": {
            "response": response_text,
            "word_counts": word_counts,
            "state_updated": state_updated,
            "session_id": session_id,
            "state_manager_response": state_response
        }
    }
    
    
async def send_result(word_counts, state_manager_url, session_id, agent_id):
    try:
        print(f"Sending results update to: {state_manager_url} for agent {agent_id}")
        print(f"Word counts: {word_counts}")
        
        data = {
            "operation": "update",
            "word_counts": word_counts,
            "session_id": session_id,
            "node_id": agent_id,
            "timestamp": time.time()
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                state_manager_url,
                json=data,
                headers={"Content-Type": "application/json"},
                timeout=10.0
            )
            
            print(f"State manager response: {response.status_code}")
            return response.json()
            
    except httpx.HTTPError as error:
        print(f"Error updating state manager: {error}")
        return {"error": str(error)}
    except Exception as error:
        print(f"Unexpected error: {error}")
        return {"error": str(error)}