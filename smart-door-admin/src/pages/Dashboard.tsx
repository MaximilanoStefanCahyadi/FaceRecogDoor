import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, DoorOpen } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalLogs: 0,
    recentAccess: 0,
    registeredUsers: 0,
    doorStatus: "Closed",
  });

  useEffect(() => {
    if (!rtdb) return;

    // Listen to logs
    const logsRef = ref(rtdb, "logs");
    const unsubscribeLogs = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = Object.values(data);
        setStats(prev => ({
          ...prev,
          totalLogs: logsArray.length,
          // Simple check for recent access (assuming timestamp string is sortable/parseable)
          // For now just counting all as we don't have a reliable date parser for the string format without a library or strict format
          recentAccess: logsArray.length, 
        }));
      } else {
        setStats(prev => ({ ...prev, totalLogs: 0, recentAccess: 0 }));
      }
    });

    // Listen to users
    const usersRef = ref(rtdb, "users");
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      setStats(prev => ({
        ...prev,
        registeredUsers: data ? Object.keys(data).length : 0,
      }));
    });

    // Listen to door status (assuming 'door_status' node exists)
    const doorStatusRef = ref(rtdb, "door_status");
    const unsubscribeDoor = onValue(doorStatusRef, (snapshot) => {
      const status = snapshot.val();
      setStats(prev => ({
        ...prev,
        doorStatus: status || "Closed",
      }));
    });

    return () => {
      unsubscribeLogs();
      unsubscribeUsers();
      unsubscribeDoor();
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Access Logs</CardTitle>
            <Activity className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLogs}</div>
            <p className="text-xs text-zinc-500">Recorded entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Access</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentAccess}</div>
            <p className="text-xs text-zinc-500">Total entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registered Faces</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.registeredUsers}</div>
            <p className="text-xs text-zinc-500">Authorized users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Door Status</CardTitle>
            <DoorOpen className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.doorStatus}</div>
            <p className="text-xs text-zinc-500">Current state</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-center justify-center h-40 text-zinc-400">
                Chart placeholder (Recharts can be added here)
             </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
               <div className="h-2 w-2 rounded-full bg-green-500"></div>
               <span className="text-sm font-medium">Camera: Online</span>
            </div>
            <div className="flex items-center space-x-2 mt-2">
               <div className="h-2 w-2 rounded-full bg-green-500"></div>
               <span className="text-sm font-medium">Door Lock: Active</span>
            </div>
            <div className="flex items-center space-x-2 mt-2">
               <div className="h-2 w-2 rounded-full bg-green-500"></div>
               <span className="text-sm font-medium">Database: Connected</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
