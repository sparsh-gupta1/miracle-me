// PM2 process config. Apply node_args changes with a fresh start (pm2 delete + pm2 start), since
// pm2 reload keeps the args the process was first started with.
module.exports = {
  apps: [
    {
      name: "miracle-me-backend",
      script: "src/server.js",
      exec_mode: "fork",
      // More than one instance needs the Socket.IO Redis adapter and shared call timers first.
      instances: 1,
      // Fits a 1 GiB t3.micro shared with Postgres and Redis.
      node_args: "--max-old-space-size=384",
      // A controlled restart instead of the kernel's OOM killer.
      max_memory_restart: "450M",
      // Longer than the app's own shutdown force-exit (8s, src/utils/shutdown.js).
      kill_timeout: 10000,
      listen_timeout: 10000,
      // Back off on a crash loop instead of restarting as fast as possible.
      exp_backoff_restart_delay: 200,
      time: true,
    },
  ],
};
