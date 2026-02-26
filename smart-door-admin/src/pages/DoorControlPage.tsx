import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DoorOpen, Lock, Unlock } from "lucide-react";
import { ref, push, set, serverTimestamp } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export default function DoorControlPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const { user } = useAuth();

  const handleOpenDoor = async () => {
    if (!rtdb) return;
    setLoading(true);
    setStatus("idle");

    try {
      // Push a new command to 'door_commands' list
      const commandsRef = ref(rtdb, "door_commands");
      const newCommandRef = push(commandsRef);
      await set(newCommandRef, {
        command: "OPEN",
        timestamp: new Date().toISOString(), // Use ISO string for consistency with logs
        requestedBy: user?.email,
        status: "PENDING",
      });

      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      console.error("Error opening door:", error);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Door Control</h1>
        <p className="text-zinc-500 mt-2">Remote access control for the main entrance</p>
      </div>

      <Card className="w-full max-w-md border-2">
        <CardHeader className="text-center">
          <CardTitle>Manual Override</CardTitle>
          <CardDescription>
            Press and hold to unlock the door remotely.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-10">
          <Button
            size="lg"
            className={`h-48 w-48 rounded-full border-8 text-xl font-bold transition-all ${
              status === "success"
                ? "border-green-500 bg-green-100 text-green-700 hover:bg-green-200"
                : "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200"
            }`}
            onClick={handleOpenDoor}
            disabled={loading}
          >
            <div className="flex flex-col items-center gap-2">
              {loading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
              ) : status === "success" ? (
                <>
                  <Unlock className="h-12 w-12" />
                  <span>UNLOCKED</span>
                </>
              ) : (
                <>
                  <Lock className="h-12 w-12" />
                  <span>UNLOCK</span>
                </>
              )}
            </div>
          </Button>
          
          {status === "success" && (
            <p className="mt-6 text-sm font-medium text-green-600 animate-pulse">
              Command sent successfully!
            </p>
          )}
          {status === "error" && (
            <p className="mt-6 text-sm font-medium text-red-600">
              Failed to send command. Try again.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
