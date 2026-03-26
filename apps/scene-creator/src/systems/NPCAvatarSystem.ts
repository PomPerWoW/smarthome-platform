import {
    createSystem,
    Entity,
    Object3D,
    AssetManager,
    AnimationMixer,
    AnimationAction,
    LoopOnce,
} from "@iwsdk/core";

import { Box3, MathUtils, SkinnedMesh } from "three";
import { SkeletonUtils } from "three-stdlib";
import { NPCAvatarComponent } from "../components/NPCAvatarComponent";
import { getRoomBounds, getWorldFloorY, roomLocalToWorld } from "../config/navmesh";
import { BackendApiClient } from "../api/BackendApiClient";

// CONFIG

const FADE_DURATION = 0.25;
const ENGAGEMENT_RADIUS = 1.2;
const DISENGAGE_RADIUS = 1.8;
const WAVE_COOLDOWN = 5.0;
const LISTEN_START_DELAY_MS = 600;
const MAX_RECORDING_DURATION = 15000;
const SILENCE_DURATION = 1200;

// Update this once you see the voice list in console
const NPC_VOICE_CONFIG: Record<string, { pitch: number; rate: number; voiceIndex?: number }> = {
    npc1: { pitch: 1.0, rate: 1.0, voiceIndex: 182 }, // Alice - Google UK English Female
    npc2: { pitch: 1.0, rate: 1.0, voiceIndex: 183 }, // Bob - Google UK English Male
    npc3: { pitch: 1.0, rate: 1.0, voiceIndex: 181 }, // Carol - Google US English
    npc4: { pitch: 0.8, rate: 0.9, voiceIndex: 183 }, // Mike - Google UK English Male (Deeper/Slower)
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
}

// NPC AVATAR SYSTEM

export class NPCAvatarSystem extends createSystem({
    npcs: {
        required: [NPCAvatarComponent],
    },
}) {
    private npcRecords: Map<string, NPCAvatarRecord> = new Map();
    private timeElapsed = 0;
    private activeConversationNpcId: string | null = null;

    init() {
        console.log("[NPCAvatar] System initialized (stationary NPCs with LLM chat + procedural lip-sync)");

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
                    resolve();
                };

                u.onerror = () => {
                    record.isSpeaking = false;
                    record.lipSync.isActive = false;
                    this.resetAllVisemes(record);
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

        navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }).then((stream) => {
            if (this.activeConversationNpcId !== npcId) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }

            record.audioChunks = [];
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus" : "audio/webm";

            record.mediaRecorder = new MediaRecorder(stream, { mimeType });

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
            npcModel.scale.setScalar(0.8);
            npcModel.position.set(finalX, finalY, finalZ);
            npcModel.rotation.set(0, initialRotation, 0);
            npcModel.visible = true;
            this.world.scene.add(npcModel);

            const targetFloorY = roomBounds ? getWorldFloorY() : finalY;
            const feetY = this.alignFeetToFloor(npcModel, targetFloorY);

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
            } else {
                console.log(`[NPCAvatar] 👄 ${npcName}: ${morphTargetMeshes.length} lip-sync meshes ready`);
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

    // ── UPDATE LOOP ─────────────────────────────────────────────────────

    update(dt: number): void {
        this.timeElapsed += dt;

        const camera = this.world.camera;
        if (!camera) return;

        const userWorldX = (camera as any).position.x;
        const userWorldZ = (camera as any).position.z;

        for (const [npcId, record] of this.npcRecords) {
            record.mixer.update(dt);

            // Procedural lip-sync (every frame)
            this.processProceduralLipSync(record, dt);

            const entity = record.entity;
            const roomModel = (globalThis as any).__labRoomModel;
            const roomRotY = roomModel ? roomModel.rotation.y : 0;

            // Room-local transform
            const currentWorldPos = { x: record.model.position.x, y: record.model.position.y, z: record.model.position.z };
            const roomLocal = this.worldToRoomLocal(currentWorldPos.x, currentWorldPos.y, currentWorldPos.z);

            if (record.lastRoomLocalPos !== null) {
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

            // Back to world
            const worldPos = this.roomLocalToWorld(record.model.position.x, record.model.position.y, record.model.position.z);
            record.model.position.set(worldPos.x, worldPos.y, worldPos.z);
            record.model.rotation.y += roomRotY;
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