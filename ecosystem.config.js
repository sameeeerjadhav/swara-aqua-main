module.exports = {
  apps: [
    {
      name: 'swara-aqua',
      // script is relative to cwd
      script: 'dist/index.js',
      cwd: './backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // Log paths relative to project root (one level up from cwd)
      error_file: '../logs/err.log',
      out_file: '../logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
