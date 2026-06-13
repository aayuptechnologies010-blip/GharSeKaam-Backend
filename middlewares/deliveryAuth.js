import jwt from "jsonwebtoken";
import { prisma } from "../config/prismaConfig.js";

export const deliveryMiddleware = async (req, res, next) => {
    try {
        let token = req.headers['authorization'] || req.headers.authorization;
        if (token && typeof token === 'string' && token.toLowerCase().startsWith('bearer ')) {
            token = token.slice(7).trim();
        }
        if (!token && req.query && req.query.token) token = req.query.token;
        if (!token && req.headers['x-access-token']) token = req.headers['x-access-token'];
        if (!token && req.cookies && req.cookies.token) token = req.cookies.token;

        if (!token) {
            return res.status(401).json({ success: false, message: "Token missing" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        req.deliveryguyid = decoded.deliveryguyid;
        req.userid = decoded.userid;

        // Auto-heal / Lookup: If token only has userid, resolve the deliveryguyid from DB
        if (!req.deliveryguyid && req.userid) {
            const deliveryGuy = await prisma.deliveryGuy.findUnique({
                where: { userid: req.userid }
            });
            if (deliveryGuy) {
                req.deliveryguyid = deliveryGuy.id;
            }
        }

        if (!req.deliveryguyid) {
            return res.status(403).json({ success: false, message: "Not registered as a delivery boy" });
        }

        next();
    } catch (err) {
        console.error("JWT VERIFY ERROR (deliveryMiddleware):", err.message);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
};
