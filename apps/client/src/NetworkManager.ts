import * as Y from 'yjs';
import type { CursorPresence } from 'shared-types';

export type CursorCallback = (presence: CursorPresence) => void;

/**
 * Dual-Protocol Network Transport Layer
 * 1. WebSockets: Handles reliable, persistent Yjs CRDT state mutations via a central server.
 * 2. WebRTC Data Channels: Handles high-frequency, ephemeral cursor data directly peer-to-peer to minimize server load and latency.
 */
export class NetworkManager {
  private ws: WebSocket;
  private yDoc: Y.Doc;
  private userId: string;
  
  // WebRTC Mesh State
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private onCursorUpdate: CursorCallback;

  constructor(yDoc: Y.Doc, roomId: string, userId: string, onCursorUpdate: CursorCallback) {
    this.yDoc = yDoc;
    this.userId = userId;
    this.onCursorUpdate = onCursorUpdate;

    // Initialize WebSocket for Yjs Sync & WebRTC Signaling
    // In production, this URL would point to your Cloudflare Worker URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:8787' : window.location.host;
    
    this.ws = new WebSocket(`${protocol}//${host}/room/${roomId}`);
    this.ws.binaryType = 'arraybuffer';
    
    this.setupWebSocket();
    this.setupYjsHooks();
  }

  private setupWebSocket() {
    this.ws.onopen = () => {
      // 1. Send our full local Yjs state to sync with existing clients in the room
      const stateUpdate = Y.encodeStateAsUpdate(this.yDoc);
      this.ws.send(stateUpdate);
      
      // 2. Announce presence to the room for WebRTC mesh signaling
      this.sendSignal({ type: 'join', userId: this.userId });
    };

    this.ws.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        // --- Persistent Data: Yjs binary update over WebSocket ---
        const update = new Uint8Array(event.data);
        Y.applyUpdate(this.yDoc, update, this); 
      } else if (typeof event.data === 'string') {
        // --- Signaling Data: WebRTC connection setup via WebSocket ---
        try {
          const signal = JSON.parse(event.data);
          await this.handleSignal(signal);
        } catch (error) {
          console.error('Failed to parse signaling data', error);
        }
      }
    };
  }

  private setupYjsHooks() {
    // Whenever our local Yjs document changes, broadcast the update to the WebSocket server
    this.yDoc.on('update', (update: Uint8Array, origin: any) => {
      // Don't echo back updates we just received from the network
      if (origin !== this && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(update);
      }
    });
  }

  // --- WebRTC Mesh Network Implementation ---

  private sendSignal(payload: Record<string, any>) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...payload, senderId: this.userId }));
    }
  }

  private async handleSignal(signal: Record<string, any>) {
    const { type, senderId, targetId, sdp, candidate } = signal;
    
    // Ignore our own signals, or signals strictly meant for other peers
    if (senderId === this.userId) return;
    if (targetId && targetId !== this.userId) return;

    switch (type) {
      case 'join': {
        // A new user joined, initiate a P2P connection as the offerer
        const peer = this.createPeerConnection(senderId);
        const channel = peer.createDataChannel('cursor-sync', { negotiated: false, ordered: false });
        this.setupDataChannel(senderId, channel);
        
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', targetId: senderId, sdp: peer.localDescription });
        break;
      }
      case 'offer': {
        // We received an offer, answer it
        const answeringPeer = this.createPeerConnection(senderId);
        await answeringPeer.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await answeringPeer.createAnswer();
        await answeringPeer.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', targetId: senderId, sdp: answeringPeer.localDescription });
        break;
      }
      case 'answer': {
        // Our offer was answered, finalize connection
        const existingPeer = this.peers.get(senderId);
        if (existingPeer) {
          await existingPeer.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        break;
      }
      case 'ice-candidate': {
        // Exchange ICE routing candidates
        const targetPeer = this.peers.get(senderId);
        if (targetPeer && candidate) {
          await targetPeer.addIceCandidate(new RTCIceCandidate(candidate));
        }
        break;
      }
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({ type: 'ice-candidate', targetId: peerId, candidate: event.candidate });
      }
    };

    peer.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        this.peers.delete(peerId);
        this.dataChannels.delete(peerId);
      }
    };

    this.peers.set(peerId, peer);
    return peer;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onmessage = (event) => {
      try {
        const presence = JSON.parse(event.data) as CursorPresence;
        this.onCursorUpdate(presence);
      } catch (e) {
        // Silently drop malformed ephemeral packets
      }
    };
    this.dataChannels.set(peerId, channel);
  }

  /**
   * Broadcasts cursor position directly to peers over WebRTC Data Channels,
   * bypassing the WebSocket server for minimal latency (ideal for 60fps rendering).
   */
  public broadcastCursor(presence: CursorPresence) {
    const payload = JSON.stringify(presence);
    for (const channel of this.dataChannels.values()) {
      if (channel.readyState === 'open') {
        channel.send(payload);
      }
    }
  }

  public disconnect() {
    this.ws.close();
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.dataChannels.clear();
  }
}