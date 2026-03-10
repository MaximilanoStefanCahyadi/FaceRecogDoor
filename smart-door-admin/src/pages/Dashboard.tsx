import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, DoorOpen, Server, Camera, Lock, Database } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from "date-fns";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalLogs: 0,
    recentAccess: 0,
    registeredUsers: 0,
    doorStatus: "Closed",
  });
  const [chartData, setChartData] = useState<any[]>([]);

  // State khusus untuk Kesehatan Sistem Real-time
  const [health, setHealth] = useState({
    isOnline: false, // Apakah mesin edge hidup?
    camera: false,
    arduino: false,
    database: false, // Apakah Web React ini terhubung ke Firebase?
  });

  // Ref untuk menyimpan timestamp terakhir dari Python agar bisa dicek oleh setInterval
  const lastSeenRef = useRef<number>(0);

  useEffect(() => {
    if (!rtdb) return;

    // 1. Cek koneksi Web ke Firebase Database
    const connectedRef = ref(rtdb, ".info/connected");
    const unsubConnection = onValue(connectedRef, (snap) => {
      setHealth(prev => ({ ...prev, database: snap.val() === true }));
    });

    // 2. Listen ke Detak Jantung Mesin (Python)
    const healthRef = ref(rtdb, "system_health");
    const unsubHealth = onValue(healthRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Simpan waktu terakhir terlihat
        lastSeenRef.current = data.last_seen || Date.now();
        
        setHealth(prev => ({
          ...prev,
          camera: data.camera_active,
          arduino: data.arduino_active,
          isOnline: true 
        }));
      }
    });

    // 3. Listen to Logs
    const logsRef = ref(rtdb, "logs");
    const unsubLogs = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = Object.values(data) as any[];
        setStats(prev => ({ ...prev, totalLogs: logsArray.length, recentAccess: logsArray.length }));

        // Process data for chart
        const dailyCounts: { [key: string]: number } = {};
        logsArray.forEach(log => {
          if (log.timestamp) {
            try {
              const date = parseISO(log.timestamp);
              const dayKey = format(date, 'yyyy-MM-dd');
              dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
            } catch (e) {
              console.warn("Failed to parse log timestamp:", log.timestamp);
            }
          }
        });

        const chartDataArray = Object.entries(dailyCounts)
          .map(([date, count]) => ({
            date,
            displayDate: format(parseISO(date), 'MMM dd'),
            count
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-7);

        setChartData(chartDataArray);
      } else {
        setStats(prev => ({ ...prev, totalLogs: 0, recentAccess: 0 }));
        setChartData([]);
      }
    });

    // 4. Listen to Users
    const usersRef = ref(rtdb, "registered_face");
    const unsubUsers = onValue(usersRef, (snapshot) => {
      setStats(prev => ({ ...prev, registeredUsers: snapshot.val() ? Object.keys(snapshot.val()).length : 0 }));
    });

    // 5. Listen to Door Status
    const doorStatusRef = ref(rtdb, "door_status");
    const unsubDoor = onValue(doorStatusRef, (snapshot) => {
      const status = snapshot.val();
      setStats(prev => ({ ...prev, doorStatus: status || "Closed" }));
    });

    // Timeout Checker: Mengecek apakah detak jantung macet lebih dari 15 detik
    // Ini berjalan setiap 5 detik terlepas dari apakah ada data baru dari Firebase
    const healthCheckInterval = setInterval(() => {
        const timeDiff = Date.now() - lastSeenRef.current;
        // Jika selisih waktu dari laporan terakhir mesin > 15 detik, anggap offline
        if (lastSeenRef.current > 0 && timeDiff > 15000) {
            setHealth(prev => {
              // Hanya update state jika sebelumnya online untuk menghindari re-render berlebih
              if (prev.isOnline) {
                return { ...prev, isOnline: false, camera: false, arduino: false };
              }
              return prev;
            });
        }
    }, 5000);

    return () => {
      unsubConnection();
      unsubHealth();
      unsubLogs();
      unsubUsers();
      unsubDoor();
      clearInterval(healthCheckInterval);
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
            <CardTitle>Access Activity (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="h-[300px] w-full">
               {chartData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis 
                       dataKey="displayDate" 
                       tickLine={false}
                       axisLine={false}
                       tick={{ fontSize: 12, fill: '#71717a' }}
                     />
                     <YAxis 
                       tickLine={false}
                       axisLine={false}
                       tick={{ fontSize: 12, fill: '#71717a' }}
                       allowDecimals={false}
                     />
                     <Tooltip 
                       cursor={{ fill: '#f4f4f5' }}
                       contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                     />
                     <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                   </BarChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="flex h-full items-center justify-center text-zinc-400">
                   No data available for chart
                 </div>
               )}
             </div>
          </CardContent>
        </Card>

        {/* --- BAGIAN SYSTEM HEALTH YANG SUDAH REAL-TIME --- */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              System Health
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold tracking-wider ${health.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {health.isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-md ${health.isOnline ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-500'}`}>
                    <Server className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-zinc-900">Edge Device</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${health.isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="text-xs font-medium text-zinc-500">{health.isOnline ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-md ${health.camera && health.isOnline ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-500'}`}>
                    <Camera className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-zinc-900">Camera Module</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${health.camera && health.isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-xs font-medium text-zinc-500">{health.camera && health.isOnline ? 'Active' : 'Offline'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-md ${health.arduino && health.isOnline ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-500'}`}>
                    <Lock className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-zinc-900">Door Lock</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${health.arduino && health.isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-xs font-medium text-zinc-500">{health.arduino && health.isOnline ? 'Ready' : 'Not Connected'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-md ${health.database ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-500'}`}>
                    <Database className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-zinc-900">Cloud Database</span>
                </div>
                <div className="flex items-center space-x-2">
                   <div className={`h-2.5 w-2.5 rounded-full ${health.database ? 'bg-green-500' : 'bg-red-500'}`}></div>
                   <span className="text-xs font-medium text-zinc-500">{health.database ? 'Synced' : 'No Signal'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}