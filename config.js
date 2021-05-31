// config.js
//const dotenv = require('dotenv').config();

module.exports = {
    CALLBACK_URL: process.env.CALLBACK_URL || 'https://localhost:8081/oauthcallback.html',
    PROXY_URL: process.env.PROXY_URL || 'https://localhost:8081/proxy/'
}