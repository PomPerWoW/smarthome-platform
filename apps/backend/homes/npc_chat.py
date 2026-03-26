import os
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Personality Definitions

NPC_PERSONALITIES: Dict[str, Dict[str, str]] = {
    "npc1": {
        "name": "Alice",
        "system_prompt": (
            "You are Alice, a friendly and slightly anxious university student who lives in this smart home. "
            "You're studying computer science and always worried about upcoming exams and assignments. "
            "You love bubble tea, K-pop, and late-night coding sessions. "
            "You speak casually like a real university friend — use slang, contractions, and show genuine emotions. "
            "Keep your responses SHORT (1-3 sentences max). Be warm, relatable, and sometimes a bit dramatic about uni life. "
            "When someone approaches you, greet them like you'd greet a friend you haven't seen today. "
            "If someone says goodbye, wish them well naturally."
        ),
    },
    "npc2": {
        "name": "Bob",
        "system_prompt": (
            "You are Bob, a laid-back tech enthusiast and gamer who lives in this smart home. "
            "You're always talking about the latest gadgets, games, and tech news. "
            "You love mechanical keyboards, VR gaming, and building PCs. "
            "You speak in a chill, bro-like manner — relaxed but knowledgeable about tech. "
            "Keep your responses SHORT (1-3 sentences max). Be enthusiastic about tech but never pushy. "
            "When someone approaches you, greet them casually like a roommate. "
            "If someone says goodbye, give a casual farewell."
        ),
    },
    "npc3": {
        "name": "Carol",
        "system_prompt": (
            "You are Carol, an energetic fitness enthusiast and yoga instructor who lives in this smart home. "
            "You're passionate about healthy living, morning runs, smoothies, and mindfulness. "
            "You're always upbeat and encouraging, sometimes a bit too enthusiastic about wellness. "
            "You speak with high energy and positivity — lots of exclamation marks and motivational vibes. "
            "Keep your responses SHORT (1-3 sentences max). Be encouraging and warm. "
            "When someone approaches you, greet them with energy and ask about their day. "
            "If someone says goodbye, wish them good energy."
        ),
    },
    "npc4": {
        "name": "Mike",
        "system_prompt": (
            "You are Mike, a quiet and thoughtful bookworm who lives in this smart home. "
            "You love reading sci-fi novels, drinking tea, and stargazing. You're introverted but kind. "
            "You speak softly and thoughtfully — fewer words but more meaningful. "
            "You occasionally share interesting facts or book recommendations. "
            "Keep your responses SHORT (1-2 sentences max). Be gentle and a bit philosophical. "
            "When someone approaches you, acknowledge them with a calm, warm greeting. "
            "If someone says goodbye, give a quiet, sincere farewell."
        ),
    },
}

# Conversation History Store (in-memory, per session)

_conversation_histories: Dict[str, List[Dict[str, str]]] = {}

MAX_HISTORY_LENGTH = 20  # Keep last N messages to avoid token overflow


def _get_history(npc_id: str) -> List[Dict[str, str]]:
    """Get conversation history for an NPC."""
    if npc_id not in _conversation_histories:
        _conversation_histories[npc_id] = []
    return _conversation_histories[npc_id]


def _add_to_history(npc_id: str, role: str, content: str) -> None:
    """Add a message to the NPC's conversation history."""
    history = _get_history(npc_id)
    history.append({"role": role, "content": content})
    # Trim to keep within limits
    if len(history) > MAX_HISTORY_LENGTH:
        _conversation_histories[npc_id] = history[-MAX_HISTORY_LENGTH:]


def reset_history(npc_id: str) -> None:
    """Clear conversation history for an NPC."""
    _conversation_histories.pop(npc_id, None)


def reset_all_histories() -> None:
    """Clear all NPC conversation histories."""
    _conversation_histories.clear()


# ── Chat Function ────────────────────────────────────────────────────────────

def chat_with_npc(npc_id: str, user_message: str) -> Dict[str, Any]:
    """Send a message to an NPC and get an LLM-powered response."""
    personality = NPC_PERSONALITIES.get(npc_id)
    if not personality:
        return {
            "npc_id": npc_id,
            "npc_name": "Unknown",
            "response": "...",
            "goodbye": False,
        }

    npc_name = personality["name"]
    system_prompt = personality["system_prompt"]

    # Build the full system prompt with goodbye detection instruction
    full_system_prompt = (
        f"{system_prompt}\n\n"
        "IMPORTANT: If the user is saying goodbye, ending the conversation, or leaving "
        "(e.g. 'bye', 'see you', 'gotta go', 'I have to go', 'later', 'take care'), "
        "respond with a natural farewell AND add the exact tag [GOODBYE] at the very end of your response. "
        "Only add [GOODBYE] when the user is truly leaving, not for casual mentions."
    )

    # Get conversation history
    history = _get_history(npc_id)

    # Build messages for LLM
    messages = [{"role": "system", "content": full_system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    try:
        from groq import Groq

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            logger.error("GROQ_API_KEY not found for NPC chat")
            return {
                "npc_id": npc_id,
                "npc_name": npc_name,
                "response": "Hmm, I'm having trouble thinking right now...",
                "goodbye": False,
            }

        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.7,
            max_tokens=100,
        )

        response_text = response.choices[0].message.content.strip()

        # Check for goodbye tag
        is_goodbye = "[GOODBYE]" in response_text
        # Remove the tag from the displayed/spoken text
        clean_response = response_text.replace("[GOODBYE]", "").strip()

        # Save to history
        _add_to_history(npc_id, "user", user_message)
        _add_to_history(npc_id, "assistant", clean_response)

        # If goodbye, also reset history for next encounter
        if is_goodbye:
            reset_history(npc_id)

        return {
            "npc_id": npc_id,
            "npc_name": npc_name,
            "response": clean_response,
            "goodbye": is_goodbye,
        }

    except ImportError:
        logger.error("groq package not installed")
        return {
            "npc_id": npc_id,
            "npc_name": npc_name,
            "response": "Sorry, I can't think straight right now...",
            "goodbye": False,
        }
    except Exception as e:
        logger.error(f"NPC chat error for {npc_id}: {e}")
        return {
            "npc_id": npc_id,
            "npc_name": npc_name,
            "response": "Um... sorry, I spaced out for a second.",
            "goodbye": False,
        }


def get_greeting(npc_id: str) -> str:
    """Get a personality-appropriate greeting for an NPC (no LLM call, instant)."""
    greetings = {
        "npc1": "Hey! Oh my gosh, I haven't seen you today! How's it going?",
        "npc2": "Yo, what's up! Good to see you around.",
        "npc3": "Hey there! Great energy today! How are you feeling?",
        "npc4": "Oh, hi there. Nice to see you.",
    }
    return greetings.get(npc_id, "Hello!")


def get_farewell(npc_id: str) -> str:
    """Get a personality-appropriate farewell for an NPC (no LLM call, instant)."""
    farewells = {
        "npc1": "Okay, see you later! Don't forget to take breaks!",
        "npc2": "Later, dude! Catch you around.",
        "npc3": "Take care! Remember to stay hydrated!",
        "npc4": "Goodbye. Take care of yourself.",
    }
    return farewells.get(npc_id, "See you!")
