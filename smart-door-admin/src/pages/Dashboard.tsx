import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, DoorOpen } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, startOfDay } from "date-fns";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalLogs: 0,
    recentAccess: 0,
    registeredUsers: 0,
    doorStatus: "Closed",
  });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (!rtdb) return;

    // Listen to logs
    const logsRef = ref(rtdb, "logs");
    const unsubscribeLogs = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logsArray = Object.values(data) as any[];
        setStats(prev => ({
          ...prev,
          totalLogs: logsArray.length,
          recentAccess: logsArray.length, 
        }));

        // Process data for chart
        const dailyCounts: { [key: string]: number } = {};
        logsArray.forEach(log => {
          if (log.timestamp) {
            try {
              // Assuming timestamp is ISO string or similar parsable format
              // If it's a custom format, we might need more robust parsing
              const date = parseISO(log.timestamp);
              const dayKey = format(date, 'yyyy-MM-dd');
              dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
            } catch (e) {
              console.warn("Failed to parse log timestamp:", log.timestamp);
            }
          }
        });

        // Convert to array and sort by date
        const chartDataArray = Object.entries(dailyCounts)
          .map(([date, count]) => ({
            date,
            displayDate: format(parseISO(date), 'MMM dd'),
            count
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-7); // Last 7 days

        setChartData(chartDataArray);

      } else {
        setStats(prev => ({ ...prev, totalLogs: 0, recentAccess: 0 }));
        setChartData([]);
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
