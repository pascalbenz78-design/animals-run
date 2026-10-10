/**
 * Einstellungen für den Mehrspieler (WebRTC über PeerJS).
 * Die Geräte verbinden sich direkt miteinander. Der PeerJS-Vermittlungsserver
 * (0.peerjs.com) hilft nur beim Verbindungsaufbau, die Spieldaten laufen direkt.
 */

export const NET = {
  /** Fester Präfix: aus dem Raumcode wird die Peer-ID des Gastgebers (z. B. «animalsrun-v1-K7PQ») */
  idPrefix: 'animalsrun-v1-',
  /** Zeichen für den Raumcode (ohne leicht verwechselbare wie 0/O, 1/I) */
  codeChars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  codeLength: 4,
  /** Höchstens so viele Menschen pro Rennen */
  maxPlayers: 4,
  /** Spielzustand vom Gastgeber: alle so vielen Simulationsschritte (60 Hz / 3 = 20-mal pro Sekunde) */
  snapshotEvery: 3,
  /** Ping-Intervall in Millisekunden */
  pingInterval: 2000,
  /** Höchstens so viele Schritte rechnet ein Mitspieler dem Gastgeber voraus (45 = 0,75 s), dann wartet er */
  maxAhead: 45,
  /** Ab dieser Abweichung wird ein Tier direkt versetzt statt sanft nachgeführt (Meter) */
  snapDistance: 6,
  /** Wie schnell Abweichungen sanft ausgeglichen werden (pro Sekunde) */
  smoothing: 10,
  /**
   * ICE-Server für den Verbindungsaufbau. Für Mobilfunknetze, die direkte Verbindungen blockieren,
   * kann hier später ein TURN-Server ergänzt werden, z. B.:
   * { urls: 'turn:turn.example.org:3478', username: 'name', credential: 'passwort' }
   */
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] as RTCIceServer[],
};
