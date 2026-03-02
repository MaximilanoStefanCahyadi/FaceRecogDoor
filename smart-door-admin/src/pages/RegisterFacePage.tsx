import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Camera, RefreshCw, Save, UserPlus } from "lucide-react";

// HAPUS import firebase/storage karena kita pakai Local Storage Python
import { ref as dbRef, push, set } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterFacePage() {
  const webcamRef = useRef<Webcam>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const { user } = useAuth();

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setImgSrc(imageSrc);
    }
  }, [webcamRef]);

  const retake = () => {
    setImgSrc(null);
    setStatus("idle");
    setErrorMessage("");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgSrc || !name) return;

    setLoading(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const safeName = name.replace(/\s+/g, '_').toUpperCase();

      if (rtdb) {
        // 1. Masukkan ke Antrean Registrasi (Untuk dibaca Python)
        const queueRef = dbRef(rtdb, "registration_queue");
        const newQueueRef = push(queueRef);
        await set(newQueueRef, {
          name: safeName,
          image_base64: imgSrc, // Langsung kirim teks Base64 dari webcam!
          timestamp: new Date().toISOString()
        });

        // 2. Masukkan ke Daftar User (Untuk tabel Dashboard web Anda)
        const usersRef = dbRef(rtdb, "users");
        const newUserRef = push(usersRef);
        await set(newUserRef, {
          name: safeName,
          registeredBy: user?.email || "admin",
          registeredAt: new Date().toISOString(),
          status: "active",
        });
      }

      setStatus("success");
      setName("");
      setImgSrc(null);
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error: any) {
      console.error("Error registering face:", error);
      setStatus("error");
      setErrorMessage(error.message || "Terjadi kesalahan saat mengirim ke Firebase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Register New Face</h1>
          <p className="text-zinc-500 mt-1">Add a new authorized user to the local AI system.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Capture Photo</CardTitle>
            <CardDescription>Ensure the face is clearly visible and well-lit.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black flex justify-center items-center">
              {imgSrc ? (
                <img src={imgSrc} alt="Captured face" className="h-full w-full object-cover" />
              ) : (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: "user" }}
                  className="h-full w-full object-cover"
                  mirrored={true} // Biasanya webcam laptop lebih natural jika di-mirror
                  screenshotQuality={1}
                />
              )}
            </div>

            <div className="flex w-full gap-2 mt-4">
              {imgSrc ? (
                <Button variant="outline" className="w-full" onClick={retake}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retake
                </Button>
              ) : (
                <Button className="w-full" onClick={capture}>
                  <Camera className="mr-2 h-4 w-4" />
                  Capture
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>User Details</CardTitle>
            <CardDescription>Enter the information for the new user.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Full Name
                </label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 p-4 text-sm text-zinc-500 dark:text-zinc-400">
                <p>
                  By registering this user, their facial data will be securely processed by the Local AI Edge Controller.
                </p>
              </div>

              <div className="pt-4">
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !imgSrc || !name}
                >
                  {loading ? (
                    "Registering to Edge Controller..."
                  ) : status === "success" ? (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Registered!
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save User
                    </>
                  )}
                </Button>
              </div>
              
              {status === "success" && (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-600 text-center font-medium">
                  User registered successfully to AI Memory!
                </div>
              )}
              {status === "error" && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 text-center font-medium">
                  {errorMessage}
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}