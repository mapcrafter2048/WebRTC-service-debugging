"use client";

import { useState } from "react";
import { useWebRTC } from "@/hooks/useWebRTC";

export default function Home() {
  const {
    roomId,
    isConnected,
    messages,
    logs,
    connectionState,
    createRoom,
    joinRoom,
    sendMessage,
    disconnect,
  } = useWebRTC();

  const [inputRoomId, setInputRoomId] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const handleCreateRoom = () => {
    createRoom();
  };

  const handleJoinRoom = () => {
    if (inputRoomId.trim()) {
      joinRoom(inputRoomId.trim());
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim() && isConnected) {
      sendMessage(messageInput.trim());
      setMessageInput("");
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">
          WebRTC Data Channel Demo
        </h1>

        {/* Connection Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Connection
          </h2>

          {!roomId ? (
            <div className="space-y-4">
              <div>
                <button
                  onClick={handleCreateRoom}
                  className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-medium"
                >
                  Create Room
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value)}
                  placeholder="Enter Room ID to join"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded text-gray-900"
                />
                <button
                  onClick={handleJoinRoom}
                  className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-medium"
                >
                  Join Room
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <p className="text-sm text-gray-600 mb-1">Room ID:</p>
                <p className="font-mono text-lg font-semibold text-gray-900 break-all">
                  {roomId}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Status:</span>
                <span
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    isConnected
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {connectionState}
                </span>
              </div>

              <button
                onClick={disconnect}
                className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 font-medium"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Messages */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
              Messages
            </h2>

            <div className="space-y-2 mb-4 h-64 overflow-y-auto border border-gray-200 rounded p-3 bg-gray-50">
              {messages.length === 0 ? (
                <p className="text-gray-400 text-sm">No messages yet</p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded ${
                      msg.sender === "me"
                        ? "bg-blue-100 text-blue-900 ml-8"
                        : "bg-green-100 text-green-900 mr-8"
                    }`}
                  >
                    <div className="text-xs text-gray-500 mb-1">
                      {msg.sender === "me" ? "You" : "Peer"}
                    </div>
                    <div className="text-sm">{msg.text}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                disabled={!isConnected}
                className="flex-1 px-4 py-2 border border-gray-300 rounded disabled:bg-gray-100 text-gray-900"
              />
              <button
                type="submit"
                disabled={!isConnected}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300 font-medium"
              >
                Send
              </button>
            </form>
          </div>

          {/* Logs */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Logs</h2>

            <div className="h-96 overflow-y-auto border border-gray-200 rounded p-3 bg-black text-green-400 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-gray-500">No logs yet</p>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="text-gray-500">[{log.timestamp}]</span>{" "}
                    <span
                      className={
                        log.type === "error"
                          ? "text-red-400"
                          : log.type === "success"
                          ? "text-green-400"
                          : log.type === "warning"
                          ? "text-yellow-400"
                          : log.type === "ice"
                          ? "text-blue-400"
                          : log.type === "message"
                          ? "text-purple-400"
                          : "text-gray-300"
                      }
                    >
                      [{log.type.toUpperCase()}]
                    </span>{" "}
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
