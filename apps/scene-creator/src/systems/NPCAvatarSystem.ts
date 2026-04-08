import {
    createSystem,
    Entity,
    Object3D,
    AssetManager,
    AnimationMixer,
    AnimationAction,
    LoopOnce,
    LoopRepeat,
} from "@iwsdk/core";

import { Box3, MathUtils, Quaternion, SkinnedMesh, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { NPCAvatarComponent } from "../components/NPCAvatarComponent";
import { AVATAR_VISUAL_SCALE } from "../config/avatarScale";
import {
    getRoomBounds,
    getWorldFloorY,
    roomLocalToWorld,
    clampToWalkableArea,
} from "../config/navmesh";
import { BackendApiClient } from "../api/BackendApiClient";
import type { AvatarBehaviorAction } from "../scripting/avatarBehaviorScript";

// CONFIG

const FADE_DURATION = 0.25;
const NPC_VISUAL_SCALE_MULTIPLIER = 1.1;

/** Fixed scripted walk speed (m/s); walk clips are time-scaled to match. */
const SCRIPT_WALK_SPEED = 0.4;
/** Default one-way patrol leg when `walk` omits `distance`. */
const SCRIPT_PATROL_DEFAULT_DISTANCE = 1.35;

const LOOP_REPEAT_CLIP_NAMES = new Set([
    "Idle",
    "Walk",
    "Walking",
    "Run",
    "Sit",
    "Sleep",
]);
const ENGAGEMENT_RADIUS = 1.2;
const DISENGAGE_RADIUS = 1.8;
const WAVE_COOLDOWN = 5.0;
const LISTEN_START_DELAY_MS = 600;
const MAX_RECORDING_DURATION = 15000;
const SILENCE_DURATION = 1200;

// Update this once you see the voice list in console
const NPC_VOICE_CONFIG: Record<string, { pitch: number; rate: number; voiceIndex?: number }> = {
    npc1: { pitch: 1.0, rate: 1.0, voiceIndex: 182 }, // Alice - Google UK English Female
    npc3: { pitch: 1.0, rate: 1.0, voiceIndex: 181 }, // Carol - Google US English
};

// PROCEDURAL VISEME SYSTEM

/** Map a character to the best RPM viseme. */
const CHAR_TO_VISEME: Record<string, string> = {
    a: "viseme_aa", e: "viseme_E", i: "viseme_I", o: "viseme_O", u: "viseme_U",
    b: "viseme_PP", p: "viseme_PP", m: "viseme_PP",
    f: "viseme_FF", v: "viseme_FF",
    t: "viseme_DD", d: "viseme_DD", n: "viseme_nn", l: "viseme_nn",
    k: "viseme_kk", g: "viseme_kk", q: "viseme_kk",
    s: "viseme_SS", z: "viseme_SS", x: "viseme_SS",
    r: "viseme_RR", w: "viseme_RR",
    c: "viseme_kk", j: "viseme_CH", h: "viseme_TH",
    y: "viseme_I",
    " ": "viseme_sil", ",": "viseme_sil", ".": "viseme_sil",
    "!": "viseme_sil", "?": "viseme_sil",
};

const ALL_VISEME_NAMES = [
    "viseme_sil", "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD",
    "viseme_kk", "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR",
    "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
];

interface ProceduralLipSync {
    /** The viseme sequence for the current word. */
    wordVisemes: string[];
    /** Current index into wordVisemes. */
    currentIndex: number;
    /** Time accumulator for advancing visemes. */
    timeAccumulator: number;
    /** Duration per viseme in seconds. */
    visemeDuration: number;
    /** True while SpeechSynthesis is actively producing sound. */
    isActive: boolean;
}

// ============================================================================
// NPC RECORD
// ============================================================================

/** Room-local patrol: forward → snap 180° → back to anchor → snap 180° → next script step. */
interface NpcScriptWalkRoutine {
    anchorX: number;
    anchorZ: number;
    dirX: number;
    dirZ: number;
    startYaw: number;
    leg: number;
    phase: "out" | "in";
}

interface NPCAvatarRecord {
    entity: Entity;
    model: Object3D;
    mixer: AnimationMixer;
    animationsMap: Map<string, AnimationAction>;
    currentAction: string;
    originalRotationY: number;
    lastRoomLocalPos: { x: number; y: number; z: number } | null;
    isPlayingWave: boolean;
    lastWaveTime: number;
    morphTargetMeshes: SkinnedMesh[];
    lipSync: ProceduralLipSync;
    isSpeaking: boolean;
    isInConversation: boolean;
    mediaRecorder: MediaRecorder | null;
    audioChunks: Blob[];
    /** Scripted behavior (loops); paused while `isInConversation` or speaking. */
    scriptActions: AvatarBehaviorAction[] | null;
    scriptIndex: number;
    scriptPhaseKey: string;
    scriptTimer: number;
    scriptWalkRoutine: NpcScriptWalkRoutine | null;
    /** mixamorigHips (or first root bone); post-mixer Y rotation applied here. */
    skeletonHipsBone: Object3D | null;
    /** Extra Y rotation (rad) on hips after mixer — e.g. π for patrol return leg. */
    skeletonYawOffsetRad: number;
}

type NpcVoiceDebugState = {
    mic: "idle" | "requesting" | "ok" | "error";
    recorder: "idle" | "ok" | "error";
    transcribe: "idle" | "ok" | "error";
    tts: "idle" | "ok" | "error";
    viseme: "unknown" | "ok" | "missing";
    note?: string;
};

/** RPM / Mixamo style root; falls back to first skinned-mesh hip/root bone. */
function findNpcSkeletonHips(root: Object3D): Object3D | null {
    const byOrder = [
        "mixamorigHips",
        "Hips",
        "mixamorig:Hips",
        "pelvis",
        "Pelvis",
        "DEF-hips",
    ];
    let named: Object3D | null = null;
    root.traverse((o) => {
        if (named) return;
        if (byOrder.includes(o.name)) named = o;
    });
    if (!named) {
        root.traverse((o) => {
            if (named) return;
            const b = o as { isBone?: boolean; name?: string };
            if (b.isBone && /hip|pelvis/i.test(b.name || "")) named = o;
        });
    }
    if (!named) {
        let foundBones: Object3D[] | undefined;
        root.traverse((o) => {
            if (foundBones) return;
            const sk = o as {
                isSkinnedMesh?: boolean;
                skeleton?: { bones: Object3D[] };
            };
            if (sk.isSkinnedMesh && sk.skeleton?.bones?.length) {
                foundBones = sk.skeleton.bones;
            }
        });
        if (foundBones?.length) {
            named =
                foundBones.find((b) => /hip|pelvis|root|spine/i.test(b.name || "")) ??
                foundBones[0] ??
                null;
        }
    }
    return named;
}

// NPC AVATAR SYSTEM

export class NPCAvatarSystem extends createSystem({
    npcs: {
        required: [NPCAvatarComponent],
    },
}) {
    private readonly _hipsYawQuat = new Quaternion();
    private readonly _hipsAnimQuat = new Quaternion();
    private readonly _axisY = new Vector3(0, 1, 0);
    private voiceDebug: NpcVoiceDebugState = {
        mic: "idle",
        recorder: "idle",
        transcribe: "idle",
        tts: "idle",
        viseme: "unknown",
    };

    private npcRecords: Map<string, NPCAvatarRecord> = new Map();
    private timeElapsed = 0;
    private activeConversationNpcId: string | null = null;

    init() {
        console.log("[NPCAvatar] System initialized (stationary NPCs with LLM chat + procedural lip-sync)");
        (globalThis as any).__npcAvatarSystem = this;
        this.publishVoiceDebug("init");

        // List all available voices for the user
        if (typeof window !== "undefined" && window.speechSynthesis) {
            const listVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                console.log("[NPCAvatar] 🎙️ Available System Voices:");
                voices.forEach((v, i) => {
                    console.log(`[${i}] ${v.name} (${v.lang}) - ${v.localService ? "Local" : "Remote"}`);
                });
                console.log("[NPCAvatar] ^^^ Copy the index or name above into NPC_VOICE_CONFIG to change NPC voices! ^^^");
            };
            if (window.speechSynthesis.getVoices().length > 0) {
                listVoices();
            } else {
                window.speechSynthesis.onvoiceschanged = listVoices;
            }
        }
    }

    private publishVoiceDebug(note?: string): void {
        this.voiceDebug = {
            ...this.voiceDebug,
            note,
        };
        (globalThis as any).__npcVoiceDebug = { ...this.voiceDebug };
        const hooks = (globalThis as any).__dashboardVoiceHooks as
            | { onSystemMessage?: (message: string) => void }
            | undefined;
        if (hooks?.onSystemMessage) {
            hooks.onSystemMessage(
                `NPC dbg mic:${this.voiceDebug.mic} rec:${this.voiceDebug.recorder} stt:${this.voiceDebug.transcribe} tts:${this.voiceDebug.tts} vis:${this.voiceDebug.viseme}${note ? ` (${note})` : ""}`,
            );
        }
    }

    // ── Room-local ↔ world helpers ──────────────────────────────────────

    private roomLocalToWorld(lx: number, ly: number, lz: number) {
        const roomModel = (globalThis as any).__labRoomModel;
        if (!roomModel) return { x: lx, y: ly, z: lz };
        const rotY = roomModel.rotation.y;
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        const roomScale =
            Math.abs((roomModel.scale?.x as number) ?? 1) > 1e-6
                ? (roomModel.scale.x as number)
                : 1;
        const sx = lx * roomScale;
        const sy = ly * roomScale;
        const sz = lz * roomScale;
        return {
            x: roomModel.position.x + sx * cosR - sz * sinR,
            y: roomModel.position.y + sy,
            z: roomModel.position.z + sx * sinR + sz * cosR,
        };
    }

    private worldToRoomLocal(wx: number, wy: number, wz: number) {
        const roomModel = (globalThis as any).__labRoomModel;
        if (!roomModel) return { x: wx, y: wy, z: wz };
        const rotY = roomModel.rotation.y;
        const cosR = Math.cos(-rotY);
        const sinR = Math.sin(-rotY);
        const dx = wx - roomModel.position.x;
        const dy = wy - roomModel.position.y;
        const dz = wz - roomModel.position.z;
        const roomScale =
            Math.abs((roomModel.scale?.x as number) ?? 1) > 1e-6
                ? (roomModel.scale.x as number)
                : 1;
        return {
            x: (dx * cosR - dz * sinR) / roomScale,
            y: dy / roomScale,
            z: (dx * sinR + dz * cosR) / roomScale,
        };
    }

    private alignFeetToFloor(model: Object3D, floorY: number): number {
        const box = new Box3().setFromObject(model as any);
        const originToFeet = model.position.y - box.min.y;
        const groundedY = floorY + originToFeet;
        model.position.y = groundedY;
        return groundedY;
    }

    // ── TTS with lip-sync events ────────────────────────────────────────

    private getVoice(npcId: string): SpeechSynthesisVoice | null {
        if (typeof window === "undefined" || !window.speechSynthesis) return null;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) return null;

        const config = NPC_VOICE_CONFIG[npcId];
        if (config && config.voiceIndex !== undefined && voices[config.voiceIndex]) {
            return voices[config.voiceIndex];
        }

        const enVoices = voices.filter(v => v.lang.startsWith("en-"));
        return enVoices[0] || voices[0];
    }

    // Convert a word into a sequence of visemes.
    private wordToVisemes(word: string): string[] {
        const visemes: string[] = [];
        for (const char of word.toLowerCase()) {
            const v = CHAR_TO_VISEME[char] || "viseme_DD";
            // Don't push the same viseme twice in a row — looks more natural
            if (visemes.length === 0 || visemes[visemes.length - 1] !== v) {
                visemes.push(v);
            }
        }
        // Always end word with a brief silence for natural pacing
        if (visemes.length > 0 && visemes[visemes.length - 1] !== "viseme_sil") {
            visemes.push("viseme_sil");
        }
        return visemes;
    }

    // Speak text with procedural lip-sync driven by SpeechSynthesis boundary events.
    private speakForNPC(npcId: string, text: string): Promise<void> {
        return new Promise((resolve) => {
            const record = this.npcRecords.get(npcId);
            if (!record || typeof window === "undefined" || !window.speechSynthesis) {
                this.voiceDebug.tts = "error";
                this.publishVoiceDebug("tts_unavailable");
                resolve();
                return;
            }

            const synth = window.speechSynthesis;
            const voiceConfig = NPC_VOICE_CONFIG[npcId] || { pitch: 1, rate: 1 };
            let spoke = false;
            let voiceReadyTimer: ReturnType<typeof setTimeout> | null = null;

            const doSpeak = () => {
                const voice = this.getVoice(npcId);
                synth.cancel();
                try {
                    synth.resume();
                } catch {
                    // no-op
                }

                const u = new SpeechSynthesisUtterance(text);
                if (voice) {
                    u.voice = voice;
                    u.lang = voice.lang;
                    console.log(`[NPCAvatar] 🗣️ ${npcId} speaking with voice: ${voice.name}`);
                }
                u.volume = 1;
                u.rate = voiceConfig.rate;
                u.pitch = voiceConfig.pitch;

                // Mark as speaking
                record.isSpeaking = true;
                record.lipSync.isActive = true;

                // Generate initial viseme sequence from the full text
                const words = text.split(/\s+/);
                const allVisemes: string[] = [];
                for (const word of words) {
                    allVisemes.push(...this.wordToVisemes(word));
                }
                record.lipSync.wordVisemes = allVisemes;
                record.lipSync.currentIndex = 0;
                record.lipSync.timeAccumulator = 0;

                // Estimate duration per viseme based on text length and speech rate
                // Average speaking rate ~150 words/min = ~2.5 words/sec
                const estimatedSeconds = (words.length / (2.5 * voiceConfig.rate));
                record.lipSync.visemeDuration = Math.max(0.04, estimatedSeconds / Math.max(1, allVisemes.length));

                console.log(`[NPCAvatar] 👄 ${npcId} lip-sync: ${allVisemes.length} visemes, ${record.lipSync.visemeDuration.toFixed(3)}s each`);

                // Word boundary events for better sync
                u.onboundary = (event: SpeechSynthesisEvent) => {
                    if (event.name === "word") {
                        const spokenSoFar = text.substring(0, event.charIndex);
                        const wordsSoFar = spokenSoFar.split(/\s+/).filter(w => w.length > 0);
                        // Jump to the viseme index for this word
                        let visemeIndex = 0;
                        for (let i = 0; i < wordsSoFar.length && i < words.length; i++) {
                            visemeIndex += this.wordToVisemes(words[i]).length;
                        }
                        record.lipSync.currentIndex = Math.min(visemeIndex, allVisemes.length - 1);
                        record.lipSync.timeAccumulator = 0;
                    }
                };

                u.onend = () => {
                    record.isSpeaking = false;
                    record.lipSync.isActive = false;
                    this.resetAllVisemes(record);
                    this.voiceDebug.tts = "ok";
                    this.publishVoiceDebug("tts_ok");
                    resolve();
                };

                u.onerror = () => {
                    record.isSpeaking = false;
                    record.lipSync.isActive = false;
                    this.resetAllVisemes(record);
                    this.voiceDebug.tts = "error";
                    this.publishVoiceDebug("tts_error");
                    resolve();
                };

                setTimeout(() => synth.speak(u), 60);
            };

            if (synth.getVoices().length > 0) {
                doSpeak();
            } else {
                synth.addEventListener("voiceschanged", doSpeak, { once: true });
                voiceReadyTimer = setTimeout(() => {
                    doSpeak();
                }, 600);
            }
        });
    }

    // ── Procedural lip-sync processing (per frame) ──────────────────────

    private setVisemeWeight(record: NPCAvatarRecord, visemeName: string, weight: number, speed: number): void {
        for (const mesh of record.morphTargetMeshes) {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
            const index = mesh.morphTargetDictionary[visemeName];
            if (index !== undefined) {
                mesh.morphTargetInfluences[index] = MathUtils.lerp(
                    mesh.morphTargetInfluences[index],
                    weight,
                    speed,
                );
            }
        }
    }

    private resetAllVisemes(record: NPCAvatarRecord): void {
        for (const mesh of record.morphTargetMeshes) {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
            for (const viseme of ALL_VISEME_NAMES) {
                const index = mesh.morphTargetDictionary[viseme];
                if (index !== undefined) {
                    mesh.morphTargetInfluences[index] = MathUtils.lerp(
                        mesh.morphTargetInfluences[index], 0, 0.15,
                    );
                }
            }
        }
    }

    private processProceduralLipSync(record: NPCAvatarRecord, dt: number): void {
        const ls = record.lipSync;
        if (!ls.isActive || ls.wordVisemes.length === 0) {
            // Smoothly close mouth when not speaking
            if (record.isSpeaking === false) {
                this.resetAllVisemes(record);
            }
            return;
        }

        // Advance through visemes over time
        ls.timeAccumulator += dt;
        if (ls.timeAccumulator >= ls.visemeDuration) {
            ls.timeAccumulator -= ls.visemeDuration;
            ls.currentIndex++;
            if (ls.currentIndex >= ls.wordVisemes.length) {
                // Loop back (speech might still be going due to timing variance)
                ls.currentIndex = 0;
            }
        }

        const currentViseme = ls.wordVisemes[ls.currentIndex];
        const isVowel = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"].includes(currentViseme);
        const lerpSpeed = isVowel ? 0.2 : 0.4;

        // Set current viseme to target weight, others to 0
        for (const viseme of ALL_VISEME_NAMES) {
            if (viseme === currentViseme) {
                this.setVisemeWeight(record, viseme, currentViseme === "viseme_sil" ? 0 : 0.8, lerpSpeed);
            } else {
                this.setVisemeWeight(record, viseme, 0, 0.15);
            }
        }
    }

    // ── Voice recording (user speech capture) ───────────────────────────

    private startListeningForNPC(npcId: string): void {
        const record = this.npcRecords.get(npcId);
        if (!record) return;

        record.entity.setValue(NPCAvatarComponent, "chatState", "listening");
        console.log(`[NPCAvatar] 🎤 ${npcId} listening for user speech...`);
        this.voiceDebug.mic = "requesting";
        this.publishVoiceDebug("mic_request");

        navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }).then((stream) => {
            this.voiceDebug.mic = "ok";
            this.publishVoiceDebug("mic_ok");
            if (this.activeConversationNpcId !== npcId) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }

            record.audioChunks = [];
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus" : "audio/webm";

            record.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.voiceDebug.recorder = "ok";
            this.publishVoiceDebug("recorder_ok");

            record.mediaRecorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) record.audioChunks.push(event.data);
            };

            record.mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (this.activeConversationNpcId !== npcId) return;

                const audioBlob = new Blob(record.audioChunks, { type: mimeType });
                if (audioBlob.size === 0) {
                    this.startListeningForNPC(npcId);
                    return;
                }

                record.entity.setValue(NPCAvatarComponent, "chatState", "thinking");
                console.log(`[NPCAvatar] 🧠 ${npcId} processing user speech...`);

                try {
                    const formData = new FormData();
                    formData.append("audio", audioBlob, "recording.webm");
                    formData.append("execute", "false");

                    const { default: axiosApi } = await import("../api/axios");
                    const transcribeResponse = await axiosApi.post<{ transcript: string }>(
                        "/api/homes/voice/transcribe/",
                        formData,
                        { headers: { "Content-Type": "multipart/form-data" } },
                    );

                    const transcript = transcribeResponse.data.transcript?.trim();
                    this.voiceDebug.transcribe = "ok";
                    this.publishVoiceDebug("stt_ok");
                    if (!transcript || transcript.length < 2) {
                        this.startListeningForNPC(npcId);
                        return;
                    }

                    console.log(`[NPCAvatar] 💬 User said to ${npcId}: "${transcript}"`);

                    const api = BackendApiClient.getInstance();
                    const chatResult = await api.sendNPCChat(npcId, transcript);
                    console.log(`[NPCAvatar] 🤖 ${npcId} responds: "${chatResult.response}"`);

                    if (this.activeConversationNpcId !== npcId) return;

                    await this.speakWithLipsync(npcId, chatResult.response);
                    if (this.activeConversationNpcId !== npcId) return;

                    if (chatResult.goodbye) {
                        this.endConversation(npcId, "goodbye_detected");
                    } else {
                        setTimeout(() => {
                            if (this.activeConversationNpcId === npcId) {
                                this.startListeningForNPC(npcId);
                            }
                        }, LISTEN_START_DELAY_MS);
                    }
                } catch (error) {
                    console.error(`[NPCAvatar] ${npcId} chat error:`, error);
                    this.voiceDebug.transcribe = "error";
                    this.publishVoiceDebug("stt_or_chat_error");
                    if (this.activeConversationNpcId === npcId) {
                        await this.speakWithLipsync(npcId, "Sorry, I spaced out for a second. What were you saying?");
                        setTimeout(() => {
                            if (this.activeConversationNpcId === npcId) {
                                this.startListeningForNPC(npcId);
                            }
                        }, LISTEN_START_DELAY_MS);
                    }
                }
            };

            record.mediaRecorder.onerror = () => {
                stream.getTracks().forEach(t => t.stop());
                this.voiceDebug.recorder = "error";
                this.publishVoiceDebug("recorder_error");
            };

            record.mediaRecorder.start();
            this.setupSilenceDetection(npcId, stream);

            setTimeout(() => {
                if (record.mediaRecorder?.state === "recording") {
                    record.mediaRecorder.stop();
                }
            }, MAX_RECORDING_DURATION);
        }).catch((err) => {
            console.error(`[NPCAvatar] ${npcId} microphone access failed:`, err);
            this.voiceDebug.mic = "error";
            this.publishVoiceDebug("mic_error");
        });
    }

    private setupSilenceDetection(npcId: string, stream: MediaStream): void {
        const record = this.npcRecords.get(npcId);
        if (!record) return;

        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            const audioContext = new AudioContextClass();
            if (audioContext.state === "suspended") audioContext.resume();

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.3;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            let silenceStart = Date.now();

            const checkInterval = setInterval(() => {
                if (!record.mediaRecorder || record.mediaRecorder.state !== "recording") {
                    clearInterval(checkInterval);
                    audioContext.close();
                    return;
                }

                analyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += Math.abs(dataArray[i] - 128);
                const avgAmplitude = sum / bufferLength;

                if (avgAmplitude > 3) {
                    silenceStart = Date.now();
                } else if (Date.now() - silenceStart > SILENCE_DURATION) {
                    clearInterval(checkInterval);
                    audioContext.close();
                    if (record.mediaRecorder.state === "recording") record.mediaRecorder.stop();
                }
            }, 100);
        } catch (err) {
            console.warn(`[NPCAvatar] ${npcId} silence detection failed:`, err);
        }
    }

    // ── Speak with lip-sync ─────────────────────────────────────────────

    private async speakWithLipsync(npcId: string, text: string): Promise<void> {
        const record = this.npcRecords.get(npcId);
        if (!record) return;

        record.entity.setValue(NPCAvatarComponent, "chatState", "speaking");
        console.log(`[NPCAvatar] 🗣️ ${npcId} speaking with lip-sync: "${text}"`);

        await this.speakForNPC(npcId, text);
    }

    // ── Conversation flow ───────────────────────────────────────────────

    private async startConversation(npcId: string): Promise<void> {
        const record = this.npcRecords.get(npcId);
        if (!record) return;

        if (this.activeConversationNpcId && this.activeConversationNpcId !== npcId) return;

        this.activeConversationNpcId = npcId;
        record.isInConversation = true;
        record.entity.setValue(NPCAvatarComponent, "chatState", "greeting");

        console.log(`[NPCAvatar] 💬 ${npcId} starting conversation`);

        try {
            const greetingText = await BackendApiClient.getInstance().getNPCGreeting(npcId);
            this.playWaveAnimation(record, npcId, "greeting");
            await this.speakWithLipsync(npcId, greetingText);

            if (this.activeConversationNpcId !== npcId) return;

            setTimeout(() => {
                if (this.activeConversationNpcId === npcId) {
                    this.startListeningForNPC(npcId);
                }
            }, LISTEN_START_DELAY_MS);
        } catch (error) {
            console.error(`[NPCAvatar] ${npcId} greeting failed:`, error);
            this.playWaveAnimation(record, npcId, "greeting_fallback");
        }
    }

    private async endConversation(npcId: string, reason: string): Promise<void> {
        const record = this.npcRecords.get(npcId);
        if (!record) return;

        console.log(`[NPCAvatar] 🔚 ${npcId} ending conversation (${reason})`);

        if (record.mediaRecorder?.state === "recording") record.mediaRecorder.stop();
        record.mediaRecorder = null;

        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        record.isSpeaking = false;
        record.lipSync.isActive = false;
        this.resetAllVisemes(record);

        record.entity.setValue(NPCAvatarComponent, "chatState", "farewell");

        if (reason === "user_left") {
            try {
                const farewellText = await BackendApiClient.getInstance().getNPCFarewell(npcId);
                this.playWaveAnimation(record, npcId, "farewell");
                await this.speakWithLipsync(npcId, farewellText);
            } catch {
                this.playWaveAnimation(record, npcId, "farewell_fallback");
            }
        } else {
            this.playWaveAnimation(record, npcId, "farewell_wave");
            try { await BackendApiClient.getInstance().resetNPCChat(npcId); } catch { /* ignore */ }
        }

        record.isInConversation = false;
        record.entity.setValue(NPCAvatarComponent, "chatState", "idle");
        if (this.activeConversationNpcId === npcId) this.activeConversationNpcId = null;
    }

    // ── Create NPC ──────────────────────────────────────────────────────

    async createNPCAvatar(
        npcId: string,
        npcName: string,
        modelKey: string,
        position: [number, number, number],
        initialRotation: number = 0
    ): Promise<Entity | null> {
        try {
            const gltf = AssetManager.getGLTF(modelKey);
            if (!gltf) {
                console.error(`[NPCAvatar] Model not found: ${modelKey}`);
                return null;
            }

            const roomBounds = getRoomBounds();
            let finalX = position[0], finalY = position[1], finalZ = position[2];

            if (roomBounds) {
                const centerX = (roomBounds.minX + roomBounds.maxX) * 0.5;
                const centerZ = (roomBounds.minZ + roomBounds.maxZ) * 0.5;
                const localX = centerX + position[0];
                const localZ = centerZ + position[2];
                const [worldX, worldZ] = roomLocalToWorld(localX, localZ);
                finalX = worldX;
                finalZ = worldZ;
                finalY = getWorldFloorY() + position[1];
            }

            const npcModel = SkeletonUtils.clone(gltf.scene) as Object3D;
            npcModel.scale.setScalar(
                AVATAR_VISUAL_SCALE * NPC_VISUAL_SCALE_MULTIPLIER,
            );
            npcModel.position.set(finalX, finalY, finalZ);
            npcModel.rotation.set(0, initialRotation, 0);
            npcModel.visible = true;
            this.world.scene.add(npcModel);

            // Feet at `finalY`: with room, world floor + position[1]; without room, position[1] is ground height.
            const feetY = this.alignFeetToFloor(npcModel, finalY);

            // Animations
            const clips: unknown[] = Array.isArray(gltf.animations) ? gltf.animations : [];
            const mixer = new AnimationMixer(npcModel);
            const animationsMap = new Map<string, AnimationAction>();

            for (const clip of clips) {
                const c = clip as { name?: string };
                if (!c.name || c.name === "TPose" || c.name.toLowerCase() === "tpose") continue;
                const action = mixer.clipAction(clip as any);
                if (action) {
                    if (c.name === "Wave") {
                        action.clampWhenFinished = true;
                        action.loop = LoopOnce;
                    } else if (LOOP_REPEAT_CLIP_NAMES.has(c.name)) {
                        action.setLoop(LoopRepeat, Infinity);
                        action.clampWhenFinished = false;
                    }
                    animationsMap.set(c.name, action);
                }
            }

            // Find lip-sync morphTarget meshes (Ready Player Me)
            const morphTargetMeshes: SkinnedMesh[] = [];
            npcModel.traverse((child) => {
                const maybeMesh = child as any;
                if (
                    maybeMesh.isSkinnedMesh &&
                    maybeMesh.morphTargetDictionary &&
                    maybeMesh.morphTargetInfluences &&
                    maybeMesh.morphTargetDictionary["viseme_aa"] !== undefined
                ) {
                    morphTargetMeshes.push(maybeMesh as SkinnedMesh);
                    console.log(`[NPCAvatar] 👄 ${npcName} lip-sync mesh found: ${maybeMesh.name || "unnamed"}`);
                }
            });

            if (morphTargetMeshes.length === 0) {
                console.warn(`[NPCAvatar] ⚠️ No lip-sync blendshapes found for ${npcName}`);
                this.voiceDebug.viseme = "missing";
                this.publishVoiceDebug("viseme_missing");
            } else {
                console.log(`[NPCAvatar] 👄 ${npcName}: ${morphTargetMeshes.length} lip-sync meshes ready`);
                this.voiceDebug.viseme = "ok";
                this.publishVoiceDebug("viseme_ok");
            }

            const skeletonHipsBone = findNpcSkeletonHips(npcModel);
            if (skeletonHipsBone) {
                console.log(`[NPCAvatar] 🦴 ${npcName} hips bone: ${skeletonHipsBone.name || "(unnamed)"}`);
            } else {
                console.warn(`[NPCAvatar] ⚠️ No hips/root bone found for ${npcName} — patrol facing may rely on root only`);
            }

            const entity = this.world.createTransformEntity(npcModel);
            entity.addComponent(NPCAvatarComponent, {
                npcId, npcName, baseY: feetY,
                currentState: "Idle", proximityState: "idle",
                userInRange: false, chatState: "idle",
            });

            const idleAction = animationsMap.get("Idle");
            if (idleAction) idleAction.play();

            const record: NPCAvatarRecord = {
                entity, model: npcModel, mixer, animationsMap,
                currentAction: "Idle",
                originalRotationY: initialRotation,
                lastRoomLocalPos: null,
                isPlayingWave: false,
                lastWaveTime: -999,
                morphTargetMeshes,
                lipSync: {
                    wordVisemes: [],
                    currentIndex: 0,
                    timeAccumulator: 0,
                    visemeDuration: 0.08,
                    isActive: false,
                },
                isSpeaking: false,
                isInConversation: false,
                mediaRecorder: null,
                audioChunks: [],
                scriptActions: null,
                scriptIndex: 0,
                scriptPhaseKey: "",
                scriptTimer: 0,
                scriptWalkRoutine: null,
                skeletonHipsBone,
                skeletonYawOffsetRad: 0,
            };
            this.npcRecords.set(npcId, record);

            console.log(`[NPCAvatar] ✅ Created: ${npcName} (lip-sync: ${morphTargetMeshes.length > 0 ? "yes" : "no"}, wave: ${animationsMap.has("Wave") ? "yes" : "no"})`);
            return entity;
        } catch (error) {
            console.error(`[NPCAvatar] Failed to create ${npcName}:`, error);
            return null;
        }
    }

    // ── Animation helpers ───────────────────────────────────────────────

    private fadeToAction(record: NPCAvatarRecord, name: string, duration: number): void {
        const previousAction = record.animationsMap.get(record.currentAction);
        const activeAction = record.animationsMap.get(name);
        if (!activeAction) return;
        if (previousAction && previousAction !== activeAction) previousAction.fadeOut(duration);
        activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
        record.currentAction = name;
    }

    private playWaveAnimation(record: NPCAvatarRecord, npcId: string, reason: string): void {
        if (record.isPlayingWave) return;
        if (!record.animationsMap.has("Wave")) return;
        if (this.timeElapsed - record.lastWaveTime < WAVE_COOLDOWN) return;

        record.isPlayingWave = true;
        record.lastWaveTime = this.timeElapsed;
        this.fadeToAction(record, "Wave", FADE_DURATION);

        const onFinished = () => {
            record.mixer.removeEventListener("finished", onFinished);
            record.isPlayingWave = false;
            this.fadeToAction(record, "Idle", FADE_DURATION);
        };
        record.mixer.addEventListener("finished", onFinished);
        console.log(`[NPCAvatar] 👋 ${npcId} waving (${reason})`);
    }

    /** Room-local XZ for all NPCs (for robot / other agents to avoid). */
    getNpcPositionsRoomLocal(): { id: string; x: number; z: number }[] {
        const out: { id: string; x: number; z: number }[] = [];
        for (const [id, rec] of this.npcRecords) {
            const w = rec.model.position;
            const loc = this.worldToRoomLocal(w.x, w.y, w.z);
            out.push({ id, x: loc.x, z: loc.z });
        }
        return out;
    }

    setBehaviorScript(npcId: string, actions: AvatarBehaviorAction[] | null): void {
        const record = this.npcRecords.get(npcId);
        if (!record) return;
        record.scriptActions = actions && actions.length ? actions : null;
        if (!record.scriptActions) {
            this.resetWalkClipTimeScales(record);
        }
        record.scriptIndex = 0;
        record.scriptPhaseKey = "";
        record.scriptTimer = 0;
        record.scriptWalkRoutine = null;
        record.skeletonYawOffsetRad = 0;
        console.log(
            `[NPCAvatar] Script ${record.scriptActions ? `loaded (${record.scriptActions.length} actions)` : "cleared"} for ${npcId}`,
        );
    }

    private getAgentObstaclesRoomLocal(excludeNpcId: string): { x: number; z: number }[] {
        const pts: { x: number; z: number }[] = [];
        for (const [id, rec] of this.npcRecords) {
            if (id === excludeNpcId) continue;
            const w = rec.model.position;
            const loc = this.worldToRoomLocal(w.x, w.y, w.z);
            pts.push({ x: loc.x, z: loc.z });
        }
        const robotSys = (globalThis as any).__robotAssistantSystem as
            | { getRobotRoomLocalXZ?: (id: string) => { x: number; z: number } | null }
            | undefined;
        const rz = robotSys?.getRobotRoomLocalXZ?.("robot1");
        if (rz) pts.push(rz);
        return pts;
    }

    private applyAgentAvoidanceRoomLocal(
        excludeNpcId: string,
        fromX: number,
        fromZ: number,
        toX: number,
        toZ: number,
    ): { x: number; z: number } {
        const NEAR = 0.52;
        const STOP = 0.3;
        let x = toX;
        let z = toZ;
        const others = this.getAgentObstaclesRoomLocal(excludeNpcId);
        for (const o of others) {
            const d = Math.sqrt((toX - o.x) ** 2 + (toZ - o.z) ** 2);
            if (d < STOP) {
                return { x: fromX, z: fromZ };
            }
        }
        for (const o of others) {
            const dx = x - o.x;
            const dz = z - o.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < NEAR && d > 1e-5) {
                const push = ((NEAR - d) / NEAR) * 0.22;
                x += (dx / d) * push;
                z += (dz / d) * push;
            }
        }
        return { x, z };
    }

    private playScriptWaveAnimation(record: NPCAvatarRecord, npcId: string): void {
        if (!record.animationsMap.has("Wave")) return;
        record.isPlayingWave = true;
        record.lastWaveTime = this.timeElapsed;
        this.fadeToAction(record, "Wave", FADE_DURATION);
        const onFinished = () => {
            record.mixer.removeEventListener("finished", onFinished);
            record.isPlayingWave = false;
            this.fadeToAction(record, "Idle", FADE_DURATION);
        };
        record.mixer.addEventListener("finished", onFinished);
        console.log(`[NPCAvatar] 👋 ${npcId} script wave`);
    }

    private chooseWalkAnimation(record: NPCAvatarRecord): string {
        if (record.animationsMap.has("Walking")) return "Walking";
        if (record.animationsMap.has("Walk")) return "Walk";
        return "Idle";
    }

    private resetWalkClipTimeScales(record: NPCAvatarRecord): void {
        for (const name of ["Walk", "Walking"] as const) {
            const a = record.animationsMap.get(name);
            if (a) a.setEffectiveTimeScale(1);
        }
    }

    /**
     * Clips write the hips/root quaternion each frame; parent Object3D.rotation often has no visible effect.
     * Apply patrol facing as q_extra * q_clip on the hips bone after the mixer runs.
     */
    private applySkeletonYawAfterMixer(record: NPCAvatarRecord): void {
        const bone = record.skeletonHipsBone;
        if (!bone || Math.abs(record.skeletonYawOffsetRad) < 1e-6) return;
        (this._hipsAnimQuat as { copy: (q: unknown) => unknown }).copy(bone.quaternion);
        this._hipsYawQuat.setFromAxisAngle(this._axisY, record.skeletonYawOffsetRad);
        (bone.quaternion as { multiplyQuaternions: (a: unknown, b: unknown) => void }).multiplyQuaternions(
            this._hipsYawQuat,
            this._hipsAnimQuat,
        );
    }

    /** Scale walk clip speed so foot cycle matches scripted walk speed. */
    private applyScriptWalkTimeScale(record: NPCAvatarRecord, walkAnim: string, speed: number): void {
        const scale = speed / SCRIPT_WALK_SPEED;
        for (const name of ["Walk", "Walking"] as const) {
            const a = record.animationsMap.get(name);
            if (a) a.setEffectiveTimeScale(name === walkAnim ? scale : 1);
        }
    }

    /** Room-local step toward XZ goal; returns true if within `arriveRadius`. */
    private npcPatrolStepToward(
        npcId: string,
        record: NPCAvatarRecord,
        entity: Entity,
        roomLocal: { x: number; y: number; z: number },
        roomRotY: number,
        dt: number,
        goalX: number,
        goalZ: number,
        speed: number,
        arriveRadius: number,
    ): boolean {
        const dx = goalX - roomLocal.x;
        const dz = goalZ - roomLocal.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < arriveRadius) {
            record.model.position.set(goalX, roomLocal.y, goalZ);
            record.lastRoomLocalPos = { x: goalX, y: roomLocal.y, z: goalZ };
            return true;
        }
        const mx = (dx / dist) * speed * dt;
        const mz = (dz / dist) * speed * dt;
        let nx = roomLocal.x + mx;
        let nz = roomLocal.z + mz;
        [nx, nz] = clampToWalkableArea(nx, nz);
        let c = { x: nx, z: nz };
        const budged = this.applyAgentAvoidanceRoomLocal(
            npcId,
            roomLocal.x,
            roomLocal.z,
            c.x,
            c.z,
        );
        const walkAnim = this.chooseWalkAnimation(record);
        if (walkAnim !== "Idle" && record.currentAction !== walkAnim) {
            this.fadeToAction(record, walkAnim, FADE_DURATION);
        } else if (walkAnim === "Idle" && record.currentAction !== "Idle") {
            this.resetWalkClipTimeScales(record);
            this.fadeToAction(record, "Idle", FADE_DURATION);
        }
        if (walkAnim !== "Idle") {
            this.applyScriptWalkTimeScale(record, walkAnim, speed);
        } else {
            this.resetWalkClipTimeScales(record);
        }
        const rdx = budged.x - roomLocal.x;
        const rdz = budged.z - roomLocal.z;
        // Return leg uses skeletonYawOffsetRad (π) on hips; keep root yaw stable so we don't double-rotate.
        if (
            Math.abs(rdx) + Math.abs(rdz) > 1e-4 &&
            Math.abs(record.skeletonYawOffsetRad) < 1e-6
        ) {
            record.model.rotation.set(0, Math.atan2(rdx, rdz) + roomRotY, 0);
        }
        record.model.position.set(budged.x, roomLocal.y, budged.z);
        record.lastRoomLocalPos = { x: budged.x, y: roomLocal.y, z: budged.z };
        entity.setValue(
            NPCAvatarComponent,
            "currentState",
            walkAnim === "Idle" ? "Idle" : "Walking",
        );
        return false;
    }

    private processBehaviorScript(
        npcId: string,
        record: NPCAvatarRecord,
        entity: Entity,
        roomLocal: { x: number; y: number; z: number },
        roomRotY: number,
        dt: number,
    ): void {
        const actions = record.scriptActions!;
        if (record.scriptIndex >= actions.length) record.scriptIndex = 0;
        const action = actions[record.scriptIndex];
        const phaseKey = `${record.scriptIndex}:${action.type}`;
        if (record.scriptPhaseKey !== phaseKey) {
            record.scriptPhaseKey = phaseKey;
            if (action.type !== "walk") {
                record.scriptWalkRoutine = null;
            }
            switch (action.type) {
                case "wait":
                    record.scriptTimer = action.duration;
                    break;
                case "idle":
                    record.scriptTimer = action.duration ?? 2;
                    break;
                case "wave":
                    record.scriptTimer = 2.2;
                    this.playScriptWaveAnimation(record, npcId);
                    break;
                case "sit": {
                    record.scriptTimer = action.duration ?? 4;
                    const sitName = record.animationsMap.has("Sitting")
                        ? "Sitting"
                        : record.animationsMap.has("Sit")
                            ? "Sit"
                            : "Idle";
                    if (sitName !== "Idle") this.fadeToAction(record, sitName, FADE_DURATION);
                    break;
                }
                case "walk": {
                    record.skeletonYawOffsetRad = 0;
                    const localYaw = record.model.rotation.y - roomRotY;
                    const leg = action.distance ?? SCRIPT_PATROL_DEFAULT_DISTANCE;
                    record.scriptWalkRoutine = {
                        anchorX: roomLocal.x,
                        anchorZ: roomLocal.z,
                        dirX: Math.sin(localYaw),
                        dirZ: Math.cos(localYaw),
                        startYaw: localYaw,
                        leg,
                        phase: "out",
                    };
                    break;
                }
                default:
                    record.scriptTimer = 0;
            }
        }

        switch (action.type) {
            case "walk": {
                const w = record.scriptWalkRoutine;
                if (!w) break;
                const speed = SCRIPT_WALK_SPEED;
                const arrive = 0.32;

                if (w.phase === "out") {
                    const goalX = w.anchorX + w.dirX * w.leg;
                    const goalZ = w.anchorZ + w.dirZ * w.leg;
                    const reached = this.npcPatrolStepToward(
                        npcId,
                        record,
                        entity,
                        roomLocal,
                        roomRotY,
                        dt,
                        goalX,
                        goalZ,
                        speed,
                        arrive,
                    );
                    if (reached) {
                        record.model.position.set(goalX, roomLocal.y, goalZ);
                        record.lastRoomLocalPos = { x: goalX, y: roomLocal.y, z: goalZ };
                        // 180° on skeleton hips (clips own root bone; parent rotation is ignored visually).
                        record.skeletonYawOffsetRad = Math.PI;
                        w.phase = "in";
                        this.resetWalkClipTimeScales(record);
                        this.fadeToAction(record, "Idle", FADE_DURATION);
                        entity.setValue(NPCAvatarComponent, "currentState", "Idle");
                    }
                    break;
                }

                if (w.phase === "in") {
                    const reached = this.npcPatrolStepToward(
                        npcId,
                        record,
                        entity,
                        roomLocal,
                        roomRotY,
                        dt,
                        w.anchorX,
                        w.anchorZ,
                        speed,
                        arrive,
                    );
                    if (reached) {
                        record.model.position.set(w.anchorX, roomLocal.y, w.anchorZ);
                        record.lastRoomLocalPos = {
                            x: w.anchorX,
                            y: roomLocal.y,
                            z: w.anchorZ,
                        };
                        record.skeletonYawOffsetRad = 0;
                        record.model.rotation.set(0, w.startYaw + roomRotY, 0);
                        record.scriptWalkRoutine = null;
                        record.scriptIndex = (record.scriptIndex + 1) % actions.length;
                        record.scriptPhaseKey = "";
                        this.resetWalkClipTimeScales(record);
                        this.fadeToAction(record, "Idle", FADE_DURATION);
                        entity.setValue(NPCAvatarComponent, "currentState", "Idle");
                    }
                    break;
                }
                break;
            }
            case "wait":
            case "idle":
            case "wave":
            case "sit": {
                record.scriptTimer -= dt;
                record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
                record.lastRoomLocalPos = { ...roomLocal };
                if (
                    (action.type === "wait" || action.type === "idle") &&
                    record.currentAction !== "Idle" &&
                    !["Wave", "Sitting", "Sit"].includes(record.currentAction)
                ) {
                    this.fadeToAction(record, "Idle", FADE_DURATION);
                }
                if (record.scriptTimer <= 0) {
                    record.scriptIndex = (record.scriptIndex + 1) % actions.length;
                    record.scriptPhaseKey = "";
                    if (action.type === "sit") {
                        this.fadeToAction(record, "Idle", FADE_DURATION);
                    }
                }
                entity.setValue(NPCAvatarComponent, "currentState", record.currentAction);
                break;
            }
            default:
                record.scriptIndex = (record.scriptIndex + 1) % actions.length;
                record.scriptPhaseKey = "";
        }
    }

    // ── UPDATE LOOP ─────────────────────────────────────────────────────

    update(dt: number): void {
        this.timeElapsed += dt;

        const camera = this.world.camera;
        if (!camera) return;

        const userWorldX = (camera as any).position.x;
        const userWorldZ = (camera as any).position.z;

        for (const [npcId, record] of this.npcRecords) {
            const entity = record.entity;
            const roomModel = (globalThis as any).__labRoomModel;
            const roomRotY = roomModel ? roomModel.rotation.y : 0;

            // Room-local transform
            const currentWorldPos = { x: record.model.position.x, y: record.model.position.y, z: record.model.position.z };
            const roomLocal = this.worldToRoomLocal(currentWorldPos.x, currentWorldPos.y, currentWorldPos.z);

            const runScript =
                record.scriptActions &&
                record.scriptActions.length > 0 &&
                !record.isInConversation &&
                !record.isSpeaking;

            if (runScript) {
                this.processBehaviorScript(npcId, record, entity, roomLocal, roomRotY, dt);
            } else if (record.lastRoomLocalPos !== null) {
                const posDiff = Math.sqrt(
                    (roomLocal.x - record.lastRoomLocalPos.x) ** 2 + (roomLocal.z - record.lastRoomLocalPos.z) ** 2,
                );
                if (posDiff > 0.1) {
                    record.model.position.set(record.lastRoomLocalPos.x, record.lastRoomLocalPos.y, record.lastRoomLocalPos.z);
                } else {
                    record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
                    record.lastRoomLocalPos = { ...roomLocal };
                }
            } else {
                record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
                record.lastRoomLocalPos = { ...roomLocal };
            }

            record.model.rotation.y -= roomRotY;

            // Proximity detection
            const userLocal = this.worldToRoomLocal(userWorldX, 0, userWorldZ);
            const distToUser = Math.sqrt(
                (record.model.position.x - userLocal.x) ** 2 + (record.model.position.z - userLocal.z) ** 2,
            );

            const wasInRange = entity.getValue(NPCAvatarComponent, "userInRange") as boolean;
            const isNowInRange = wasInRange ? distToUser <= DISENGAGE_RADIUS : distToUser <= ENGAGEMENT_RADIUS;

            if (isNowInRange && !wasInRange) {
                entity.setValue(NPCAvatarComponent, "userInRange", true);
                entity.setValue(NPCAvatarComponent, "proximityState", "waving_hello");
                if (!this.activeConversationNpcId) {
                    this.startConversation(npcId);
                } else {
                    this.playWaveAnimation(record, npcId, "hello_silent");
                }
            }

            if (!isNowInRange && wasInRange) {
                entity.setValue(NPCAvatarComponent, "userInRange", false);
                entity.setValue(NPCAvatarComponent, "proximityState", "waving_goodbye");
                if (this.activeConversationNpcId === npcId) {
                    this.endConversation(npcId, "user_left");
                } else {
                    this.playWaveAnimation(record, npcId, "goodbye_silent");
                }
            }

            // Update proximity state (no rotation tracking)
            if (isNowInRange) {
                const ps = entity.getValue(NPCAvatarComponent, "proximityState") as string;
                if (ps === "waving_hello" && !record.isPlayingWave) {
                    entity.setValue(NPCAvatarComponent, "proximityState", "engaged");
                }
            } else {
                const ps = entity.getValue(NPCAvatarComponent, "proximityState") as string;
                if (ps === "waving_goodbye" && !record.isPlayingWave) {
                    entity.setValue(NPCAvatarComponent, "proximityState", "idle");
                }
            }

            // Back to world — scripted root position is final before mixer so skeleton samples match this frame
            const worldPos = this.roomLocalToWorld(record.model.position.x, record.model.position.y, record.model.position.z);
            record.model.position.set(worldPos.x, worldPos.y, worldPos.z);
            record.model.rotation.y += roomRotY;

            record.mixer.update(dt);
            this.applySkeletonYawAfterMixer(record);
            this.processProceduralLipSync(record, dt);
        }
    }

    destroy(): void {
        for (const [, record] of this.npcRecords) {
            if (record.mediaRecorder?.state === "recording") record.mediaRecorder.stop();
            if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
            record.mixer.stopAllAction();
            const obj = record.entity.object3D;
            if (obj?.parent) obj.parent.remove(obj);
            record.entity.destroy();
        }
        this.npcRecords.clear();
        this.activeConversationNpcId = null;
        console.log("[NPCAvatar] System destroyed");
    }
}