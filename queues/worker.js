#!/usr/bin/env node
/**
 * InstaFlow DM Worker
 * Run separately: node queues/worker.js
 * Or via PM2: pm2 start ecosystem.config.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('./dmQueue');
