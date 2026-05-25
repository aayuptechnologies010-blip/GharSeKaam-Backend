import jwt from 'jsonwebtoken'
import env from 'dotenv'
import { prisma } from '../config/prismaConfig.js'
env.config()


export const userMiddleware = async (req, res, next) => {
    try {
        // robust token extraction: header (Bearer), query, x-access-token, cookie
        let token = req.headers['authorization'] || req.headers.authorization;
        if (token && typeof token === 'string' && token.toLowerCase().startsWith('bearer ')) {
            token = token.slice(7).trim();
        }
        if (!token && req.query && req.query.token) token = req.query.token;
        if (!token && req.headers['x-access-token']) token = req.headers['x-access-token'];
        if (!token && req.cookies && req.cookies.token) token = req.cookies.token;

        if (!token) {
            return res.status(401).json({ success: false, message: 'token not provided' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            console.error('JWT verify error (userMiddleware):', err.message);
            return res.status(401).json({ success: false, message: 'Invalid or expired token', error: err.message });
        }

        const user = await prisma.user.findUnique({
            where: {
                googleid: decoded.userid
            }
        });

        if (user) {
            req.userid = decoded.userid;
            return next();
        } else {
            return res.status(404).json({ success: false, message: 'user not found' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}