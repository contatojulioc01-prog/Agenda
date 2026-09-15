const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'agenda',
      script: path.join(__dirname, 'index.js'),
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 9900,
      },
    },
  ],
};
