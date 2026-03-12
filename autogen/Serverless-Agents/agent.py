import asyncio
import json
import os
import re
import time
import httpx
from flask import request
from typing import Dict
from autogen import AssistantAgent, UserProxyAgent
from autogen_core.tools import FunctionTool

async def word_count(text: str) -> Dict[str, int]:
    words = text.split()
    for word in words:
        word_count[word] = word_count.get(word, 0) + 1
    
    return word_count

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
    word_count_tool = FunctionTool(word_count, description="Return a dictionary of word:count")
    # Ollama config for autogen
    config_list = [
        {
            "model": "qwen2.5",
            "base_url": "http://ollama:11434/v1",
            "api_key": "ollama",  # dummy key for Ollama
        }
    ]
        
    user_proxy_agent = UserProxyAgent(
        name="User",
        human_input_mode="NEVER",
        max_consecutive_auto_reply=1,
    )
    user_proxy_agent.register_for_execution(name="word_count")(word_count)
    
    assistant_agent = AssistantAgent(
        name="assistant_agent",
        system_message="You are a helpful assistant that counts words.",
        llm_config={"config_list": config_list, "tools": [word_count_tool.schema]},
    )
    
    try:
        message = f'Run the word count for this text: {chunk}'
        
        chat_result = await user_proxy_agent.a_initiate_chat(
            assistant_agent,
            message=message,
            max_turns=1,
        )

        # Get all messages from chat history
        all_messages = []
        if chat_result.chat_history:
            for msg in chat_result.chat_history:
                content = msg.get("content", "")
                if content:
                    all_messages.append(content)
        
        response_text = "\n".join(all_messages)
    
        word_counts = {}
        if chat_result.chat_history:
            for msg in chat_result.chat_history:
                # Check for tool responses
                if msg.get("role") == "tool" or "tool_responses" in msg:
                    # Try to get the content which should be the tool return value
                    content = msg.get("content", "")
                    if isinstance(content, dict):
                        word_counts = content
                        break
                    elif isinstance(content, str):
                        try:
                            word_counts = json.loads(content)
                            break
                        except:
                            pass
                        
        #word_counts = parse_word_counts(response_text)
        #word_counts = chat_result
        print(word_counts)

        if state_manager_url:
            state_response = await send_result(word_counts, state_manager_url, agent_id)
            state_updated = True
        else:
            state_updated = False
            state_response = None

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