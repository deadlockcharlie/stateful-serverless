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
    
    # Run the async code
    result = asyncio.run(process_chunk(agent_id, chunk, state_manager_url))
    # Return the body portion directly - Fission expects the response body
    return json.dumps(result.get("body", result))

async def process_chunk(agent_id, chunk, state_manager_url):
    """Async processing logic"""
    # Try environment variable first, then mounted secret file
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        try:
            with open("/secrets/default/openai-api-key/OPENAI_API_KEY", "r") as f:
                api_key = f.read().strip()
        except FileNotFoundError:
            pass
    
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment or mounted secret")
    MODEL_CLIENT = OpenAIChatCompletionClient(model="gpt-4o-2024-08-06", api_key=api_key)
    
    agent = AssistantAgent(
        name="assistant_agent",
        system_message="You are a helpful assistant",
        model_client=MODEL_CLIENT, 
    )
    
    try:
        response = await agent.on_messages(
            [TextMessage(content=f'Create a list of word : count, for all of the words that exist in this text, reply ONLY with the list of word:count and nothing else, for example if the text was "hello world" you reply with "hello": 2, "world": 1  {chunk}',
                         source="user")], CancellationToken()
        )

        response_text = response.chat_message.content
        word_counts = parse_word_counts(response_text)
        print(word_counts)

        if state_manager_url:
            state_response = await send_result(word_counts, state_manager_url, agent_id)
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
                "state_manager_response": state_response
            }
        }
    except Exception as e: 
        error_message = str(e)
        error_type = type(e).__name__
        print(f"ERROR in agent {agent_id}: {error_type}: {error_message}")
        import traceback
        traceback.print_exc()
        
        return {
            "status": 500,
            "body": {
                "error": error_message,
                "error_type": error_type,
                "agent_id": agent_id
            }
        }   
    
async def send_result(word_counts, state_manager_url, agent_id):
    try:
        print(f"Sending results update to: {state_manager_url} for agent {agent_id}")
        print(f"Word counts: {word_counts}")
        
        data = {
            "operation": "update",
            "word_counts": word_counts,
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