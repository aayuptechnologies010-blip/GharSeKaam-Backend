import dotenv from 'dotenv';
dotenv.config();

console.log("Environment variable keys:", Object.keys(process.env).filter(k => !k.startsWith("npm_")));
