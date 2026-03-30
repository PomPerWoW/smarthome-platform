# Voice commands reference (Scene Creator)

Commands are sent to the backend `POST /api/homes/voice/command/` (`VoiceAssistantService` in `apps/backend/homes/services.py`). The client (Quest / desktop) uses the same API.

Speech recognition often **drops punctuation** (no question mark). The backend treats help-style phrases accordingly.

---

## 1. Help, instructions, and conversation (no device action)

These return an `instruction_topic` for scripted spoken guidance (robot walks to you in XR when applicable).

### Assistant capabilities

| Example phrases |
|-----------------|
| what can you do |
| what can you help me with |
| what do you do |
| who are you |
| what is your purpose |
| what are your capabilities |
| tell me what you can do |

### Getting started

Phrases containing: how do I get started, where do I start, first time, getting started, I’m new, etc. (see `_detect_instruction_topic` in `services.py`).

### Panel & navigation

| Topic | Example phrases |
|-------|-----------------|
| **panel** | how do I use the panel, what is the panel for, explain the panel |
| **voice** | how do I use voice, how do I give voice commands, what can I say |
| **navigation** | how do I navigate, where is everything, where is the menu |
| **welcome_panel** | welcome panel, where is the welcome panel, open welcome panel |
| **control** (general) | how do I control, how can I control the system |
| **on_off** | how do I turn on, how do I turn off, how to switch on |

### Per-device help (“how do I…”)

If the utterance looks like a **how-to** (not a command like “turn on”), mentioning a device selects that topic:

| Device | Example |
|--------|---------|
| fan | how do I use the fan, how to control the fan |
| light | how do I use the light, how to control the lightbulb |
| TV | how do I use the TV, television |
| AC | how do I use the air conditioner |

### Usage / graphs

Phrases like: usage graph, usage view, how do I see usage, check consumption.

### Troubleshooting

Phrases like: not working, not responding, something wrong, troubleshooting, it’s broken.

### Device list / count

Handled even without “how do I”:

| Examples |
|----------|
| how many devices do I have |
| what devices do I have |
| list devices, my devices, devices in my room |

Returns `device_info` with a dynamic `instruction_text` from the LLM when possible.

### One session per mic use (XR / scene-creator)

After the assistant finishes an instruction (or a device action), the voice UI **closes** and the mic **stops**. There is **no** chained “Do you want me to do anything else?” loop. To ask another question, **open the voice assistant again** (new session).

If you **tap the mic again** while listening (or tap to dismiss the open conversation), the client shows **“See you again! 👋”**, plays the goodbye line, waits briefly, then closes — so accidental opens still end cleanly.

---

## 2. Device control (actions)

When the text is **not** classified as instruction/help above, the backend uses the LLM to parse **actions** against your devices. Typical patterns (wording can vary):

### All devices

- turn on / turn off / switch on / switch off + device name  
  - e.g. “turn on the fan”, “switch off the light”

### Light

- set brightness to …  
- set colour / color to … (e.g. red, blue, hex if supported)

### TV

- set volume to …  
- set channel to …  
- mute / unmute the TV

### Fan

- set fan speed to …  
- turn on swing / turn off swing (if modeled)

### Air conditioner

- set temperature to … (digits or words, e.g. “twenty-four”)

### Refresh (if supported by your deployment)

- “refresh devices” (may be handled as a special or generic phrase depending on backend/LLM)

Exact supported actions map to `CommandIntent` and SCADA in `homes/services.py` (`turn_on`, `turn_off`, `set_brightness`, `set_volume`, …).

---

## 3. Developer notes

- **Instruction detection** lives in `VoiceAssistantService._detect_instruction_topic` (`apps/backend/homes/services.py`).  
- **Spoken scripts** for each `instruction_topic` are in `apps/scene-creator/src/utils/VoiceTextToSpeech.ts` (`INSTRUCTION_TEXTS`) — keep keys in sync with the backend.  
- **Execute flag**: Scene Creator calls `sendVoiceCommand(text, false)` first so the robot can move near the user or device before executing (`execute: true` on a follow-up call from `RobotAssistantSystem`).  
- **Quest**: Often uses audio upload + transcribe; the same `command` string is then processed by `process_voice_command`.

If you add a new instruction topic:

1. Return a new `instruction_topic` string from `_detect_instruction_topic`.  
2. Add matching copy to `INSTRUCTION_TEXTS` in `VoiceTextToSpeech.ts`.  
3. Extend `RobotAssistantSystem.getInstructionText` if it has a local map.  
4. Update this document.

There is **no** `yes_more` / `goodbye` instruction topic for follow-up turns; those were removed in favor of session-per-mic-use.
