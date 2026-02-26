import React, { useEffect, useState } from "react";
import { ref, onValue, query, limitToLast } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface AccessLog {
  id: string;
  timestamp: string;
  name?: string;
  snapshot?: string;
  method?: string;
  status?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rtdb) {
      setError("Firebase Realtime Database is not initialized.");
      setLoading(false);
      return;
    }

    const logsRef = ref(rtdb, "logs");
    // Get last 50 logs
    const recentLogsQuery = query(logsRef, limitToLast(50));

    const unsubscribe = onValue(recentLogsQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array and reverse to show newest first
        const logsList = Object.entries(data).map(([key, value]: [string, any]) => ({
          id: key,
          ...value,
        })).reverse();
        setLogs(logsList);
        setError(null);
      } else {
        setLogs([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching logs:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 text-red-500">
        <p className="text-lg font-semibold">Error loading logs</p>
        <p className="text-sm">{error}</p>
        <p className="text-xs text-zinc-500">Check your Firebase Realtime Database Rules.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Access Logs</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Image</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500">
                    No logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.timestamp || "N/A"}
                    </TableCell>
                    <TableCell>{log.name || "Unknown"}</TableCell>
                    <TableCell>{log.method || "Face ID"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          log.status === "Success" || log.status === "Granted" || !log.status // Default to success if undefined
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.status || "Granted"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.snapshot ? (
                        <img
                          src={log.snapshot}
                          alt="Snapshot"
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">No Image</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
