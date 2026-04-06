/**
 * Shared visual scale for humanoid RPM-style avatars (player + NPCs).
 * Collision radii/heights in collision.ts are scaled relative to this baseline.
 * Robot assistant uses its own scale in RobotAssistantSystem.
 */
export const AVATAR_VISUAL_SCALE = 0.76; // was 0.8; ~0.95× for slightly smaller silhouettes
