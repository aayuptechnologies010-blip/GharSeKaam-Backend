import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import passport from 'passport'
import session from 'express-session'
import cookie from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import { initWebSocket } from './socket.js'

import { customerRouter } from './src/customer/customer.route.js'
import { shopkeeperRouter } from './src/shopkeeper/shopkeeper.route.js'
import { deliveryRouter } from './src/delivery/delivery.route.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// configurations
const app = express();
dotenv.config();


// session

app.use(session({
    secret: 'prags',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}))


// Allow all origins (CORS)
app.use(cors({ origin: '*' }));
app.use(cookie());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// middlewares and routings

app.get('/', (req, res) => {
    res.send("Buildkart is Healthy")
})


app.use('/api/v1/user', customerRouter)
app.use('/api/v1/owner', shopkeeperRouter)
app.use('/api/v1/delivery', deliveryRouter)


app.get(/(.*)/, (req, res) => {
  res.send("PAGE NOT FOUND");
});


const server = http.createServer(app);
initWebSocket(server);

server.listen(process.env.PORT || 3000, () => {
    console.log('app is listening on port : ', process.env.PORT || 3000);
})


app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    "success" : false,
    "message" : "internal server error"
  })
})