module.exports = {
  apps: [
    {
      name: 'agenda-bi',
      cwd: __dirname,
      script: 'production-start.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true,
      env_production: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
      },
    },
  ],
};
