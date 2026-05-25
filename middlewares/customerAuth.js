import {prisma} from '../config/prismaConfig.js'
import jwt from 'jsonwebtoken'

export const customerMiddleware = async (req, res, next) => {
    try {
        const token = req.headers['authorization'];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if(!decoded.customerid){
                res.status(401).json({ success: false, message: "Customer not found" });
            }
            const customer = await prisma.customer.findUnique({
                where: { id: decoded.customerid }
            });
            if (customer) {
                req.customerid = decoded.customerid;
                next();
            } else {
                res.status(401).json({ success: false, message: "Customer not found" });
            }
        } else {
            res.status(401).json({ success: false, message: "Token not provided" });
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};