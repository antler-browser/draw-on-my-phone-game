export { decodeAndVerifyJWT, type IRLJWTPayload } from './jwt.js'
export {
  SocialPlatform,
  getPlatformDisplayName,
  getPlatformPlaceholder,
  getPlatforSVGIcon,
  sanitizeInput,
  normalizeHandle,
  validateHandle,
  getFullURL,
  createSocialLink,
  getHandleFromURL,
  type SocialLink
} from './social-links.js'
export type {
  Game,
  Player,
  ServerGameState,
  GameStateUpdate,
  Submission,
  TaskType,
  WebSocketMessageType,
  WebSocketMessage,
  GameStateFullMessage,
  GameStateUpdateMessage,
  ErrorMessage
} from './types.js'

export {
  getTaskType,
  getChainOwnerPosition,
  getNextChainHolder,
  isGameComplete,
  getTotalRounds,
  getRandomWords
} from './game-logic.js'
