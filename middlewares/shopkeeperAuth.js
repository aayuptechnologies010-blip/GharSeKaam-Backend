import jwt from "jsonwebtoken";
import { prisma } from "../config/prismaConfig.js";

export const shopkeeperMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers['Authorization'];
        console.log("Auth Header:", authHeader);

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Token missing" });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // MUST match payload
        req.shopkeeperid = decoded.shopkeeperid;

        // Auto-heal: If token only has userid (temporary token) but user is now registered,
        // dynamically resolve the shopkeeper ID from the database
        if (!req.shopkeeperid && decoded.userid) {
            console.log("Middleware: Token has userid but no shopkeeperid. Fetching shopkeeper from DB...");
            const shopkeeper = await prisma.shopkeeper.findUnique({
                where: { userid: decoded.userid }
            });
            if (shopkeeper) {
                req.shopkeeperid = shopkeeper.id;
                console.log("Middleware: Successfully auto-resolved shopkeeperid:", shopkeeper.id);
            }
        }

        if (!req.shopkeeperid) {
            return res.status(401).json({ message: "Invalid token payload" });
        }

        next();
    } catch (err) {
        console.error("JWT VERIFY ERROR:", err.message);
        return res.status(401).json({
            message: "Invalid or expired token",
        });
    }
};