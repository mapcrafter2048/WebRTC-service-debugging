"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  addDoc,
} from "firebase/firestore";

const FALLBACK_STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTC() {
  const [roomId, setRoomId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [connectionState, setConnectionState] = useState("new");

  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const unsubscribeRef = useRef(null);
  const iceServersConfig = useRef(null);

  const addLog = useCallback((message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${type.toUpperCase()}]`, message);
    setLogs((prev) => [...prev, { timestamp, message, type }]);
  }, []);

  // Fetch ICE servers (STUN + TURN) from Cloudflare
  const fetchIceServers = useCallback(async () => {
    try {
      addLog("Fetching ICE servers from Cloudflare...", "info");

      const response = await fetch("/api/ice-servers", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ICE servers: ${response.status}`);
      }

      const data = await response.json();

      if (data.iceServers && data.iceServers.length > 0) {
        addLog(
          `Received ${data.iceServers.length} ICE servers from Cloudflare`,
          "success"
        );

        // Log each server type
        data.iceServers.forEach((server) => {
          const serverType = server.urls.includes("turn") ? "TURN" : "STUN";
          addLog(`  ${serverType}: ${server.urls}`, "ice");
        });

        iceServersConfig.current = { iceServers: data.iceServers };
        return iceServersConfig.current;
      } else {
        throw new Error("No ICE servers returned");
      }
    } catch (error) {
      addLog(
        `Failed to fetch Cloudflare ICE servers: ${error.message}`,
        "warning"
      );
      addLog("Falling back to Google STUN servers only", "warning");
      iceServersConfig.current = FALLBACK_STUN_SERVERS;
      return iceServersConfig.current;
    }
  }, [addLog]);

  // Create a new room (caller/offerer)
  const createRoom = useCallback(async () => {
    try {
      addLog("Creating new room...", "info");

      // Fetch ICE servers first
      const config = await fetchIceServers();

      // Create peer connection
      peerConnection.current = new RTCPeerConnection(config);
      addLog(
        "RTCPeerConnection created with Cloudflare TURN servers",
        "success"
      );

      // Create data channel
      dataChannel.current = peerConnection.current.createDataChannel(
        "messaging",
        {
          ordered: true,
        }
      );
      addLog("Data channel created: messaging", "success");

      setupDataChannel();
      setupPeerConnectionListeners();

      // Create room document in Firestore
      const roomRef = doc(collection(db, "rooms"));
      const newRoomId = roomRef.id;
      addLog(`Room ID generated: ${newRoomId}`, "info");

      // Set up ICE candidate listener
      const callerCandidatesCollection = collection(
        roomRef,
        "callerCandidates"
      );
      peerConnection.current.onicecandidate = async (event) => {
        if (event.candidate) {
          addLog(
            `New ICE candidate (caller): ${event.candidate.candidate}`,
            "ice"
          );
          await addDoc(callerCandidatesCollection, event.candidate.toJSON());
        }
      };

      // Create offer
      addLog("Creating offer...", "info");
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      addLog("Local description set (offer)", "success");

      const roomData = {
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        createdAt: new Date().toISOString(),
      };

      await setDoc(roomRef, roomData);
      addLog("Room created in Firestore", "success");
      setRoomId(newRoomId);

      // Listen for answer
      addLog("Waiting for peer to join...", "info");
      unsubscribeRef.current = onSnapshot(roomRef, async (snapshot) => {
        const data = snapshot.data();
        if (data?.answer && !peerConnection.current.remoteDescription) {
          addLog("Received answer from peer", "success");
          const answer = new RTCSessionDescription(data.answer);
          await peerConnection.current.setRemoteDescription(answer);
          addLog("Remote description set (answer)", "success");
        }
      });

      // Listen for callee ICE candidates
      const calleeCandidatesCollection = collection(
        roomRef,
        "calleeCandidates"
      );
      onSnapshot(calleeCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            addLog(
              `Adding ICE candidate from peer: ${candidate.candidate}`,
              "ice"
            );
            await peerConnection.current.addIceCandidate(candidate);
          }
        });
      });
    } catch (error) {
      addLog(`Error creating room: ${error.message}`, "error");
      console.error("Create room error:", error);
    }
  }, [addLog, fetchIceServers, setupDataChannel, setupPeerConnectionListeners]);

  // Join an existing room (callee/answerer)
  const joinRoom = useCallback(
    async (roomIdToJoin) => {
      try {
        addLog(`Joining room: ${roomIdToJoin}`, "info");

        const roomRef = doc(db, "rooms", roomIdToJoin);
        const roomSnapshot = await getDoc(roomRef);

        if (!roomSnapshot.exists()) {
          addLog("Room not found!", "error");
          alert("Room not found!");
          return;
        }

        addLog("Room found, setting up connection...", "success");

        // Fetch ICE servers first
        const config = await fetchIceServers();

        // Create peer connection
        peerConnection.current = new RTCPeerConnection(config);
        addLog(
          "RTCPeerConnection created with Cloudflare TURN servers",
          "success"
        );

        setupPeerConnectionListeners();

        // Listen for data channel from caller
        peerConnection.current.ondatachannel = (event) => {
          addLog("Data channel received from peer", "success");
          dataChannel.current = event.channel;
          setupDataChannel();
        };

        // Set up ICE candidate listener
        const calleeCandidatesCollection = collection(
          roomRef,
          "calleeCandidates"
        );
        peerConnection.current.onicecandidate = async (event) => {
          if (event.candidate) {
            addLog(
              `New ICE candidate (callee): ${event.candidate.candidate}`,
              "ice"
            );
            await addDoc(calleeCandidatesCollection, event.candidate.toJSON());
          }
        };

        // Get offer and set remote description
        const offer = roomSnapshot.data().offer;
        addLog("Setting remote description (offer)", "info");
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        addLog("Remote description set", "success");

        // Create answer
        addLog("Creating answer...", "info");
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        addLog("Local description set (answer)", "success");

        await updateDoc(roomRef, {
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
        });
        addLog("Answer sent to Firestore", "success");

        setRoomId(roomIdToJoin);

        // Listen for caller ICE candidates
        const callerCandidatesCollection = collection(
          roomRef,
          "callerCandidates"
        );
        onSnapshot(callerCandidatesCollection, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
              const candidate = new RTCIceCandidate(change.doc.data());
              addLog(
                `Adding ICE candidate from peer: ${candidate.candidate}`,
                "ice"
              );
              await peerConnection.current.addIceCandidate(candidate);
            }
          });
        });
      } catch (error) {
        addLog(`Error joining room: ${error.message}`, "error");
        console.error("Join room error:", error);
      }
    },
    [addLog, fetchIceServers, setupDataChannel, setupPeerConnectionListeners]
  );

  const setupDataChannel = useCallback(() => {
    if (!dataChannel.current) return;

    dataChannel.current.onopen = () => {
      addLog("Data channel opened!", "success");
      setIsConnected(true);
      setConnectionState("connected");
    };

    dataChannel.current.onclose = () => {
      addLog("Data channel closed", "warning");
      setIsConnected(false);
      setConnectionState("disconnected");
    };

    dataChannel.current.onerror = (error) => {
      addLog(`Data channel error: ${error}`, "error");
    };

    dataChannel.current.onmessage = (event) => {
      addLog(`Message received: ${event.data}`, "message");
      setMessages((prev) => [
        ...prev,
        { text: event.data, sender: "peer", timestamp: Date.now() },
      ]);
    };
  }, [addLog]);

  const setupPeerConnectionListeners = useCallback(() => {
    if (!peerConnection.current) return;

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      addLog(`Connection state changed: ${state}`, "info");
      setConnectionState(state);
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current.iceConnectionState;
      addLog(`ICE connection state changed: ${state}`, "ice");
    };

    peerConnection.current.onicegatheringstatechange = () => {
      const state = peerConnection.current.iceGatheringState;
      addLog(`ICE gathering state changed: ${state}`, "ice");
    };

    peerConnection.current.onsignalingstatechange = () => {
      const state = peerConnection.current.signalingState;
      addLog(`Signaling state changed: ${state}`, "info");
    };
  }, [addLog]);

  const sendMessage = useCallback(
    (message) => {
      if (!dataChannel.current || dataChannel.current.readyState !== "open") {
        addLog("Cannot send message: data channel not open", "error");
        return;
      }

      try {
        dataChannel.current.send(message);
        addLog(`Message sent: ${message}`, "message");
        setMessages((prev) => [
          ...prev,
          { text: message, sender: "me", timestamp: Date.now() },
        ]);
      } catch (error) {
        addLog(`Error sending message: ${error.message}`, "error");
      }
    },
    [addLog]
  );

  const disconnect = useCallback(() => {
    addLog("Disconnecting...", "info");

    if (dataChannel.current) {
      dataChannel.current.close();
      dataChannel.current = null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setIsConnected(false);
    setConnectionState("closed");
    addLog("Disconnected", "success");
  }, [addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dataChannel.current) dataChannel.current.close();
      if (peerConnection.current) peerConnection.current.close();
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  return {
    roomId,
    isConnected,
    messages,
    logs,
    connectionState,
    createRoom,
    joinRoom,
    sendMessage,
    disconnect,
  };
}
