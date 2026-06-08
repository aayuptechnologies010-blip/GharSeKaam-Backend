import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import passport from 'passport'
import session from 'express-session'
import cookie from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'

import { customerRouter } from './src/customer/customer.route.js'
import { shopkeeperRouter } from './src/shopkeeper/shopkeeper.route.js'

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


app.get(/(.*)/, (req, res) => {
  res.send("PAGE NOT FOUND");
});


app.listen(process.env.PORT || 3000, (req, res, next) => {
    console.log('app is listening on port : ', process.env.PORT || 3000);
})


app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    "success" : false,
    "message" : "internal server error"
  })
})